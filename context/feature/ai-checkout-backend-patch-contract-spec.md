# AI Checkout Backend Patch Contract

## Research 判断

本 spec 不需要外部 research。目标是后端 contract 和 LLM intent 升级：把现有 AI 下单从 `update_address` 扩展为结构化 checkout draft patch，并返回足够客户端渲染的 draft snapshot。

实现前需要本地扫描：

- `server/src/modules/chat/checkout-intent.service.ts`
- `server/src/modules/chat/checkout-command.service.ts`
- `server/src/modules/chat/checkout-response.service.ts`
- `server/src/modules/chat/pending-checkout.store.ts`
- `server/src/modules/orders/checkout.types.ts`
- `server/src/modules/orders/order.service.ts`
- `server/src/modules/orders/order.mapper.ts`
- `server/src/modules/orders/order.controller.ts`
- `server/src/modules/orders/order.service.test.ts`
- `server/src/modules/chat/checkout-command.service.test.ts`
- `server/src/modules/chat/checkout-intent.service.test.ts`

## 背景

`mock-checkout-spec.md` 已经让聊天 Agent 可以创建 pending checkout、更新地址、取消和确认下单。`android-checkout-detail-page-spec.md` 又补齐了 shipping / delivery / payment snapshot。

当前 AI 下单交互的短板是：聊天侧的更新能力仍偏向“整段地址文本”，无法清晰表达收货人、手机号、详细地址、配送方式和支付方式的结构化变更。为了让导师看到 Agent 正在操作结构化业务数据，本 spec 先把后端升级为 checkout draft patch contract。

## 目标

- 将 checkout intent 从单一 `addressText` 升级为结构化 `checkoutPatch`。
- 兼容旧 `update_address`，但新增推荐 action：`update_checkout`。
- 支持通过对话更新：
  - 收货人。
  - 手机号。
  - 详细地址。
  - 配送方式。
  - 支付方式。
- 后端校验 patch 字段，配送 / 支付只能来自 draft allowlist。
- delivery method 变化后以后端规则重新计算 shipping fee 和 total。
- `checkoutAction` 返回完整 draft snapshot，供 Android 后续渲染订单草稿卡片。
- 保持旧 `done.checkoutAction` 字段兼容，不要求本 spec 新增独立 SSE event。

## 非目标

- 不新增 Android 聊天订单卡片。
- 不新增 `checkout_action` SSE event。
- 不接真实支付、物流、优惠券、发票或地址簿。
- 不把商品列表、价格或总价交给 Android / LLM 决定。
- 不重写购物车自然语言管理、推荐、图片找货或商品对比逻辑。

## Checkout Intent Schema

当前 intent：

```ts
action: "start_checkout" | "confirm_checkout" | "update_address" | "cancel_checkout" | "summarize_checkout" | "unknown"
addressText?: string
```

升级后建议：

```ts
type CheckoutIntentAction =
  | "start_checkout"
  | "summarize_checkout"
  | "update_checkout"
  | "update_address"
  | "cancel_checkout"
  | "confirm_checkout"
  | "unknown";
```

LLM 输出 JSON：

```json
{
  "is_checkout_intent": true,
  "action": "update_checkout",
  "target_scope": "selected_cart_items",
  "confidence": "high",
  "needs_confirmation": false,
  "checkout_patch": {
    "shipping": {
      "recipient": "张三",
      "phone": "13800000000",
      "full_address": "上海市浦东新区测试路 1 号"
    },
    "delivery_method_type": "express",
    "payment_method_type": "alipay"
  },
  "clarification_question": null
}
```

字段规则：

- `checkout_patch.shipping.recipient`：可选，用户明确给出收货人时填写。
- `checkout_patch.shipping.phone`：可选，用户明确给出手机号时填写。
- `checkout_patch.shipping.full_address`：可选，用户明确给出详细地址时填写。
- `checkout_patch.delivery_method_type`：可选，只能映射到后端 draft 的 delivery options。
- `checkout_patch.payment_method_type`：可选，只能映射到后端 draft 的 payment options。
- 用户只说“改地址”但没有给具体地址时，`needs_confirmation = true`。
- 用户只说“确认”时，必须存在 pending draft 才能是 `confirm_checkout`。

