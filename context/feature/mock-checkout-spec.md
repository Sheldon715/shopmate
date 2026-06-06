# Mock Checkout Agent Flow

## 背景

挑战阶段第 30 项不应只做“点击按钮生成一条模拟订单”。导师考察点更接近“推荐咨询升级到交易执行”：Agent 能否通过多轮对话读取购物车、汇总结构化订单信息、引导用户确认收货地址，并在用户确认后创建模拟订单，同时让 Android 客户端实时反馈状态变化。

当前项目已经具备：

- 真实购物车 API 和 Android 购物车页。
- 聊天自然语言加购和购物车 CRUD。
- 后端 Chat SSE `done.cartAction` side effect。
- Android 收到购物车 side effect 后刷新购物车的能力。

本 spec 在这些能力之上新增 Agent 下单确认闭环：先生成待确认 checkout draft，再由用户确认后创建 mock order。真实支付、真实物流和完整地址簿不在本轮范围内。

## 目标

- 支持用户通过聊天触发结算流程：
  - “帮我结算购物车”
  - “就买这些”
  - “下单吧”
  - “确认下单”
- Agent 读取当前已勾选购物车商品，汇总商品、数量、单价、小计、总价和默认收货地址。
- 首轮只创建 `pendingCheckout`，不直接创建订单。
- 用户可以在 pending 状态下：
  - 确认下单。
  - 修改本次模拟收货地址。
  - 取消下单。
  - 要求重新汇总订单信息。
- 用户明确确认后，后端创建模拟订单和订单项快照。
- 订单金额、商品名称、价格、数量、地址都以后端事实和 checkout draft 为准，不能信任客户端传来的总价。
- Android 收到 checkout / order side effect 后刷新购物车，并展示订单创建结果。

## 非目标

- 不接真实支付、退款、物流、发票或优惠券。
- 不做完整登录 / JWT / 多用户地址簿；当前继续使用 demo user。
- 不做真实库存锁定或库存扣减；只校验商品仍 active / available。
- 不让 Android 解析自然语言或直接决定订单金额。
- 不用关键词 / 正则直接执行下单。
- 不在代码里硬编码用户可见导购确认话术；用户可见回复由 LLM 基于结构化状态生成。
- 不把图片找货、商品对比、RAG rerank 或推荐策略优化混进本 spec。

## 前置条件

应先完成并保持稳定：

- `android-cart-api-foundation-spec.md`
- `conversational-cart-add-spec.md`
- `cart-natural-language-management-spec.md`
- Chat SSE 和 Android `cartAction` 解析 / 刷新链路

如果当前 `context/current-feature.md` 仍在执行其他 feature，先完成或显式切换后再加载本 spec。

## 交互设计

推荐主流程：

1. 用户：“帮我结算购物车。”
2. LLM checkout intent 判断为 `start_checkout`。
3. 后端读取当前购物车已勾选商品。
4. 后端生成 pending checkout draft，包含商品快照、总价、默认地址和过期时间。
5. Agent 回复订单汇总，并询问是否使用默认地址确认下单。
6. 用户：“确认。”
7. LLM checkout intent 判断为 `confirm_checkout`。
8. 后端校验 pending draft 仍有效，重新确认商品仍可售。
9. 后端创建 mock order / order items。
10. SSE 返回 assistant 回复和 `done.checkoutAction`。
11. Android 刷新购物车，并展示模拟订单完成结果。

地址修改流程：

1. pending checkout 已存在。
2. 用户：“地址改成 UNSW 学生宿舍。”
3. LLM intent 判断为 `update_address`，抽取 address text。
4. 后端只更新 pending draft address snapshot，不创建订单。
5. Agent 重新汇总订单和新地址，继续等待确认。

取消流程：

1. pending checkout 已存在。
2. 用户：“取消下单。”
3. 后端清除 pending checkout。
4. Agent 说明已取消；不改变购物车。

## LLM Intent Schema

