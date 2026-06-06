# Android Checkout Detail Page

## Research 判断

本 spec 不需要单独做外部 research。原因是范围不是支付平台、地址库或真实电商合规接入，而是把已经完成的 `mock-checkout-spec.md` 从购物车 bottom sheet 升级成独立 Android 确认订单页，并补齐后端 checkout snapshot contract。

实现前需要做的是本地代码扫描，而不是联网调研：

- 复核 `CartScreen` 当前 `CartCheckoutSheet`、`OrderRepository`、`OrderApiClient` 和 `OrderService`。
- 复核 `orders` / `order_items` 现有 migration 与 DTO 是否已经覆盖商品、地址、金额快照。
- 复核 ShopMate Android 主题、共享组件、商品图片解析和价格格式化方式。

## 背景

`mock-checkout-spec.md` 已经完成 Agent 下单确认闭环：

- 聊天 Agent 可以启动 checkout、修改地址、确认或取消。
- 后端已有 pending checkout、mock order / order_items、订单快照和 `checkoutAction`。
- 购物车按钮现在可以创建 pending draft，但 Android 端仍是一个简短确认 sheet。

这个形态已经超过“小修 UI”的边界。下一步应该单独做一个 checkout experience：购物车点击“去结算”进入独立 `CheckoutScreen`，页面接近京东 / 淘宝的确认订单页，展示收货信息、商品清单、配送方式、支付方式和金额明细，并在提交时把用户编辑后的收货 / 配送 / 支付选择传给后端保存快照。

## 目标

- 购物车“去结算”进入独立 Android `CheckoutScreen`，不再弹简短 bottom sheet。
- 页面结构贴近真实电商确认订单页：
  - 收货联系人、电话、地址。
  - 商品清单、数量、单价、小计。
  - 配送方式。
  - 支付方式 selector。
  - 商品金额、配送费、应付金额。
  - 底部固定提交订单栏。
- 用户可以在页面内编辑联系人、电话和地址，并做基础校验。
- 用户可以选择 fake 支付方式，但不接真实支付、不跳支付 SDK、不创建真实交易。
- 用户提交订单时，Android 将 shipping / delivery / payment snapshot 传给后端。
- 后端以 pending checkout draft 的商品和金额为准，保存订单商品、价格、地址、配送和支付方式快照。
- 聊天 Agent checkout 入口继续保留；购物车按钮走独立页面，两个入口共享后端 pending draft / confirm 能力。
- UI 必须贴合 ShopMate 现有主题风格，不出现“模拟”字样。

## 非目标

- 不接真实支付、退款、物流、优惠券、发票或地址簿。
- 不做订单历史列表、售后页、物流轨迹或真实订单状态机。
- 不让 Android 决定商品金额、配送费最终值或订单商品列表。
- 不把聊天 Agent 的 LLM checkout intent 重写到 Android 端。
- 不把图片找货、推荐、对比、RAG 或购物车自然语言管理混进本 spec。
- 不用这个 spec 修改 `.env`、真实支付密钥或第三方支付配置。

## 与现有 mock checkout 的关系

本 spec 是 `mock-checkout-spec.md` 的后续体验升级，不是继续硬塞到已完成 feature 里。

保留：

- 后端 `POST /api/orders/mock-checkout` 创建 pending draft。
- 后端 `POST /api/orders/mock-checkout/confirm` 创建 order / order_items。
- 后端 `POST /api/orders/mock-checkout/cancel` 取消 draft。
- 聊天 Agent 入口和 `done.checkoutAction`。
- 创建订单后刷新购物车的行为。

升级：

- Android 购物车按钮从 `CartCheckoutSheet` 改为进入 `CheckoutScreen`。
- Android draft DTO 需要包含完整商品行和 checkout 可编辑字段。
- Confirm API 需要接收并校验 shipping / delivery / payment snapshot。
- `orders` 表需要补足支付和配送快照字段，如果当前 schema 不够，应新增 migration。

## 页面入口

### 购物车入口

1. 用户在购物车勾选商品。
2. 点击“去结算”。
3. Android 调用 `POST /api/orders/mock-checkout` 创建 draft。
4. 成功后进入 `CheckoutScreen(draftId)`，展示后端返回的商品和金额快照。
5. 页面内编辑收货信息、选择配送和支付。
6. 点击“提交订单”。
7. Android 调用 confirm API，传入 `draftId`、`conversationId`、shipping / delivery / payment snapshot。
8. 后端创建 order / order_items，并返回订单号。
9. Android 刷新购物车，展示订单提交成功状态。

### 聊天 Agent 入口

