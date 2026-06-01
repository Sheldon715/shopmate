# Active Clarification

## 概述

让 ShopMate 在用户信息不足时主动反问，而不是直接给泛泛推荐。是否反问和用户可见问题由 LLM clarification intent 决定；规则只负责发现候选宽泛品类和候选缺失槽位。

示例：

```text
用户：推荐一款手机
AI：<LLM 生成的澄清问题>
用户：预算 3000 左右，拍照好一点
AI：<基于补充条件的 RAG 推荐回答>
```

本 spec 建立最小澄清机制：识别过宽问题的候选、交给 LLM 判断是否需要追问、记录缺失槽位，并让用户下一轮回答能接回原始意图。

## 范围

本 spec 负责：

- 后端在 RAG 检索前通过 LLM clarification intent 判断是否需要主动反问。
- 对 LLM 确认需要澄清的宽泛品类问题返回模型生成的澄清问题，而不是直接推荐商品。
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

采用“候选预筛 + LLM intent”的两段式策略：

- `ClarificationService` 只判断当前问题是否可能是宽泛品类请求，并给出候选 `missingSlots`。
- `ClarificationIntentService` 调用 LLM，输出 `needs_clarification`、`clarification_question` 和 `missing_slots`。
- 只有 LLM 确认需要澄清且给出有效 `clarification_question` 时，才返回 `NEEDS_CLARIFICATION`。
- 如果没有候选、LLM 否定、输出无效、没有生成问题或模型不可用，继续原 RAG 流程，不拦截用户请求。

规则 / 正则不能：

- 单独决定 `NEEDS_CLARIFICATION`。
- 生成用户可见反问文案。
- 为某个品类写死追问维度。

## 后端实现

新增：

- `server/src/modules/chat/clarification.types.ts`
- `server/src/modules/chat/clarification.service.ts`
- `server/src/modules/chat/clarification.service.test.ts`
- `server/src/modules/chat/clarification-intent.service.ts`
- `server/src/modules/chat/clarification-intent.service.test.ts`

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

- 是否存在宽泛澄清候选
- 候选缺失槽位

`ClarificationIntentService` 输入：

- 当前问题
- `ClarificationService` 产出的候选缺失槽位
- 已合并的 `ChatContextMemory`
- 当前 filters

LLM 输出 schema：

```json
{
  "needs_clarification": true,
  "clarification_question": "...",
  "missing_slots": ["budget", "priority"]
}
```

`clarification_question` 要求：

- 1 句话。
- 不超过 70 个中文字符。
- 不编造商品名。
- 不输出商品卡片。

### RAG 接入

`RagChatService.answer` 流程调整：

1. 合并 context memory。
2. 调用 `ClarificationIntentService`。
3. 如果需要澄清：
   - 不调用 vector search。
   - 不调用 RAG 生成 LLM。
   - 返回 `answer = LLM 生成的 clarification.question`。
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
- 澄清请求不调用 vector search / RAG 生成 LLM。
- 用户补充信息后能继续正常 RAG 推荐。
- Android 不把澄清当成错误。
- 现有无候选商品返回行为不破坏。
- 后端 test / build 与 Android unit test / build 通过，或记录真实失败原因。