兼容策略：

- 旧 `update_address` 保留一版，并在 command 层映射为 `update_checkout` + `shipping.fullAddress`。
- 旧 `addressText` 保留一版，用于兼容现有测试、prompt fallback 和老模型输出。
- 如果同时存在 `addressText` 和 `checkoutPatch.shipping.fullAddress`，优先使用结构化 patch。

## TypeScript Contract

建议在 `checkout.types.ts` 增加：

```ts
export interface CheckoutShippingPatchInput {
  recipient?: string;
  phone?: string;
  fullAddress?: string;
}

export interface CheckoutPatchInput {
  shipping?: CheckoutShippingPatchInput;
  deliveryMethodType?: string;
  paymentMethodType?: string;
}

export type CheckoutChangedField =
  | "shipping"
  | "delivery_method"
  | "payment_method"
  | "summary";
```

扩展 intent：

```ts
export type CheckoutIntentDetection =
  | { isCheckoutIntent: false }
  | {
      isCheckoutIntent: true;
      action: CheckoutIntentAction;
      addressText?: string;
      checkoutPatch?: CheckoutPatchInput;
      targetScope: "selected_cart_items";
      confidence: CheckoutIntentConfidence;
      needsConfirmation: boolean;
      clarificationQuestion?: string;
    };
```

扩展 action：

```ts
export interface CheckoutDraftSnapshot {
  id: string;
  status: "pending";
  address: MockShippingAddress;
  items: PendingCheckoutItem[];
  summary: CheckoutSummary;
  selectedDeliveryMethod: CheckoutDeliverySnapshot;
  selectedPaymentMethod: CheckoutPaymentSnapshot;
  deliveryOptions: CheckoutDeliveryOption[];
  paymentOptions: CheckoutPaymentOption[];
  expiresAt: string;
}

export interface CheckoutActionResult {
  type: CheckoutActionType;
  status: CheckoutActionStatus;
  draftId?: string;
  orderId?: string;
  orderNumber?: string;
  selectedCount?: number;
  totalCents?: number;
  address?: MockShippingAddress;
  cartRefreshRequired?: boolean;
  draft?: CheckoutDraftSnapshot;
  changedFields?: CheckoutChangedField[];
}
```

如果当前 `PendingCheckoutDraft` 已经包含 delivery / payment options，可以由 mapper 函数生成 `CheckoutDraftSnapshot`，避免直接把内部 store 类型作为 API contract 泄露。

## 后端实现要求

### `CheckoutIntentService`

- Prompt 改为“checkout draft patch 分类器”。
- 输入包含：
  - 用户原话。
  - short history。
  - cart summary。
  - pending draft summary。
  - 当前 address。
  - delivery options。
  - payment options。
- 输出只允许 JSON，不输出用户可见回复。
- 不确定时输出 `unknown` 或 `needs_confirmation = true`。
- 推荐下单前要买什么、下单流程是什么、推荐适合买的商品，不是执行 checkout。
- `confirm_checkout` 必须表示用户明确同意创建订单。

### `CheckoutCommandService`

- 新增 `updateCheckout`。
- `update_address` 走兼容路径，内部调用 `updateCheckout`。
- patch 前必须存在 pending draft。
- patch 后保存更新后的 draft。
- 返回完整 `checkoutAction.draft`。
- delivery / payment patch invalid 时返回 `failed` 或 `needs_confirmation`，不创建订单。

### `OrderService`

- 新增或扩展 draft update 方法：
  - `updatePendingCheckoutDraft(draft, patch)`。
  - 或分拆 `updateDraftShipping`、`updateDraftDeliveryMethod`、`updateDraftPaymentMethod`。
- 校验 shipping：
  - recipient 非空。
  - phone 为基础合法手机号格式。
  - fullAddress 非空。
- 校验 delivery / payment：
  - type 必须存在于 draft options。
  - delivery 变化后重算 shipping fee / total。
  - payment 只保存 type / label / `not_charged`。
- 手机号保存和日志输出必须脱敏。

### `CheckoutResponseService`

