# RAG Pipeline Parallel First Token

## 概述

本 spec 继续优化 `POST /api/chat/stream` 的首 token 体验，重点补上上一轮 `first-token-optimization-spec.md` 尚未覆盖的“流水线并行”。

上一轮已经完成：

- 真正的最终 RAG LLM streaming，不再等完整 `RagChatResult` 后假切块。
- Prompt / context / completion token 压缩。
- intent 候选预筛，普通推荐不再无条件跑 cart / negative / comparison intent。
- `done.retrieval.timing` 阶段耗时观测。

当前最新 cold Chat SSE smoke 仍显示首个用户可见 `message_delta` 约 14.04s，主要剩余耗时集中在：

- query rewrite：约 6.66s 累计。
- vector search：约 7.45s 累计。
- final LLM first delta：约 13.93s 累计。

因此下一步不需要先 research。问题已经足够明确：把“必须串行等待”的 RAG 编排改成“可并行竞速、超时降级、安全收口”的工程问题。Research 只在后续发现 provider 并发限制、Qdrant / embedding 调用策略或模型路由方案不清楚时再补。

## 背景

导师加分项口径是“通过 Prompt 压缩、流水线并行等手段将首 Token 时间控制在 1s 以内”。这里需要区分三个体验层：

- `client_loading_feedback_ms`：用户发送后看到 Android 本地 streaming / typing 气泡的时间。这个必须稳定小于 1s。
- `llm_first_delta_ms`：后端第一段真实 assistant `message_delta` 的时间。它必须来自完成意图判断后的真实回答，不能用固定模板伪造。
- `grounded_first_delta_ms`：基于 RAG 检索、商品回查和最终 LLM 生成的第一段商品事实型回答时间。这个指标受 query rewrite、embedding / Qdrant、商品回查和最终 LLM 延迟影响，短期很难稳定到 1s。

本 spec 的目标是同时做两件事：

1. 用 Android 本地 streaming / typing 气泡让首屏等待反馈稳定小于 1s。
2. 用流水线并行把真实 grounded token 从约 14s 继续往 5-8s 压。

2026-06-04 修订：不再由后端发送用户可见的“安全预响应”。真机验证发现固定处理反馈会在 comparison、cart、clarification、追问等不同意图下显得像预设模板，并且容易和后续真实回答合并到同一个气泡。等待过程统一由 Android 本地空 streaming 气泡表达；后端第一条 `message_delta` 必须是真实意图链路产物。

## 目标

- 保持 Android 本地 loading / typing 气泡在请求发出后立即出现，真实回答到达前不显示伪回答文本。
- 后端不发送固定安全预响应；首条用户可见 `message_delta` 必须是 RAG / comparison / cart / clarification 等真实业务路径产生的回答。
- 对普通 RAG success 路径实现 query rewrite 与原始 query 检索并行竞速。
- 对 query rewrite 设置短超时；rewrite 超时或失败时使用原始 query 的检索结果继续，不阻塞首 token。
- 保持 LLM 意图权威：cart、negative、comparison、clarification 的语义判断不能被并行检索结果绕过。
- 保持商品事实安全边界：`product_cards`、`done.recommendedProductIds` 和商品相关回答仍只来自后端校验过的库内商品。
- 保持现有 SSE contract 兼容，不新增 Android 必须处理的新 event。
- 通过 timing metadata 清楚区分安全首屏反馈、query rewrite、原 query search、rewrite query search、采用的检索路径、final LLM first delta 和 done。

## 不做

- 不做 query expansion、rerank、GraphRAG、Agentic RAG 或新向量库替换。
- 不合并多个 LLM intent 到一个 router prompt。
- 不改变 cartAction、negative constraint、comparison、clarification 的业务语义。
- 不让规则 / 正则成为用户意图权威；代码只做候选预筛、超时降级、schema 校验、allowlist 和安全过滤。
- 不发送用户可见安全预响应，也不在后端写固定模板话术冒充首 token。
- 不为了 1s 指标跳过商品回查、库内 product id allowlist、negative post-filter 或 comparison target gate。
- 不修改 Android UI；Android 继续按现有 `message_delta`、`product_cards`、`comparison_result`、`done` 解析。
- 不把真实 `.env`、API key、完整 prompt、provider 原始错误或完整商品知识文本写入 timing / log / SSE。

