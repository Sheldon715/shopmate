# Android Main Chat App Flow

## 概述

把早期为 Figma 还原和演示拆出来的 `HomeChatEntryScreen`、`ChatRecommendationScreen`、历史 mock 入口，收敛成真正 App 的主聊天流程。

目标：用户完成 onboarding 后进入主聊天入口，可以直接输入需求并开始真实 SSE 聊天；发送后进入同一个真实会话的聊天结果视图，看到流式回复和商品卡片，再点击商品进入真实详情。

本 spec 不重做 Android 网络层、RAG、SSE、商品详情 API。它只整理 App flow、导航状态和主聊天入口。

## 范围

本 spec 负责：

- `HomeChatEntryScreen` 的 composer 接入真实 `ChatViewModel`。
- 用户在首页输入并发送后，自动进入聊天结果视图。
- 首页 prompt suggestion 点击后填入 composer，或直接作为待发送文本。
- `ChatRecommendationScreen` 继续展示同一个 `ChatViewModel` 会话，不再是独立固定推荐结果页。
- `ChatRecommendationScreen` 的“新聊天”回到主聊天入口时，需要清理或重置当前会话。
- 历史侧边栏保留 mock demo，但正式主路径不依赖历史 mock 才能开始聊天。
- `ProductComparisonScreen` 仍可保留 mock preview / demo entry，但不作为主流程替代首页。

不负责：

- 新增后端对比结构化 payload。
- 商品详情真实 API。
- 购物车 API。
- 远程图片加载。
- 对话持久化。
- 真实历史会话列表。
- RAG prompt / SSE / Product API 改造。

## 前置条件

先完成：

- `android-chat-api-integration-spec.md`
- `android-product-api-integration-spec.md`

当前应已有：

- `ChatViewModel`
- `ChatUiState`
- `ChatRecommendationScreen(state, callbacks...)`
- `ProductDetailScreen` 可读取真实 product id
- `ShopMateAppContainer`

## 目标流程

正式运行路径固定为：

1. App 启动。
2. Onboarding 完成。
3. 进入主聊天入口 / 主聊天页。
4. 用户输入需求或点 prompt suggestion。
5. 点击发送。
6. App 进入聊天结果视图。
7. 后端 SSE 返回文本和商品卡片。
8. 用户点击商品卡片进入真实详情。
9. 用户可返回聊天结果继续追问，或点新聊天回到主入口。

不再要求用户通过 mock 历史记录进入 `ChatRecommendationScreen` 才能看到真实聊天结果。

## 文件

预计修改：

- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatUiState.kt`

可能新增：

- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatSessionMode.kt` 或轻量 helper

不修改：

- `ChatStreamClient`
- `DefaultChatRepository`
- `ProductApiClient`
- 后端代码

## MainActivity 导航

调整导航语义：

- `HomeChatEntry` 是主聊天入口。
- `ChatRecommendation` 是同一个聊天会话的结果 / transcript view。
- `ChatViewModel` 应在 `HomeChatEntry` 和 `ChatRecommendation` 两个 screen 之间共享。

发送行为：

- 在 `HomeChatEntryScreen` 点击发送后：
  1. 调用 `chatViewModel.onComposerTextChange(text)` 或等效方法。
  2. 调用 `chatViewModel.sendMessage()`。
  3. `currentScreen = ShopMateScreen.ChatRecommendation`。

如果发送为空：

- 不跳转。
- 保持 composer 状态。

## HomeChatEntryScreen

把首页从静态入口改成真实主聊天入口：

```kotlin
fun HomeChatEntryScreen(
    composerText: String,
    isSending: Boolean,
    onComposerTextChange: (String) -> Unit,
    onSend: () -> Unit,
    ...
)
```

要求：

- composer 使用共享 `ChatViewModel` 的 `composerText`。
- `sendEnabled = composerText.isNotBlank() && !isSending`。
- `onSend` 触发真实聊天，不再是空 lambda。
- prompt suggestion 点击后：
  - 推荐第一版：填入 composer，不自动发送，避免误触直接请求后端。
  - 如果想一键发送，必须有清晰行为，且不能绕过 `ChatViewModel`。
