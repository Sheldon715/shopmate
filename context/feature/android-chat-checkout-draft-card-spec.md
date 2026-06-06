# Android Chat Checkout Draft Card

## Research 判断

本 spec 不需要外部 research。目标是 Android 聊天页消费后端扩展后的 `checkoutAction`，展示和更新订单草稿卡片，并把聊天 draft 入口连接到已完成的 `CheckoutScreen`。

实现前需要本地扫描：

- `client/android/app/src/main/java/com/shopmate/app/data/chat/`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatUiState.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/checkout/CheckoutScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/checkout/CheckoutViewModel.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/orders/`
- 当前导航入口和购物车 / 聊天 side effect 处理。

## 背景

`ai-checkout-backend-patch-contract-spec.md` 完成后，`done.checkoutAction` 会返回完整 draft snapshot。这个后端能力如果只停留在日志或 assistant 文案里，Demo 观感不够明显。

本 spec 的目标是让 Android 聊天页把结构化 checkout 状态可视化：创建 draft 时出现订单卡片，修改地址 / 配送 / 支付时更新同一张卡片，确认订单后标记已提交并刷新购物车。

## 目标

- Android 解析扩展后的 `ChatCheckoutActionDto`。
- 聊天页展示 `CheckoutDraftCard`。
- `draft_created` 创建卡片。
- `address_updated` / `draft_updated` 更新同一张卡片。
- `cancelled` / `expired` 改变卡片状态。
- `order_created` 标记卡片已提交，触发购物车刷新和订单结果展示。
- 卡片支持：
  - 查看订单。
  - 取消。
  - 提交订单。
- “查看订单”进入 `CheckoutScreen(draftId)`，复用独立确认订单页。
- UI 不展示“mock”“fake”“模拟”等字样。

## 非目标

- 不新增后端 patch contract。
- 不新增独立 `checkout_action` SSE event。
- 不重写 `CheckoutScreen` 主流程。
- 不接真实支付、物流、发票或地址簿。
- 不在 Android 本地决定商品金额、配送费或订单成功状态。

## Chat DTO

扩展 `ChatCheckoutActionDto`，建议字段：

```kotlin
@Serializable
data class ChatCheckoutActionDto(
    val type: String,
    val status: String,
    val draftId: String? = null,
    val orderId: String? = null,
    val orderNumber: String? = null,
    val selectedCount: Int? = null,
    val totalCents: Int? = null,
    val address: ChatCheckoutAddressDto? = null,
    val cartRefreshRequired: Boolean? = null,
    val draft: ChatCheckoutDraftDto? = null,
    val order: ChatCheckoutOrderDto? = null,
    val changedFields: List<String> = emptyList(),
)
```

Draft DTO：

```kotlin
@Serializable
data class ChatCheckoutDraftDto(
    val id: String,
    val status: String,
    val address: ChatCheckoutAddressDto,
    val items: List<ChatCheckoutDraftItemDto> = emptyList(),
    val summary: ChatCheckoutSummaryDto,
    val selectedDeliveryMethod: ChatCheckoutDeliveryMethodDto,
    val selectedPaymentMethod: ChatCheckoutPaymentMethodDto,
    val deliveryOptions: List<ChatCheckoutDeliveryMethodDto> = emptyList(),
    val paymentOptions: List<ChatCheckoutPaymentMethodDto> = emptyList(),
    val expiresAt: String,
)
```

解析要求：

- 未知字段忽略。
- 缺失 `draft` 时仍兼容旧 `draftId` / `totalCents` / `address`。
- 金额字段按 cents 处理。
- `status = order_created` 时允许只有 `order` 或 order summary。

## UI Model

建议新增：

```kotlin
data class ChatCheckoutDraftUi(
    val draftId: String,
    val status: CheckoutDraftStatusUi,
    val items: List<CheckoutDraftItemUi>,
    val summary: CheckoutSummaryUi,
    val shipping: CheckoutShippingUi,
    val deliveryMethod: CheckoutDeliveryMethodUi,
    val paymentMethod: CheckoutPaymentMethodUi,
    val expiresAtText: String,
    val orderNumber: String? = null,
)
```

状态：

```kotlin
enum class CheckoutDraftStatusUi {
    Pending,
    Updating,
    Updated,
    Cancelled,
    Expired,
    Submitted,
    Failed,
}
```

`ChatUiState` 可选两种形态：

```kotlin
val activeCheckoutDraft: ChatCheckoutDraftUi? = null
```

或：

```kotlin
val checkoutDrafts: List<ChatCheckoutDraftUi> = emptyList()
```

第一版推荐 `activeCheckoutDraft`，因为同一 conversation / userKey 只保留一个 active draft。

## ChatViewModel 行为

收到 `ChatStreamEvent.Done.checkoutAction` 后：

- `draft_created`：
  - 将 `draft` map 为 `activeCheckoutDraft`。
  - 状态为 `Pending`。
- `address_updated` / `draft_updated`：
  - 用同一 `draftId` 更新 `activeCheckoutDraft`。
  - 状态为 `Updated`。
- `cancelled`：
  - 状态为 `Cancelled`。
  - 不刷新购物车。
- `expired`：
  - 状态为 `Expired`。
  - 不刷新购物车。
- `failed`：
  - 状态为 `Failed`。
  - 不刷新购物车。
- `order_created`：
  - 状态为 `Submitted`。
  - 保存 `orderNumber`。
  - 触发 `ChatSideEffect.RefreshCart`。
  - 触发订单结果 side effect。

提交 / 取消按钮：

- 提交订单：调用现有 `startStream(message = "确认下单")` 或新增明确方法 `confirmActiveCheckout()`。
- 取消订单：调用 `startStream(message = "取消下单")`。
- 不允许 Android 本地直接创建订单。

查看订单：

- 触发 `ChatSideEffect.OpenCheckoutDraft(draftId)`。
- 外层导航打开 `CheckoutScreen(draftId)`。

## CheckoutDraftCard UI

建议新增：

```text
client/android/app/src/main/java/com/shopmate/app/ui/chat/components/CheckoutDraftCard.kt
```

卡片内容：

- 状态：待确认、已更新、已取消、已过期、已提交。
- 商品摘要：前 1-2 个商品名、总商品数。
- 金额：商品金额、配送费、应付金额。
- 收货信息：联系人、手机号 masked、详细地址。
- 配送方式：label、fee、eta。
- 支付方式：label。
- 操作按钮：
  - 查看订单。
  - 取消。
  - 提交订单。

视觉要求：

- 使用 ShopMate 现有主题颜色和圆角。
- 信息密度高于营销页，适合扫读。
- 不嵌套卡片。
- 小屏下地址、金额和按钮不能重叠。
- 不展示“mock”“fake”“模拟”等字样。

## 与 CheckoutScreen 的连接

新增 side effect：

```kotlin
sealed interface ChatSideEffect {
    data class RefreshCart(val message: String?) : ChatSideEffect
    data class ShowMockOrderResult(
        val orderNumber: String?,
        val totalCents: Int?,
    ) : ChatSideEffect
    data class OpenCheckoutDraft(val draftId: String) : ChatSideEffect
}
```

要求：

- 从聊天卡片打开 `CheckoutScreen(draftId)`。
- `CheckoutScreen` 使用同一个 draft，不重新创建新 draft。
- `CheckoutScreen` 提交成功后刷新购物车。
- 如果 draft 已过期，提示用户返回聊天重新汇总或返回购物车重新结算。

如果当前 `CheckoutScreen` 只能消费购物车按钮创建的新 draft，本 spec 需要补一个“按 draftId 加载现有 draft”的入口或 repository 方法。

## 状态反馈策略

第一版基于 `done.checkoutAction`：

- 用户发送后，Android 可以先把 active draft 标记为 `Updating`。
- 只有后端返回 action 后，才更新真实状态、金额和订单结果。
- 不做乐观金额更新。
- 不做本地订单成功判断。

后续 `checkout-realtime-sse-event-spec.md` 完成后，再把更新来源从 `done` 扩展到独立 `checkout_action` event。

## 测试要求

Android：

- parser 能解析扩展后的 `done.checkoutAction.draft`。
- `draft_created` 创建 `activeCheckoutDraft`。
- `address_updated` / `draft_updated` 更新同一 draft。
- `cancelled` / `expired` 修改卡片状态。
- `order_created` 触发 `RefreshCart` 和订单结果 side effect。
- 点击“提交订单”发送确认消息，不直接本地创建订单。
- 点击“取消”发送取消消息。
- 点击“查看订单”触发 `OpenCheckoutDraft(draftId)`。
- 小屏下订单卡片不出现文本重叠。

可补 UI / mapper 单测：

- cents 转金额文案。
- long address 换行 / 省略策略。
- 空 items fallback。
- 缺 draft 但有旧字段时不崩溃。

## 验证命令

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/
```

如联动后端 smoke：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

## 完成标准

- 聊天页能展示 checkout draft card。
- draft 创建、更新、取消、过期和提交状态能反映到同一张卡片。
- 订单成功后刷新购物车。
- 卡片可以进入 `CheckoutScreen(draftId)`。
- Android 不本地决定价格、配送费或订单成功。
- UI 不出现“mock”“fake”“模拟”等字样。
- Android unit test / build 通过，或记录真实失败原因。
