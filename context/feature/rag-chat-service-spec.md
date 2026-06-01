# RAG Chat Service

## 概述

实现 Phase 2 第一版 RAG 聊天编排服务：用户问题进入后，后端先做向量检索，再用 PostgreSQL 回查商品事实，之后构造 prompt 调用 `LlmClient`，最后解析并校验模型输出，返回自然语言回答和商品卡片。

本 spec 使用当前已确认路线：Node.js / TypeScript 后端 + Qdrant 向量检索 + provider-neutral `LlmClient`。不再引入 Python / LangChain / Chroma。

本 spec 不实现 `/api/chat/stream`、SSE event、Android 接入、真实 provider streaming 或高级 RAG 优化。

## 范围

本 spec 负责：

- 新增 `server/src/modules/chat/`。
- 实现 `RagChatService`，串联 vector search、PostgreSQL 商品回查、prompt builder、LLM client 和异常 / 无候选返回。
- 实现 `prompt.builder.ts`，统一管理 RAG prompt。
- 实现 LLM JSON 输出 parser 和 product id allowlist 校验。
- 确保商品卡片永远从 PostgreSQL DTO 生成，不信任 LLM 返回的价格、库存、图片或商品字段。
- 支持单轮模糊推荐，并支持把 caller 传入的基础 filters 透传给 vector search。
- 用 Vitest 覆盖 happy path、无结果、LLM 失败、模型乱给 product id、stale vector hit 等路径。

不负责：

- `/api/chat/stream` 路由。
- SSE delta / product_cards / done / error event。
- Android chat UI contract。
- query rewriting、query expansion、LLM reranking、tool calling、Agentic RAG、GraphRAG。
- 长期用户画像、长期对话记忆、购物车写入。

## API Key Gate

沿用 `llm-client-spec.md` 的规则：

