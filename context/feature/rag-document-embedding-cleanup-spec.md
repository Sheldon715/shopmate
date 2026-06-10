# RAG Document and Embedding Text Cleanup Spec

## 1. 概述

本 spec 是 `rag-retrieval-ranking-upgrade-spec.md` 的第二个可执行子 spec，接在 `rag-debug-trace-evaluation-baseline-spec.md` 之后执行。

第一阶段 baseline 已经补齐 trace 和指标。本阶段根据 baseline 证据，优先处理 RAG document / embedding text 的质量问题，并先校准 baseline expected set，避免把评估标注问题误判为检索失败。

本阶段仍然不做 hybrid retrieval、keyword / BM25、candidate merge 或 reranker。

## 2. 第一阶段证据

`docs/rag-tuning-report.md` 当前 baseline：

- Case groups：8
- Queries：24
- Passed queries：23/24
- recall@5 / @10 / @20：0.933
- MRR@10：0.839
- paraphrase candidate overlap@10：0.894
- constraint satisfaction rate：1.000
- negative constraint accuracy：1.000
- stale hit rate：0.000
- no-result accuracy：1.000

唯一失败：

| Case | Query | Failure Type | Report Note |
| --- | --- | --- | --- |
| `dorm-small-appliance-paraphrases` | `一人食省空间小家电` | `vector_retrieval_failure` | No expected product id appeared in product-level top-k. |

但 trace 显示：

- top1：`p_home_kitchen_004`，小熊 DDZ-C06A1 电炖盅
- top2：`p_home_kitchen_002`，苏泊尔电饭煲
- top3：同 `p_home_kitchen_004` FAQ
- top5：同 `p_home_kitchen_004` review summary

其中 `p_home_kitchen_004` 的证据包含：

- `一人食`
- `小容量`
- `宿舍友好`
- `租房党`
- `早餐制作`

因此这条失败至少包含两个问题：

1. `retrieval-baseline-cases.json` 的 expectedProductIdsAny 可能遗漏了真实合适的厨房小电商品。
2. RAG document text 仍有明显污染和结构不足，例如 dataset/demo 说明、`占位图` / `主图` tags、`商品详情页数据` 等生产说明进入 embedding text。

本阶段先同时解决这两个基础问题：评估标注校准 + document / embedding text cleanup。

## 3. 目标

- 校准 `retrieval-baseline-cases.json` 中明显遗漏或过窄的 expected product set，并在报告中说明事实依据。
- 从 RAG embedding text 中移除 dataset/demo/source/process 说明，保留到 metadata / manifest / report。
- 清洗不应进入 embedding 的视觉或生产 tags，例如 `占位图`、`主图`、`详情页`、`商品介绍`。
- 新增 product-level `product_profile` document，让每个商品都有一个稳定承载整体语义的主文档。
- 将当前 `content_block` 粗粒度 docType 映射成更明确的 document responsibility。
- 增加中文 alias / natural language tags，优先覆盖 baseline 里的高价值场景。
- 重建 RAG documents 和 Qdrant index，复跑 baseline，输出 E0 -> E1 对比。

## 4. 非目标

- 不改 Android UI。
- 不改 Chat SSE contract。
- 不改 cart / checkout / comparison / clarification 业务逻辑。
- 不改 prompt 来掩盖检索问题。
- 不实现 keyword / BM25 / sparse retrieval。
- 不实现 hybrid retrieval。
- 不实现 product candidate merge。
- 不实现 rule-based reranker。
- 不为了提高分数删除失败 case。
- 不直接修改原始商品库事实，除非发现当前 source data 明确错误；数据事实修复应另开数据 spec。

## 5. 文件范围

预计新增：

- `server/src/modules/vector/rag-document-text-cleaner.ts`
- `server/src/modules/vector/rag-document-text-cleaner.test.ts`
- `server/src/modules/vector/rag-document-aliases.ts`
- `server/src/modules/vector/rag-document-aliases.test.ts`
- `docs/rag-document-embedding-cleanup-report.md`

预计修改：

