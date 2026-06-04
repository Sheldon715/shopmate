# Chat Typewriter Streaming Experience

## 概述

本 spec 优化 Android 聊天页的真实流式展示体验，让导购回复更像主流 LLM：第一段真实 `message_delta` 到达后，用户先看到首字 / 首小段，然后后续内容以稳定节奏继续出现。

它和 `rag-pipeline-parallel-first-token-spec.md` 的关系：

- pipeline spec 负责让后端更早产出第一段真实 `message_delta`。
- 本 spec 负责让已经到达 Android 的真实文本更平滑地显示出来。

当前已经可以做这一层，因为普通 RAG success 路径已有真实 LLM streaming，Android 也已经用本地空 streaming assistant 气泡承担等待反馈。现在缺的是“收到 delta 后如何展示”，而不是继续用固定模板冒充首 token。

## 背景

当前 Chat SSE contract 已经是：

```text
message_delta -> product_cards -> comparison_result -> done
```

Android 收到 `message_delta` 后会直接把 `event.text` 追加到当前 assistant 气泡：

```kotlin
assistant.copy(text = assistant.text + text)
```

因此只要后端 / provider 一次给了较长 delta，UI 就会一整段跳出来。缓存命中、comparison、cart、clarification、no-candidates fallback 等分支也可能先生成完整业务结果，再通过 `message_delta` 发出，所以体感更像“一段一段出现”，不是细腻的打字机式流式。

本 spec 不改变首 token 的定义：

- `first_delta_received_ms`：Android 收到第一条非空 `message_delta` 的时间。
- `first_visible_text_ms`：用户第一次看到真实 assistant 文本的时间。
- `typewriter_complete_ms`：本条 assistant 文本完全显示完成的时间。

验收时必须保证 `first_visible_text_ms` 不明显晚于 `first_delta_received_ms`。打字机效果不能为了“慢慢打”而把第一字也藏起来。

## 目标

- 第一条真实 `message_delta` 到达后，Android 在 100ms 内显示首字 / 首小段。
- 后续文本按稳定节奏逐步显示，避免大段文本突然跳出。
- 同一 assistant 气泡持续更新，不新增气泡、不改变商品卡锚点。
- `product_cards`、`comparison_result`、`done` 到达时，已收到但尚未显示的文本必须安全 flush，避免商品卡或对比入口基于半截回答渲染。
- 保持现有 SSE contract，不新增后端 event，不要求 Android parser 处理新字段。
- 保持后端首条 `message_delta` 必须是真实业务回答，不恢复固定安全预响应。
- 对缓存、澄清、购物车、对比、无候选 fallback 等非 RAG 真流式分支也能获得更平滑的视觉效果。

## 不做

- 不改变 RAG / intent / comparison / cart 的业务语义。
- 不用关键词、规则或固定模板生成用户可见导购话术。
- 不为了打字机效果延迟第一条真实文本的展示。
- 不把 `product_cards` 或 `comparison_result` 人为拖慢到整段打完很久以后。
- 不修改 SSE event 名称、payload schema 或 Android 网络 parser contract。
- 不新增 TTS、语音播报、富文本 markdown 渲染或逐词高亮。
- 不把真实 `.env`、API key、完整 prompt、provider 原始错误或完整商品知识文本写入日志 / timing / UI。

## 设计原则

- 真实优先：所有可见文本仍来自后端真实 `message_delta`，不插入“我正在帮你看”这类预设文案。
- 首字优先：第一段 delta 到达后先快速显示少量字符，再进入稳定打字节奏。
- 可追赶：如果后端一次性发来很多文本，UI 可以临时加速，避免长答案拖太久。
- 可 flush：任何终止、错误、商品卡、对比结果、页面切换、重试、新消息都必须能立刻 flush 或取消队列。
- 可测试：打字机节奏需要可注入时钟 / ticker，不能依赖不稳定的真实时间单测。

## Android 实现方案

### 1. 引入 streaming text revealer

在 Android chat 层新增一个小的内部组件，例如：

```kotlin
internal class AssistantTextRevealer(
    private val scope: CoroutineScope,
    private val onVisibleTextChanged: (String) -> Unit,
)
```

职责：

