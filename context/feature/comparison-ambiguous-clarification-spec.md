# Comparison Ambiguous Clarification Spec

## 1. 背景

`comparison-rag-output-spec.md` 已经让明确目标的对比请求可以返回真实 `comparison_result`。Post-advanced RAG evaluation 里，`comparison-recent-two-sunscreens-chat` 和 `comparison-priority-oily-commute-chat` 都通过，说明结构化对比 payload、库内商品 allowlist 和 SSE contract 方向可行。

当前剩余问题集中在 `comparison-ambiguous-chat`：用户只说“帮我比较一下”时，系统没有生成 `comparison_result`，这是安全的；但它继续进入普通 RAG，返回了一组 `product_cards`。这种体验像是在替用户猜要比较什么。

本 spec 只修 ambiguous comparison 的控制流：当 LLM 判断用户是在请求对比，但目标商品不足或过多时，后端应返回 LLM 生成的澄清问题，不进入普通 RAG 推荐。

## 2. 目标

- comparison intent 已成立，但目标不足时，返回澄清而不是普通推荐。
- 用户说“帮我对比一下”且最近推荐商品刚好 2 个时，可以直接对比这 2 个商品。
- 用户说“帮我对比一下”但最近推荐商品只有 1 个时，返回 LLM 澄清，询问还要和哪款商品对比。
- 用户说“帮我对比一下”但最近推荐商品超过 2 个时，返回 LLM 澄清，询问要对比哪两款。
- 用户明确说“第一款和第三款”“这两款”“理肤泉和安热沙”时，沿用现有 target resolution，不被本 spec 破坏。
- Chat SSE 中 ambiguous comparison 不再返回普通 `product_cards`。

## 3. 非目标

本 feature 不做以下事情：

- 不改 comparison output schema。
- 不改 Android comparison UI。
- 不做 29 query expansion / rerank。
- 不做 RAG Negative Fact Metadata。
- 不修改商品数据或 Qdrant index。
- 不写死对比维度、推荐结论或用户可见对比文案。
- 不让关键词规则直接决定 comparison intent。

LLM 仍然负责判断“这是不是对比请求”、生成澄清问题、生成对比维度和结论。代码只负责在 comparison intent 已成立后，基于最近推荐商品数量和 target resolution 结果做安全控制。

## 4. 是否 Overfitting

这不是针对单个测试 case 的 overfitting，原因是规则抽象的是通用业务边界：

- 两款商品：对比可执行。
- 少于两款：缺少对比对象，必须追问。
- 多于两款：第一版只支持两款对比，必须让用户选两款。

这条规则适用于所有品类，不依赖“防晒”“耳机”或某个 caseId。它不生成用户可见结论，也不决定比较维度，只是防止目标不足时误进入普通推荐。

## 5. 行为规则

### 5.1 明确目标

如果用户明确指定两个商品，继续现有 comparison flow：

- “帮我对比这两款”
- “对比第一款和第二款”
- “第一款和第三款哪个更适合我”
- “对比理肤泉和安热沙”

要求：

- 成功解析出 2 个 active product 后，生成 `comparison_result`。
- 不静默替换用户指定商品。
- 如果指定商品不存在、inactive、被 negative constraint 排除或出现多个同名候选，则返回澄清。

### 5.2 目标为空，但最近推荐刚好 2 个

如果 LLM 判断是 comparison intent，且 target 为 `unknown` 或缺少 ordinals / names，但 `contextMemory.lastRecommendedProductIds` 去重后刚好 2 个 active product：

- 直接使用这 2 个商品作为 comparison target。
- 允许用户问题中的关注点继续传给 comparison generation，例如“哪个更适合油皮通勤”。
- SSE 返回 `message_delta -> product_cards -> comparison_result -> done`。

示例：

```text
上一轮：推荐两款适合通勤的防晒
当前：帮我对比一下
结果：直接对比上一轮两款防晒
```

### 5.3 目标为空，最近推荐少于 2 个

如果最近推荐商品少于 2 个：

- 不调用普通 RAG。
- 不返回普通 `product_cards`。
- 不生成 `comparison_result`。
- 返回 LLM 生成的澄清问题。

示例意图：

```text
我现在只看到一款商品。你想拿它和哪一款对比？
```

实际用户可见文案必须由 LLM 生成，代码不能写死。

### 5.4 目标为空，最近推荐超过 2 个

如果最近推荐商品超过 2 个：

- 不静默选择前两款。
- 不调用普通 RAG。
- 不返回普通 `product_cards`。
- 不生成 `comparison_result`。
- 返回 LLM 生成的澄清问题，让用户选择哪两款。

示例意图：

```text
你想比较刚才推荐里的哪两款？可以说“第一款和第三款”。
```

实际用户可见文案必须由 LLM 生成，代码不能写死。

## 6. 后端实现建议

建议在 `ComparisonIntentService.detect()` 和 target resolution 之后增加一个小的 resolution gate，例如：