- `server/src/modules/vector/rag-document.types.ts`
- `server/src/modules/vector/rag-document.builder.ts`
- `server/src/modules/vector/rag-document.builder.test.ts`
- `server/src/modules/vector/qdrant.mapper.ts`
- `server/src/modules/vector/qdrant.client.ts` only if docType payload index needs compatibility updates
- `server/src/modules/vector/vector-search.types.ts` only if trace metadata needs typed docType update
- `server/src/modules/chat/rag-debug-trace.types.ts` only if docType union update needs alignment
- `data/processed/rag/retrieval-baseline-cases.json`
- `data/processed/rag/product-documents.jsonl`
- `data/processed/rag/document-manifest.json`
- `data/processed/rag/vector-index-manifest.json`
- `data/processed/rag/retrieval-baseline-results.jsonl`
- `data/processed/rag/retrieval-baseline-traces.jsonl`
- `docs/rag-tuning-report.md`

不应修改：

- `client/android/**`
- `server/src/modules/chat/rag.service.ts`，除非 docType typing 需要非行为性同步
- `server/src/modules/chat/prompt.builder.ts`
- cart / checkout / order modules

## 6. Step 0 - Baseline Evidence Audit

在改 document builder 之前，先复核 `dorm-small-appliance-paraphrases` 的 expected set。

需要做：

- 阅读 `retrieval-baseline-traces.jsonl` 中 `一人食省空间小家电` 的 top hits。
- 回查 PostgreSQL 或 source product facts，确认 `p_home_kitchen_004` 是否满足该 case。
- 如果 `p_home_kitchen_004` 事实满足 `一人食`、`小容量`、`厨房小电`、`宿舍 / 租房`，则把它加入 `expectedProductIdsAny`。
- 如果 `p_home_kitchen_002`、`p_home_kitchen_001` 也满足该 case，按事实加入或不加入，并在 report 解释。
- 不允许因为当前 top hit 是某商品就自动加入 expected；必须有商品事实依据。

验收：

- `retrieval-baseline-cases.json` 的 expected 更新有 report 说明。
- 如果只修 expected set 就让 24/24 通过，也不能跳过 document cleanup，因为 trace 已证明 embedding text 有污染。

## 7. Document Type 设计

将 `RagDocumentType` 从当前：

```ts
type RagDocumentType =
  | "content_block"
  | "faq"
  | "description"
  | "review_summary";
```

扩展为：

```ts
type RagDocumentType =
  | "product_profile"
  | "product_specs"
  | "selling_points"
  | "use_cases"
  | "reviews_summary"
  | "constraints"
  | "faq";
```

映射规则：

| 当前来源 | 新 docType | 说明 |
| --- | --- | --- |
| product base fields | `product_profile` | 每个商品一个整体语义主文档 |
| `content_block.blockType=spec` | `product_specs` | 规格、价格、SKU |
| `content_block.blockType=sku` | `product_specs` | SKU / 规格摘要 |
| `content_block.blockType=selling_point` | `selling_points` | 卖点和适用优点 |
| `content_block.blockType=scenario` | `use_cases` | 场景、用户、用途 |
| `content_block.blockType=limitation` | `constraints` | 不适合、限制、风险 |
| `officialFaq` | `faq` | 问答证据 |
| `reviewSummary` | `reviews_summary` | 评论摘要 |
| `marketingDescription` | 不再单独生成 raw `description`，内容清洗后进入 `product_profile` 或 `selling_points` | 避免生产说明污染 |

兼容要求：

- `metadata.blockType` 可继续保留原始 block type。
- Qdrant payload `doc_type` 必须跟新 docType 对齐。
- 旧 index 需要 recreate，不做混合旧新 docType 的增量索引。

## 8. Product Profile Document

每个 active product 必须生成一个 `product_profile` document。

内容结构：

```txt
商品: {displayName}
原始标题: {rawName}
品牌: {brand}
类目: {category} / {subCategory}
价格: {priceRange}
可售: 是/否
适合人群: {targetUsers}
使用场景: {useCases}
核心特点: {pros/recommendWhen/key attributes}
不适合: {avoidWhen/cons}
自然语言标签: {aliases}
```

要求：