- 保留首页品牌、prompt panel、侧边栏视觉。
- Preview 使用本地 state，不创建 ViewModel，不访问网络。

## ChatRecommendationScreen

继续作为聊天 transcript / result view：

- 接收共享 `ChatUiState`。
- 不自己保存另一个 composer text。
- 发送追问仍调用同一个 `ChatViewModel.sendMessage()`。
- 商品卡片点击进入 `ProductDetail(productId)`。
- 新聊天按钮调用 `chatViewModel.startNewChat()` 或等效方法，然后跳回 `HomeChatEntry`。

如果当前没有任何消息：

- 可以显示引导消息，或自动跳回 `HomeChatEntry`。
- 不展示旧 mock 固定推荐结果作为正式运行状态。

## ChatViewModel 补充

新增或确认方法：

```kotlin
fun startNewChat()
fun hasActiveConversation(): Boolean
```

`startNewChat()` 要求：

- 取消正在进行的 stream。
- 清空 messages。
- 清空 productCards。
- 清空 composerText。
- 清空 error。
- `isSending=false`。

`hasActiveConversation()`：

- messages 不为空，或 productCards 不为空，或 isSending 为 true。

不要清理 Preview state；Preview 使用独立 mock state。

## 历史和对比入口

历史侧边栏：

- 保留 mock history conversations，用于 demo 和视觉展示。
- 正式主路径不依赖 mock history。
- 点击 `history-commute-earbuds` 可以展示 mock / 当前会话，但必须标注为 demo 行为或保持为 preview-like shortcut。

对比页：

- `ProductComparisonScreen` 可以保留为独立 demo screen。
- 真实主流程里，如果后端没有结构化对比 payload，不要强行从聊天结果跳真实对比。
- 可以把“对比功能待接入”作为后续入口提示。
- 不要在 14.5 塞入 mock 对比结果来冒充真实 SSE 输出。

## 返回行为

建议：

- 从商品详情返回：回到 `ChatRecommendation`，保留会话。
- 从购物车返回：回到进入购物车前的 screen。
- 从聊天结果点新聊天：回到 `HomeChatEntry` 并清空会话。
- 系统返回键不在本 spec 强制处理；当前自定义 screen state 继续可用即可。

## 测试

如果 Android unit test 可用，覆盖：

- `ChatViewModel.startNewChat()` 清空状态并取消 loading。
- `hasActiveConversation()` 对空 / 有消息 / 有商品 / sending 状态返回正确。
- 首页发送非空文本会调用 ViewModel send 并触发导航到 `ChatRecommendation`。
- 首页空文本不会跳转。
- prompt suggestion 点击只填入 composer。
- 新聊天会清空会话并回到首页。

如果 UI 测试暂时不做：

- 至少保持 `ChatViewModel` 逻辑可测。
- 手动验证导航流。

## 手动验证

建议手测：

1. 启动 App。
2. 完成 onboarding。
3. 在首页输入“推荐一款适合通勤的蓝牙耳机，预算 200 以内”。
4. 点击发送。
5. 应自动进入聊天结果视图，并看到真实 SSE 回复。
6. 点击商品卡片进入真实详情。
7. 返回聊天结果，会话仍保留。
8. 点击新聊天，回到首页且清空旧会话。

后端离线时：

- 首页发送后可以进入聊天结果视图。
- 聊天结果视图显示连接失败和重试。
- 不用 mock 商品冒充真实结果。

## 验收标准

- Onboarding 后主路径是 `HomeChatEntry -> 输入 -> ChatRecommendation 真实会话`。
- 用户无需点击 mock 历史记录也能开始真实聊天。
- 首页 composer 和聊天结果 composer 使用同一个 `ChatViewModel` 状态。
- 发送后能自动切到聊天结果视图。
- 商品卡片点击进入真实详情页。
- 新聊天能清空会话并回到主聊天入口。
- Mock preview / mock history 保留，但不再是正式主流程 blocker。
- 不新增 RAG / SSE / Product API / Cart API 逻辑。
- 不把 mock 对比结果伪装成真实后端输出。
- `cd client/android && .\gradlew.bat build` 通过。
- 如新增 Android unit tests，相关测试通过。