新增 `CheckoutIntentService`。输入包括用户原话、短历史、当前购物车摘要、pending checkout 摘要和最近 checkout 状态。LLM 只输出结构化 intent，不生成最终用户可见回复。

```json
{
  "is_checkout_intent": true,
  "action": "start_checkout",
  "address_text": null,
  "target_scope": "selected_cart_items",
  "confidence": "high",
  "needs_confirmation": false,
  "clarification_question": null
}
```

字段：

- `is_checkout_intent`: 当前话是否明确涉及结算 / 下单 / 订单确认。
- `action`: `start_checkout | confirm_checkout | update_address | cancel_checkout | summarize_checkout | unknown`.
- `address_text`: 用户明确修改本次收货地址时填入原文或规范化后的简短地址。
- `target_scope`: 第一版只允许 `selected_cart_items`，不支持从自然语言直接挑选未勾选商品下单。
- `confidence`: `high | medium | low`。
- `needs_confirmation`: 当意图含糊、高风险或需要用户补充时为 true。
- `clarification_question`: 需要补充信息时由 LLM 生成。

Prompt 要求：

- “推荐下单前要买什么”“下单流程是什么”不是执行 checkout。
- “确认”“可以”“没问题”只有在当前会话存在 pending checkout 时才可能是 `confirm_checkout`。
- `confirm_checkout` 必须表示用户明确同意创建订单。
- 修改地址只更新 pending checkout，不等于确认下单。
- 模型不能输出订单号、金额事实或商品事实；这些由后端生成。
- 模型不可用、输出无效或低置信时，不创建订单、不改变 checkout 状态。

## Pending Checkout

后端新增短期 pending checkout store，可先使用进程内 TTL Map，与当前 chat memory 模式一致。后续接真实用户 / 地址簿时再迁移到数据库。

建议字段：

```ts
interface PendingCheckoutDraft {
  id: string;
  conversationId: string;
  userKey: string;
  status: "pending";
  address: MockShippingAddress;
  items: PendingCheckoutItem[];
  summary: CheckoutSummary;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}
```

规则：

- Draft 来自当前购物车已勾选商品。
- Draft 内保存商品和价格快照，用于向用户确认。
- 用户最终确认时仍要重新校验商品是否存在、active / available；如商品不可用，不能创建订单。
- Draft 默认 15 分钟过期。
- 同一 conversation / userKey 只保留一个 active draft；新 start_checkout 可覆盖旧 draft，但应先由 Agent 说明将重新生成。

## 数据库设计

新增 migration：

- `orders`
- `order_items`

建议字段：

`orders`:

- `id`
- `order_number`
- `user_key`
- `status`: 第一版 `mock_created | cancelled`
- `currency`: `CNY`
- `subtotal_cents`
- `shipping_fee_cents`
- `total_cents`
- `shipping_name`
- `shipping_phone_masked`
- `shipping_address`
- `source`: `chat_agent | cart_button`
- `created_at`

`order_items`:

- `id`
- `order_id`
- `product_id`
- `product_name_snapshot`
- `brand_snapshot`
- `category_snapshot`
- `unit_price_cents_snapshot`
- `quantity`
- `subtotal_cents_snapshot`
- `image_path_snapshot`
- `created_at`

要求：

- 订单价格必须保存快照。
- 订单项必须保留商品名 / 品牌 / 类目 / 主图快照，避免商品后续变化影响历史订单展示。
- 不写真实手机号；demo 地址使用 masked phone 或固定 mock contact。

## 后端实现

新增模块建议：

- `server/src/modules/orders/order.types.ts`
- `server/src/modules/orders/order.repository.ts`
- `server/src/modules/orders/order.mapper.ts`
- `server/src/modules/orders/order.service.ts`
- `server/src/modules/orders/order.controller.ts`
- `server/src/modules/orders/order.routes.ts`
- `server/src/modules/chat/checkout-intent.service.ts`
- `server/src/modules/chat/checkout-command.service.ts`
- `server/src/modules/chat/checkout-response.service.ts`
- `server/src/modules/chat/pending-checkout.store.ts`

HTTP API：

