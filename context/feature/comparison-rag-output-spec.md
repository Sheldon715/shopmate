# Comparison RAG Output

## 背景

进阶加分阶段第 28 项要求把当前 mock 商品对比页升级为真实 RAG 对比结果。早期 `android-product-comparison-spec.md` 明确只做 Android mock：`ProductComparisonScreen` 直接消费 `MockShopMateData.sunscreenComparison`，侧边栏历史项进入固定防晒对比页。

本 spec 要把对比能力接入真实聊天链路：用户在主聊天里说“帮我对比这两款”“对比理肤泉和安热沙”，后端用 LLM 判断对比意图、解析目标商品、基于库内商品事实生成结构化对比结果，Android 再用真实 payload 渲染 `ProductComparisonScreen`。

核心原则：对比意图、对比维度、每格内容、推荐结论和用户可见说明都应由 LLM 基于库内商品事实生成。代码只负责 schema 校验、商品目标解析、product id allowlist、字段长度限制、商品事实回查和 UI contract，不能按品类写死“防晒力 / 肤感 / 预算”这类模板。

## 目标

- 支持用户在聊天中触发真实商品对比：
  - “帮我对比这两款”
  - “对比第一款和第二款”
  - “帮我比较理肤泉和安热沙”
  - “这两个哪个更适合油皮通勤”
- 新增 LLM comparison intent，判断当前问题是否是对比请求，并抽取目标商品与对比偏好。
- 后端基于最近推荐商品、当前问题中的商品名和 PostgreSQL 商品事实解析对比目标。
- 后端调用 LLM 生成结构化 comparison payload：对比维度、商品列表、每格内容、高亮项、推荐商品和总结。
- SSE 返回 comparison payload，Android 展示聊天中的对比入口，并打开真实 `ProductComparisonScreen`。
- `ProductComparisonScreen` 消费真实 UI state，不再在正式运行路径使用 `MockShopMateData.sunscreenComparison`。

## 非目标

- 不做多轮复杂决策树或长期偏好学习。
- 不做真实排序模型 / reranker；如需要留给 `rag-query-expansion-rerank-spec.md`。
- 不做图片找货或多模态对比。
- 第一版只支持 2 个商品对比；如果用户要求 3 个或更多商品，后端不生成对比表，由 LLM 用自然中文说明目前只支持两款，并请用户选出两款。
- 不把对比表塞进普通 assistant 文本里。
- 不让 Android 根据关键词判断对比意图。
- 不使用固定品类维度模板拼表格。

## LLM Comparison Intent

新增 `ComparisonIntentService`，输入当前问题、短历史、context memory、最近推荐商品摘要和可选 filters，输出严格 JSON：

```json
{
  "is_comparison": true,
  "confidence": "high",
  "target": {
    "kind": "recent_recommendations",
    "ordinals": [1, 2],
    "names": []
  },
  "user_priority": "油皮通勤",
  "needs_clarification": false,
  "clarification_question": null
}
```

字段说明：

- `is_comparison`: 当前问题是否明确要求比较多个商品。
- `confidence`: `high | medium | low`。
- `target.kind`:
  - `recent_recommendations`: 指向最近推荐商品，如“这两款”“第一款和第二款”。
  - `names`: 指向用户说出的商品名 / 品牌名。
  - `category_search`: 用户只说“帮我对比两款防晒”，需要先检索候选。
  - `unknown`: 目标不足。
- `ordinals`: 最近推荐商品序号；如果用户提到超过两款，也要保留这些线索并让 `needs_clarification=true`。
- `names`: 用户提到的商品名、品牌或别名。
- `user_priority`: 用户关注点，例如“油皮通勤”“续航”“预算”，由 LLM 提取。
- `needs_clarification`: 目标不足或歧义时为 true。
- `clarification_question`: 需要澄清时由 LLM 生成，代码不能写死反问模板。

Intent prompt 必须强调：

- 只判断对比意图和目标，不生成对比表。
- “推荐两款商品”不是对比请求。
- “把第二个加入购物车”不是对比请求，应交给购物车 intent。
- 不能输出 productId 作为事实；productId 由后端解析和校验。
- 不确定目标时输出 `needs_clarification = true`。

## Comparison Output Schema

新增 `ComparisonGenerationService`，输入已校验的商品事实、用户问题、短历史、用户关注点、检索 snippets 和当前日期，输出严格 JSON：

