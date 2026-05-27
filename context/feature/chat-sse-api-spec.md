# Chat SSE API

## 概述

实现 Phase 2 第一版聊天流式接口：新增 `POST /api/chat/stream`，让 Android 后续可以通过 SSE 收到回答文本、商品卡片和完成状态。

本 spec 只做 HTTP / SSE 接口层。它调用已完成的 `RagChatService.answer()`，不改 RAG 检索、prompt、LLM client 或商品推荐逻辑。

第一版不是 true provider streaming：后端先等待 `RagChatService.answer()` 得到完整结果，再把 `answer` 切成 `message_delta` 事件输出。这样先稳定 App 接口和错误路径，后续如果要接 provider streaming，再扩展 `LlmClient` 和 RAG service。

## 范围

本 spec 负责：

- 新增 `/api/chat/stream` 路由。
- 解析并校验聊天请求 body。
- 设置 SSE headers。
- 输出 `message_delta`、`product_cards`、`done`、`error` 事件。
- 将客户端断开映射到 `AbortController`，传给 `RagChatService.answer()`。
- 处理 RAG service 抛错、JSON 序列化失败、写流失败和客户端断开。
- 用 Vitest 覆盖请求校验、SSE event 格式、成功流、fallback 流和错误流。

不负责：

- Android UI contract 的最终冻结。
- Android 端 EventSource / OkHttp 接入。
- true LLM streaming。
- query rewriting、query expansion、reranking、Agentic RAG。
- 对话持久化、用户登录、购物车写入。
- RAG 评估测试集。

## API Key Gate

沿用第 9 / 10 步规则：

- 单元测试使用 fake `RagChatService`，不调用真实 Qdrant、embedding、PostgreSQL 或 LLM。
- 缺少真实 `LLM_API_KEY` 时，测试和 build 仍然通过。
- 如果要手动 smoke test 真实 RAG 链路但本地缺 key，停下来提示我配置 `.env`，不要硬写或编造 key。

## 文件

预计新增：

- `server/src/modules/chat/chat.routes.ts`
- `server/src/modules/chat/chat.controller.ts`
- `server/src/modules/chat/chat-stream.request.ts`
- `server/src/modules/chat/sse-writer.ts`
- `server/src/modules/chat/chat-stream.request.test.ts`
- `server/src/modules/chat/sse-writer.test.ts`
- `server/src/modules/chat/chat.controller.test.ts`

预计修改：

- `server/src/app.ts`：挂载 `app.use("/api/chat", chatRouter)`。
- `server/src/modules/chat/chat.types.ts`：如需要，补充 API 层 request / event types。

不要新增 Express 以外的 runtime dependency。测试如果不需要完整 HTTP server，优先用 fake request / response 测 controller 和 SSE writer。

## Endpoint

`POST /api/chat/stream`

Headers:

```text
Content-Type: application/json
Accept: text/event-stream
```

Request body：

```json
{
  "message": "我想买适合通勤的耳机，预算 500 左右",
  "history": [
    { "role": "user", "content": "我比较在意续航" },
    { "role": "assistant", "content": "可以优先看轻量和长续航款。" }
  ],
  "filters": {
    "category": "数码电子",
    "maxPriceCents": 50000,
    "availableOnly": true
  },
  "topK": 8,
  "maxRecommendedProducts": 3
}
```

字段规则：

- `message` 必填，trim 后 1 到 1000 字符。
- `history` 可选，最多 4 条，只允许 `user` / `assistant`，每条 content trim 后 1 到 500 字符。
- `filters` 可选，字段与 `VectorSearchFilters` 对齐。
- `topK` 可选，整数 1 到 20。
- `maxRecommendedProducts` 可选，整数 1 到 5。

Controller 映射到：

```ts
ragChatService.answer({
  question: body.message,
  shortHistory: body.history,
  filters: body.filters,
  topK: body.topK,
  maxRecommendedProducts: body.maxRecommendedProducts,
  requestId,
  abortSignal,
});
```

## SSE Headers

校验请求成功后再开启 SSE。开启后设置：

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

实现要求：

- 调用 `response.flushHeaders?.()`，如果当前 Response 没有这个方法就跳过。
- 开启 SSE 后不要再返回 `ApiResponse<T>` JSON wrapper。
- 在等待 RAG 结果期间可以每 15 秒写一次 SSE comment heartbeat：`: ping\n\n`。
- 结束时必须 `response.end()`，除非客户端已经断开。

## Event Contract

SSE event 固定格式：

```text
event: message_delta
data: {"text":"推荐你先看...","index":0}

event: product_cards
data: {"items":[...]}

event: done
data: {"recommendedProductIds":["product_001"],"fallbackUsed":false,"retrieval":{"candidateCount":3,"returnedProductIds":["product_001"]}}
```

必须支持的 event：

- `message_delta`
  - `data.text`: string
  - `data.index`: number，从 0 递增
