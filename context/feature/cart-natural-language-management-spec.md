# Cart Natural Language Management

## 背景

进阶加分阶段第 27 项要求支持“删除第二个商品”“把数量改成 2”这类自然语言购物车管理。当前项目已经有真实购物车 API、Android 购物车页、聊天自然语言加购和 `cartAction` SSE side effect，但聊天里还没有覆盖完整购物车 CRUD。

本 spec 在 `conversational-cart-add-spec.md` 和 `conversational-cart-add-response-generation-spec.md` 基础上扩展。核心原则不变：购物车操作意图必须由 LLM 判断和抽取；代码只做购物车快照、目标解析、数量限制、权限 / userKey、item allowlist 和 CartService 校验，不能用关键词正则直接执行删除、改数量或勾选。

## 目标

- 支持用户在聊天中管理购物车：
  - “删除第二个商品”
  - “把数量改成 2”
  - “这款买 3 件”
  - “取消勾选第一个”
  - “购物车里现在有什么”
- 新增或扩展 LLM cart management intent，覆盖 `inspect`、`add`、`remove`、`update_quantity`、`update_selected`。
- 后端执行前必须基于当前购物车快照解析目标 item，不能相信 LLM 直接给出的 itemId / productId。
- 成功 mutation 后通过 SSE `done.cartAction` 通知 Android 刷新购物车。
- 用户可见操作说明由 LLM 基于结构化 `cartAction` 和当前购物车事实生成；代码不能拼固定导购话术。
- LLM intent 无效、模型不可用、目标不明确或权限 / allowlist 校验失败时，不执行购物车 mutation。

## 非目标

- 不做真实登录 / 多用户购物车隔离；当前继续使用 demo user。后续接 auth 时必须用当前 user 约束 cart item。
- 不做结算、下单、地址确认或支付；这些留给 `mock-checkout-spec.md`。
- 不做“清空购物车”第一版直接执行。清空属于高风险批量删除，第一版只能识别并要求确认。
- 不让 Android 解析自然语言或直接调用购物车 CRUD。
- 不新增预设用户可见回复模板。
- 不让 LLM 绕过 `CartService` 的数量、商品可用性和 item 存在性校验。

## LLM Intent Schema

建议把现有 `CartCommandIntentService` 扩展为 `CartManagementIntentService`，或保留旧 service 名但更新 schema。输入包括当前用户消息、短历史、context memory、最近推荐商品、当前购物车快照摘要。

LLM 只输出结构化 intent：

```json
{
  "is_cart_management": true,
  "action": "update_quantity",
  "target": {
    "kind": "cart_ordinal",
    "index": 2,
    "text": null
  },
  "quantity": 2,
  "selected": null,
  "needs_confirmation": false,
  "confidence": "high",
  "clarification_question": null
}
```

字段说明：

- `is_cart_management`: 当前话是否明确要求查看或改变购物车。
- `action`: `inspect | add | remove | update_quantity | update_selected | clear`.
- `target.kind`:
  - `cart_ordinal`: 当前购物车列表中的第几个 item。
  - `recent_recommendation_ordinal`: 最近推荐商品中的第几个商品，只用于 add。
  - `name`: 商品名 / 品牌 / 关键词。
  - `deictic`: “这个 / 这款 / 刚才那个”。
  - `all`: 全部 item；只允许 inspect / update_selected，clear 需要确认。
  - `unknown`: 目标不明确。
- `quantity`: 只用于 add / update_quantity，范围由后端规范化到 `1..99`。
- `selected`: 只用于 update_selected。
- `needs_confirmation`: 高风险或含糊操作必须为 true。
- `confidence`: `high | medium | low`。
- `clarification_question`: 需要用户补充时由 LLM 生成，不用代码模板。

## Prompt 要求

cart management intent prompt 必须明确：