```ts
type ComparisonTargetResolution =
  | { status: "ready"; productIds: [string, string] }
  | { status: "needs_clarification"; reason: "too_few_targets" | "too_many_targets" | "ambiguous_targets" | "invalid_targets"; targetHints?: unknown };
```

推荐流程：

1. `RagChatService.answer()` 先按现有顺序处理 cart、negative constraint、comparison intent。
2. 如果 `isComparison=false`，继续普通 clarification / RAG。
3. 如果 `isComparison=true`：
   - 解析用户显式 target。
   - 如果显式 target 解析成 2 个商品，生成 comparison。
   - 如果没有显式 target，看 `contextMemory.lastRecommendedProductIds`。
   - 最近推荐刚好 2 个时，使用这 2 个商品。
   - 最近推荐不是 2 个时，返回 comparison clarification。
4. comparison clarification 直接作为 Chat result 返回，不进入普通 RAG。
5. `done` payload 记录 fallback / retrieval metadata，便于 evaluation 判断这是 intentional clarification。

可能涉及文件：

- `server/src/modules/chat/comparison-intent.service.ts`
- `server/src/modules/chat/rag.service.ts`
- `server/src/modules/chat/chat-context-memory.service.ts`
- `server/src/modules/chat/chat-stream.controller.ts`
- `server/src/modules/chat/chat-contract.fixture.test.ts`
- `server/src/modules/chat/*.test.ts`
- `data/processed/rag/chat-evaluation-cases.json`
- `docs/rag-evaluation-post-advanced-report.md` 或新增 follow-up report

## 7. Chat Result / SSE 要求

comparison clarification 成功时：

- 可以发送 `message_delta`，内容为 LLM 生成的澄清问题。
- 不发送 `product_cards`，或发送空 `product_cards` only if 当前 SSE contract 强制要求每次成功都发该 event。
- 不发送 `comparison_result`。
- `done.fallbackReason` 可使用或新增稳定值，例如 `COMPARISON_TARGET_CLARIFICATION`。
- `done.recommendedProductIds` 应为空。

如果现有 Android parser 依赖每个成功流都有 `product_cards` event，则允许发送空 `product_cards.items=[]`，但报告必须说明这是 contract 兼容，不是推荐结果。

## 8. 测试要求

后端单元测试至少覆盖：

- comparison intent true + 最近推荐刚好 2 个 -> 直接 comparison。
- comparison intent true + 最近推荐 1 个 -> clarification，不调用 vector search / ordinary RAG generation。
- comparison intent true + 最近推荐 3 个 -> clarification，不静默截断前两款。
- 用户明确 ordinals 为 2 个 -> comparison。
- 用户明确 ordinals 超过 2 个 -> clarification。
- 用户显式商品名解析为 2 个 active products -> comparison。
- 用户显式商品名 ambiguous -> clarification。
- non-comparison query -> 继续普通 RAG。

Chat SSE / evaluation case 至少覆盖：

- `comparison-recent-two-sunscreens-chat` 仍 pass，返回 `comparison_result`。
- `comparison-priority-oily-commute-chat` 仍 pass，返回 `comparison_result`。
- `comparison-ambiguous-chat` 从 `acceptable_needs_optimization` 变成 pass：不返回普通商品卡，只返回澄清。
- 新增一个最近推荐刚好 1 个后的 “帮我对比一下” case。
- 新增一个最近推荐超过 2 个后的 “帮我对比一下” case。

## 9. 验证命令

建议执行：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

如果修改了 Chat SSE evaluation cases：

```powershell
cd server
npm.cmd run rag:evaluate -- --output ../data/processed/rag/evaluation-results-comparison-clarification.jsonl
```

Chat SSE smoke：

```powershell
cd server
npm.cmd run dev
```

然后用 `message` 字段测试：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"cmp-ambiguous-1\",\"message\":\"帮我比较一下\"}" http://localhost:3000/api/chat/stream
```

## 10. 完成报告

完成时记录：

- comparison Chat case before / after。
- `comparison-ambiguous-chat` 是否不再返回普通推荐商品。
- 最近推荐 1 / 2 / 3 个商品时的行为。
- 明确目标 comparison 是否仍返回 `comparison_result`。
- 是否新增或复用 `COMPARISON_TARGET_CLARIFICATION` fallback reason。
- 未运行的命令和真实原因。

## 11. Checklist

- [ ] 增加 comparison target resolution gate。
- [ ] 最近推荐刚好 2 个时直接 comparison。
- [ ] 最近推荐少于 2 个时返回 LLM 澄清。
- [ ] 最近推荐超过 2 个时返回 LLM 澄清。
- [ ] comparison clarification 不进入普通 RAG。
- [ ] 补后端单元测试。
- [ ] 补 Chat SSE / evaluation case。
- [ ] 跑 server test / build。
- [ ] 复跑 comparison Chat SSE smoke。
- [ ] 写完成报告。
