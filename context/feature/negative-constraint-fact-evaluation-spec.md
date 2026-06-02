# Negative Constraint Fact Evaluation

## 背景

`docs/rag-evaluation-post-advanced-report.md` 显示，26 / 27 / 28 完成后的核心 Chat 链路已经稳定：20 个 Chat SSE case 中 19 pass / 1 acceptable，未发现库外商品、购物车误 mutation、comparison_result 越权或 SSE contract 破坏。

当前不应该直接进入 25 `rag-query-rewrite-spec.md` 或 29 `rag-query-expansion-rerank-spec.md`。本轮失败主要集中在负向约束的商品事实判定和离线评估标准：

- `alcohol-free-sunscreen`：离线 evaluator 把“含酒精风险”和“不含酒精”都当成命中 `avoidTerms=["酒精"]`。
- `alcohol-free-oily-sunscreen`：top hit 是可用的“不含酒精”安全候选，但 evaluator 仍因 substring 判失败。
- `earbuds-not-in-ear`：商品库缺少结构化佩戴形态字段，导致“不要入耳式”只能靠 snippet / substring 判断。

本 spec 是 26 的 follow-up，目标是把负向约束从“字符串包含”推进到“基于商品事实的冲突 / 安全证据判定”。LLM 仍然负责自然语言负向意图识别；代码只负责商品事实校验、allowlist、schema、评估和安全过滤。

## 目标

- 修复离线 `rag:evaluate` 的 avoidTerms 判定，区分明确冲突证据和明确 free-from 安全证据。
- 让离线 evaluator 和 Chat 检索后过滤尽量复用同一套商品事实判定 helper，避免线上可通过、离线误失败。
- 为已暴露问题的耳机商品补充结构化佩戴形态 / 佩戴方式事实，让“不要入耳式”不再依赖裸 substring。
- 保留 26 的 LLM-first 边界：当前用户自然语言里的负向约束必须来自 LLM intent 或显式 filters，不能由规则 / 正则直接判断用户语义。
- 复跑 post-advanced 14 个离线检索 case 和 20 个 Chat SSE case，确认修复后不引入新的推荐、购物车或对比回归。

## 非目标

- 不实现 query rewrite。
- 不实现 query expansion、rerank 或 MMR。
- 不新增 Gradio、dashboard、debug endpoint 或 LLM-as-judge。
- 不修改用户可见 no-result、cartAction 或 comparison 文案模板。
- 不用关键词规则从用户原话中抽取新的 negative intent。
- 不为所有品类建立完整商品属性知识图谱；本 spec 只补本轮评估暴露出的最小结构化事实。
- 不处理 `comparison-ambiguous-chat` 的澄清控制流；那是 28 follow-up，可单独拆 spec。

## 文件

预计修改：

- `server/src/modules/chat/negative-constraint-filter.ts`
- `server/src/modules/chat/negative-constraint-filter.test.ts`
- `server/src/modules/vector/vector-evaluation.service.ts`
- `server/src/modules/vector/vector-evaluation.service.test.ts`
- `server/src/modules/vector/vector-evaluation.types.ts`
- `server/src/scripts/evaluate-rag.ts`
- `data/raw/ecommerce_agent_dataset_v3/**` 或 catalog enrichment 相关文件
- `data/processed/catalog/products.normalized.jsonl`
- `data/processed/rag/product-documents.jsonl`
- `data/processed/rag/document-manifest.json`
- `data/processed/rag/vector-index-manifest.json`
- `data/processed/rag/evaluation-results-post-advanced.jsonl`

可能新增：

- `server/src/modules/chat/negative-constraint-evidence.ts`
- `server/src/modules/chat/negative-constraint-evidence.test.ts`
- `docs/negative-constraint-fact-evaluation-report.md`

不应修改：

- Android UI 代码。
- CartService 业务逻辑。
- Comparison generation schema。
- `rag-query-rewrite-spec.md` 或 `rag-query-expansion-rerank-spec.md`。

## 事实判定模型

新增或抽取一个 shared helper，例如 `negative-constraint-evidence.ts`。它只判断“一个已确认的 constraint 是否与某个商品事实冲突”，不判断用户是否表达了负向意图。

输入建议：

```ts
interface NegativeConstraintEvidenceInput {
  term: string;
  kind: NegativeConstraintKind;
  matchPolicy: NegativeConstraintMatchPolicy;
  productFacts: {
    id: string;
    name: string;
    brand: string;
    category: string;
    subCategory: string | null;
    tags: string[];
    recommendWhen: string[];
    avoidWhen: string[];
    pros: string[];
    cons: string[];
    attributes: Record<string, string[]>;
    marketingDescription: string;
    knowledgeText: string;
    snippets: string[];
  };
}
```

