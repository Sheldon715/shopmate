# RAG Evaluation Cases

## 概述

建立 12.5 第一轮 RAG Chat 黑盒测试集。这个 spec 只负责设计和落盘测试 case，不运行真实后端、不调用 LLM、不判断当前实现好坏。

后续 `rag-evaluation-baseline-report-spec.md` 会读取这些 case，运行离线检索和 Chat SSE 黑盒测试。

## 范围

本 spec 负责：

- 新增 `data/processed/rag/chat-evaluation-cases.json`。
- 固定第一轮 Chat SSE 黑盒测试问题。
- 为每个 case 记录 query、history、filters、topK、maxRecommendedProducts、期望行为、期望商品和风险点。
- 标注哪些 case 是基础必做，哪些是后续优化观察项。

不负责：

- 运行 `rag:evaluate`。
- 调用 `POST /api/chat/stream`。
- 生成 `docs/rag-evaluation-baseline-report.md`。
- 修改 RAG、LLM、vector、SSE 或 Android 代码。
- 调整现有 `data/processed/rag/evaluation-cases.json` 标准答案。
- 新增 Gradio、dashboard、debug API 或测试 runner。

## 文件

预计新增：

- `data/processed/rag/chat-evaluation-cases.json`

预计修改：

- 无源代码修改。

## Case Schema

`chat-evaluation-cases.json` 使用 JSON array。每个 case 建议包含：

```json
{
  "caseId": "oil-skin-cleanser-chat",
  "query": "推荐一款适合油皮的洗面奶",
  "history": [],
  "filters": {
    "category": "美妆护肤",
    "subCategory": "洁面",
    "availableOnly": true
  },
  "topK": 8,
  "maxRecommendedProducts": 3,
  "expectedBehavior": "推荐库内洁面商品，回答不编造价格、库存或功效。",
  "expectedProductIdsAny": ["p_beauty_011"],
  "expectedNoResult": false,
  "riskFocus": ["retrieval", "llm_grounding"],
  "priority": "p0"
}
```

字段规则：

- `caseId`：稳定英文 id，后续 report 复用。
- `query`：用户原始问题，不要过度改写。
- `history`：可为空数组；多轮 case 最多放当前 SSE contract 支持的短历史。
- `filters`：只使用 `VectorSearchFilters` 已支持字段。
- `topK`：第一轮默认 8，除非 case 明确需要不同 topK。
- `maxRecommendedProducts`：第一轮默认 3。
- `expectedBehavior`：用自然语言写清楚通过标准。
- `expectedProductIdsAny`：如果当前商品库有明确期望商品就填写；否则为空数组。
- `expectedNoResult`：只有当前商品库确实没有合适结果时才设为 true。
- `riskFocus`：可选值建议使用 `retrieval`、`filter`、`llm_grounding`、`sse_contract`、`no_result`、`follow_up`、`comparison`。
- `priority`：`p0` 表示基础 Demo 必测，`p1` 表示优化观察项。

## 首批 Case

至少包含：

| caseId | query | priority | 重点 |
| --- | --- | --- | --- |
| `oil-skin-cleanser-chat` | 推荐一款适合油皮的洗面奶 | p0 | 类目、商品命中、LLM grounding |
| `bluetooth-earbuds-under-200-chat` | 200 元以内的蓝牙耳机有哪些？ | p0 | 合理 no result |
| `alcohol-free-sunscreen-chat` | 推荐防晒霜，但不要含酒精的 | p1 | 否定约束，后续 `negative-constraint-rag-spec.md` |
| `compare-two-sunscreens-chat` | 帮我对比两款防晒霜 | p1 | 对比意图，后续 `comparison-rag-output-spec.md` |
| `cheaper-follow-up-earbuds-chat` | 再便宜一点的有吗？ | p1 | 多轮追问，后续 context / rewrite |
| `quiet-dorm-keyboard-chat` | 宿舍用安静一点的键盘 | p0 | 场景召回 |
| `air-purifier-under-1000-chat` | 1000 元以内空气净化器 | p0 | 预算 filter |
| `mars-camping-fridge-chat` | 有没有适合火星露营的冰箱？ | p0 | 无结果与不编造 |

## 设计规则

- 不为了让结果好看而删除难 case。
- 不把 `expectedProductIdsAny` 写成当前系统碰巧返回的结果。
- 如果商品库没有合适商品，应明确 `expectedNoResult=true`。
- 如果能力尚未实现但后续要优化，保留 case，并用 `priority=p1` 与 `riskFocus` 标注。
- 不写真实 API key、`.env` 内容、prompt 全文或 provider 原始错误。

## 验证

本 spec 完成后检查：

- `chat-evaluation-cases.json` 是合法 JSON。
- 每个 case 都有唯一 `caseId`。
- 每个 case 都有非空 `query`。
- `history` 是数组。
- `filters` 不包含 `VectorSearchFilters` 以外字段。
- `priority` 只使用 `p0` 或 `p1`。

不需要运行真实 RAG / LLM。

## 验收标准

- `data/processed/rag/chat-evaluation-cases.json` 存在。
- 至少包含首批 8 个 case。
- P0 case 覆盖基础 Demo 风险：命中、no result、预算 filter、场景召回、不编造。
- P1 case 覆盖后续优化风险：否定约束、多轮追问、对比输出。
- 没有修改源代码。
- 没有新增 Gradio / dashboard / debug API。