- 只判断购物车管理意图，不生成用户可见回答，不执行操作。
- 不能因为出现“删除 / 加 / 改 / 数量”等词就判定为 cart action；必须结合语义。
- “推荐加湿器”“预算加一点”“删掉这个条件”“换个推荐”不是购物车管理。
- 删除、改数量、取消勾选必须指向当前购物车 item。
- 加购可以指向最近推荐商品；删除和改数量不能指向最近推荐，必须基于当前购物车。
- `clear` 或 “全删 / 清空购物车”必须 `needs_confirmation = true`，第一轮不执行。
- 不要输出 itemId、productId 作为事实；可以输出 target descriptor，后端再解析。

## 后端流程

推荐接入顺序：

1. `RagChatService.answer()` 收到用户消息。
2. 读取 context memory 和当前 cart snapshot。
3. 调用 LLM cart management intent。
4. 如果 `is_cart_management = false`，继续现有 clarification / RAG 流程。
5. 如果 intent 无效、低置信、模型不可用或 schema 不合法，不执行操作，继续普通聊天或返回安全状态。
6. 如果 `needs_confirmation = true`，返回 LLM 生成的确认 / 澄清问题，不执行 CartService。
7. 用 `CartManagementCommandService` 基于当前 cart snapshot / 最近推荐商品解析目标：
   - add：只允许最近推荐商品 allowlist 或明确库内 active 商品。
   - remove / update_quantity / update_selected：只允许当前购物车 item allowlist。
   - inspect：读取当前 cart snapshot，不 mutation。
8. 调用 `CartService`：
   - `addItem`
   - `updateItem`
   - `deleteItem`
   - `selectAll`，仅用于明确的全选 / 全不选。
9. 构造结构化 `cartAction`。
10. 调用 LLM response generator 生成用户可见 assistant 回复。
11. SSE 输出普通 assistant message、可选 `product_cards` 和 `done.cartAction`。
12. Android 收到成功 mutation 的 `cartAction` 后刷新购物车。

## 结构化 Action

扩展现有 `CartActionResult`：

```ts
type CartActionType =
  | "inspect"
  | "add"
  | "remove"
  | "update_quantity"
  | "update_selected";

type CartActionStatus =
  | "success"
  | "needs_target"
  | "needs_confirmation"
  | "not_found"
  | "unavailable"
  | "failed";
```

建议字段：

- `type`
- `status`
- `itemId?`
- `productId?`
- `productName?`
- `quantity?`
- `selected?`
- `cartSummary?`
- `message?`：结构化状态说明，不作为 assistant 文案模板来源。

`cartAction.message` 不能承载硬编码导购话术；用户可见 assistant 回复由 LLM response service 生成。若 response LLM 失败，后端可以只返回结构化 `cartAction`，不要补一段固定导购模板。

## Target Resolution

后端解析目标必须使用当前事实：

- 当前购物车 snapshot：`CartDto.items`。
- 最近推荐商品：`contextMemory.lastRecommendedProductIds`，只用于 add。
- 商品事实：PostgreSQL active product。

规则边界：

- LLM 说“第二个”时，后端按当前购物车顺序解析，不按模型想象解析。
- LLM 说商品名时，后端用 cart item 的 name / brand / productId 做匹配。
- 多个匹配时返回 `needs_target`，由 LLM 生成澄清问题。
- 目标不存在时返回 `not_found`，不执行任何 mutation。
- 数量为 0 的 `update_quantity` 不自动等同 remove；除非 LLM action 明确是 `remove`，否则需要澄清。
- `clear` 第一版不执行，只返回 confirmation。

## 用户可见回答

新增或扩展 `CartActionResponseService`：

- 输入：用户原话、LLM intent、结构化 `cartAction`、当前 cart snapshot、目标商品事实、失败原因。
- 输出：短中文 assistant 回复。
- 回复必须由 LLM 生成，不能在代码里写“已删除第二个商品”“数量已改为 2”这类模板。
- LLM 必须遵守 `cartAction.status`：
  - 只有 `success` 才能说操作已完成。
  - `needs_target` / `needs_confirmation` 必须向用户确认。
  - `not_found` 只能说明当前购物车没有匹配 item。
  - `failed` 不能假装成功。
