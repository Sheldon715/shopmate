# Conversational Cart Add Response Generation

## 概述

对已经完成的 `conversational-cart-add-spec.md` 做一次回复文案补修：保留现有 LLM cart intent、最近推荐商品 allowlist、数量限制和 `CartService` 校验，但把加购结果的用户可见 assistant 回复交给 LLM / chat orchestration prompt 生成。

本 spec 不重做加购意图识别，也不扩大购物车能力范围。目标是移除 `RagChatService.answerCartCommand()` 里成功、歧义、缺上下文、未找到和失败场景的固定导购话术，让代码只返回结构化 `cartAction`、库内商品上下文和安全状态。

## 范围

本 spec 负责：

- 新增或内聚一个 cart action response generation 层。
- 根据 `cartAction` 状态、最近推荐商品上下文和当前用户问题生成 assistant 回复。
- 成功、目标缺失、目标歧义、目标未找到、商品不可用和加购失败都走同一套回复生成入口。
- LLM 输出无效或不可用时，只返回最小状态消息，不拼导购式模板。
- 保持 `done.cartAction`、`fallbackReason`、商品卡片和 Android 刷新 side effect 兼容。
- 补充后端测试，确保加购回复不再来自原来的固定长文案。

不负责：

- 删除 / 修改购物车商品。
- 自然语言购物车管理 CRUD。
- 改 Android UI。
- 改 SSE event 名称或 payload 结构。
- 重做 `CartCommandIntentService`。
- 重做 active clarification。

## 当前问题

当前 cart add 已经满足：

- LLM 判断是否是加购意图。
- 后端只允许最近推荐商品进入加购。
- CartService 做商品存在性、可用性和数量校验。
- Android 通过 `cartAction` 刷新购物车。

但 `RagChatService.answerCartCommand()` 仍然写死用户可见回复，例如：

- 没有最近推荐时的固定说明。
- 多个候选商品时的固定澄清句。
- 未找到目标时的固定说明。
- 加购成功后的固定成功话术。
- `cartAction.message` 里的固定失败话术直接作为 assistant answer。

这些要改成 LLM / orchestration 生成；代码只保留状态和校验。

## 后端实现

预计新增：

- `server/src/modules/chat/cart-action-response.service.ts`
- `server/src/modules/chat/cart-action-response.service.test.ts`（可选；也可集中在 `rag.service.test.ts`）

预计修改：

- `server/src/modules/chat/rag.service.ts`
- `server/src/modules/chat/rag.service.test.ts`
- `server/src/modules/chat/chat-contract.fixture.ts`（如 fixture answer 变化）
- `server/src/modules/chat/chat-contract.fixture.test.ts`（如 fixture answer 变化）

### Response Service

新增服务输入：

```ts
interface CartActionResponseInput {
  question: string;
  cartAction: CartActionResult;
  fallbackReason?: CartCommandFallbackReason;
  recentProducts: Array<{
    id: string;
    name: string;
    brand: string;
    category: string;
  }>;
  requestId?: string;
  abortSignal?: AbortSignal;
}
```

LLM 输出 schema：

```json
{
  "answer": "string"
}
```

输出要求：

- 中文，一句话或两句话。
- 移动端可读，不超过 90 个中文字符。
- 只能基于 `cartAction.status` 和库内商品上下文说话。
- `success` 才能说已加入购物车。
- `needs_target` 必须让用户确认要加哪一个。
- `not_found` 只能说明最近推荐里没匹配到。
- `unavailable` 只能说明该库内商品当前不可加购。
- `failed` 只能说明本次加购未完成。
- 不能编造商品、价格、库存、优惠、物流或结算结果。

### RagChatService 接入

`answerCartCommand()` 调整为：

1. LLM cart intent 已确认是 cart add。
2. 后端读取最近推荐商品并做 allowlist。
3. `CartCommandService.resolveTarget()` 解析目标。
4. 生成结构化 `cartAction`。
5. 调用 cart action response generation 生成 `answer`。
6. 返回 `answer`、`cartAction`、商品卡片和原有 retrieval metadata。

注意：

- 加购命令仍不调用 vector search。
- 加购命令确认后仍不调用 RAG 推荐生成。
- 回复生成可以调用 LLM，但 prompt 必须是 cart action response prompt，不是 RAG prompt。
- LLM 回复失败时不影响结构化 `cartAction` 和购物车实际结果。

### 最小状态消息

模型不可用、输出无效或 answer 为空时，允许返回最小状态消息：

- `success`: `加购已完成。`
- `needs_target`: `需要先确认要加入购物车的商品。`
- `not_found`: `最近推荐中没有找到匹配商品。`
- `unavailable`: `该商品当前不可加购。`
- `failed`: `加购未完成。`

这些是错误 / 状态兜住 UI 的最小文本，不再写导购式说明、推荐理由或操作引导模板。

## 测试

后端必须覆盖：

- 成功加购时调用 cart action response prompt，assistant answer 使用 LLM 输出。
- 目标歧义时不调用 cart，但 assistant answer 使用 LLM 输出。
- 没有最近推荐时不调用 cart，返回 `CART_TARGET_MISSING`，answer 使用 LLM 输出或最小状态消息。
- 目标未找到时不调用 cart，返回 `not_found`。
- 商品不可用 / 加购失败时保留 `cartAction`，answer 不直接使用固定 `cartAction.message`。
- cart action response LLM 输出无效或失败时，结构化 `cartAction` 不丢失，answer 使用最小状态消息。
- cart command 确认后不调用 vector search / RAG prompt。
- 普通推荐请求不调用 cart action response prompt。

## 运行与验证

必须运行：

```powershell
cd server
npm.cmd test -- --run src/modules/chat/rag.service.test.ts
npm.cmd test
npm.cmd run build
```

如未改 SSE 字段或 Android DTO，不需要重跑 Android；如果 fixture 或 payload 结构变化，再补 Android parser / ViewModel 测试。

## 完成标准

- 加购结果用户可见回复不再来自 `RagChatService` 固定导购话术。
- LLM / chat orchestration prompt 根据 `cartAction` 状态生成回复。
- 模型不可用时只有最小状态消息，不伪装成导购生成。
- 购物车真实操作、allowlist 校验、数量限制和 Android `cartAction` side effect 保持不变。
- 后端 test / build 通过，或记录真实失败原因。
