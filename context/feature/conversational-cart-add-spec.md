# Conversational Cart Add

## 概述

支持用户在聊天里直接说“把这个加到购物车”“把第二个加进去”。Agent 先用 LLM 判断是否是明确加购操作意图，再根据最近一次推荐结果定位商品，并调用购物车 API 完成加购。

本 spec 把购物车加入聊天闭环：用户不必点击商品卡片按钮，也能用自然语言完成最常见的加购动作。

## 范围

本 spec 负责：

- 识别聊天中的加购意图。
- 从 `chat-context-memory-spec.md` 保存的最近推荐商品中定位目标商品。
- 支持序号表达：
  - `把第一个加到购物车`
  - `把第二个加进去`
  - `加第二个`
- 支持明确商品名片段匹配。
- 对“这个”这类不明确表达给出澄清，不误加。
- 后端调用现有 Cart service / API 语义完成加购。
- SSE `done` 可选返回 `cartAction`，Android 据此刷新购物车状态或提示结果。

不负责：

- 删除购物车商品。
- 修改数量。
- 结算 / 下单 / 支付。
- 登录用户购物车隔离。
- 复杂 LLM tool calling。
- 商品对比页加购真实化。
- “把便宜的那个加进去”这类比较推理；后续可放到进阶阶段。

## 前置条件

先完成：

- `chat-context-memory-spec.md`
- `active-clarification-spec.md`
- `android-cart-api-foundation-spec.md`

当前应已有：

- 后端 `CartService.addItem`。
- Android `CartViewModel.refresh()` / `addProduct()` 能刷新购物车状态。
- 后端 context memory 中有 `lastRecommendedProductIds`。
- Android 能发送稳定 `conversationId`。

## 技术决策

第一版在后端处理加购命令：

- Chat service 调用 LLM cart intent 分类器识别 cart add intent。
- Chat service 通过最近推荐商品定位 product id。
- Chat service 复用现有 `CartService.addItem`。
- Android 收到 `done.cartAction` 后刷新购物车状态。

原因：

- “最近一次推荐商品”已经保存在后端 context memory。
- 后端能保证 product id 来自库内商品，并复用购物车校验。
- Android 不需要把自然语言解析规则散落在 UI 层。
- 关键词 / 正则只能用于 LLM 确认后的字段规范化、数量限制和最近推荐商品定位辅助，不能单独触发加购。

边界：

- 仍然使用当前 demo user cart。
- 没有登录隔离前，不做多人真实购物车承诺。

## Cart Command 规则

新增：

- `server/src/modules/chat/cart-command.types.ts`
- `server/src/modules/chat/cart-command-intent.service.ts`
- `server/src/modules/chat/cart-command-intent.service.test.ts`
- `server/src/modules/chat/cart-command.service.ts`
- `server/src/modules/chat/cart-command.service.test.ts`

识别为加购的表达：

- `把第一个加到购物车`
- `第二个加进去`
- `加第二个`
- `把 2 加进去`
- `我要第一款`
- `把小米那款加进去`（名称片段匹配）

不识别或需要澄清：

- `这个加进去`，但最近推荐不止 1 个。
- 没有最近推荐商品时：`把这个加购物车`。
- 序号超过最近推荐数量。
- 同时匹配多个商品名片段。

第一版数量：

- 默认数量 `1`。
- 可选支持 `加两个第二个` / `第二个加 2 件`。
- 数量必须限制在 `1..99`，复用 cart service 限制。

## 后端实现

修改：

- `server/src/modules/chat/chat.types.ts`
- `server/src/modules/chat/rag.service.ts`
- `server/src/modules/chat/chat.controller.ts`
- `server/src/modules/chat/chat.controller.test.ts`
- `server/src/modules/chat/rag.service.test.ts`
- `server/src/modules/chat/chat-contract.fixture.ts`
- `server/src/modules/cart/cart.service.ts`（如需暴露依赖注入）

### 类型

`RagChatResult` 增加可选：

```ts
cartAction?: {
  type: "add";
  status: "success" | "needs_target" | "not_found" | "unavailable" | "failed";
  productId?: string;
  productName?: string;
  quantity?: number;
  message: string;
};
```

`ChatDonePayload` 同步增加可选 `cartAction`。

`done.fallbackReason` 沿用现有协议字段，新增取值：

```ts
"CART_TARGET_MISSING" | "CART_TARGET_AMBIGUOUS" | "CART_ADD_FAILED"
```

### Chat Service 流程

`RagChatService.answer` 在正常 RAG 检索前执行：

