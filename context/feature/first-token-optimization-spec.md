# First Token Optimization

## 概述

本 spec 优化 `POST /api/chat/stream` 的首 token 体验。当前 Gradio sample 已显示首 token 平均约 37.9s，P95 约 43.1s；直接绕过 Gradio 调用单条 Chat SSE 也约 39.3s 才收到第一段 `message_delta`。这说明问题主要在后端 Chat SSE / RAG / LLM 编排链路，而不是 Gradio 依赖安装或前端渲染。

本轮先不跑 research，直接写可实现 spec。原因是当前代码结构已经暴露首要瓶颈：`chat.controller.ts` 先 `await chatService.answer(...)` 拿到完整 `RagChatResult`，再用 `writeChatResult()` 把完整 `answer` 切成 `message_delta` 写出。也就是说，当前 SSE 是“返回格式像流式”，但用户看到第一个 token 前，后端已经完成了 cart intent、negative intent、comparison intent、clarification intent、query rewrite、cache、vector search、数据库回查和最终 LLM 生成。

Research 作为后置项：如果实现时发现当前 OpenAI-compatible provider 的 streaming delta 格式、abort 行为或 SDK 兼容性不确定，再单独跑 `performance-optimization-research.md` 或模型流式 API research。

## 背景

课题加分项要求首屏 / 首 token 响应足够快，目标文案是通过 prompt 压缩、流水线并行等手段将首 token 控制到 1s 以内。ShopMate 当前已经有 Gradio 工作台记录首 token 和总耗时，因此可以开始优化。

现有链路大致如下：

1. `chat.controller.ts` 打开 SSE header。
2. `RagChatService.answer()` 串行执行多段逻辑。
3. 多个 intent / routing 服务可能分别调用 LLM：cart intent、negative constraint intent、comparison intent、clarification intent、query rewrite。
4. 命中普通 RAG 后，执行 vector search、PostgreSQL 商品回查、negative post-filter。
5. 最终 RAG LLM 生成完整 JSON 文本。
6. controller 才把完整 answer 切块写成 `message_delta`。

因此当前首 token 时间实际包含了“整条后端思考时间 + 完整模型输出时间”，不是传统意义上模型开始吐第一个 token 的时间。

## 目标

- 为 Chat SSE 增加阶段耗时观测，至少记录 request start、SSE header flush、routing / intent、query rewrite、cache、vector search、product lookup、final LLM first delta、final LLM complete、done。
- 支持最终 RAG 回复真实流式输出：最终 LLM 一旦返回文本 delta，就尽快写出 `message_delta`，不再等待完整 `RagChatResult` 才开始发文本。
- 保持现有 SSE contract 兼容：`message_delta`、`product_cards`、`comparison_result`、`done`、`error` event 名称不变。
- 保持 Android 现有 parser 和 UI 行为可用；必要时只增加可忽略的 `done.retrieval.timing` 或 debug metadata，不要求 Android 改 UI。
- 优先压缩普通推荐路径的首 token，因为 Gradio sample 里的推荐决策 / 避坑反选已稳定复现 30s 以上延迟。
- 降低最终 RAG prompt 和输出 token 上限，避免为了结构化 JSON 和长解释拖慢首 token / 总耗时。
- 对不需要最终 RAG 的路径保留快速返回：clarification、cartAction、comparison clarification、cache hit、no candidates 等路径不为流式改造引入额外等待。

## 不做

- 不做 query expansion、rerank、GraphRAG、Agentic RAG 或新向量库替换。
- 不改变 negative constraint、comparison、cartAction、clarification 的业务语义。
- 不把规则 / 正则变成用户意图权威；LLM 意图仍是 cart / negative / clarification / comparison 等控制流的主心骨。
- 不为了快而跳过商品事实回查、库内 product id allowlist 或安全过滤。
- 不在 Android UI 上新增性能图表；指标先由 Gradio 和后端 debug metadata 消费。
- 不把真实 `.env`、API key、完整 prompt 或 provider 原始敏感错误写入日志、SSE 或 Gradio 导出。
- 不把 1s 作为本轮必须达成的硬验收。1s 是最终挑战目标，本轮 V1 先消除“完整生成后才发首 token”的结构性问题，并给后续并行化提供证据。

## 设计原则

