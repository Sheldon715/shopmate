# Negative Constraint RAG

## 背景

进阶加分阶段第 26 项要求支持“不要含酒精”“除了某品牌还有什么”等否定条件。当前代码已经有一部分地基：`VectorSearchFilters.avoidTerms`、Qdrant `must_not`、会话记忆里的 `avoidTerms`、RAG prompt 里的否定词展示，以及 evaluation case `alcohol-free-sunscreen`。但这还不是完整的 26。

当前缺口是：否定语义仍偏规则抽取，容易把“不要 / 不含 / 除了”后面的字串当成确定约束；也没有完整的 LLM negative intent schema、候选商品事实过滤、无效模型输出处理和端到端测试收口。

本 spec 的核心原则：否定条件的意图识别和约束抽取必须由 LLM 完成。代码只负责候选事实、schema 校验、商品库内过滤、长度 / 数量限制和安全状态控制，不能靠关键词模板预设用户语义。

## 目标

- 支持用户用自然语言表达排除条件：
  - “推荐防晒霜，但不要含酒精的”
  - “除了安热沙还有什么防晒”
  - “不要太油的防晒”
  - “别推荐苹果手机”
- 新增 LLM negative constraint intent，识别当前问题是否包含排除约束，并抽取结构化 constraints。
- 将 LLM 抽取的排除约束合并进当前会话记忆和 RAG filters。
- 在检索前、检索后和 RAG prompt 中都显式应用排除约束。
- 用户可见回答仍由 RAG LLM 生成，不能用规则模板拼“已为你排除 xxx”。
- LLM negative intent 无效、不可用或不确定时，不新增排除约束，不执行误过滤，也不向用户展示预设导购话术。

## 非目标

- 不做完整 query rewrite；如果需要改写检索 query，留给 `rag-query-rewrite-spec.md`。
- 不做语义 rerank；如果过滤后召回仍差，留给 `rag-query-expansion-rerank-spec.md`。
- 不改 Android contract，除非后端 SSE 需要新增明确结构化状态；第一版应尽量保持 `answer` / `productCards` / `done` 现有 shape。
- 不做购物车 CRUD；“不要第二个，删掉它”留给 `cart-natural-language-management-spec.md`。
- 不做商品成分医学判断。只能基于库内商品事实和候选 snippets，不得编造“无酒精”“无香精”等事实。

## LLM Intent Schema

新增 `NegativeConstraintIntentService`，输入当前问题、必要短历史、已有 context memory、显式 filters 和可选候选类目提示，输出严格 JSON：

```json
{
  "has_negative_constraints": true,
  "confidence": "high",
  "constraints": [
    {
      "raw_text": "不要含酒精",
      "term": "酒精",
      "kind": "ingredient",
      "scope": "product",
      "match_policy": "exclude_if_product_facts_conflict"
    }
  ],
  "needs_clarification": false,
  "clarification_question": null
}
```

字段说明：

- `has_negative_constraints`: 当前问题是否真的包含排除约束。
- `confidence`: `high | medium | low`。
- `constraints`: 最多 5 个排除约束。
- `raw_text`: 用户原话中的相关片段。
- `term`: 标准化后的排除目标，例如 `酒精`、`安热沙`、`太油`。
- `kind`: `ingredient | brand | feature | category | price | product | unknown`。
- `scope`: `product | sku | recommendation_set | unknown`。
- `match_policy`:
  - `exclude_brand`: 排除品牌。
  - `exclude_product`: 排除指定商品。
  - `exclude_category`: 排除品类。
  - `exclude_if_product_facts_conflict`: 商品事实、tags、avoid_when、snippets 或描述中出现明确冲突时排除。
  - `needs_clarification`: 排除对象不明确，不能安全过滤。
- `needs_clarification`: 排除目标太模糊时为 true。
- `clarification_question`: 需要澄清时由 LLM 生成的用户可见问题；代码不能写死反问模板。

## Prompt 要求

negative intent prompt 必须强调：

- 只判断否定 / 排除约束，不推荐商品，不生成商品卡片。
- 不要根据关键词机械截取；要判断用户是否真的表达了排除意图。
- “不含酒精”表示要排除含酒精或酒精风险不明确的商品；不能把“出现酒精字样”简单等同于含酒精。
- “除了某品牌”表示排除该品牌并推荐同类替代，不等于用户讨厌整个类目。
- “不要太贵 / 便宜一点”这类可能是价格约束，应输出 `kind = price` 或交给现有预算逻辑，不要硬塞进 `avoidTerms`。
- 如果无法确定排除对象，输出 `needs_clarification = true` 和 LLM 生成的澄清问题。

## 后端流程

推荐接入顺序：

1. `RagChatService.answer()` 接收问题。
2. 先执行 cart intent；如果是购物车命令，走现有购物车链路，本 spec 不处理。
3. 读取已有 context memory，但不要用规则从当前问题抽取新的 avoid terms。
4. 调用 `NegativeConstraintIntentService.detect()`。
5. 如果 LLM 输出有效且 `has_negative_constraints = true`：
   - 将 constraints 合并进 memory constraints。
   - 将可安全映射的 constraints 转成 `VectorSearchFilters.avoidTerms` / brand 排除 / product 排除。
   - 如果 `needs_clarification = true`，返回 LLM 生成的澄清问题，`fallbackReason` 可复用或扩展为 `NEEDS_CLARIFICATION`。