```json
{
  "answer": "我把这两款按通勤肤感、防晒稳定性和预算做了对比。",
  "comparison": {
    "title": "防晒霜对比",
    "products": [
      { "product_id": "p_beauty_006", "display_label": "欧莱雅隔离露" },
      { "product_id": "p_beauty_010", "display_label": "安热沙防晒乳" }
    ],
    "dimensions": [
      {
        "id": "skin_feel",
        "label": "肤感",
        "cells": [
          {
            "product_id": "p_beauty_006",
            "value": "水感轻薄，更适合日常通勤。",
            "highlight": true
          },
          {
            "product_id": "p_beauty_010",
            "value": "成膜更强，户外稳定性更好。",
            "highlight": false
          }
        ]
      }
    ],
    "recommended_product_id": "p_beauty_006",
    "conclusion": "如果主要是油皮通勤，优先看欧莱雅；如果长时间户外，安热沙更稳。",
    "highlights": [
      {
        "product_id": "p_beauty_006",
        "label": "通勤肤感",
        "text": "更轻薄，日常使用压力小。"
      }
    ]
  }
}
```

约束：

- `answer` 是聊天气泡里的简短回复，不超过 90 个中文字符。
- `dimensions` 第一版 3 到 6 行。
- 每个 `dimension.cells` 必须覆盖所有 comparison products。
- `product_id` 只能来自后端提供的 allowlist。
- 每格 `value` 只能基于商品事实、snippets、字段和库内内容。
- `recommended_product_id` 可以为 null；不能为了有结论硬推荐。
- `conclusion` 不超过 160 个中文字符。
- 不允许输出 markdown、表格字符串或商品库外产品。

## 后端流程

推荐接入顺序：

1. `RagChatService.answer()` 收到用户问题。
2. 先执行购物车 intent；明确购物车操作优先，不进入 comparison。
3. 执行 negative constraint intent，让排除条件可以影响后续候选。
4. 调用 `ComparisonIntentService.detect()`。
5. 如果不是 comparison，继续现有 clarification / RAG 流程。
6. 如果 comparison 目标不足，返回 LLM 生成的 clarification question，不生成对比表。
7. 解析对比目标：
   - 最近推荐序号：从 `contextMemory.lastRecommendedProductIds` 取商品。
   - 商品名 / 品牌：用 PostgreSQL active products 和可选 vector search 查找。
   - category_search：用 RAG 检索拿候选，再限制到 2 个。
8. 后端对目标商品做 allowlist、active 状态和去重校验。
9. 对目标商品补充 snippets / product facts，构造 comparison prompt。
10. 调用 `ComparisonGenerationService.generate()`。
11. parse 并校验 comparison output。
12. 返回普通 assistant `answer`、对比商品 `productCards` 和结构化 `comparison_result`。
13. 不把 comparison response 写入 popular query cache，除非后续单独设计 comparison cache key。

## Target Resolution

目标解析必须基于后端事实：

- 最近推荐商品只能来自 `contextMemory.lastRecommendedProductIds`。
- 商品名匹配必须回查 PostgreSQL active products。
- 多个同名 / 同品牌候选时，需要 LLM 澄清，不自动猜。
- 少于 2 个商品时不能生成对比表。
- 超过 2 个商品时不静默截断为前两款，应让 LLM 说明目前只支持两款对比，并请用户选出两款。
- 负向约束已经确认时，被排除商品不能进入 comparison payload。

## SSE Contract

新增 SSE event：

```ts
type ChatStreamEventName =
  | "message_delta"
  | "product_cards"
  | "comparison_result"
  | "done"
  | "error";
```

`comparison_result` payload：

```ts
interface ChatComparisonResultPayload {
  id: string;
  title: string;
  query: string;
  productIds: string[];
  dimensions: Array<{
    id: string;
    label: string;
    cells: Array<{
      productId: string;
      value: string;
      highlight?: boolean;
    }>;
  }>;
  recommendedProductId?: string | null;
  conclusion: string;
  highlights: Array<{
    productId: string;
    label: string;
    text: string;
  }>;
}
```

事件顺序建议：

1. `message_delta`
2. `product_cards`
3. `comparison_result`
4. `done`

`done.recommendedProductIds` 使用对比商品 ids，`retrieval.returnedProductIds` 同步记录返回商品。普通 RAG 不发送 `comparison_result`。

如果实现阶段决定把 comparison 放进 `done.comparison`，也必须保持 Android parser、contract fixture 和 SSE 测试覆盖；但第一版推荐独立 `comparison_result`，避免把大型结构塞进 done summary。

## Android 改动范围

- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatStreamContract.kt`
  - 增加 `ChatComparisonResultDto` / `ChatComparisonDimensionDto` / `ChatComparisonCellDto`。
  - 增加 `ChatStreamEvent.ComparisonResult`。

- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatStreamEventParser.kt`
  - 解析 `comparison_result`。
  - 旧事件不受影响。

- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatUiState.kt`
  - 增加当前会话 comparison result 列表或 latest comparison。
  - 增加聊天中的 comparison action / card UI state。

- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`
  - 收到 `ComparisonResult` 后保存 payload。
  - 在聊天消息区暴露“查看对比”入口。
  - 不把 comparison 解析成普通商品推荐。

- `client/android/app/src/main/java/com/shopmate/app/ui/comparison/ProductComparisonScreen.kt`
  - 从 `ComparisonUi` 参数或 ViewModel state 渲染真实数据。
  - 正式运行路径不再读取 `MockShopMateData.sunscreenComparison`。
  - Preview 可继续使用 mock。

- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
  - 增加真实 comparison route，例如 `ShopMateScreen.ProductComparison(comparisonId: String)`。
  - 从聊天中的 comparison action 打开对比页。

## UI 要求

- 聊天页中保留 assistant 简短回复，并展示一个明确的 comparison action。
- 对比页展示：
  - 用户原始问题。
  - LLM assistant 简短说明。
  - 对比商品卡片。
  - 对比维度表。
  - 高亮项。
  - 推荐结论。
- 表格在窄屏可换行，不能横向溢出。
- 如果 comparison payload 缺字段或校验失败，Android 不打开对比页，保留普通 assistant 回复。
- 商品卡点击继续走真实 Product Detail API。

## LLM-first 边界

- comparison intent 由 LLM 判断；Android 和后端规则不能用“对比 / 比较”关键词直接切流。
- 对比维度由 LLM 根据商品事实和用户关注点生成；代码不能按品类写死维度模板。
- 每格文案和结论由 LLM 生成；代码只做长度、空值、product id allowlist 和字段完整性校验。
- 模型不可用或输出无效时，不生成结构化对比，不展示预设对比表。
- 被 allowlist 排除的 product id 不能出现在 rows、highlights、recommendation 或 product cards。

## 测试要求

后端：

- `ComparisonIntentService`：
  - “帮我对比这两款” -> comparison true，target recent recommendations。
  - “推荐两款防晒” -> comparison false 或 category search 推荐，不直接 comparison。
  - “对比第一款和第三款” -> ordinals。
  - 目标不足时输出 LLM clarification question。
  - invalid JSON / schema 不合法时不进入 comparison flow。

- `ComparisonGenerationService`：
  - 校验 LLM output schema。
  - 过滤不在 allowlist 的 product id。
  - 维度 cells 必须覆盖所有 products。
  - `recommended_product_id` 不合法时置空或失败，不硬推荐。
  - 输出过长时截断或判 invalid。

- `RagChatService`：
  - comparison flow 不调用普通 RAG response parser。
  - comparison products 来自 PostgreSQL active products。
  - negative constraints 会排除 comparison target。
  - no target / ambiguous target 不执行对比生成。
  - comparison result 不写 popular query cache。

- SSE contract：
  - `comparison_result` event 顺序正确。
  - 普通 RAG / clarification / cart action 不发送 comparison event。
  - contract fixture 覆盖 comparison success。

Android：

- `ChatStreamEventParserTest` 覆盖 `comparison_result`。
- mapper 将 DTO 转成 `ComparisonUi`。
- `ChatViewModelTest` 覆盖收到 comparison result 后出现 comparison action。
- `ProductComparisonScreen` 用真实 `ComparisonUi` 渲染，不依赖 `MockShopMateData`。
- `testDebugUnitTest` 和 build 通过。

验证命令：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build
```

## Smoke Test

先发起一轮普通推荐，让会话里有最近推荐商品：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"comparison-demo-1\",\"message\":\"推荐两款适合通勤的防晒\"}" http://localhost:3000/api/chat/stream
```

再触发对比：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"comparison-demo-1\",\"message\":\"帮我对比这两款，哪个更适合油皮通勤\"}" http://localhost:3000/api/chat/stream
```

期望：

- SSE 包含 `comparison_result`。
- `product_cards` 是真实库内商品。
- comparison rows 的 productId 全部来自返回商品 allowlist。
- assistant 回复由 LLM 生成，不是固定模板。
- Android 聊天页出现“查看对比”入口，点击进入真实对比页。

## 完成标准

- `comparison-rag-output-spec.md` 对应实现完成。
- 用户能从主聊天触发真实商品对比。
- 后端返回结构化 comparison payload：维度、商品、每格内容、高亮、推荐结论。
- 对比维度和结论由 LLM 基于库内商品事实生成。
- Android `ProductComparisonScreen` 正式路径消费真实 payload，不再使用 `MockShopMateData.sunscreenComparison`。
- 模型失败或输出无效时不展示预设对比表。