聊天入口继续保持 `mock-checkout-spec.md` 的 Agent 流程。后续如果要从聊天 draft 跳转到独立 checkout 页，可以在收到 `checkoutAction.status = draft_created` 后暴露一个“查看订单”操作，但本 spec 第一版不强制做。

## Android 信息架构

新增建议目录：

```text
client/android/app/src/main/java/com/shopmate/app/ui/checkout/
  CheckoutScreen.kt
  CheckoutUiState.kt
  CheckoutViewModel.kt
  CheckoutViewModelFactory.kt
```

数据层继续放在：

```text
client/android/app/src/main/java/com/shopmate/app/data/orders/
```

推荐 UI sections：

1. 顶部栏
   - 返回按钮。
   - 标题“确认订单”。
   - 不放营销式说明。

2. 收货信息
   - 联系人。
   - 手机号。
   - 详细地址。
   - 支持点击编辑，或 inline edit。
   - 手机号做长度 / 数字基础校验。
   - 地址不能为空。

3. 商品清单
   - 使用紧凑商品行，不直接复用聊天大卡导致页面过长。
   - 展示图片、商品名、品牌 / 类目、单价、数量、小计。
   - 商品、数量和价格不可在 checkout 页编辑；要改数量返回购物车。

4. 配送方式
   - 第一版提供 1 到 2 个 fake option，例如：
     - 标准配送，配送费 0。
     - 加急配送，配送费可选。
   - 选项来自后端 draft 或前后端共同固定 contract。
   - 最终费用以后端 confirm 时重新计算为准。

5. 支付方式
   - selector 只做 fake choice，例如：
     - 微信支付。
     - 支付宝。
     - 银行卡。
   - 不请求真实支付权限。
   - 不打开第三方支付 SDK。
   - 不保存卡号、账户号或支付凭证。

6. 金额明细
   - 商品金额。
   - 配送费。
   - 应付金额。
   - 如果 Android 根据配送选项显示本地预估，提交后仍以后端返回订单金额为准。

7. 底部提交栏
   - 固定在底部。
   - 左侧显示应付金额。
   - 右侧按钮“提交订单”。
   - loading 时按钮禁用并显示提交中状态。

8. 提交结果
   - 成功后展示订单号、金额和返回购物车 / 回到聊天入口。
   - UI 文案不出现“模拟”字样。
   - 可以在 debug log / contract / docs 中继续使用 mock 命名，用户界面不展示。

## ShopMate 主题要求

订单页必须像 ShopMate 的产品页、购物车页和聊天页的一部分，而不是普通 Material Demo：

- 使用 `ShopMateTheme`、`ShopMateTextPrimary`、`ShopMateTextSecondary`、`ShopMateGreen`、`ShopMateLightGreen`、`ShopMateSurfaceSoft`。
- CTA 使用当前绿色渐变或既有 primary button 语义。
- 背景延续现有柔和浅色背景，不做大面积单色深色或外部电商红橙主题。
- 商品行和信息块使用当前项目的 rounded surface / soft border 语言。
- 图标优先复用项目已有 top action / cart / product icon 体系；如新增图标，放在 Android 资源目录并保持同风格。
- 页面要适合重复操作和扫读：信息密度高于营销页，避免大 hero、夸张插画或解释性文案。
- 所有文本在小屏下不能挤出容器；最长地址需要换行或省略，底部金额和按钮不能重叠。
- 不在 UI 中展示“fake”“mock”“模拟”这类字样。

## Android 状态设计

建议状态：

```kotlin
data class CheckoutUiState(
    val draft: CheckoutDraftUi? = null,
    val editableShipping: CheckoutShippingInputUi = CheckoutShippingInputUi(),
    val selectedDeliveryMethod: CheckoutDeliveryMethodUi? = null,
    val selectedPaymentMethod: CheckoutPaymentMethodUi? = null,
    val isLoadingDraft: Boolean = false,
    val isSubmitting: Boolean = false,
    val fieldErrors: CheckoutFieldErrorsUi = CheckoutFieldErrorsUi(),
    val errorMessage: String? = null,
    val orderResult: CheckoutOrderResultUi? = null,
)
```

规则：

- draft loading 失败时展示局部错误和重试。
- 字段校验失败时不调用 confirm API。
- `isSubmitting = true` 时禁用返回以外的重复提交操作，或返回时先取消请求。
- 订单提交成功后触发购物车刷新。
- Draft 过期、购物车变化或商品不可用时，提示用户返回购物车重新结算。

## Android 网络与 DTO

现有 DTO 需要扩展，而不是另起一套订单网络栈。

`MockCheckoutDraftDto` 建议增加：

