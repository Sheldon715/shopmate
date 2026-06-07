# Checkout Realtime SSE Event

## Research 判断

本 spec 不需要外部 research。目标是优化 ShopMate 自己的 Chat SSE contract：在 checkout 状态变化完成后，先把结构化 `checkout_action` event 发给 Android，再继续发送 assistant 文案和最终 `done`。

实现前需要本地扫描：

- `server/src/modules/chat/chat.controller.ts`
- `server/src/modules/chat/chat.types.ts`
- `server/src/modules/chat/rag.service.ts`
- SSE writer / contract fixture / tests。
- `client/android/app/src/main/java/com/shopmate/app/data/chat/` SSE parser。
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`

## 背景

30.2.1 和 30.2.2 可以通过 `done.checkoutAction` 完成结构化状态反馈。但 `done` 通常在 assistant 文案流结束时才到达，客户端无法在后端已经完成 draft 创建 / 更新后立刻展示状态变化。

为了更贴“客户端实时反馈状态变化”，本 spec 新增独立 SSE event：

```text
event: checkout_action
data: {"status":"draft_created","draft":{...}}
```

这样 Android 可以先更新订单卡片，assistant 回复继续流式生成。

## 目标

- 后端新增 `checkout_action` SSE event。
- draft 创建 / 更新 / 取消 / 确认后，先发送 `checkout_action`。
- `message_delta` 继续由 LLM 回复生成。
- `done.checkoutAction` 保留，兼容旧客户端、Gradio evidence 和测试。
- Android parser 支持 `checkout_action` event。
- ChatViewModel 对 `checkout_action` 和 `done.checkoutAction` 做去重同步。

## 非目标

- 不新增 checkout patch intent。
- 不新增聊天订单卡片 UI。
- 不改变订单创建、金额计算、配送 / 支付校验逻辑。
- 不移除旧 `done.checkoutAction`。
- 不把所有 cart / comparison action 都改成独立 event；本 spec 只做 checkout。

## SSE Contract

新增 event：

```text
event: checkout_action
data: {
  "type": "start_checkout",
  "status": "draft_created",
  "draftId": "draft_001",
  "draft": {
    "id": "draft_001",
    "status": "pending",
    "items": [],
    "summary": {},
    "address": {},
    "selectedDeliveryMethod": {},
    "selectedPaymentMethod": {},
    "expiresAt": "2026-06-06T00:00:00.000Z"
  },
  "changedFields": []
}
```

事件顺序：

1. `checkout_action`：后端完成业务 mutation 后立即发送。
2. `message_delta`：assistant 用户可见回复。
3. `done`：保留 `checkoutAction`。

如果 checkout response LLM 失败：

- `checkout_action` 仍应已发送。
- `done.checkoutAction` 仍应返回。
- assistant 文案可以为空或最小安全回复，不能影响结构化状态。

## 后端实现要求

### Rag result contract

当前 `RagChatResult` 已能返回 `checkoutAction`。本 spec 需要让 controller 在拿到 result 后：

- 如果 result 有 `checkoutAction`，先写 `checkout_action` event。
- 再写 answer 的 `message_delta`。
- 最后写 `done`。

如果当前 controller 是先等待完整 `RagChatService.answer()` 结果再开始 SSE，则这仍然能保证 `checkout_action` 早于 message delta，但不能早于整个 RAG / LLM intent 处理。第一版接受这个边界。

后续如果要更进一步，可以把 checkout command 变成 async event hook，但不是本 spec 范围。

### SSE writer

- 新增 event name：`checkout_action`。
- payload 使用与 `done.checkoutAction` 相同的数据结构。
- 序列化失败时走现有 SSE error 处理。
- 不重复写入 popular query cache。

### Tests / Fixtures

- 更新 Chat SSE contract fixture。
- 增加 checkout event 顺序测试：
  - `checkout_action` 出现在 `done` 前。
  - `checkout_action` payload 与 `done.checkoutAction` 核心字段一致。
  - no checkout 请求不发送 `checkout_action`。
  - checkout action 序列化失败不产生半截非法 SSE。

## Android 实现要求

### Parser

`ChatStreamEvent` 新增：

```kotlin
data class CheckoutAction(
    val action: ChatCheckoutActionDto,
) : ChatStreamEvent
```

解析规则：

- 识别 `event: checkout_action`。
- payload 复用 `ChatCheckoutActionDto`。
- 未知字段忽略。
- 解析失败走现有 parse error 或 unknown event 策略，不能让整个聊天页崩溃。

### ChatViewModel

- 收到 `ChatStreamEvent.CheckoutAction` 时立即更新 `activeCheckoutDraft`。
- 收到 `Done.checkoutAction` 时作为兜底同步。
- 同一 `draftId` + `status` 的 action 去重。
- `order_created` 的 `RefreshCart` 只能触发一次。

建议保留一个最近处理过的 checkout action key：

```kotlin
private var lastCheckoutActionKey: String? = null
```

key 可由：

```text
draftId|orderId|status|updatedAt
```

如果 payload 没有 updatedAt，则使用 `draftId|orderId|status|totalCents`。

## 客户端实时反馈文案

当 `checkout_action` 先到、assistant 文案还在生成时：

- 卡片可以立刻显示状态变化。
- assistant 气泡仍显示 streaming loading。
- 不额外插入固定话术。

示例：

1. 用户：“配送选加急。”
2. 订单卡片先更新配送方式和总价。
3. assistant 稍后流式输出：“配送方式已更新，请确认金额无误后再提交订单。”

## 安全边界

- `checkout_action` 是结构化 side effect，不是用户可见话术。
- Android 不能因为本地按钮点击就创建订单；必须等后端 action。
- `order_created` 的购物车刷新只触发一次。
- `done.checkoutAction` 不移除，旧客户端仍可工作。
- payload 不包含完整手机号、真实支付凭证或 provider secret。

## 测试要求

后端：

- checkout 请求发送 `checkout_action` event。
- event 顺序为 `checkout_action` -> `message_delta` -> `done`。
- `checkout_action` 和 `done.checkoutAction` 核心字段一致。
- 普通 RAG 请求不发送 `checkout_action`。
- LLM 回复失败时仍保留结构化 checkout action。

Android：

- parser 能解析 `checkout_action`。
- `CheckoutAction` event 到达时更新订单卡片。
- 后续 `Done.checkoutAction` 不重复触发 `RefreshCart`。
- 旧只有 `done.checkoutAction` 的流仍可工作。
- 未知 / malformed checkout event 不导致 UI 崩溃。

## Smoke Test

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"checkout-sse-demo-1\",\"message\":\"帮我下单购物车里的商品\"}" http://localhost:3000/api/chat/stream
```

期望 SSE 中包含：

```text
event: checkout_action
```

并且它出现在：

```text
event: done
```

之前。

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

## 完成标准

- 后端发送独立 `checkout_action` SSE event。
- `done.checkoutAction` 保持兼容。
- Android 能用 `checkout_action` 更早更新订单卡片。
- `order_created` 不重复刷新购物车。
- 普通聊天、推荐、对比、购物车管理和图片找货 SSE 不受影响。
- 后端 test / build 与 Android unit test / build 通过，或记录真实失败原因。