1. 读取 context memory。
2. 调用 `CartCommandIntentService.detect(question, memory)`，由 LLM 输出 `is_cart_add`、`target`、`quantity`。
3. 如果 LLM 否定、输出无效或请求失败，继续正常 RAG，不执行加购。
4. 如果是 cart command：
   - 读取 memory.lastRecommendedProductIds。
   - `CartCommandService` 只在 LLM 确认后做目标 / 数量规范化和最近推荐商品定位。
   - 无目标 / 多目标时返回需要确认目标的 assistant 回复，不调用 cart。
   - 成功定位后调用 `CartService.addItem({ productId, quantity })`。
   - 返回 assistant 回复和 `cartAction`。

回复文案要求：

- 用户可见 assistant 回复由 LLM / chat orchestration prompt 根据 `cartAction` 状态、库内商品上下文和会话记忆生成。
- 后端代码只返回结构化状态、商品 id、商品名、数量和校验结果。
- 不在 service 里继续增加固定导购话术。

要求：

- 加购命令不调用 vector search。
- 加购执行前必须调用 LLM 判断 AI 操作意图；确认是加购后不再调用 RAG 生成 LLM。
- 不信任用户提供的商品名作为事实；必须映射到最近推荐的库内 product id。
- 商品不可用或不存在时返回普通 assistant 回复，不假装成功。

### Product Cards

对于加购命令：

- 成功加购时可以返回最近一次推荐商品卡片，保持 UI 不突然清空。
- 目标缺失 / 歧义时应返回最近推荐商品卡片，方便用户说第几个。
- 没有最近推荐时返回空 product cards。

## Android 实现

修改：

- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatStreamContract.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatStreamEventParser.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`
- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/cart/CartViewModel.kt`（如需公开 refresh）
- 对应测试文件。

要求：

- `DonePayloadDto` 解析 optional `cartAction`。
- `ChatStreamEvent.Done` 携带 optional `cartAction`。
- `ChatViewModel` 收到成功 `cartAction` 时暴露一次性 side effect，例如：
  - `RefreshCart`
  - `ShowCartMessage`
- `MainActivity` 收到 side effect 后调用 `cartViewModel.refresh()` 或等价刷新方法。
- 成功 / 歧义 / 无上下文都作为普通 assistant message 展示，不作为网络错误。
- 最近推荐商品卡片不应因为加购命令被清空。

不要：

- 在 Android UI 层硬编码商品序号到 product id 的业务规则。
- 用 Toast 替代聊天中的 assistant 文本。
- 让加购失败显示“RAG 失败”。

## 测试

后端必须覆盖：

- `把第二个加进去` 使用 memory 中第二个 product id 调用 cart。
- `把这个加到购物车` 在只有 1 个最近推荐时成功。
- `把这个加到购物车` 在多于 1 个最近推荐时返回 `CART_TARGET_AMBIGUOUS`。
- 无最近推荐时返回 `CART_TARGET_MISSING`。
- 序号越界不调用 cart。
- 商品不可用时返回 `unavailable`。
- LLM 判断 `is_cart_add=false`、输出无效或请求失败时不调用 cart。
- cart command 确认后不调用 vector search / RAG 生成 LLM。

Android 必须覆盖：

- parser 能读取 `done.cartAction`。
- 成功 cart action 后触发 cart refresh side effect。
- 歧义 / 无上下文不触发 cart refresh。
- 加购命令回复不会显示 chat error。
- 最近 product cards 在 cart command 后仍可见。

## 运行与验证

必须运行：

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

建议 smoke：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"cart-demo-1\",\"message\":\"推荐几款适合通勤的耳机\",\"topK\":8,\"maxRecommendedProducts\":3}" http://localhost:3000/api/chat/stream
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"cart-demo-1\",\"message\":\"把第二个加到购物车\"}" http://localhost:3000/api/chat/stream
curl.exe http://localhost:3000/api/cart
```

预期：

- 第一轮返回商品卡片。
- 第二轮 assistant 文本说明已加入购物车。
- `/api/cart` 能看到对应商品。

## 完成标准

- 用户可以用自然语言把最近推荐商品加入购物车。
- 商品定位只基于最近推荐的库内商品。
- 歧义时主动追问，不误加商品。
- 后端复用现有 CartService 校验。
- Android 能刷新购物车状态并保持聊天 UI 稳定。
- 加购执行前有 LLM AI 意图判断；确认后不调用 vector search / RAG 生成 LLM。
- 后端 test / build 与 Android unit test / build 通过，或记录真实失败原因。