- 回复生成 prompt 增加 `changedFields` 和 draft snapshot。
- 用户可见回复仍由 LLM 生成。
- 只有 `order_created` 才能说订单已提交。
- `draft_updated` / `address_updated` 只能说订单信息已更新并等待确认。
- 不出现“mock”“fake”“模拟”等 UI 词。

## Action Status

现有 status 可继续使用：

- `draft_created`
- `needs_confirmation`
- `address_updated`
- `order_created`
- `cancelled`
- `empty_cart`
- `expired`
- `failed`

建议新增：

- `draft_updated`

规则：

- 只改 shipping address 时，可继续返回 `address_updated`。
- 改 delivery / payment / 多字段 patch 时，返回 `draft_updated` 更清晰。
- Android 后续应同时识别 `address_updated` 和 `draft_updated` 为“更新订单卡片”。

## 安全边界

- 没有 LLM checkout intent，不进入 checkout command。
- 没有 pending draft，不接受“确认”直接创建订单。
- 没有用户明确确认，不创建 order。
- shipping / delivery / payment patch 必须通过后端校验和 allowlist。
- Android 不传商品价格、商品列表或总价作为权威输入。
- LLM 不输出订单金额事实，金额来自后端 draft / order。
- 订单成功后才刷新购物车。
- 手机号保存前必须 mask，不记录完整手机号。
- `checkoutAction` 不写入 popular query cache。

## 测试要求

后端：

- `CheckoutIntentService`：
  - “帮我下单”输出 `start_checkout`。
  - pending 存在时“确认下单”输出 `confirm_checkout`。
  - “收货人改成张三，电话 13800000000，地址改成...”输出 shipping patch。
  - “配送选加急”输出 delivery patch。
  - “支付用支付宝”输出 payment patch。
  - 无 pending 时“确认”不 mutation。
  - 普通推荐问题不进入 checkout。
  - invalid JSON / 低置信不 mutation。

- `CheckoutCommandService`：
  - `start_checkout` 返回完整 draft snapshot。
  - shipping patch 更新 draft 并返回 changedFields。
  - delivery patch 重新计算 shipping fee / total。
  - payment patch 只保存 allowlist type / label。
  - cancel 后返回可标记 cancelled 的 action。
  - confirm 后返回 `cartRefreshRequired = true`。

- `OrderService`：
  - 不信任客户端金额。
  - 手机号保存 masked。
  - 未知 delivery / payment method 返回 `INVALID_CHECKOUT_REQUEST` 或稳定失败状态。
  - draft 过期、购物车变化或商品不可用时不创建订单。

- Chat SSE：
  - checkout 请求不进入普通 RAG。
  - `done.checkoutAction` 携带完整 draft snapshot。
  - 旧 `done.checkoutAction` 字段保持兼容。

## Smoke Test

准备：购物车中至少有一件已勾选商品。

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"ai-checkout-demo-1\",\"message\":\"帮我下单购物车里的商品\"}" http://localhost:3000/api/chat/stream
```

期望：

- `done.checkoutAction.status = draft_created`。
- 返回完整 draft snapshot。
- 不创建订单。

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"ai-checkout-demo-1\",\"message\":\"收货人改成张三，电话 13800000000，地址改成上海市浦东新区测试路 1 号\"}" http://localhost:3000/api/chat/stream
```

期望：

- `done.checkoutAction.status = address_updated` 或 `draft_updated`。
- draft shipping 更新，手机号 masked。
- 不创建订单。

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"ai-checkout-demo-1\",\"message\":\"配送选加急，支付用支付宝\"}" http://localhost:3000/api/chat/stream
```

期望：

- 返回 draft update。
- delivery / payment 更新。
- total 以后端重新计算结果为准。

## 验证命令

```powershell
cd server
npm.cmd test
npm.cmd run build
```

## 完成标准

- 用户能通过聊天创建、查看、修改、取消和确认 checkout draft。
- LLM 输出结构化 checkout patch。
- 后端执行 shipping / delivery / payment 校验和 allowlist。
- `done.checkoutAction` 返回完整 draft snapshot。
- 确认前不创建订单；确认后创建 order / order_items 快照。
- 订单金额、商品、配送费和支付状态都以后端事实为准。
- 后端 test / build 通过，或记录真实失败原因。