## 设计原则

- 等待反馈和真实回答分层：1s 内用客户端 loading 表达“正在处理”，后端文本只承载真实业务回答。
- 并行只发生在不会改变业务控制流的阶段。购物车、对比、负向约束、主动澄清等控制流仍先由对应 LLM intent / gate 决定。
- 竞速结果必须可解释。`done.retrieval.timing` 要说明最后采用了原始 query、rewrite query、缓存还是 fallback。
- 快路径不能降低质量。query rewrite 超时可以降级到原 query，但如果 rewrite 及时回来且检索结果更合适，应优先使用 rewrite 结果。
- 流水线并行优先覆盖普通推荐路径；复杂 action / clarification / comparison 路径保持现有行为。

## 后端实现方案

### 1. 客户端 loading 反馈与真实首 delta

后端 streaming 路径不发送固定安全预响应。`ChatViewModel` 发送消息时已经插入一个空的 streaming assistant 气泡，UI 会渲染为 typing / loading 状态；这就是所有意图统一使用的等待反馈。

后端行为：

- `answerStream()` 只在真实回答文本可用时写 `message_delta`。
- 普通 RAG success 路径的首条 `message_delta` 来自最终 LLM answer 字段的 streaming delta。
- comparison / cart / clarification / no candidates 等路径的首条 `message_delta` 来自对应业务结果，不提前写通用模板。
- `llm_first_delta` 只表示真实 LLM 回答的第一段文本；没有 `first_visible_feedback_sent` 这类后端预响应 timing。

Android 行为：

- 发送后立即显示空 streaming assistant 气泡。
- 收到第一条真实 `message_delta` 后，将文本写入这个气泡。
- 如果后端还未返回文本，loading 状态继续显示，不用后端模板填充。

注意：

- 不用关键词判断“哪些问题适合预响应”；所有输入都遵守同一规则。
- popular query cache 只缓存真实业务回答，不缓存 loading 文案。
- 如果后续失败，仍发送 `error` 或 fallback；不要为了圆首屏反馈编造成功结果。

### 2. Timing metadata 扩展

扩展 `server/src/modules/chat/chat-timing.ts` 支持这些阶段名：

- `original_search_started`
- `original_search_done`
- `query_rewrite_started`
- `query_rewrite_timeout`
- `rewrite_search_started`
- `rewrite_search_done`
- `retrieval_plan_selected`
- `grounded_llm_started`

在 `done.retrieval` 中增加可选 safe metadata：

```ts
retrievalStrategy?: "cache" | "original_query" | "rewritten_query" | "fallback";
queryRewriteTimedOut?: boolean;
```

如果不想扩展 public payload 字段，也可以只把这些信息放到 `timing` entries 和已有 `queryRewriteStatus` / `queryRewriteReason` 中。但 Gradio 对比更方便时，建议增加上述字段。

### 3. 原 query 检索与 query rewrite 并行

当前普通 RAG 路径大致是：

```text
query rewrite -> cache input -> cache read -> vector search -> product lookup -> final LLM streaming
```

改成：

```text
start query rewrite with timeout
start original-query cache/read/search pipeline
when rewrite returns in time:
  start rewritten-query cache/read/search pipeline
select best available retrieval result
product lookup / post-filter / final LLM streaming
```

V1 保守实现：

- 只并行原 query 检索和 query rewrite。
- 原 query pipeline 包括 cache read + vector search，但不生成最终 LLM。
- rewrite 在短超时内返回后，再启动 rewrite query pipeline。
- 选择结果：
  - 如果 rewrite query 有 cache hit，优先用 rewrite cache hit。
  - 如果 original query 有 cache hit 且 rewrite 尚未完成，优先用 original cache hit。
  - 如果 rewrite query vector result 不为空，优先用 rewrite result。
  - 如果 rewrite 超时 / 失败 / 结果为空，使用 original result。
  - 如果两者都为空，走现有 no-candidates fallback。

