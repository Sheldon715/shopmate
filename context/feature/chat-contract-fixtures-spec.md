# Chat Contract Fixtures

## 概述

固定后端聊天 SSE contract 的文档、payload types 和测试 fixture，作为 Android 后续解析实现的来源。

本 spec 只做后端 contract 对齐和文档沉淀。不写 Android DTO / parser，不改 RAG service，不改 SSE controller 行为。

## 范围

本 spec 负责：

- 新增 `docs/chat-stream-contract.md`。
- 固定 `POST /api/chat/stream` request body schema。
- 固定 `message_delta`、`product_cards`、`done`、`error` event payload schema。
- 新增后端 contract fixture，覆盖成功、fallback、error 和无商品场景。
- 让后端 SSE tests 复用或对齐 fixture。

不负责：

- Android 代码。
- Android parser / mapper。
- 真实网络请求。
- RAG / LLM / vector 逻辑。
- true provider streaming。

## 文件

预计新增：

- `docs/chat-stream-contract.md`
- `server/src/modules/chat/chat-contract.fixture.ts`
- `server/src/modules/chat/chat-contract.fixture.test.ts`

预计修改：

- `server/src/modules/chat/sse-writer.ts`：如需要，导出稳定 event payload types。
- `server/src/modules/chat/chat.controller.test.ts`：复用 fixture，避免测试里手写不同 payload。
- `server/src/modules/chat/chat.types.ts`：如需要，补充 contract 类型；不要把 Android 专属字段写进 RAG core type。

## Request Contract

`POST /api/chat/stream`

```json
{
  "message": "我想买适合通勤的耳机，预算 500 左右",
  "history": [
    { "role": "user", "content": "我比较在意续航" },
    { "role": "assistant", "content": "可以优先看轻量和长续航款。" }
  ],
  "filters": {
    "category": "数码电子",
    "subCategory": "耳机",
    "brand": "示例品牌",
    "minPriceCents": 10000,
    "maxPriceCents": 50000,
    "availableOnly": true,
    "tagsAny": ["通勤", "蓝牙"],
    "avoidTerms": ["酒精"]
  },
  "topK": 8,
  "maxRecommendedProducts": 3
}
```

文档必须注明：

- Android 第一版只必须发送 `message` 和最近最多 4 条 `history`。
- `filters`、`topK`、`maxRecommendedProducts` 没有 UI 来源时不要硬编码复杂筛选。
- 请求校验失败返回普通 JSON，不开启 SSE。

## Event Contract

事件名固定：

- `message_delta`
- `product_cards`
- `done`
- `error`

成功顺序固定：

1. 0 个或多个 `message_delta`
2. 1 个 `product_cards`
3. 1 个 `done`

错误顺序固定：

1. 1 个 `error`
2. stream 结束

## Payload Schemas

`message_delta`

```json
{
  "text": "推荐你先看这几款。",
  "index": 0
}
```

`product_cards`

```json
{
  "items": [
    {
      "id": "product_001",
      "name": "通勤蓝牙耳机 A",
      "brand": "示例品牌",
      "category": "数码电子",
      "subCategory": "耳机",
      "priceCents": 19900,
      "priceRangeCents": { "min": 17900, "max": 21900 },
      "currency": "CNY",
      "imagePath": "/images/product_001.png",
      "ratingAvg": 4.6,
      "tags": ["通勤", "蓝牙"],
      "available": true
    }
  ]
}
```

`done`

```json
{
  "recommendedProductIds": ["product_001"],
  "fallbackUsed": false,
  "fallbackReason": null,
  "retrieval": {
    "candidateCount": 3,
    "returnedProductIds": ["product_001"]
  }
}
```

`error`

```json
{
  "code": "CHAT_STREAM_ERROR",
  "message": "Chat stream failed.",
  "retryable": true
}
```

## Fixtures

新增 structured fixtures：

- success stream：2 个 `message_delta` + `product_cards` + `done`
- empty answer fallback：`product_cards` + `done(fallbackUsed=true)`
- error stream：`error`
- no product stream：`message_delta` + `product_cards(items=[])` + `done`

要求：

- fixture 里的 product card 必须符合 `ProductCardDto` 必填字段。
- fixture 中的 event 顺序必须与 contract 一致。
- `docs/chat-stream-contract.md` 展示 fixture 对应的 SSE 文本样例。
- 不在 fixture 中写 prompt、API key、provider 原始报错或 `.env` 内容。

## Compatibility Rules

后端必须遵守：

- 不删除已有 event 名称。
- 不把 `ProductCardDto` 改成 snake_case。
- 新增字段只能作为 optional / ignored-safe 字段。
- 错误响应不包含 prompt、API key、`.env`、provider 原始报错详情。
- `ProductCardDto` 仍然从 PostgreSQL mapper 生成，不由 LLM 生成。

## 测试

Vitest 覆盖：

- 每个 fixture event payload 能被 `writeSseEvent()` 序列化。
- fixture 的 product card 符合 `ProductCardDto` 必填字段。
- `done` payload 包含 `recommendedProductIds`、`fallbackUsed` 和 `retrieval`。
- error fixture 包含 `code`、`message`、`retryable`。
- `chat.controller.test.ts` 的成功 / fallback / error 预期与 fixture 对齐。

## 验收标准

- `docs/chat-stream-contract.md` 明确记录 request、event、payload、error 和兼容规则。
- 后端有可复用 contract fixture。
- 后端 SSE tests 复用或严格对齐 fixture。
- 没有引入 Android 代码。
- 没有改 RAG / LLM / vector 行为。
- `cd server && npm.cmd test` 通过。
- `cd server && npm.cmd run build` 通过。
