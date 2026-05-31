# Active Clarification

## 概述

让 ShopMate 在用户信息不足时主动反问，而不是直接给泛泛推荐。

示例：

```text
用户：推荐一款手机
AI：你更看重拍照、续航、预算还是性价比？告诉我一两个重点，我再帮你筛。
用户：预算 3000 左右，拍照好一点
AI：好的，在 3000 左右和拍照优先的条件下推荐...
```

本 spec 建立最小澄清机制：识别过宽的问题、生成 1 句追问、记录缺失槽位，并让用户下一轮回答能接回原始意图。

## 范围

本 spec 负责：

- 后端在 RAG 检索前判断是否需要主动反问。
- 对宽泛品类问题返回澄清问题，而不是直接推荐商品。
- `done.fallbackReason` 新增 `NEEDS_CLARIFICATION`。
- `done` 可选返回 `clarification` 元数据，供测试和后续 UI 使用。
- Android 对 `NEEDS_CLARIFICATION` 不显示“商品库暂时没有匹配”的错误。
- 澄清后的下一轮回答复用 `chat-context-memory-spec.md` 的会话记忆。

不负责：

- 多轮表单式问卷。
- 大型 slot filling 框架。
- LLM function calling / tool calling。
- 语音输入。
- 对所有类目都做完美澄清。
- UI quick reply chips；第一版只显示普通聊天文本。

## 前置条件

先完成：

- `chat-context-memory-spec.md`

当前应已有：

- `conversationId`
- 后端短期 `ChatContextMemory`
- Android 能发送历史和会话 id。

## 判定策略

第一版使用规则判断，避免额外 LLM 调用。

需要澄清的典型情况：

- 用户只说宽泛品类：
  - `推荐一款手机`
  - `推荐电脑`
  - `推荐护肤品`
  - `有什么跑鞋`
- 没有预算、用途、偏好或关键约束。
- 当前会话 memory 里也没有可用约束。

不需要澄清的情况：

- 已有预算：
  - `推荐 3000 元以内的手机`
- 已有用途：
  - `推荐适合拍照的手机`
  - `推荐通勤用耳机`
- 已有明确人群/场景：
  - `适合油皮的洗面奶`
  - `学生党用的跑鞋`
- 用户明确要求“随便推荐一个”或“先给我几个看看”。

## 后端实现

新增：

- `server/src/modules/chat/clarification.types.ts`
- `server/src/modules/chat/clarification.service.ts`
- `server/src/modules/chat/clarification.service.test.ts`

修改：

- `server/src/modules/chat/chat.types.ts`
- `server/src/modules/chat/rag.service.ts`
- `server/src/modules/chat/chat.controller.test.ts`
- `server/src/modules/chat/rag.service.test.ts`
- `server/src/modules/chat/chat-contract.fixture.ts`
- `server/src/modules/chat/chat-contract.fixture.test.ts`
- `docs/chat-stream-contract.md`（如果当前 contract 文档存在并仍作为真源）

### 类型

建议：

```ts
export interface ClarificationDecision {
  needsClarification: boolean;
  question?: string;
  missingSlots: ClarificationSlot[];
}

export type ClarificationSlot =
  | "budget"
  | "use_case"
  | "priority"
  | "audience";
```

`ChatDonePayload` 增加可选字段：

```ts
clarification?: {
  missingSlots: ClarificationSlot[];
};
```

`RagChatFallbackReason` 增加：

```ts
"NEEDS_CLARIFICATION"
```

### Service

`ClarificationService` 输入：

- 当前问题
- 已合并的 `ChatContextMemory`
- 当前 filters

输出：

- 是否需要澄清
- 一句移动端友好的追问
- 缺失槽位

生成规则：

- 手机：优先问拍照、续航、预算、性价比。
- 电脑 / 数码：优先问预算、用途、性能/轻薄。
- 护肤 / 美妆：优先问肤质、预算、功效。
- 运动鞋 / 跑鞋：优先问使用场景、缓震/轻量、预算。
- 食品 / 生活：优先问口味、预算、使用场景。
- 默认：问预算、使用场景和偏好。

回答文案要求：

- 1 句话。
- 不超过 70 个中文字符。
- 不编造商品名。
- 不输出商品卡片。

示例：

```text
你更看重拍照、续航、预算还是性价比？告诉我一两个重点，我再帮你筛。
```

### RAG 接入

`RagChatService.answer` 流程调整：

1. 合并 context memory。
2. 调用 `ClarificationService`.
3. 如果需要澄清：
   - 不调用 vector search。
   - 不调用 LLM。
   - 返回 `answer = clarification.question`。
   - `productCards = []`。
   - `recommendedProductIds = []`。
   - `fallbackUsed = true`。
   - `fallbackReason = "NEEDS_CLARIFICATION"`。
   - `retrieval.candidateCount = 0`。
   - 写入 memory：保留当前 intent 和 pending missing slots。
4. 如果不需要澄清，继续原 RAG 流程。

注意：

- 已经有足够 context 时不能重复追问。
- 用户回答澄清问题后，应进入正常推荐。
- 澄清不是错误，不应触发 retry UI。

## Android 实现

修改：

- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatStreamContract.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatStreamEventParser.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`
- 对应测试文件。

要求：

- `DonePayloadDto` 可解析 optional `clarification`，也可以第一版只忽略该字段。
- `fallbackReason == "NEEDS_CLARIFICATION"` 时：
  - 保留 assistant 文本。
  - `isSending=false`。
  - 不显示“当前商品库暂时没有完全匹配”的错误。
  - `canRetry=false`。
  - composer 保持可输入。
- 下一轮用户回复继续发送同一个 `conversationId` 和 history。

不做：

- quick reply chips。
- 专门澄清卡片。
- 新页面。

## 测试

后端必须覆盖：

- `推荐一款手机` 返回 `NEEDS_CLARIFICATION`，不调用 vector search。
- `推荐 3000 以内拍照好的手机` 不触发澄清。
- 有 memory 约束时，短句 `那推荐手机` 不重复追问。
- 澄清返回没有 product cards。
- contract fixture 包含 clarification 场景。

Android 必须覆盖：

- `NEEDS_CLARIFICATION` done 不产生 errorMessage。
- 澄清回答结束后 composer 可继续输入。
- 仍然保存 history session。
- 未知 fallbackReason 保持现有兼容。

## 运行与验证

必须运行：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build
```

建议 smoke：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"clarify-demo-1\",\"message\":\"推荐一款手机\"}" http://localhost:3000/api/chat/stream
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"clarify-demo-1\",\"message\":\"预算 3000，拍照好一点\"}" http://localhost:3000/api/chat/stream
```

第一轮应只反问，第二轮应进入正常推荐。

## 完成标准

- 信息不足时能主动反问。
- 澄清请求不调用 vector search / LLM。
- 用户补充信息后能继续正常 RAG 推荐。
- Android 不把澄清当成错误。
- 现有 no-candidates fallback 行为不破坏。
- 后端 test / build 与 Android unit test / build 通过，或记录真实失败原因。