- 接收后端 delta，追加到内部 `pendingText`。
- 维护 `visibleText`。
- 第一次收到非空 delta 时，立即显示首字 / 首小段。
- 启动 coroutine ticker，按节奏把 `pendingText` 搬到 `visibleText`。
- `flush()` 时立即显示所有已收到文本。
- `cancel()` 时停止 ticker，并清空当前流状态。

建议先作为 `ChatViewModel` 内部 helper 实现，避免过早暴露到 UI component 层。

### 2. 显示节奏

建议默认策略：

- 首段快速显示：第一条 delta 到达后立即展示 1 到 4 个 Unicode code points。
- 普通速度：每秒 24 到 36 个中文字符 / code points。
- 追赶速度：当 pending 超过 80 到 120 个 code points 时，提升到每秒 60 到 90 个 code points。
- tick 间隔：约 16ms 到 33ms，按 elapsed time 计算本 tick 应显示数量，不要每 tick 固定只加 1 个字。
- 标点停顿可选：句号、问号、感叹号后可增加 80 到 150ms 微停顿，但 V1 可以先不做，避免测试复杂。

注意：

- 用 `Array.from` 对应的 Kotlin code point / grapheme 安全方案，不能把 emoji 或组合字符切坏。
- 中文场景以 code point 粒度足够；后续如果有复杂 emoji / skin tone 组合再考虑 grapheme cluster 库。

### 3. ChatViewModel 接入

当前逻辑：

```kotlin
is ChatStreamEvent.MessageDelta -> appendAssistantDelta(event.text)
```

改成：

```kotlin
is ChatStreamEvent.MessageDelta -> enqueueAssistantDelta(event.text)
```

`enqueueAssistantDelta()` 行为：

- 把 delta 交给 revealer。
- revealer 每次产出新的 visible text 时，只更新当前 streaming assistant message 的 `text`。
- 不在每个字符 tick 都调用 `saveCurrentSession`；可以：
  - 每 500ms 节流保存一次；或
  - 只在 `done` / `error` / stream completion 时保存最终文本。

为了避免下游事件使用半截文本：

- 处理 `ProductCards` 前先 `flushAssistantText()`
- 处理 `ComparisonResult` 前先 `flushAssistantText()`
- 处理 `Done` 前先 `flushAssistantText()`
- 处理 `Error` 前如果已有 pending 文本，也先 `flushAssistantText()`
- 用户发起新消息、retry、new chat、打开历史会话、ViewModel 清理时 cancel 当前 revealer。

### 4. UI state 边界

不建议新增新的 SSE 状态。Android 内部可以新增局部状态：

```kotlin
private var activeAssistantMessageId: String? = null
private var assistantTextRevealer: AssistantTextRevealer? = null
```

如果当前 UI model 只有 `ChatMessageUi.text`，V1 可以继续只存 visible text，并在非文本事件前 flush。

如果后续要支持更复杂的“完整文本 vs 可见文本”差异，再扩展：

```kotlin
visibleText: String
completeText: String
```

V1 不建议这么做，避免扩大 UI model 改动面。

### 5. 失败和取消

- SSE error 到达：flush 已收到文本，然后显示错误状态；如果没有任何文本，保持现有错误卡 / retry 行为。
- 用户重试：cancel 旧 revealer，创建新的空 streaming assistant 气泡。
- 用户开始新聊天：cancel 旧 revealer，清空 pending。
- stream 正常结束但没有 done：flush pending，然后走现有 incomplete completion 保护。
- app 进入后台 / ViewModel cleared：cancel revealer，不继续 tick。

## 后端实现方案

V1 不要求后端改 contract。Android 打字机层足以平滑：

- 普通 RAG 真流式 delta。
- fallback / cache / comparison / cart 等一次性较大 delta。

可选后端小优化：

- 将非 streaming fallback 的 `chunkMessageDelta(answer, 100)` 调整为更小的 24 到 40 code points。
- 只用于没有 provider streaming 的路径，且不引入人工 sleep。
- 不改变 event order，不为了“看起来打字”在后端 delay `message_delta`。

建议 V1 先不做后端 delay。打字节奏应该由客户端控制，否则会增加服务端连接占用和测试不稳定性。

## Gradio / 评估工具影响