- `GET /api/orders/:orderId`
- `POST /api/orders/mock-checkout`

`POST /api/orders/mock-checkout` 用于 Android 购物车页按钮入口。它不绕过确认流程，第一版建议行为是：创建 pending checkout draft 并返回 draft，让 Android 展示确认面板；最终确认仍调用 chat 或专门 confirm endpoint。

如果为了 Android 按钮体验需要非聊天确认，可新增：

- `POST /api/orders/mock-checkout/confirm`
- `POST /api/orders/mock-checkout/cancel`

但聊天 Agent 流程仍是评分重点。

Chat 接入流程：

1. `RagChatService.answer()` 在 cart management 后、普通 RAG 前调用 checkout intent。
2. `is_checkout_intent = false` 时继续原流程。
3. `start_checkout`：
   - 读取 cart snapshot。
   - 只取 selected items。
   - cart 为空或未勾选时返回结构化 `checkoutAction.status = empty_cart`。
   - 生成 pending draft，不创建订单。
4. `update_address`：
   - 必须存在 pending draft。
   - 更新 draft address。
   - 返回待确认汇总。
5. `summarize_checkout`：
   - 读取 pending draft 或重新从购物车生成 draft。
   - 不创建订单。
6. `cancel_checkout`：
   - 清除 pending draft。
   - 不改变购物车。
7. `confirm_checkout`：
   - 必须存在 pending draft。
   - 校验 draft 未过期。
   - 在数据库事务中创建 `orders` 和 `order_items`。
   - 删除或取消勾选已结算购物车项。第一版推荐删除已结算项，让客户端状态变化明显。
   - 返回订单 DTO 和 checkoutAction。

## SSE Contract

`ChatDonePayload` 增加可选：

```ts
checkoutAction?: {
  type:
    | "start_checkout"
    | "update_address"
    | "summarize_checkout"
    | "confirm_checkout"
    | "cancel_checkout";
  status:
    | "draft_created"
    | "needs_confirmation"
    | "address_updated"
    | "order_created"
    | "cancelled"
    | "empty_cart"
    | "expired"
    | "failed";
  draftId?: string;
  orderId?: string;
  orderNumber?: string;
  selectedCount?: number;
  totalCents?: number;
  address?: {
    label: string;
    recipient: string;
    phoneMasked: string;
    fullAddress: string;
  };
  cartRefreshRequired?: boolean;
}
```

边界：

- `checkoutAction` 是结构化 side effect，不是用户可见话术来源。
- assistant message 仍由 LLM `CheckoutResponseService` 生成。
- 创建订单成功时 `cartRefreshRequired = true`。
- draft 创建 / 地址更新不刷新购物车。

## 用户可见回复

新增 `CheckoutResponseService`：

- 输入：用户原话、checkout intent、checkoutAction、cart / draft / order facts。
- 输出：中文 assistant 回复。
- LLM 必须基于后端提供的商品事实、金额和地址，不得编造优惠、库存、物流或支付结果。
- 只有 `status = order_created` 才能说已完成模拟下单。
- `empty_cart` 只能提示购物车没有可结算商品。
- `expired` 需要提示用户重新汇总。
- 模型失败时，后端可以返回最小结构化状态，但不要补固定导购模板。

## Android 实现

聊天页：

- 扩展 `ChatStreamContract.kt` / parser，解析 `checkoutAction`。
- `ChatViewModel` 收到 `checkoutAction.status = order_created` 且 `cartRefreshRequired = true` 时触发 `RefreshCart`。
- 可新增 `ShowMockOrderResult` side effect，带 `orderNumber` / `totalCents`。
- 聊天消息正常展示 LLM assistant 回复。

购物车页：

- 将当前 `onCheckoutClick = showCheckoutPending` 替换为真实入口。
- 最小实现可以打开一个确认 bottom sheet：
  - 已选商品数量。
  - 总价。
  - 默认地址。
  - “确认模拟下单 / 返回修改”。
- 更贴 Agent 评分的实现：点击“去结算”后把用户带回聊天页，并自动发送或预填“帮我结算购物车”，由 Agent 引导确认。