- 先修假流式，再做并行化。当前最影响体验的是 controller 等完整结果后才写 `message_delta`。
- 先可观测，再优化。没有阶段耗时就无法判断 37s 是 intent、embedding、Qdrant、数据库、最终 LLM 还是 judge 造成。
- 只流式用户可见 assistant 文本；商品卡、retrieval、cartAction、comparisonResult 等结构化 payload 仍在安全校验后发送。
- 最终 LLM 可以流式，但 product id 仍必须经过后端 allowlist 校验。不能因为流式就边说边推荐未校验商品。
- cache hit 应继续最快返回，且可以复用缓存 answer 快速切块发送。
- 对 provider streaming 失败要有 fallback：流式调用失败时可回退到当前 non-streaming `generate()`，但需要在 timing metadata 中标记。

## 后端实现方案

### 1. LLM client 支持流式

扩展 `server/src/modules/llm/llm.types.ts`：

- 新增 `LlmStreamChunk`，至少包含 `textDelta?: string`、`finishReason?: string`。
- 新增可选接口 `streamGenerate(request): AsyncIterable<LlmStreamChunk>`，或新增 `StreamingLlmClient` 独立接口。
- 保留现有 `generate()`，避免一次性改完所有 intent 服务。

修改 `server/src/modules/llm/openai-compatible-chat.client.ts`：

- 对 final answer 支持 `stream: true` 的 OpenAI-compatible Chat Completions 请求。
- 解析 SSE chunk 中的 `choices[0].delta.content`。
- 支持 abortSignal。
- provider 返回不支持 streaming、非 2xx、JSON 解析失败或 stream 中断时抛出可映射错误。

修改 / 新增测试：

- `openai-compatible-chat.client.test.ts` 覆盖 streaming delta、done、abort、provider error。
- `mock-llm.client.ts` 支持测试用流式输出。

### 2. 拆分 RAG 最终生成与结果收口

在 `RagChatService` 中避免 controller 只能拿完整 `RagChatResult`：

- 新增普通 RAG 路径的 streaming 方法，例如 `answerStream(input, callbacks)` 或返回 `AsyncIterable<ChatStreamEventDraft>`。
- V1 可以只让普通 RAG success 路径真实流式；其他路径继续复用 `answer()` 后切块。
- 在最终 RAG LLM 调用前，仍完成必要的 filters、vector search、product lookup 和 contexts 构造。
- 最终 LLM 输出仍需要解析 product ids。为兼容流式，建议把最终输出 schema 从“一个 JSON object 包含 answer 和 ids”拆成两段：
  - 用户可见 answer 走流式纯文本或轻量格式。
  - 推荐 product ids 由后端基于 candidates 和模型后置选择完成，或者让模型在流结束后返回结构化 footer，再由后端校验。

V1 推荐保守方案：

- 最终 RAG prompt 要求模型先输出用户可见短答，后续用一个明确 JSON footer 或 delimiter 输出推荐 ids。
- controller 只把 footer 前的文本作为 `message_delta` 发给用户。
- 流结束后解析 footer，校验 product ids，发送 `product_cards` 和 `done`。
- 如果 footer 缺失或 invalid product id，保留现有 fallback：发送已流式文本后，在 `done` 标记 fallback，商品卡为空或使用安全 fallback 卡片。不要为了补救再编造商品。

如果 delimiter/footer 方案实现风险太高，V1 fallback 是：

- 保持最终 LLM 结构化 JSON non-streaming，但在 routing 阶段向 SSE 发送一个可忽略 comment heartbeat 或 `status` 不落 Android contract。
- 这只能改善连接保活，不算真正首 token 优化；不得作为最终完成标准。

### 3. Controller 支持服务主动写流

修改 `server/src/modules/chat/chat.controller.ts`：

- 抽象 `ChatStreamWriter`，提供 `writeMessageDelta(text)`, `writeProductCards(items)`, `writeComparisonResult(payload)`, `writeDone(payload)`, `writeError(payload)`。
- 对支持 streaming 的 service 路径，controller 在 header flush 后把 writer 传入 service。
- 保留当前 `writeChatResult()` 作为非 streaming fallback。
- 继续处理 client close、abortSignal、backpressure 和 serialization error。

测试：

- `chat.controller.test.ts` 增加“service 在 promise 完成前写出第一段 message_delta”的测试。
- 保留现有 event order：文本 delta 在前，product cards / comparison result / done 在后。
- client close 后下游 streaming LLM 被 abort，且不继续写。

### 4. 阶段耗时观测