6. 再执行 clarification intent，让它看到已经抽取出的负向约束。
7. vector search 使用合并后的 filters，并适当 over-fetch，避免过滤后候选不足。
8. PostgreSQL 回查商品事实。
9. 对候选商品执行后过滤，移除与 LLM negative constraints 冲突的商品。
10. RAG prompt 只接收过滤后的候选，并明确列出用户的排除约束。
11. RAG LLM 生成用户可见回答和 product ids。
12. 后端继续做 product id allowlist；被排除商品即使被 LLM 输出，也必须丢弃。

## 与现有规则抽取的关系

需要收敛 `ChatContextMemoryService.extractAvoidTerms()` 的职责：

- 不再用 `不要 / 不含 / 除了` 正则作为当前问题的权威语义判断。
- 可以保留轻量 normalize / trim / dedupe helper。
- 显式 API filters 中传入的 `avoidTerms` 仍可作为结构化约束使用。
- 当前用户自然语言里的新增排除条件必须来自 `NegativeConstraintIntentService` 的有效输出。

已有的 category、budget、preference 小规则可以暂时保留，但不能扩展成新的否定语义模板。

## 过滤策略

第一版用三层过滤，宁可少推荐，也不要把明显冲突的商品包装成符合条件：

1. 检索前 metadata filter：
   - brand 排除进入 Qdrant `must_not`。
   - tags / avoid_when 可继续走 `must_not`。
   - 对 `ingredient` / `feature` 这类非精确 metadata，不只依赖 Qdrant。

2. 检索后 product facts filter：
   - 用 PostgreSQL 商品字段、`recommendWhen`、`avoidWhen`、`marketingDescription`、tags 和 snippets 判断是否明显冲突。
   - `不含酒精` 这种场景不能简单看到“酒精”就排除；如果商品事实明确写“不含酒精”，可以保留；如果事实写“部分敏感肌可能对酒精敏感”，必须排除。
   - 如果无法判断是否满足排除条件，默认不把它作为“满足排除条件”的推荐。

3. LLM answer allowlist：
   - RAG LLM 只能从过滤后的 candidate ids 中选择。
   - parse 后再次校验 product ids，任何被排除的 id 都不能出现在最终 `recommendedProductIds` 和 `productCards`。

## 用户可见回答

- 正常推荐：由 RAG LLM 基于过滤后的候选和 negative constraints 生成简短回答。
- 没有候选：由现有 `RagResponseGenerationService.generateNoCandidatesAnswer()` 或同等 LLM 回复生成服务生成可继续聊天的说明。
- LLM negative intent 失败：不新增排除约束，也不声称“已排除”；可以继续普通 RAG 或返回结构化状态，不能拼预设导购话术。
- LLM 输出非法 product id：沿用现有 invalid output / allowlist 处理，不把被排除商品展示给用户。

## 数据与评估

必须复用现有 case，并补充更多反选表达：

- `alcohol-free-sunscreen`
- `alcohol-free-sunscreen-chat`
- “除了安热沙还有什么防晒”
- “不要苹果，推荐拍照好的手机”
- “耳机不要入耳式”
- “防晒别太油”

对于每个 case 记录：

- LLM negative intent 输出。
- 最终 filters。
- vector hits 原始候选。
- 过滤后候选。
- 最终 productCards。
- 是否出现违反排除约束的商品。

## 测试要求

后端单元测试：

- `NegativeConstraintIntentService`：
  - 能解析“不要含酒精”“除了安热沙还有什么”。
  - “不要太贵”不应被硬塞成普通 avoid term。
  - LLM invalid JSON / schema 不合法时返回无约束，不抛出未处理异常。
  - `needs_clarification` 使用 LLM 输出的问题，不用代码模板。

- `ChatContextMemoryService` / RAG orchestration：
  - 当前问题的自然语言否定约束来自 LLM intent，而不是 regex。
  - negative constraints 会进入 filters 和 context memory。
  - 多轮追问会保留上一轮有效排除约束。
  - 用户切换类目时清理不再适用的排除约束。

- vector / candidate filter：
  - brand 排除不会返回该品牌。
  - 明确含有冲突事实的商品会被过滤。
  - “不含酒精”商品不会因为文本出现“酒精”两个字被误过滤。
  - 被过滤商品即使被 LLM 推荐，也不会进入最终 cards。

- SSE / contract：
  - 无需新增 Android 字段时，现有事件 shape 不变。
  - no-candidates 仍显示普通 assistant message，不出现“重新输入”错误卡。

验证命令：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

如本 feature 修改 Android contract，再补：

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build
```

## Smoke Test

后端本地启动后至少测：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"negative-demo-1\",\"message\":\"推荐防晒霜，但不要含酒精的\"}" http://localhost:3000/api/chat/stream
```

期望：

- assistant 不声称推荐含酒精商品满足“无酒精”。
- `product_cards` 不包含明确含酒精或酒精风险冲突商品。
- 如果库内没有足够安全候选，LLM 生成可继续聊天的 no-candidates 回复。

再测：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"negative-demo-2\",\"message\":\"除了安热沙还有什么防晒\"}" http://localhost:3000/api/chat/stream
```

期望：

- 不返回安热沙品牌商品。
- assistant 文案来自 LLM，不是固定模板。

## 完成标准

- `context/feature/negative-constraint-rag-spec.md` 对应实现完成。
- 自然语言否定约束由 LLM intent 决定，代码不再用正则作为权威判断。
- 检索前 filters、检索后商品事实过滤和 RAG prompt 都能看到同一组 negative constraints。
- 最终 `productCards` 不包含被排除商品。
- 模型失败时不新增排除约束、不执行业务动作、不展示预设导购话术。
- `alcohol-free-sunscreen-chat` 这类 case 有可复核测试或 smoke 记录。