V2 可选优化：

- 原 query vector search 和 rewrite query vector search 竞速，谁先有足够候选就先进入 product lookup。
- rewrite 后到但质量更高时，只在最终 LLM 尚未开始前替换候选；一旦 final LLM 已开始，不再切换候选，避免回答和商品卡不一致。

### 4. Query rewrite timeout

新增配置常量，例如：

```ts
const QUERY_REWRITE_FIRST_TOKEN_TIMEOUT_MS = 900;
```

行为：

- 普通推荐路径中 query rewrite 超过 timeout，就标记 `query_rewrite_timeout` 并继续原 query pipeline。
- timeout 后不要强制 abort provider 请求，除非当前 LLM client 可以可靠 abort；可以让 promise 后台结束但不再影响当前响应。
- 如果 provider 支持 abort，使用子 AbortController，并在 request abort 时一起取消。
- timeout 不能影响原有非 streaming `answer()` fallback 的正确性；测试中要覆盖。

### 5. Retrieval pipeline helper

在 `RagChatService` 中抽出 helper，减少 `answerInternal()` 继续膨胀：

```ts
private async runRetrievalPipeline(input): Promise<RetrievalPipelineResult>
```

建议拆成更小的结构：

- `createCacheInputForQuery(...)`
- `readCacheForQuery(...)`
- `searchVectorForQuery(...)`
- `selectRetrievalPlan(...)`

`RetrievalPipelineResult` 至少包含：

- `queryRewrite?: QueryRewriteResult`
- `cacheInput`
- `cacheHit?: PopularQueryCacheHit`
- `hits`
- `retrievalStrategy`
- `queryRewriteTimedOut`
- `selectedQuery`
- `selectedQuerySource`

原则：

- helper 只负责检索和缓存候选，不生成用户可见文案。
- 商品 id allowlist、商品回查、negative post-filter 和 final LLM 输出解析仍在现有安全路径里做。

### 6. Popular query cache 边界

并行后缓存 key 必须仍然安全：

- original query cache key 使用原 query、filters、topK、model / prompt / RAG 数据版本。
- rewrite query cache key 使用 rewrite query、baseQuery、queryRewriteVersion。
- Android 本地 loading 不进入缓存；后端 popular query cache 只保存真实业务回答。
- cache hit 仍需回查 active products，确保商品仍可售 / 可见。
- cache hit 的 `done.retrieval` 要标明命中的是 original query 还是 rewrite query。

### 7. Abort 与资源清理

- request abort 时必须取消仍在进行的 query rewrite、vector search、product lookup 和 final LLM streaming。
- 如果原 query pipeline 已经选中并进入 final LLM，迟到的 rewrite result 不得继续写 SSE。
- 并行 promise 的错误要被收口，不能形成 unhandled rejection。
- provider / Qdrant / DB 错误按现有 fallback 处理，不能把原始敏感错误发给客户端。

## 测试计划

### 单元测试

更新 / 新增 `rag.service.test.ts`：

- `answerStream()` 不写固定预响应；首条 `message_delta` 必须是真实回答文本。
- 普通 RAG streaming 会在最终 LLM answer 字段可解析时写出首条真实 `message_delta`，再发送 `product_cards` / `done`。
- query rewrite 慢于 timeout 时，普通 RAG 使用 original query 检索并继续输出。
- query rewrite 及时返回且 rewrite result 有候选时，优先使用 rewritten query。
- original query cache hit 可以在 rewrite 未完成时快速返回，且仍回查 active products。
- rewrite query cache hit 优先于 original vector result。
- request abort 会停止迟到的 rewrite / search / final LLM 写入。
- 两条并行 pipeline 中一条失败时，另一条可用结果仍能完成；两条都失败时走现有 fallback。

更新 `chat.controller.test.ts`：

- streaming service 的真实 message delta / product_cards / done event order 稳定。
- timing metadata 包含真实 `llm_first_delta` 和最终 `done_sent`。

更新 Android `ChatViewModelTest`：

- 发送任意消息后，真实 SSE delta 到达前保留空 streaming assistant 气泡作为 loading。
- 收到第一条真实 `message_delta` 后，同一个气泡更新为真实回答文本。