- `product_profile` 不写 dataset/source/demo/process note。
- `product_profile` 不写图片占位、主图、详情页、构建页面等非商品语义。
- `displayName` 可使用当前已有展示名 helper，但不得覆盖 `rawName`。
- `rawName` 保留给检索和证据链，但不能塞入生产说明。

## 9. Text Cleaner

新增 `rag-document-text-cleaner.ts`，用于清理进入 embedding text 的文本。

必须移除或改写：

- `本数据集保留真实品牌与产品名`
- `便于后续查找对应商品图片`
- `构建商品详情页`
- `导购信息经过脱敏和结构化整理`
- `价格、SKU、评论和 FAQ 为比赛数据`
- `本商品数据来自 synthetic/desensitized`
- `仅用于课程 Demo 和检索实验`
- `商品详情页数据`
- `占位图`
- `主图`
- `详情页`
- `商品介绍` 作为内容块关键词时的低价值 tag

注意：

- 不删除真实商品事实，例如品牌、价格、规格、适用场景、限制、评论摘要。
- source / dataset / dataVersion 仍保留在 metadata 和 manifest。
- snippet 也应来自 cleaned bodyLines，避免 trace/report 继续展示污染文本。

## 10. Alias and Natural Language Tags

新增 `rag-document-aliases.ts`，根据 category、subCategory、attributes、recommendWhen、pros、use cases 生成中文自然语言标签。

第一版只做 deterministic alias，不调用 LLM。

优先覆盖 baseline case：

| 商品语义 | aliases |
| --- | --- |
| `洁面` | 洗面奶、洁面乳、洁面、控油洁面、油皮清洁 |
| `防晒` | 防晒霜、防晒乳、通勤防晒、户外防晒、不含酒精防晒 |
| `真无线耳机` | 蓝牙耳机、无线耳机、耳机、半入耳、开放式、不塞耳朵 |
| `厨房小电` | 小家电、小电器、厨房电器、一人食、租房、宿舍、宿舍小电器、省空间、小容量 |
| `办公外设` | 键盘、安静键盘、低噪键盘、宿舍键盘、不吵室友 |
| `空气护理` | 空气净化器、空气护理、除味、卧室空气、租房空气 |
| `跑步鞋` | 跑鞋、运动鞋、训练鞋、轻量、缓震、耐穿 |

规则：

- alias 只增强 retrieval，不作为商品事实向用户展示。
- alias 不能制造商品没有的功能或认证。
- alias 应可单元测试，避免加入太宽泛的噪音词。

## 11. Evaluation Changes

本阶段允许更新 `retrieval-baseline-cases.json`，但只限两类：

1. 根据 trace 和商品事实补充遗漏的 expected product id。
2. 为 document cleanup 增加针对污染文本的 regression case note。

不允许：

- 删除失败 group。
- 把 expected 改成任意当前 top hit。
- 把真实 data gap 改成 expected hit。

必须新增 report 小节：

```md
## 10. E1 Document / Embedding Cleanup

### Expected Set Audit

### Document Text Changes

### Before / After Metrics

### Remaining Failures

### Next Recommended Spec
```

## 12. 执行步骤

### Step 1 - Evidence audit

- 复核唯一失败 case trace。
- 校准 expected set。
- 在 report 中写清楚为什么更新。

### Step 2 - Text cleaner

- 新增 cleaner helper。
- 单测覆盖 dataset/demo/source/process phrase。
- 单测覆盖真实商品事实不被误删。

### Step 3 - Alias builder

- 新增 alias helper。
- 覆盖 baseline categories。
- 单测确认 aliases 去重、trim、不产生空值。

### Step 4 - Document builder refactor

- 新增 `product_profile` document。
- 映射 content blocks 到新 docType。
- `marketingDescription` 不再生成 raw `description` document。
- cleaned text 进入 document text 和 snippet。
- metadata 保留 source fields。

### Step 5 - Payload / trace typing sync

- 同步 `RagDocumentType` 到 Qdrant payload mapping、trace metadata 和相关测试。
- 如果 payload index 仍是 keyword `doc_type`，只需确保新 docType 可写入。

### Step 6 - Regenerate and reindex

运行：

