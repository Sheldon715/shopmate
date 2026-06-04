# Comparison Target Consistency and Performance

## 背景

最近一次对比修复后，真机反馈暴露了两个新问题：

- 用户说“对比一下前两个”时，有时只返回“这次没有生成可靠推荐说明。”，没有 `comparison_result` 和对比详情入口。
- 用户继续说“对比一下第一个和第三个”时，后端可能拿到的 `lastRecommendedProductIds` 和 Android 当前屏幕可见商品卡不是同一组，导致比较到用户没有指向的商品。
- 对比结果整体返回仍偏慢，尤其是 comparison intent、商品读取、comparison generation 串行时，用户会在等待气泡里停留太久。

这不是打字机体验或普通首 Token 的问题，应独立作为商品对比链路的目标一致性和性能修复。

## 目标

- Android 对最近商品的序号指代必须与当前屏幕可见商品卡顺序一致。
- 后端仍以 LLM comparison intent 作为是否进入对比链路的权威判断；Android 只回传当前可见商品 id 作为指代上下文，不决定业务意图。
- “前两个”“第一个和第三个”“第 1 个和第 3 个”等序号对比只允许解析到当前可见 / 最近推荐 allowlist 内的 active 商品。
- 目标不足、序号越界、超过两款、商品下架或歧义时，必须走 comparison clarification，不得猜商品或普通 RAG 推荐。
- comparison generation 成功时继续返回 LLM 生成的 `message_delta`、`product_cards`、`comparison_result`、`done`。
- comparison generation 失败或超时时，允许返回安全基础事实对比：只展示库内品牌 / 品类 / 价格 / 可售等事实，不生成推荐高亮、购买建议或模型式结论。
- 对比链路应减少无效等待：最近商品读取尽量复用预取，generation prompt / timeout 控制在可接受范围，并在 `done.retrieval.timing` 中保留 comparison 阶段观测。

## 不做

- 不修改对比详情页视觉结构。
- 不把关键词 / 正则变成 comparison intent 权威；规则只做显式序号抽取、allowlist 校验和安全 fallback。
- 不让 Android 直接决定“这是对比请求”或决定推荐哪款。
- 不支持三款及以上对比；超过两款继续澄清。
- 不新增必须解析的新 SSE event。
- 不为了速度跳过 active product 校验、product id allowlist 或 LLM intent。

## 后端方案

1. 扩展 Chat SSE request：
   - 增加可选 `recentProductIds: string[]`。
   - 做 trim、dedupe、数量和长度限制。
   - 该字段只表示客户端当前可见商品卡顺序；后端仍需回查 active 商品。

2. 统一 recent product source：
   - `RagChatService` 解析最近商品时优先使用 request `recentProductIds`，为空时回退 `contextMemory.lastRecommendedProductIds`。
   - comparison intent、comparison prefetch、target resolution 和 cart ordinal 仍消费同一组 recent ids，避免客户端可见顺序与后端记忆顺序分叉。

3. 收紧 comparison target resolution：
   - 显式序号必须全部落在 recent ids 范围内。
   - 无序号且 recent ids 超过两款时继续澄清。
   - 有序号时只选中对应序号商品，不静默补齐或截断。
   - selected ids 回查后数量不足两款时走 `COMPARISON_TARGET_CLARIFICATION`。

4. 对比 generation 安全降级：
   - LLM generation 成功时保持原结构化对比输出。
   - LLM invalid / error / timeout 时不再只返回普通 fallback 文案；改为返回基础事实 `comparison_result`。
   - 基础事实对比只包含库内 facts：商品名、品牌、品类、价格区间、可售状态；`recommendedProductId=null`，无高亮。
   - `fallbackUsed=true`，`fallbackReason` 保留 `LLM_INVALID_OUTPUT` 或 `LLM_ERROR`，方便 Gradio 和日志识别。

5. 性能控制：
   - 保持 comparison product prefetch 与 intent 判断并行。
   - 压缩 comparison generation prompt / facts 数量，减少 completion token。
   - 设置更短的 comparison generation timeout；超时后走安全基础事实对比，不让用户无限等待。
   - 保留 `comparison_prefetch_started/done`、`comparison_intent_done`、`comparison_targets_started/done`、`comparison_generation_started/done` timing。

## Android 方案

- `ChatRepository.streamChat` 增加 `recentProductIds` 参数。
- `ChatViewModel.startStream` 在发送前捕获当前 `productCards` 的 id 顺序，随请求传给后端。
- comparison follow-up 仍保留当前商品卡锚点；后端如返回当前流的两张对比商品卡，Android 用它们构建对比详情，但不把原商品卡重新挂到新问题下。
- 请求字段为空时保持兼容，不影响无商品卡聊天。

## 测试计划

后端：

- `parseChatStreamRequestBody` 接受、trim、dedupe `recentProductIds`，并拒绝过多或非法项。
- “第一个和第三个”在 request `recentProductIds` 提供三款时解析为第一和第三款。
- request `recentProductIds` 与 memory 不一致时，显式序号优先使用 request 顺序。
- “第一个和第三个”但 request 只有两款时走 comparison clarification，不拿 memory 里的第三款猜。
- generation invalid / error 时返回基础事实 `comparison_result`，`fallbackUsed=true`，并且 `recommendedProductId=null`。
- 现有 “前两个”“第二个和第三个”“无序号超过两款澄清” 回归不变。

Android：

- `DefaultChatRepository` 会把 `recentProductIds` 写入 `ChatStreamRequestDto`。
- `ChatViewModel` 发送 comparison follow-up 时传当前商品卡 id 顺序，并保持原商品卡锚点。

## 验收标准

- 截图中的“对比前两个”不再因为 comparison generation 一次失败就没有对比详情入口。
- “对比第一个和第三个”只会比较用户当前商品卡列表中的第 1 和第 3 个；若当前只有两张卡，则澄清而不是拿旧记忆商品。
- 对比 fallback 明确标记 `fallbackUsed`，但不会编造推荐结论或推荐高亮。
- 后端 `npm.cmd test`、`npm.cmd run build` 通过。
- Android `testDebugUnitTest` 和带 demo URL 的 build 通过，或记录不能运行的原因。