- 单元测试必须使用 `MockLlmClient`，不调用真实 LLM。
- 缺少 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` 时，server build 和 mock tests 仍然通过。
- 如果实现或验证时需要真实 LLM 调用，但本地没有有效 key，必须停下来告诉我配置 `.env` 或部署环境变量。
- 不要在代码、测试、文档、日志或聊天里硬写真实 key。
- 第一版验收不强制真实 LLM API 成功。

## 文件

预计新增：

- `server/src/modules/chat/chat.types.ts`
- `server/src/modules/chat/rag.service.ts`
- `server/src/modules/chat/prompt.builder.ts`
- `server/src/modules/chat/rag-llm-output.parser.ts`
- `server/src/modules/chat/prompt.builder.test.ts`
- `server/src/modules/chat/rag-llm-output.parser.test.ts`
- `server/src/modules/chat/rag.service.test.ts`

预计修改：

- `server/src/modules/products/product.repository.ts`
- `server/src/modules/products/product.service.ts` 或新增轻量 RAG reader
- `server/src/modules/products/product.repository.test.ts` 如需要覆盖按 id 批量回查

不新增 Express route；第 11 个 `chat-sse-api-spec.md` 再接入 HTTP / SSE。

## 数据流

`RagChatService.answer(input)` 第一版流程：

1. 校验 `question` 非空，裁剪短历史长度。
2. 调用 `VectorSearchService.search({ query: question, filters, topK })`。
3. 按 `productId` 去重，保留每个商品最高分命中和少量 snippets。
4. 用 PostgreSQL 按 product ids 批量回查 active products。
5. 丢弃 PostgreSQL 中不存在或非 active 的 stale vector hit。
6. 保持检索顺序构造 `RetrievedProductContext[]`。
7. 如果无候选商品，返回明确的无结果状态，不调用 LLM。
8. 调用 `buildRagPrompt()` 生成 `LlmMessage[]`。
9. 用 `LlmClient.generate()` 请求 JSON 输出。
10. 解析 `{ answer, recommended_product_ids }`。
11. 只保留候选商品 allowlist 内的 product ids，并去重。
12. 如果模型输出不可用，只保留通过库内校验的候选商品，不拼装导购式推荐理由。
13. 商品卡片用 `mapProductToCardDto(product)` 生成。
14. 返回 `answer`、`recommendedProductIds`、`productCards` 和轻量 metadata，供后续 SSE route 包装。

## Types

建议 contract：

```ts
export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RagChatRequest {
  question: string;
  shortHistory?: ChatHistoryMessage[];
  filters?: VectorSearchFilters;
  topK?: number;
  maxRecommendedProducts?: number;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface RetrievedProductContext {
  product: Product;
  score: number;
  snippets: string[];
  metadata: VectorSearchHitMetadata;
}

export interface RagChatResult {
  answer: string;
  recommendedProductIds: string[];
  productCards: ProductCardDto[];
  fallbackUsed: boolean;
  fallbackReason?: "NO_CANDIDATES" | "LLM_ERROR" | "LLM_INVALID_OUTPUT" | "NO_VALID_PRODUCT_IDS";
  retrieval: {
    candidateCount: number;
    returnedProductIds: string[];
  };
}
```

注意：

- `retrieval` 只返回轻量 debug 信息，不返回完整 prompt。
- `ProductCardDto` 必须来自 PostgreSQL product mapper。
- `shortHistory` 第一版最多保留最近 4 条，每条内容做长度限制。

## Prompt Builder

`buildRagPrompt(input)` 必须包含：

- 当前日期，使用 ISO date。
- 数据说明：商品数据是脱敏 / synthetic / curated demo catalog，不能当作实时电商库存。
- 用户当前问题。
- 必要短历史。
- 候选商品列表，字段来自 PostgreSQL：id、名称、品牌、类目、价格区间、库存可用状态、标签、适用场景、避坑点、摘要。
- 每个候选商品对应的 vector snippets，用作解释上下文。
- 输出格式要求：只输出 JSON object。

Prompt 必须明确禁止：

- 编造候选外商品。
- 编造价格、库存、优惠、折扣、功效、认证、物流时效。
- 把 snippet 当作比 PostgreSQL 商品字段更权威的事实来源。
- 返回不在候选列表里的 product id。
- 在没有合适商品时硬推荐。

第一版 prompt 只做推荐和解释，不做 query expansion / reranking。

## LLM 输出解析

模型目标输出：

```json
{
  "answer": "string",
  "recommended_product_ids": ["product_001"]
}
```

Parser 规则：

- 只接受 JSON object。
- `answer` 必须是非空 string。
- `recommended_product_ids` 必须是 string array。
- 丢弃空字符串、重复 id、候选 allowlist 之外的 id。
- 如果 JSON 外面包了少量 markdown code fence，可以做保守清理；不要写复杂自然语言解析器。
- parser 不读取商品价格、库存、图片或卡片字段。

## 异常与无候选返回

必须有稳定异常路径：

- 无候选商品：返回明确无结果状态，`productCards=[]`。
- LLM config missing、LLM error、timeout、invalid JSON：不拼装导购式推荐理由；只返回结构化状态和通过库内校验的候选商品卡片。
- 模型返回的 product ids 全部不合法：不信任模型 ids，只能使用候选 allowlist 和 PostgreSQL 回查后的商品。
- `answer` 不能用代码模板生成推荐解释；如果模型不可用，只能给出简短状态说明，不编造具体理由。

这些路径仍必须返回现有协议字段 `fallbackUsed=true` 和明确 `fallbackReason`，方便 SSE / Android / evaluation 识别状态。

## 商品回查

新增或复用一个按 id 批量回查方法：

- 输入 product ids。
- 只返回 `status = 'active'` 商品。
- 同时加载 SKUs。
- 输出顺序按输入 product ids 保持。
- 对不存在的 id 静默跳过，交给 RAG service 处理 stale vector hit。

不要在 RAG service 中用循环 N 次 `findProductById()` 查询。

## 测试

Vitest 覆盖：

- `prompt.builder.test.ts`
  - 包含当前日期、脱敏 / synthetic 说明、用户问题、短历史、候选商品、snippets。
  - 包含禁止编造价格、库存、候选外商品的规则。
  - 不包含 API key、完整 `.env`、过长历史。
- `rag-llm-output.parser.test.ts`
  - 正常 JSON。
  - markdown code fence 包裹 JSON。
  - malformed JSON。
  - 空 answer。
  - 重复 product ids。
  - 候选 allowlist 外 product ids。
- `rag.service.test.ts`
  - happy path：vector hit -> PostgreSQL 回查 -> LLM JSON -> product cards。
  - LLM 返回候选外 id 时被丢弃。
  - LLM 失败时不生成导购式推荐理由，只返回安全状态和库内候选商品。
  - 无 vector candidates 时不调用 LLM。
  - vector hit 指向 stale product id 时被跳过。
  - `filters`、`topK`、`abortSignal` 会传给下游依赖。

单元测试使用 fake vector service、fake product reader 和 `MockLlmClient`。不要在单元测试中调用真实 Qdrant、真实 embedding、真实 PostgreSQL 或真实 LLM。

## 验收标准

- `server/src/modules/chat/` 下有清晰的 service、prompt builder、parser、types 和 tests。
- RAG service 不依赖 Express request / response，后续 SSE route 可以直接调用。
- LLM 输出只用于 `answer` 和候选 id 选择；商品卡片字段全部来自 PostgreSQL。
- 缺少真实 API key 时不影响 mock tests 和 build。
- 无候选、LLM 失败、模型乱返回 id 都有稳定状态返回。
- 第一版没有 query expansion / reranking / tool calling，但 service 边界允许后续插入这些步骤。
- `cd server && npm.cmd test` 通过。
- `cd server && npm.cmd run build` 通过。
