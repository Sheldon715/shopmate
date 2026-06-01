# Active Clarification LLM Intent

## 概述

对已经完成的 `active-clarification-spec.md` 做一次 LLM intent 修复：规则只发现可能需要澄清的宽泛品类请求和候选缺失槽位，是否真的反问以及用户可见 `clarification_question` 都交给 LLM 决定。

目标是移除“手机就问拍照 / 续航 / 预算”这类代码预设反问，让主动澄清保持在同一条 LLM-first chat orchestration 链路里。

## 范围

本 spec 负责：

- 新增 `ClarificationIntentService`。
- 在 RAG 检索前调用 LLM 判断是否需要澄清。
- 由 LLM 生成用户可见 `clarification_question`。
- 保留 `ClarificationService` 作为候选预筛和缺失槽位 hint。
- LLM 否定、输出无效、没有生成问题或不可用时，继续原 RAG 流程，不拦截用户请求。
- 保持 `NEEDS_CLARIFICATION`、`clarification` payload、Android parser / ViewModel 兼容。

不负责：

- 新增 quick reply chips。
- 表单式多轮 slot filling。
- 改 RAG 检索、rerank 或商品卡片协议。
- 改 cart add intent。

## 后端设计

`ClarificationService` 只输出候选：

- 当前问题是否像宽泛品类请求。
- 候选 `missingSlots`。
- 不生成用户可见文案。
- 不能单独决定 `NEEDS_CLARIFICATION`。

`ClarificationIntentService` 调用 LLM，输入：

- 当前用户问题。
- 候选缺失槽位。
- 当前 conversation memory summary。
- 当前 filters。

LLM 输出 schema：

```json
{
  "needs_clarification": true,
  "clarification_question": "你更看重拍照、续航还是预算？",
  "missing_slots": ["budget", "priority"]
}
```

约束：

- `needs_clarification=false` 时继续 RAG。
- `clarification_question` 必须是一句中文，不超过 70 个中文字符。
- 问题不能推荐具体商品、不能决定 productId、不能输出商品卡片。
- `missing_slots` 只允许 `budget`、`use_case`、`priority`、`audience`。

## RAG 接入

`RagChatService.answer` 流程：

1. 合并 context memory。
2. 先调用 cart intent；如果不是 cart command，再调用 clarification intent。
3. LLM 确认需要澄清且生成有效问题时：
   - 不调用 vector search。
   - 不调用 RAG 推荐生成。
   - 返回 LLM 生成的 `answer`。
   - `fallbackUsed=true`。
   - `fallbackReason="NEEDS_CLARIFICATION"`。
   - `productCards=[]`。
   - 写入 `pendingClarification`，让下一轮用户补充条件能接回原始意图。
4. LLM 否定或失败时继续原 RAG 流程。

## 测试

必须覆盖：

- 宽泛请求会调用 clarification intent prompt，并使用 LLM 生成的问题。
- LLM 否定时继续 RAG。
- LLM 输出无效、没有问题或不可用时继续 RAG。
- 短品类词如“鞋”也会进入 LLM intent。
- 澄清后的下一轮复用同一 conversation memory。
- Android 对 `NEEDS_CLARIFICATION` 保持普通 assistant 消息，不显示 retry / no-match 错误。

## 运行与验证

```powershell
cd server
npm.cmd test -- --run src/modules/chat/clarification-intent.service.test.ts src/modules/chat/rag.service.test.ts src/modules/chat/chat-contract.fixture.test.ts
npm.cmd test
npm.cmd run build
```

如 Android 解析或 ViewModel 逻辑变更，补充：

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.ui.chat.ChatViewModelTest"
.\gradlew.bat --no-daemon build
```

## 完成标准

- 主动澄清的用户可见问题来自 LLM。
- 规则不生成反问模板，不单独决定 `NEEDS_CLARIFICATION`。
- LLM 不可用时不阻塞原 RAG。
- 后端和必要 Android 测试通过，或记录真实失败原因。