```powershell
cd server
npm.cmd run rag:documents
npm.cmd run rag:index -- --recreate
```

如外部 embedding / Qdrant 不可用：

- 先跑 `rag:documents` 和 tests。
- 在 report 标注 index / baseline 未完成原因。
- 不编造 E1 指标。

### Step 7 - Rerun baseline

运行：

```powershell
cd server
npm.cmd run rag:baseline -- --output ../data/processed/rag/retrieval-baseline-results.jsonl --trace-output ../data/processed/rag/retrieval-baseline-traces.jsonl --markdown-report ../docs/rag-tuning-report.md
```

报告对比 E0 baseline：

- recall@5 / @10 / @20
- MRR@10
- candidate overlap@10
- expected hit consistency
- constraint satisfaction
- negative constraint accuracy
- stale hit rate
- failure type distribution

## 13. 验证命令

目标测试：

```powershell
cd server
npm.cmd test -- rag-document-text-cleaner.test.ts rag-document-aliases.test.ts rag-document.builder.test.ts
npm.cmd test -- rag-debug-trace.test.ts retrieval-baseline-evaluation.service.test.ts
npm.cmd run build
```

完整后端验证：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

RAG 工件验证：

```powershell
cd server
npm.cmd run rag:documents
npm.cmd run rag:index -- --recreate
npm.cmd run rag:baseline -- --output ../data/processed/rag/retrieval-baseline-results.jsonl --trace-output ../data/processed/rag/retrieval-baseline-traces.jsonl --markdown-report ../docs/rag-tuning-report.md
```

可选 sanity：

```powershell
cd server
npm.cmd run rag:evaluate
```

Android 不作为本 spec 必跑 gate，因为本阶段不改 Android contract。

## 14. 验收标准

- `retrieval-baseline-cases.json` 的 expected set 更新有事实依据和报告说明。
- `product-documents.jsonl` 中不再出现 dataset/demo/process 污染短语。
- `product-documents.jsonl` 中不再把 `占位图`、`主图` 作为高价值 tags 写入 embedding text。
- 每个 active product 至少有一个 `product_profile` document。
- `document-manifest.json` 记录新 document type 分布。
- Qdrant index manifest 与新 documents 数量一致。
- E1 baseline 跑通并写回 `docs/rag-tuning-report.md`。
- constraint satisfaction、negative constraint accuracy、stale hit rate 不得比 E0 下降。
- 如果 `一人食省空间小家电` 仍失败，trace 必须能说明是 expected set、document text、alias 还是真实 data gap 问题。

指标目标：

- recall@10 不低于 E0 的 0.933。
- MRR@10 不低于 E0 的 0.839。
- paraphrase overlap@10 不低于 E0 的 0.894。
- constraint satisfaction 保持 1.000。
- negative constraint accuracy 保持 1.000。
- stale hit rate 保持 0.000。

## 15. 风险与回滚

风险：

- alias 过宽导致跨类目串味。
- 清理文本时误删真实商品事实。
- docType 改动导致旧测试或 Qdrant payload mapping 不兼容。
- 重建 index 依赖外部 embedding / Qdrant，可能耗时或失败。

控制：

- alias helper 必须有单元测试。
- cleaner helper 必须有“保留真实事实”测试。
- baseline 必须比较 constraint / negative 指标，不能只看 recall。
- docType 变更后强制 recreate index。

回滚：

- 保留第一阶段 E0 baseline files。
- 若 E1 下降，回退 document builder 改动，保留 expected set audit 作为独立修正。
- 不把 E1 默认作为后续 hybrid/rerank 基线，除非 metrics 不劣于 E0。

## 16. 下一步决策

完成本 spec 后：

- 如果 E1 修复唯一 failure，且 metrics 整体稳定，下一份 spec 可以进入 `rag-hybrid-retrieval-candidate-merge-spec.md`。
- 如果 E1 后仍有 expected product 不进 top20，继续做 document / alias / data fact cleanup，不进入 rerank。
- 如果 expected product 进 top20 但 top5 不稳，再进入 hybrid retrieval / candidate merge。
- 如果候选稳定但最终选择差，再进入 rule-based reranker。
