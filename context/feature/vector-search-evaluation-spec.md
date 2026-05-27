# Vector Search Evaluation

## 概述

在 `vector-rag-documents-spec.md` 和 `vector-qdrant-index-spec.md` 完成后，建立第一版离线检索评估。目标是在接 LLM / SSE 前，先确认 query embedding + Qdrant filter 能稳定召回库内商品。

本 spec 不调用 LLM，不生成导购回复，不实现 Android 接入。它只评估向量检索质量和硬过滤正确性。

## 范围

本 spec 负责：

- 新增固定离线检索测试集。
- 新增 `rag:evaluate` 脚本。
- 记录 top-k hits、filters、pass / fail 和失败原因。
- 明确哪些失败需要回到 document / metadata / filter 设计修复。

不负责：

- 修改 embedding model。
- 重写 RAG documents。
- 接入 LLM。
- 黑盒 RAG 聊天测试，交给 `rag-evaluation-spec.md`。
- query rewriting、query expansion、re-ranking。

## 文件

预计新增：

- `server/src/scripts/evaluate-rag.ts`
- `server/src/modules/vector/vector-evaluation.types.ts`
- `server/src/modules/vector/vector-evaluation.service.ts`
- `server/src/modules/vector/vector-evaluation.service.test.ts`
- `data/processed/rag/evaluation-cases.json`

预计修改：

- `server/package.json`

生成工件：

- `data/processed/rag/evaluation-results.jsonl`

## Script

`server/package.json` 新增：

```json
{
  "rag:evaluate": "tsx src/scripts/evaluate-rag.ts"
}
```

脚本要求：

- 读取 `evaluation-cases.json`。
- 对每个 case 调用 vector search。
- 不调用 LLM。
- 输出每个 case 的 query、filters、hits、pass / fail、failure reason。
- 支持 `--case`、`--limit`、`--output`。

## Evaluation Cases

首批 case：

- `推荐一款适合油皮的洗面奶`
- `200 元以内的蓝牙耳机有哪些？`
- `推荐防晒霜，但不要含酒精的`
- `帮我比较两款防晒霜`
- `适合宿舍用的小电器有哪些？`
- `500 元以内轻量跑鞋`
- `宿舍用安静一点的键盘`
- `1000 元以内空气净化器`

每个 case 至少记录：

- `caseId`
- `query`
- `filters`
- `expectedCategory`
- `expectedSubCategory`
- `expectedProductIdsAny`
- `expectedNoResult`
- `passCriteria`

## 评估规则

- 检查 top-k 是否命中期望类目 / 子类。
- 检查硬过滤是否生效，尤其预算和 active / available。
- 检查所有 `product_id` 后续可被 PostgreSQL 回查。
- no result 可以是合理结果，但必须符合 case 预期。
- 失败原因使用稳定 code：
  - `no_vector_result`
  - `wrong_category`
  - `budget_violation`
  - `stale_hit`
  - `filter_too_strict`
  - `unexpected_result`

## 通过门槛

- P0：不得返回明显违反硬过滤的商品。
- P0：不得返回 PostgreSQL 中不存在的 active product。
- P0：失败 case 必须有明确 failure reason。
- P1：8 个 case 至少 6 个命中期望类目 / 子类，或合理返回 no result。
- P1：每个 hit 都记录 `doc_id`、`product_id`、score、snippet。

## 输出格式

`evaluation-results.jsonl` 每行至少包含：

- `caseId`
- `query`
- `filters`
- `hits`
- `passed`
- `failureReasons`
- `notes`
- `generatedAt`

不要把真实 API key、embedding vectors 或完整商品 JSON 写入结果。

## 测试

Vitest 覆盖：

- pass / fail 判定逻辑。
- category / subCategory 检查。
- budget violation 检查。
- stale hit 标记。
- expected no result case。

不在单元测试中调用真实 Qdrant、真实 embedding API 或真实 PostgreSQL。

## 验收标准

- `data/processed/rag/evaluation-cases.json` 存在，并包含首批 8 个 case。
- `rag:evaluate` 能生成 `evaluation-results.jsonl`。
- 评估结果能区分通过、失败和合理 no result。
- 失败原因使用稳定 code。
- 结果能指导后续是否需要调整 document、metadata 或 filter。
- `cd server && npm.cmd test` 通过。
- `cd server && npm.cmd run build` 通过。