新增轻量 timing helper，例如 `server/src/modules/chat/chat-timing.ts`：

- `mark(name)`。
- `durationMs(from, to)`。
- `toSafeMetadata()`，只输出阶段名和毫秒数。

在 `RagChatService.answer()` / streaming path 标记：

- `request_received`
- `sse_started`
- `cart_snapshot_done`
- `cart_intent_done`
- `negative_intent_done`
- `comparison_intent_done`
- `clarification_intent_done`
- `query_rewrite_done`
- `cache_read_done`
- `vector_search_done`
- `product_lookup_done`
- `llm_first_delta`
- `llm_complete`
- `done_sent`

暴露方式：

- 默认只在 server debug log 或 Gradio-export-safe `done.retrieval.timing` 中输出。
- 不输出 prompt、API key、provider raw error、完整商品知识文本。

### 5. Prompt 与 token 压缩

普通 RAG prompt V1 压缩：

- 降低 `RAG_LLM_MAX_COMPLETION_TOKENS`，当前 2000 对 72 字符 answer 上限明显过大。
- candidates 默认只给 top 3 商品的必要事实；长 `knowledgeText` / marketing 文本裁剪为短摘要。
- shortHistory 控制在最近 2-3 条，且只保留对检索 / 推荐有用字段。
- 最终 answer 明确要求短答优先，先给结论，再给 1-2 个理由。

注意：

- 压缩 prompt 不能删除商品事实安全边界。
- 不能让模型输出库外商品名、价格或库存。

### 6. Gradio 评估配合

使用现有 `rag-gradio-evaluation-workbench/`：

- 先只跑 sample 3 条，不跑 30-50 条长集。
- 运行时关闭自动初评，避免 judge LLM 把评估时间和 Chat SSE 时间混在一起。
- 保存 baseline 和优化后结果到 `data/processed/rag/gradio-runs/`。
- 对比平均首 token、P95 首 token、总耗时、商品命中率、约束通过率和要点覆盖。

## 验收标准

功能验收：

- `POST /api/chat/stream` 普通 RAG success 路径能在最终 LLM 仍在生成时发出第一条 `message_delta`。
- `product_cards` 和 `done` 仍只包含后端校验过的库内商品 id。
- cache hit、clarification、cartAction、comparison clarification、no candidates 路径行为不回退。
- Android 现有 Chat SSE parser 不需要改即可继续展示文本和商品卡。

性能验收：

- sample 3 条关闭自动初评后，平均首 token 相比当前 baseline 至少下降 50%。
- P95 首 token 明显低于当前 43s baseline。
- 如果无法接近 1s，必须用 timing metadata 说明主要剩余耗时属于哪一段。
- 商品命中率和约束通过率不能为了速度下降；sample 仍应保持当前 100% / 100%。

测试验收：

- `cd server; npm.cmd test` 通过。
- `cd server; npm.cmd run build` 通过。
- Gradio sample smoke 记录优化前后首 token。
- 至少一条直接 Chat SSE smoke 证明第一条 `message_delta` 在请求完成前已经到达。

## 风险与回退

- 风险：最终 LLM 仍需要结构化 JSON，流式纯文本会破坏 `parseRagLlmOutput()`。
  - 回退：只对 prompt / token / timing 先优化，同时保留 non-streaming；但不能宣称完成真实首 token 优化。
- 风险：provider streaming 格式与 OpenAI-compatible 不完全一致。
  - 回退：保留 `generate()` fallback，并补 research / provider adapter spec。
- 风险：模型边流式边输出未校验商品名。
  - 回退：prompt 禁止库外商品名，后端只在 `product_cards` / `done` 返回校验商品；必要时对流式文本做最小安全截断。
- 风险：多段 intent LLM 调用仍串行，真实首 token 仍高。
  - 后续 spec 再做 routing 并行化：cart / negative / comparison / clarification / rewrite 的合并、短路和缓存。

## 后续 research 触发条件

实现时只有遇到以下情况才需要补 research：

- 当前 Ark / OpenAI-compatible provider 的 streaming delta、tool call、finish reason 或错误事件不稳定。
- 需要把多个 intent LLM 调用合并成一个 router prompt，但 schema 和安全边界不清楚。
- 需要跨 provider 对比首 token、模型大小、max token、temperature 对延迟的影响。
- 需要把 query rewrite / negative intent / clarification intent 并行化，但会影响控制流正确性。