### 回归测试

- `cd server; npm.cmd test`
- `cd server; npm.cmd run build`
- 重点保留以下已有测试通过：
  - cart command intent
  - negative constraint intent
  - comparison intent
  - clarification intent
  - popular query cache
  - RAG service streaming
  - OpenAI-compatible streaming client

### Smoke 测试

直接 Chat SSE cold smoke：

- 问题：`推荐一款适合每天地铁通勤、降噪好的蓝牙耳机`
- 记录：
  - `client_loading_feedback_ms`，由 Android 本地发送后 loading 出现时间观察
  - `llm_first_delta_ms`
  - `grounded_first_delta_ms`
  - `total_ms`
  - `retrievalStrategy`
  - timing entries

Gradio sample 3 条：

- 关闭自动 LLM 初评。
- 对比上一轮 first-token 数据：
  - baseline 直接 Chat SSE：约 39.3s。
  - first-token V1 cold：约 14.04s。
  - 本 spec 后：`client_loading_feedback_ms < 1s`，`grounded_first_delta_ms` 目标进入 5-8s 区间。

## 验收标准

功能验收：

- Android 发送任意消息后 1s 内显示本地 streaming / typing loading 气泡。
- 后端首条用户可见 `message_delta` 必须来自真实业务回答，不发送固定处理反馈。
- 后续商品事实型文本、`product_cards` 和 `done.recommendedProductIds` 仍只来自后端校验过的库内商品。
- query rewrite 超时不会阻塞原 query 检索和最终回答。
- query rewrite 正常返回时仍可用于提升检索，不被原 query 快路径永久绕过。
- cache hit、clarification、cartAction、comparison clarification、no candidates 行为不回退。
- Android 现有 parser 无需修改。

性能验收：

- `client_loading_feedback_ms < 1000ms`。
- `llm_first_delta_ms` 继续作为真实后端首段回答指标观测，不能用模板文本冲指标。
- cold smoke 的 `grounded_first_delta_ms` 相比上一轮约 14.04s 明显下降，目标 5-8s。
- 如果未达到 5-8s，必须用 timing metadata 说明瓶颈是 query rewrite、embedding / Qdrant、product lookup 还是 final LLM。
- 商品命中率、约束通过率和 comparison / negative / cartAction 语义不能为了速度下降。

安全验收：

- 后端不发送固定安全预响应，不写入缓存伪回答，不改变业务状态。
- 并行检索结果不能绕过 LLM negative constraint、comparison target gate、cart intent 或 clarification intent。
- 不输出 API key、prompt、provider 原始错误或完整商品知识文本。

## 风险与回退

- 风险：为了 1s 指标重新加入后端固定预响应，导致不同意图下出现模板感。
  - 回退：保持客户端 loading 作为等待反馈；后端只输出真实业务回答，并用 `llm_first_delta_ms` / `grounded_first_delta_ms` 解释真实链路耗时。
- 风险：query rewrite 迟到后与原 query 候选冲突。
  - 回退：一旦 final LLM 开始，锁定候选，不再替换。
- 风险：并行 promise 出现 unhandled rejection。
  - 回退：所有并行任务统一用 wrapper 收口错误，选路时只消费 safe result。
- 风险：原 query 快路径降低复杂问题召回质量。
  - 回退：对含否定、追问、比较、预算、复杂约束的问题提高 rewrite 优先级或延长 timeout；普通短推荐才走激进快路径。
- 风险：provider 并发限制导致更多失败。
  - 回退：只并行原 query vector search 和 query rewrite，不并行多个最终 LLM；必要时降级为 timeout fallback。

## 后续 research 触发条件

实现过程中只有遇到以下问题才补 research：

- 当前 LLM provider 对并发 query rewrite / final LLM 调用有限流或排队，导致并行反而更慢。
- Qdrant / embedding provider 的并发调用需要官方配置或连接池优化。
- 需要引入 rerank、query expansion、GraphRAG、Agentic RAG 或模型路由。
- 需要把多个 intent 合并成一个 router prompt，并重新设计 LLM intent schema。