```kotlin
@Serializable
data class MockCheckoutDraftDto(
    val id: String,
    val conversationId: String,
    val address: MockCheckoutAddressDto,
    val summary: MockCheckoutSummaryDto,
    val items: List<MockCheckoutItemDto> = emptyList(),
    val deliveryOptions: List<MockCheckoutDeliveryOptionDto> = emptyList(),
    val paymentOptions: List<MockCheckoutPaymentOptionDto> = emptyList(),
    val expiresAt: String,
)
```

Confirm request 建议从只传 `conversationId` 升级为：

```kotlin
@Serializable
data class MockCheckoutConfirmRequestDto(
    val conversationId: String,
    val draftId: String,
    val shipping: MockCheckoutShippingInputDto,
    val deliveryMethodType: String,
    val paymentMethodType: String,
)
```

注意：

- Android 不传商品金额和总价作为权威值。
- Android 不传商品列表作为权威值。
- Android 可以传用户编辑后的收货 / 配送 / 支付选择。
- 支付方式只传枚举，不传账户信息。

## 后端 Contract

### Draft response

`POST /api/orders/mock-checkout` 返回的 draft 需要足够渲染独立页面：

```json
{
  "success": true,
  "data": {
    "draft": {
      "id": "draft_001",
      "conversationId": "cart-button-checkout",
      "address": {
        "label": "默认地址",
        "recipient": "ShopMate 用户",
        "phoneMasked": "138****0000",
        "fullAddress": "ShopMate 收货点"
      },
      "items": [
        {
          "cartItemId": "cart_item_001",
          "productId": "product_001",
          "productName": "商品名称",
          "brand": "品牌",
          "category": "类目",
          "unitPriceCents": 9900,
          "quantity": 1,
          "subtotalCents": 9900,
          "imagePath": "/images/products/product_001.jpg"
        }
      ],
      "summary": {
        "itemCount": 1,
        "selectedCount": 1,
        "subtotalCents": 9900,
        "shippingFeeCents": 0,
        "totalCents": 9900,
        "currency": "CNY"
      },
      "deliveryOptions": [
        {
          "type": "standard",
          "label": "标准配送",
          "feeCents": 0,
          "etaText": "预计 2-4 天送达"
        }
      ],
      "paymentOptions": [
        {
          "type": "wechat",
          "label": "微信支付"
        }
      ],
      "expiresAt": "2026-06-06T00:00:00.000Z"
    }
  }
}
```

### Confirm request

`POST /api/orders/mock-checkout/confirm` 接收：

```json
{
  "conversationId": "cart-button-checkout",
  "draftId": "draft_001",
  "shipping": {
    "recipient": "张三",
    "phone": "13800000000",
    "fullAddress": "上海市浦东新区..."
  },
  "deliveryMethodType": "standard",
  "paymentMethodType": "wechat"
}
```

后端要求：

- `draftId` 必须匹配当前 pending checkout。
- `shipping.recipient`、`shipping.phone`、`shipping.fullAddress` 必须校验。
- 手机号只用于本次订单快照，保存前应 mask，不记录到日志。
- `deliveryMethodType` 必须来自后端允许列表。
- `paymentMethodType` 必须来自后端允许列表。
- 订单总价由 draft 商品金额和后端 delivery option 重新计算。
- 不接受客户端传入的 total / subtotal / item price。

### Confirm response

返回订单 DTO 时增加 checkout snapshot：

```json
{
  "order": {
    "id": "order_001",
    "orderNumber": "MOCK-20260606-ABC123",
    "totalCents": 9900,
    "shippingAddress": {
      "label": "订单收货信息",
      "recipient": "张三",
      "phoneMasked": "138****0000",
      "fullAddress": "上海市浦东新区..."
    },
    "deliveryMethod": {
      "type": "standard",
      "label": "标准配送",
      "feeCents": 0
    },
    "paymentMethod": {
      "type": "wechat",
      "label": "微信支付",
      "status": "not_charged"
    },
    "items": []
  },
  "checkoutAction": {
    "type": "confirm_checkout",
    "status": "order_created",
    "cartRefreshRequired": true
  }
}
```

对外 UI 不展示 `MOCK` 前缀时，Android 可以只展示 `orderNumber` 的后半段或后端新增 `displayOrderNumber`。如果保留当前 `MOCK-` 订单号，用户界面仍不能出现“模拟”字样。

## 数据库迁移

当前 `orders` 已有：

- `shipping_name`
- `shipping_phone_masked`
- `shipping_address`
- `shipping_fee_cents`
- `source`

如实现 payment / delivery snapshot，需要新增 migration，例如 `0005_order_checkout_snapshots.sql`：

```sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_label TEXT NOT NULL DEFAULT '订单收货信息',
  ADD COLUMN IF NOT EXISTS delivery_method_type TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS delivery_method_label TEXT NOT NULL DEFAULT '标准配送',
  ADD COLUMN IF NOT EXISTS payment_method_type TEXT NOT NULL DEFAULT 'wechat',
  ADD COLUMN IF NOT EXISTS payment_method_label TEXT NOT NULL DEFAULT '微信支付',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_charged';
```

规则：

- 不保存真实支付账号。
- 不保存完整银行卡、支付 token 或交易流水。
- 如果用户输入手机号，数据库只保存 masked phone。
- `order_items` 继续保存商品名、品牌、类目、单价、数量、小计和图片快照。

## 后端实现要求

需要调整：

- `checkout.types.ts`
  - 增加 delivery / payment 类型。
  - 增加 confirm request input 类型。

- `order.service.ts`
  - `createPendingCheckout` 返回商品 items、delivery options、payment options。
  - `confirmPendingCheckout` 接收 shipping / delivery / payment snapshot。
  - 校验 shipping 字段和 method allowlist。
  - 根据 delivery option 重新计算 shipping fee 和 total。
  - mask phone 后写入订单。

- `order.controller.ts`
  - `parseMockCheckoutBody` 拆分 draft create / confirm / cancel body。
  - confirm endpoint 支持新 body。
  - 错误码保持稳定，新增字段错误返回 `INVALID_CHECKOUT_REQUEST`。

- `order.mapper.ts`
  - 订单 DTO 返回 delivery / payment snapshot。

- `order.repository.ts`
  - 写入新增 order columns。
  - 读取新增 order columns。

错误码建议：

- `INVALID_CHECKOUT_REQUEST`
- `CHECKOUT_EMPTY_CART`
- `CHECKOUT_EXPIRED`
- `CHECKOUT_CART_CHANGED`
- `CHECKOUT_PRODUCT_UNAVAILABLE`
- `ORDER_NOT_FOUND`

不需要新增真实 payment service。

## 安全边界

- 后端继续保持 mock order / no real payment。
- UI 不展示“模拟”，但代码、API path 和数据库状态可以继续使用 mock 命名以保证边界清楚。
- 所有订单商品、价格和数量以后端 pending draft / PostgreSQL 商品事实为准。
- Android 提交的 shipping / payment 只作为快照输入，不影响商品事实。
- 支付方式 selector 只保存 `type` / `label` / `not_charged`，不产生真实扣款。
- Draft 过期、购物车变化、商品不可用、字段非法时不创建订单。
- 日志不得打印完整手机号、支付信息或 provider secret。
- checkout action 不进入 popular query cache。

## 测试要求

后端：

- Draft response 包含 items、summary、deliveryOptions、paymentOptions。
- Confirm body 缺 `draftId`、地址为空、手机号非法、未知支付方式时返回 `INVALID_CHECKOUT_REQUEST`。
- Confirm 时不信任客户端金额。
- Confirm 后订单保存 shipping masked phone、delivery method、payment method 和 payment status。
- Draft 过期、购物车变化、商品不可用时不创建订单。
- `GET /api/orders/:id` 返回订单商品、地址、配送和支付快照。

Android：

- `OrderApiClient` 能解析扩展 draft 和 order DTO。
- Confirm request 能发送 edited shipping / delivery / payment。
- `CheckoutViewModel` 校验联系人、手机号和地址。
- 购物车“去结算”进入 `CheckoutScreen`，不再展示 checkout sheet。
- 提交成功触发购物车刷新，并展示订单结果。
- Draft 过期 / cart changed / product unavailable 有用户可见错误。
- 小屏下地址、商品名、底部金额和按钮不重叠。

## 验证命令

后端：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

Android：

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/
```

如只做 Android UI 而后端 contract 未改，必须在 `context/current-feature.md` 记录未执行的后端验证和原因。

## 完成标准

- 购物车点击“去结算”进入独立确认订单页。
- 页面展示商品明细、收货信息、配送方式、支付方式、金额明细和提交底栏。
- 页面视觉贴合 ShopMate 现有主题，且用户界面不出现“模拟”字样。
- 用户编辑后的联系人、电话、地址、配送方式和支付方式能提交到后端。
- 后端保存订单商品、价格、地址、配送和支付快照。
- 支付方式只作为 fake selector，没有真实支付调用或支付凭证。
- 聊天 Agent checkout 入口仍可用，购物车按钮独立页面不破坏现有 SSE contract。
- 后端 test / build 与 Android unit test / build 通过，或记录真实失败原因。