Gradio 批量评估仍以 SSE 原始 event 时间为准，不模拟 Android 打字机。

如果需要在单条调试页展示体验，可增加两个可选指标：

- `first_delta_received_ms`
- `first_visible_text_ms`

但 V1 不要求 Gradio UI 模拟 Android typewriter，因为 Gradio 是评估工具，不是正式用户端。

## 测试计划

### Android 单元测试

更新 `ChatViewModelTest`：

- 收到一条较长 `MessageDelta` 后，立即只显示首字 / 首小段，而不是完整文本。
- 推进虚拟时间后，文本逐步增长。
- 推进到足够时间后，完整文本显示。
- `Done` 到达时立即 flush pending 文本，并把 assistant message 标记为 done。
- `ProductCards` 到达前 flush 文本，商品卡 anchor 仍指向当前 assistant message。
- `ComparisonResult` 到达前 flush 文本，对比入口 summary 使用完整 assistant 文本。
- `Error` 到达时不会丢失已收到但未显示的文本。
- retry / new chat 会 cancel 上一条 revealer，不把旧文本继续吐到新气泡。
- 中文、英文、emoji 混合文本不会被切坏。

如果 coroutine 时间控制复杂，给 revealer 注入测试 ticker：

```kotlin
interface TypewriterTicker {
    suspend fun delayNextFrame()
    fun nowMillis(): Long
}
```

测试中用 fake ticker 手动推进。

### 后端回归测试

如果 V1 不改后端，只需保留现有：

- `cd server; npm.cmd test`
- `cd server; npm.cmd run build`

如果改了 fallback chunk size，补充：

- `chunkMessageDelta` 不切坏中文 / emoji。
- fallback 路径 event order 仍为 `message_delta -> product_cards -> done`。

### Android 验证

- `cd client/android; .\gradlew.bat --no-daemon testDebugUnitTest`
- `cd client/android; .\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/`

真机 / 模拟器手测：

- 普通推荐：`推荐一款适合通勤的蓝牙耳机`
- 追问比较：`对比一下前两个`
- 购物车操作：`把第一个加入购物车`
- 澄清问题：`推荐一个好用的`
- 无结果：`推荐一个完全不存在的商品`

观察点：

- 发送后 1s 内仍显示本地 loading 气泡。
- 第一条真实文本到达后不是整段跳出，而是逐步出现。
- 商品卡不会在文本半截时造成错位或锚点丢失。
- done 后文本完整，不出现少字、重复字、旧消息串到新消息。

## 验收标准

- Android 第一条真实 `message_delta` 到达后 100ms 内有真实文本可见。
- 单条长 delta 不会一次性完整显示，而是按打字机节奏逐步出现。
- `done` 后 assistant 文本与所有收到的 `message_delta` 拼接结果完全一致。
- `product_cards`、`comparison_result`、`cartAction` 和错误处理不受影响。
- 不新增 SSE event，不改变后端 API contract。
- 不恢复任何后端固定安全预响应。
- Android 单测和 build 通过；后端 test / build 保持通过。

## 风险与回滚

- 风险：逐字更新导致 UI recomposition 过于频繁。缓解：按 frame / elapsed 批量追加，并节流 session 保存。
- 风险：打字机速度过慢，用户觉得回答拖沓。缓解：pending 长时自动加速，done / product cards 前 flush。
- 风险：文本未 flush 就处理 comparison result，导致 summary 截断。缓解：所有非文本事件前统一 flush。
- 风险：测试依赖真实时间变 flaky。缓解：ticker / clock 可注入，单测用虚拟时间。
- 回滚：保留旧 `appendAssistantDelta(text)` 直接追加路径，通过 feature flag 或单点 helper 关闭 typewriter。

## 实施顺序

1. 新增 Android `AssistantTextRevealer` helper 和 fake ticker 测试。
2. 在 `ChatViewModel` 中把 `MessageDelta` 改为 enqueue，非文本事件前 flush。
3. 补充 Android ViewModel 单测覆盖逐步显示、flush、cancel、emoji / 中文。
4. 视情况调整 session 保存节流，避免每字保存历史。
5. 跑 Android 单测 / build，确认后端 test / build 不回退。
6. 真机或模拟器手测普通推荐、对比、购物车、澄清、无结果路径。
