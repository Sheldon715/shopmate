# Vector Qdrant Index

## 概述

在 `vector-rag-documents-spec.md` 完成后，接入 embedding wrapper 和 Qdrant，把 `product-documents.jsonl` 写入 `shopmate_product_documents` collection，并提供本地 `rag:index` / `rag:search` 调试能力。

本 spec 只做 embedding、Qdrant index 和基础 search，不做离线评估、不接 LLM、不实现 SSE。

## 范围

本 spec 负责：

- 新增 provider-neutral `EmbeddingClient`。
- 新增 fake embedding 供测试使用。
- 新增 Qdrant client / adapter。
- 创建 Qdrant collection 和 payload indexes。
- 新增 `rag:index` 和 `rag:search` 脚本。
- 实现 `VectorSearchService.search` 返回轻量 hits。

不负责：

- RAG document builder，已由 `vector-rag-documents-spec.md` 处理。
- 离线评估，交给 `vector-search-evaluation-spec.md`。
- PostgreSQL 商品回查编排，交给 `rag-chat-service-spec.md`。
- LLM、SSE、Android 接入。

## 依赖与环境

新增依赖：

- `@qdrant/js-client-rest`

新增 / 扩展 env：

- `QDRANT_URL`
- `QDRANT_API_KEY`
- `QDRANT_COLLECTION_PRODUCTS`
- `EMBEDDING_PROVIDER`
- `EMBEDDING_BASE_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS`
- `EMBEDDING_ENDPOINT_KIND`
- `EMBEDDING_BATCH_SIZE`
- `EMBEDDING_TIMEOUT_MS`
- `EMBEDDING_MAX_RETRIES`
- `RAG_TOP_K`

默认值按 research 结果：collection `shopmate_product_documents`，embedding model `doubao-embedding-vision-250615`，dimensions `2048`，distance `Cosine`。

Qdrant 本地启动：

```powershell
docker run --rm -p 6333:6333 -v shopmate_qdrant:/qdrant/storage qdrant/qdrant
```

## 文件

预计新增：

- `server/src/modules/vector/embedding.types.ts`
- `server/src/modules/vector/embedding.service.ts`
- `server/src/modules/vector/fake-embedding.service.ts`
- `server/src/modules/vector/qdrant.client.ts`
- `server/src/modules/vector/qdrant.types.ts`
- `server/src/modules/vector/vector-search.service.ts`
- `server/src/modules/vector/vector-search.types.ts`
- `server/src/modules/vector/vector-search.service.test.ts`
- `server/src/scripts/index-product-vectors.ts`
- `server/src/scripts/search-product-vectors.ts`

预计修改：

- `server/src/lib/env.ts`
- `server/package.json`
- `.env.example`

生成工件：

- `data/processed/rag/vector-index-manifest.json`

## Qdrant

collection：

- name：`shopmate_product_documents`
- vector size：来自 `EMBEDDING_DIMENSIONS`
- distance：`Cosine`
- point id：deterministic UUID，基于 `{embedding_model}|{dimensions}|{doc_id}`

payload 只保存过滤和调试字段，不保存完整商品 JSON、完整 SKU、购物车数据、图片事实或库存结论。

payload indexes：

- keyword：`doc_id`、`product_id`、`doc_type`、`status`、`category`、`sub_category`、`brand`、`tags`、`recommend_when`、`avoid_when`、`block_type`、`ingest_batch_id`、`embedding_model`
- integer：`price_min_cents`、`price_max_cents`
- bool：`available`

## Embedding

`EmbeddingClient` 至少提供：

- `embedDocuments(texts: string[]): Promise<EmbeddingResult>`
- `embedQuery(text: string): Promise<EmbeddingResult>`

要求：

- document embedding 和 query embedding 使用同一个 model / dimensions。
- 每次返回后验证向量维度。
- model 或 dimensions 改变时必须重建 collection。
- 测试使用 fake embedding，不调用真实 API。

## Scripts

`server/package.json` 新增：

```json
{
  "rag:index": "tsx src/scripts/index-product-vectors.ts",
  "rag:search": "tsx src/scripts/search-product-vectors.ts"
}
```

`rag:index`：

- 读取 `product-documents.jsonl`。
- 创建 / 重建 collection。
- 生成 embeddings。
- upsert Qdrant points。
- 输出 `vector-index-manifest.json`。
- 支持 `--dry-run`、`--limit`、`--recreate`。

`rag:search`：

- 支持 `--query`。
- 支持 category / brand / price 等基本 filter 参数。
- 输出 `doc_id`、`product_id`、score、snippet。
- 不调用 LLM。

## Vector Search

`VectorSearchFilters` 第一版支持：

- `category`
- `subCategory`
- `brand`
- `minPriceCents`
- `maxPriceCents`
- `availableOnly`
- `tagsAny`
- `avoidTerms`

filter 规则：

- 永远加 `status = active`。
- 默认加 `available = true`。
- 类目、子类、品牌为 exact match。
- 用户最大预算：`price_min_cents <= maxPriceCents`。
- 用户最低预算：`price_max_cents >= minPriceCents`。
- `avoidTerms` 只处理明确品牌、tag 或 `avoid_when` 关键词，不做复杂语义否定。

search 返回轻量 `VectorSearchHit`，供后续 `rag-chat-service-spec.md` 去重、回查和排序。

## 测试

Vitest 覆盖：

- fake embedding 稳定。
- 向量维度不匹配时报错。
- 空文本拒绝。
- filter builder 的 budget range 方向正确。
- Qdrant error 映射为 `VECTOR_SEARCH_FAILED`。
- search hit payload 映射稳定。

不在单元测试中调用真实 Qdrant、真实 embedding API 或真实 PostgreSQL。

## 验收标准

- `rag:index` 可以创建 / 重建 Qdrant collection 并 upsert documents。
- `rag:search --query "200 元以内的蓝牙耳机有哪些？"` 能输出 `doc_id`、`product_id`、score 和 snippet。
- Qdrant payload 不包含完整商品事实或购物车数据。
- search result 不包含最终商品卡片事实，只返回候选 hit。
- `cd server && npm.cmd test` 通过。
- `cd server && npm.cmd run build` 通过。