订单结果：

- 成功后展示订单号、总价和“模拟订单已生成”。
- 刷新购物车，已结算商品应消失或取消勾选。
- 失败时不把它当成 Chat SSE 网络错误；按 assistant 回复和局部错误状态展示。

## 安全边界

- 没有 LLM checkout intent，不创建订单。
- 没有 pending draft，不接受“确认”直接创建订单。
- Draft 过期，不创建订单。
- 购物车为空或没有 selected items，不创建订单。
- 商品不可用、商品缺失或数量非法，不创建订单。
- 总价由后端重新计算并保存快照。
- 地址只作为 mock shipping address，不保存真实敏感信息。
- 日志不得打印完整用户地址以外的敏感 provider error；如果后续接真实用户信息，地址日志必须脱敏。
- checkout action 不能写入 popular query cache。

## 测试要求

后端：

- `CheckoutIntentService`：
  - “帮我结算购物车” -> `start_checkout`。
  - pending 存在时“确认” -> `confirm_checkout`。
  - 无 pending 时“确认”不创建订单。
  - “地址改成 xxx” -> `update_address`。
  - “取消下单” -> `cancel_checkout`。
  - 普通推荐问题 -> `is_checkout_intent = false`。
  - invalid JSON / schema 不合法不 mutation。

- `PendingCheckoutStore`：
  - create / update address / get / clear。
  - TTL 过期后返回 missing / expired。
  - 同一 conversation 覆盖旧 draft 行为稳定。

- `OrderService`：
  - 从 selected cart items 创建订单。
  - 空购物车 / 未勾选商品失败。
  - 商品不可用失败。
  - 价格和商品信息保存快照。
  - 创建订单后删除或取消勾选已结算购物车项。
  - 事务失败时不产生半截订单。

- Chat SSE：
  - start_checkout 返回 `checkoutAction.status = draft_created`，不调用普通 RAG。
  - update_address 返回 `address_updated`，不创建订单。
  - confirm_checkout 返回 `order_created` 和 `cartRefreshRequired = true`。
  - cancel_checkout 返回 `cancelled`。
  - LLM intent 失败不创建订单。

Android：

- parser 能读取 `done.checkoutAction`。
- `order_created` 触发购物车刷新 side effect。
- `draft_created` / `address_updated` 不触发购物车刷新。
- 购物车页 checkout 入口不再只显示占位。
- checkout 失败不会显示普通聊天网络错误。

## Smoke Test

准备：购物车中至少有两件商品，并勾选至少一件。

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"checkout-demo-1\",\"message\":\"帮我结算购物车\"}" http://localhost:3000/api/chat/stream
```

期望：

- 返回订单汇总和默认地址确认。
- `done.checkoutAction.status = draft_created`。
- 没有创建订单。

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"checkout-demo-1\",\"message\":\"地址改成 UNSW 学生宿舍\"}" http://localhost:3000/api/chat/stream
```

期望：

- 更新 pending draft 地址。
- `done.checkoutAction.status = address_updated`。
- 没有创建订单。

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"checkout-demo-1\",\"message\":\"确认下单\"}" http://localhost:3000/api/chat/stream
```

期望：

- 创建 mock order。
- 返回订单号。
- `done.checkoutAction.status = order_created`。
- Android 刷新购物车。

## 验证命令

后端：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

Android contract 或 UI 变化：

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build
```

## 完成标准

- 用户能通过聊天启动结算、确认地址、修改地址、取消和最终确认下单。
- 后端先生成 pending checkout，用户确认后才创建 mock order。
- 订单和订单项保存商品 / 地址 / 价格快照。
- 创建订单后 Android 能看到购物车状态变化和订单结果反馈。
- LLM 负责下单意图和用户可见回复，后端负责事实、校验、事务和结构化 side effect。
- 模型失败、目标不明、draft 过期、购物车为空或商品不可用时不创建订单。
- 后端 test / build 与 Android unit test / build 通过，或记录真实失败原因。