- LLM 不能编造优惠、库存、订单、支付、物流或结算结果。

## Android 影响

Android 不解析自然语言，只消费 SSE：

- `ChatCartActionDto.type` 要支持 `add | remove | update_quantity | update_selected | inspect`。
- `ChatViewModel.emitCartActionSideEffect()` 不应只识别 `type = add`；任何成功 mutation 都应触发 `RefreshCart`。
- `inspect` 不需要刷新购物车，除非后端明确返回新的 cart snapshot。
- `CartViewModel.refresh()` 继续从真实 Cart API 拉最新状态。
- 聊天页展示 LLM assistant 回复；购物车页展示刷新后的真实状态。
- 如果 contract 增加字段，补 `ChatStreamEventParserTest` 和 DTO 默认值，避免旧事件解析失败。

## 安全边界

- LLM intent 不通过，不 mutation。
- 目标解析不唯一，不 mutation。
- item 不属于当前用户购物车，不 mutation。
- 数量必须通过 `CartService` 的 `1..99` 校验。
- 删除 / 改数量必须基于当前 cart item allowlist。
- 清空购物车需要确认；第一版不直接执行。
- provider error / invalid output 不显示预设导购回复，不执行业务动作。

## 测试要求

后端：

- `CartManagementIntentService`：
  - “删除第二个商品” -> `remove + cart_ordinal(2)`。
  - “把数量改成 2” -> `update_quantity`，目标不明时 `needs_target`。
  - “购物车里有什么” -> `inspect`。
  - “推荐加湿器”“预算加一点” -> `is_cart_management = false`。
  - invalid JSON / schema 不合法时不 mutation。

- `CartManagementCommandService`：
  - ordinal / name / deictic target 能从当前 cart snapshot 解析。
  - 多个匹配返回 ambiguous。
  - cart 为空时 remove / update 返回 missing。
  - add 只能用最近推荐商品 allowlist 或库内 active 商品。

- `RagChatService`：
  - 成功 remove 调用 `CartService.deleteItem`，返回 `cartAction.type = remove`。
  - 成功 update_quantity 调用 `CartService.updateItem`。
  - `needs_confirmation` 不调用 CartService。
  - LLM intent 失败不调用 CartService。
  - response LLM 失败不生成预设导购话术。

- SSE contract：
  - `done.cartAction` 支持新 type。
  - 普通 RAG 不带 cartAction。
  - 购物车 mutation 后缓存不写入 popular query cache。

Android：

- `ChatStreamEventParserTest` 覆盖新 `cartAction.type`。
- `ChatViewModelTest` 覆盖成功 remove / update_quantity 会触发 `RefreshCart`。
- 非 success / inspect 不触发刷新。
- 购物车刷新失败时保留聊天结果，不把它当聊天流错误。

验证命令：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

如果修改 Android contract：

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build
```

## Smoke Test

准备：购物车中至少有两件商品。

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"cart-crud-demo-1\",\"message\":\"删除第二个商品\"}" http://localhost:3000/api/chat/stream
```

期望：

- LLM intent 判断为 cart management。
- 后端删除当前购物车第二个 item。
- SSE `done.cartAction.type = remove` 且 `status = success`。
- assistant 回复由 LLM 生成。
- Android 收到后刷新购物车。

再测：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"cart-crud-demo-1\",\"message\":\"把数量改成 2\"}" http://localhost:3000/api/chat/stream
```

期望：

- 如果目标不明确，LLM 生成澄清问题，不执行 mutation。
- 如果上下文中只有一个明确 cart item，后端把数量改为 2，并返回成功 cartAction。

## 完成标准

- `cart-natural-language-management-spec.md` 对应实现完成。
- 聊天中可以用自然语言查看、删除、改数量和勾选购物车 item。
- 所有 mutation 都由 LLM intent 先确认，再由后端 allowlist / CartService 执行。
- Android 端不解析自然语言，只按 `cartAction` 刷新购物车。
- 用户可见回复由 LLM 生成，不使用固定操作模板。
- 模型失败、目标不明或校验失败时不执行业务动作。