输出建议：

```ts
interface NegativeConstraintEvidenceResult {
  conflicts: boolean;
  reason:
    | "brand_match"
    | "product_match"
    | "category_match"
    | "strict_risk_fact"
    | "explicit_conflict_fact"
    | "explicit_safe_free_from"
    | "structured_attribute_conflict"
    | "no_conflict_evidence";
  evidence: string[];
}
```

规则边界：

- `exclude_brand` / `exclude_product` / `exclude_category` 可以做后端事实匹配，因为 LLM 已经决定 constraint 类型。
- `exclude_if_product_facts_conflict` 只能排除有明确冲突证据的商品。
- `avoidWhen`、`cons`、明确负面评价、风险提示中出现 term，属于严格冲突证据。
- “不含酒精”“无酒精”“未添加酒精”“0 添加酒精”“alcohol free”这类 free-from 表达不是冲突证据。
- free-from 证据不能掩盖同一商品的独立风险事实。例如 FAQ 写“不含酒精”，但 `avoidWhen` 写“酒精敏感人群慎用”，仍应判冲突。
- 对佩戴形态这类属性，优先使用结构化 attributes 或 tags 的标准值；不要把“半入耳”简单当作“入耳式”冲突。
- 事实不足时默认不把商品包装成“满足负向条件”。如果过滤后没有安全候选，Chat 层应走可继续聊天的 no-candidates 回复。

## 离线 Evaluator 改动

当前 `vector-evaluation.service.ts` 的 `containsAvoidTerm()` 用 substring 扫：

- brand
- snippet
- tags
- avoidWhen

需要改成 fact-aware 判断：

1. 从 PostgreSQL product lookup 中拿到更完整的 product snapshot。
2. 把 hit metadata、snippet 和 product facts 合并成 evidence input。
3. 对 `filters.avoidTerms` 中每个 term 调用 shared helper。
4. 只有 helper 返回 `conflicts=true` 时，才把该 hit 判为违反 avoidTerms。
5. notes 中记录具体 reason 和 evidence 摘要，方便后续 report 判断。

`VectorEvaluationProductSnapshot` 需要至少补充：

- `name`
- `brand`
- `tags`
- `recommendWhen`
- `avoidWhen`
- `pros`
- `cons`
- `attributes`
- `marketingDescription`
- `knowledgeText`

如果觉得 full product snapshot 过重，可以新增 evaluator 内部 `VectorEvaluationProductFacts`，但不要只保留现在的 category / price / available。

失败原因可以继续使用现有 `unexpected_result`，但 notes 必须写清楚：

- 哪个 productId。
- 哪个 avoidTerm。
- 判定 reason。
- 证据摘要。

## Chat 过滤改动

`filterContextsByNegativeConstraints()` 已经能保留“不含酒精”商品，但它的逻辑应迁移或复用 shared helper，避免 Chat 和 evaluator 逐渐分叉。

要求：

- `productViolatesNegativeConstraint()` 的可见行为不退化。
- `p_beauty_006` 这类明确“不含酒精”商品不能被误过滤。
- `p_beauty_010` 这类存在酒精敏感风险的商品，在“不要酒精”约束下仍应被排除。
- LLM invalid / unavailable 时仍不新增负向约束。
- price constraint 不进入普通 avoidTerms 过滤。

## 数据补充范围

本 spec 只补已暴露问题的最小结构化事实。

### 防晒 / 成分风险

确认并保留：

- `p_beauty_006`：明确“不含酒精”的安全证据。
- `p_beauty_010`：明确“酒精敏感风险”或不适合酒精敏感人群的风险证据。

如果这些事实已经在 raw / normalized 数据里，只需要让 evaluator 正确理解；不要为了通过测试伪造商品事实。

### 耳机 / 佩戴形态

为相关真无线耳机补充结构化属性，例如：

```json
{
  "佩戴形态": ["半入耳式"]
}
```

或：

```json
{
  "佩戴方式": ["入耳式"]
}
```

要求：

- `p_digital_007`、`p_digital_018` 等参与 `earbuds-not-in-ear` 的商品必须能从 attributes / tags / RAG documents 中看出佩戴形态。
- `入耳式`、`半入耳式`、`开放式`、`头戴式` 不要靠互相包含的字符串判等。
- 修改源头优先级：raw dataset 或 catalog enrichment > normalized processed file。不能只手改最终 RAG documents。

如果 data 改动会影响 RAG documents：

- 需要运行 catalog normalize / validate。
- 需要重新 import 商品。
- 需要重新生成 RAG documents。
- 需要重新索引 Qdrant，并记录 manifest。