- `product_cards`
  - `data.items`: `ProductCardDto[]`
- `done`
  - `data.recommendedProductIds`: string[]
  - `data.fallbackUsed`: boolean
  - `data.fallbackReason`: optional string
  - `data.retrieval`: `RagChatResult["retrieval"]`
- `error`
  - `data.code`: string
  - `data.message`: string
  - `data.retryable`: boolean

第一版输出顺序：

1. 多个 `message_delta`。
2. 一个 `product_cards`。
3. 一个 `done`。
4. `response.end()`。

如果发生错误：

1. 一个 `error`。
2. `response.end()`。

## Message Chunking

新增纯函数 `chunkMessageDelta(answer)`：

- 用 `Array.from(answer)` 避免切坏中文和 emoji。
- 默认每段 80 到 120 个字符即可。
- 空 answer 不输出 `message_delta`，但仍输出 `product_cards` 和 `done`。
- 不要为了演示效果在生产代码里加固定 sleep。

## 请求校验

请求校验失败发生在 SSE headers 之前，返回普通 JSON：

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CHAT_REQUEST",
    "message": "message 不能为空"
  }
}
```

HTTP status：

- `400 INVALID_CHAT_REQUEST`：body 格式错误、message 为空、history / filters / topK 参数非法。
- `500 INTERNAL_ERROR`：headers 还没开启时发生未知错误。

SSE 已开启后，不再写 HTTP JSON error，只写 `error` event。

## 客户端断开

Controller 要创建 `AbortController`：

- 监听 `request.on("close")`。
- 如果 response 尚未正常结束，调用 `abortController.abort()`。
- 把 `abortSignal` 传入 `RagChatService.answer()`。
- 客户端主动断开不当作 500，不写 error log 噪音。
- 断开后不要继续 `response.write()`。

## 错误处理

必须覆盖：

- `RagChatService.answer()` 抛 `RagChatError`：如果 SSE 未开启，返回 `400 INVALID_CHAT_REQUEST`；如果已开启，输出 `error` event。
- RAG / vector / LLM 未预期抛错：输出 `error` event `CHAT_STREAM_ERROR`。
- JSON.stringify 失败：输出 `error` event `SSE_SERIALIZATION_ERROR`，然后结束。
- `response.write()` 失败或流已关闭：停止后续写入，不再追加事件。

注意：第 10 步的正常 LLM 失败、无检索结果、invalid LLM JSON 应该已经由 `RagChatService` 转成 fallback result。SSE controller 不要重复实现 RAG fallback。

## 测试

Vitest 覆盖：

- `chat-stream.request.test.ts`
  - 合法 request body 会映射成 `RagChatRequest`。
  - message 空、message 过长、history role 非法、topK 越界、maxRecommendedProducts 越界会报 `INVALID_CHAT_REQUEST`。
  - filters 只接受允许字段和正确类型。
- `sse-writer.test.ts`
  - `writeSseEvent()` 输出标准 `event:` / `data:` / 空行格式。
  - product cards 可以序列化。
  - JSON serialization error 返回 false 或抛固定错误，调用方能写 `error` event。
  - `chunkMessageDelta()` 不切坏中文文本。
- `chat.controller.test.ts`
  - 成功结果输出 `message_delta -> product_cards -> done`。
  - RAG fallback result 仍按成功流输出，并在 `done` 带 `fallbackUsed=true`。
  - request validation error 在 SSE headers 前返回 400 JSON。
  - fake RAG service 抛错时输出 `error` event 并结束。
  - client close 会 abort 下游 signal，且不会继续写事件。

测试使用 fake `RagChatService`，不要调用真实外部服务。

## 手动验证

本地真实链路可选 smoke test：

1. 确认 PostgreSQL、Qdrant、embedding、LLM env 都已配置。
2. 启动后端：`cd server && npm.cmd run dev`。
3. 用 PowerShell 或 curl 发起 SSE 请求。

示例请求：

```powershell
curl.exe -N -X POST http://localhost:3000/api/chat/stream `
  -H "Content-Type: application/json" `
  -H "Accept: text/event-stream" `
  -d "{\"message\":\"我想买适合通勤的耳机，预算 500 左右\",\"maxRecommendedProducts\":3}"
```

如果缺少真实 LLM key，停下来提示配置，不把 key 写进命令、文档或聊天。

## 验收标准

- `POST /api/chat/stream` 已挂载到 Express app。
- 合法请求返回 `text/event-stream`。
- 成功流按顺序输出 `message_delta`、`product_cards`、`done`。
- 错误流输出 `error` 并结束。
- 请求参数非法时返回 400 JSON，不开启 SSE。
- 客户端断开会 abort 下游 RAG 调用。
- 不在日志或响应里暴露 API key、完整 prompt、`.env` 内容。
- 不新增 true LLM streaming 或 RAG 高级优化。
- `cd server && npm.cmd test` 通过。
- `cd server && npm.cmd run build` 通过。
