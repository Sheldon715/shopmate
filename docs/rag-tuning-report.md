# RAG Tuning Report

## 1. Baseline Scope

- Generated at: 2026-06-09T23:05:02.968Z
- Case groups: 8
- Queries: 24
- Top K: 20

## 2. Current RAG Path

- Query rewrite is optional and recorded per query when enabled.
- Vector retrieval uses the current ShopMate vector search service.
- Product facts are reloaded from PostgreSQL for stale-hit and constraint checks.
- This report is baseline-only and does not claim retrieval optimization.

## 3. Baseline Metrics

- Passed queries: 23/24
- recall@5: 0.933
- recall@10: 0.933
- recall@20: 0.933
- MRR@10: 0.839
- Average expected rank: 1.357

## 4. Paraphrase Consistency

- Candidate overlap@10: 0.894
- Expected hit consistency: 0.958

## 5. Constraint and Negative Constraint Accuracy

- Constraint satisfaction rate: 1.000
- Negative constraint accuracy: 1.000
- Stale hit rate: 0.000
- No-result accuracy: 1.000

## 6. Failure Type Distribution

| Failure Type | Count |
| --- | ---: |
| vector_retrieval_failure | 1 |
| data_missing | 6 |
| no_failure_detected | 17 |

## 7. Top Failed Cases

| Case | Query | Failure Type | Notes |
| --- | --- | --- | --- |
| dorm-small-appliance-paraphrases | 一人食省空间小家电 | vector_retrieval_failure | No expected product id appeared in product-level top-k. |

## 8. Evidence Files

- Results JSONL: C:\Users\lxd04\Desktop\WEB\WEB PROJECT\shopmate\data\processed\rag\retrieval-baseline-results.jsonl
- Trace JSONL: C:\Users\lxd04\Desktop\WEB\WEB PROJECT\shopmate\data\processed\rag\retrieval-baseline-traces.jsonl

## 9. Next Recommended Spec

- Expected products are often missing from top-k; prioritize document and embedding text cleanup.