## 评估 Case 调整

可以更新 `evaluation-cases.json` 的 notes / passCriteria description，但不能删除失败 case。

保留并复测：

- `alcohol-free-sunscreen`
- `alcohol-free-oily-sunscreen`
- `negative-brand-sunscreen`
- `earbuds-not-in-ear`

调整标准：

- `alcohol-free-*`：明确“不含酒精”的商品不应因出现“酒精”两个字判 fail。
- 明确含酒精风险、酒精敏感风险或不适合酒精敏感人群的商品必须 fail。
- `earbuds-not-in-ear`：如果商品事实明确是入耳式，应排除；如果是半入耳 / 开放式 / 头戴式，不能仅因包含“入耳”两个字判冲突。

## 测试要求

### Unit Tests

新增或更新：

- `negative-constraint-evidence.test.ts`
  - “不含酒精”不冲突。
  - `avoidWhen=["酒精敏感人群"]` 冲突。
  - free-from FAQ 不能掩盖独立 `avoidWhen` 冲突。
  - `exclude_brand` 精确排除安热沙。
  - `半入耳式` 不等于 `入耳式` 冲突，除非 constraint 明确是半入耳。
  - 事实不足时返回 no conflict evidence，但不能生成用户可见保证。

- `negative-constraint-filter.test.ts`
  - 继续覆盖 Chat post-filter 行为。
  - 证明 filter 使用 shared helper。

- `vector-evaluation.service.test.ts`
  - evaluator 保留“不含酒精” hit。
  - evaluator 排除酒精风险 hit。
  - evaluator notes 写出 conflict reason。
  - brand / category / budget / stale hit 原有判断不回归。

### Data Tests

如果补了 catalog metadata：

- `catalog:normalize` 产物包含耳机佩戴形态。
- `catalog:validate` 通过。
- product mapper 能保留 attributes。
- RAG document builder 把关键结构化属性写入 documents。

## 验证命令

基础后端：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

如果改了 catalog / RAG documents：

```powershell
cd server
npm.cmd run catalog:normalize
npm.cmd run catalog:validate
npm.cmd run catalog:import
npm.cmd run rag:documents
npm.cmd run rag:index -- --recreate
```

然后复跑评估：

```powershell
cd server
npm.cmd run rag:evaluate -- --output ../data/processed/rag/evaluation-results-post-advanced.jsonl
```

单 case 复现：

```powershell
cd server
npm.cmd run rag:evaluate -- --case alcohol-free-sunscreen --output ../data/processed/rag/evaluation-results-negative-facts.jsonl
npm.cmd run rag:evaluate -- --case alcohol-free-oily-sunscreen --output ../data/processed/rag/evaluation-results-negative-facts.jsonl
npm.cmd run rag:evaluate -- --case earbuds-not-in-ear --output ../data/processed/rag/evaluation-results-negative-facts.jsonl
```

Chat SSE smoke：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"negative-facts-1\",\"message\":\"推荐防晒霜，但不要含酒精的\"}" http://localhost:3000/api/chat/stream
```

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"negative-facts-2\",\"message\":\"耳机不要入耳式\"}" http://localhost:3000/api/chat/stream
```

复跑 post-advanced Chat cases：

- 使用 `data/processed/rag/chat-evaluation-cases.json`。
- 输出仍写入 `data/processed/rag/chat-evaluation-results-post-advanced.jsonl` 或新的 negative facts 结果文件。

Android：

本 spec 不改 Android。如果只改后端和数据，不需要 Android build。若 SSE payload contract 意外改动，必须补：

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon -PSHOPMATE_DEMO_API_BASE_URL=https://api.example.test/ build
```

## 验收标准

- `alcohol-free-sunscreen` 不再因为 `p_beauty_006` 的“不含酒精”安全证据被误判失败。
- `alcohol-free-oily-sunscreen` 通过，或失败原因不再是 free-from substring 误判。
- 明确酒精风险商品仍会在“不要酒精”约束下被排除。
- `earbuds-not-in-ear` 的判断基于结构化佩戴形态或明确商品事实，不靠简单 substring。
- Chat SSE negative constraint cases 仍 pass，不返回冲突商品。
- 20 个 post-advanced Chat SSE case 没有从 pass 退化为 fail。
- `comparison-ambiguous-chat` 可继续记录为 28 follow-up，本 spec 不用普通推荐逻辑修它。
- report 明确写出当前是否仍有 25 / 29 的启动证据；如果失败仍不是 `retrieval_query` 或 `retrieval_ranking`，继续暂缓 25 / 29。
- 未写入真实 API key、连接串、完整 prompt、`.env` 内容或 provider 原始敏感错误。
