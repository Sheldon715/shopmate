# RAG Tuning Report

## 1. Baseline Scope

- Generated at: 2026-06-10T00:14:27.732Z
- Case groups: 8
- Queries: 24
- Top K: 20

## 2. Current RAG Path

- Query rewrite is optional and recorded per query when enabled.
- Vector retrieval uses the current ShopMate vector search service.
- Product facts are reloaded from PostgreSQL for stale-hit and constraint checks.
- This report is baseline-only and does not claim retrieval optimization.

## 3. Baseline Metrics

- Passed queries: 24/24
- recall@5: 1.000
- recall@10: 1.000
- recall@20: 1.000
- MRR@10: 1.000
- Average expected rank: 1.000

## 4. Paraphrase Consistency

- Candidate overlap@10: 0.935
- Expected hit consistency: 1.000

## 5. Constraint and Negative Constraint Accuracy

- Constraint satisfaction rate: 1.000
- Negative constraint accuracy: 1.000
- Stale hit rate: 0.000
- No-result accuracy: 1.000

## 6. Failure Type Distribution

| Failure Type | Count |
| --- | ---: |
| data_missing | 6 |
| no_failure_detected | 18 |

## 7. Top Failed Cases

| Case | Query | Failure Type | Notes |
| --- | --- | --- | --- |
| none | none | none | none |

## 8. Evidence Files

- Results JSONL: C:\Users\lxd04\Desktop\WEB\WEB PROJECT\shopmate\data\processed\rag\retrieval-baseline-results.jsonl
- Trace JSONL: C:\Users\lxd04\Desktop\WEB\WEB PROJECT\shopmate\data\processed\rag\retrieval-baseline-traces.jsonl

## 9. Next Recommended Spec

- Baseline is acceptable for this case set; expand cases before introducing a new retrieval strategy.

## 10. E1 Document / Embedding Cleanup

### Expected Set Audit

- `dorm-small-appliance-paraphrases` 的 `expectedProductIdsAny` 已补充 `p_home_kitchen_004`、`p_home_kitchen_001`、`p_home_kitchen_002`。
- 事实依据：三者均为 active `家用电器 / 厨房小电`；商品属性或 FAQ 明确包含 `一人食`、`租房党`、`早餐制作` 等场景。其中 `p_home_kitchen_004` 还包含 `小容量`、`宿舍友好`，与 `一人食省空间小家电` 直接匹配。
- 本次未删除原 expected ids；原列表中的空气护理 / 洗衣机 / 饮水设备仍作为既有宿舍 / 小空间小家电预期候选保留，后续如要收窄 case 语义应另做评估集维护。

### Document Text Changes

- 新增每个 active product 的 `product_profile` 主文档，当前 175/175 个 active product 均有 profile。
- docType 从旧的 `content_block` / `description` / `review_summary` 调整为 `product_profile`、`product_specs`、`selling_points`、`use_cases`、`constraints`、`faq`、`reviews_summary`。
- `marketingDescription` 不再生成 raw `description` 文档，清洗后进入 `product_profile` 或对应内容块文本。
- 已移除进入 embedding text / snippet / metadata tags 的 dataset、demo、source、process、`占位图`、`主图`、`商品详情页数据`、`商品介绍` 等污染文本。
- 新增 deterministic 中文 alias：洁面、防晒、真无线耳机、厨房小电、办公外设、空气护理、跑鞋等 baseline 高价值场景。

### Before / After Metrics

| Metric | E0 | E1 |
| --- | ---: | ---: |
| Passed queries | 23/24 | 24/24 |
| recall@5 | 0.933 | 1.000 |
| recall@10 | 0.933 | 1.000 |
| recall@20 | 0.933 | 1.000 |
| MRR@10 | 0.839 | 1.000 |
| candidate overlap@10 | 0.894 | 0.935 |
| expected hit consistency | 0.958 | 1.000 |
| constraint satisfaction | 1.000 | 1.000 |
| negative constraint accuracy | 1.000 | 1.000 |
| stale hit rate | 0.000 | 0.000 |
| no-result accuracy | 1.000 | 1.000 |

### Remaining Failures

- 当前 24 条 baseline query 全部通过。
- `data_missing` 计数仍为 6，来自 expected-no-result case 的正确 no-result 分类，不代表本轮失败。

### Next Recommended Spec

- 当前 case set 下 E1 稳定，可以先扩充 retrieval baseline cases，覆盖更多口语化场景和商品簇。
- 如果后续扩充后 expected product 已进 top20 但 top5 不稳，再进入 `rag-hybrid-retrieval-candidate-merge-spec.md`。
- 如果候选稳定但最终回答选择弱，再评估 reranker 或 answer grounding 修复。
