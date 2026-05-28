# Android Chat API Integration

## 概述

把 Android 主聊天页接到真实后端 `POST /api/chat/stream`，让用户在 App 内输入问题后，可以看到流式文本回复和商品卡片。

本 spec 建立 Repository + ViewModel + UI state，并接入第 13 步的 `ChatStreamClient`。不做商品详情真实 API、不做购物车 API、不做部署配置。

## 范围

本 spec 负责：

- 新增 `ChatRepository`，把 `ChatStreamClient.streamChat()` 包装成 UI 可消费的结果流。
- 新增 `ChatViewModel` 和 `ChatUiState`。
- 让 `ChatRecommendationScreen` 从静态 mock 页面变成 state-driven 页面。
- 用户点击发送时，把 composer 文本发送到 `/api/chat/stream`。
- 渲染 `message_delta` 追加出来的 assistant 文本。
- 渲染 `product_cards` 商品卡片。
- 处理 `done`、`error`、网络失败、空结果和重试状态。
- 保留 Preview / mock fallback，避免开发时完全依赖后端在线。

不负责：

- 商品详情页真实 API。
- 购物车 API 和加购真实请求。
- 图片加载。
- 登录 / user session。
- 对话持久化。
- 历史侧边栏接真实数据。
- Retrofit。
- 后端部署 / 真机公网访问配置。

## 前置条件

先完成：

- `android-network-client-spec.md`
- `android-chat-contract-parser-spec.md`
- `chat-sse-api-spec.md`

当前第 13 步如果缺少 `ChatProductMapper.kt`，本 spec 需要先补齐：

- `ChatProductCardDto -> ProductCardUi`
- `priceText` 格式化
- placeholder `imageRes`
- tags 最多 3 个
- 不编造商品功效

## 文件

预计新增：

- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatRepository.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/chat/DefaultChatRepository.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatProductMapper.kt`（如果第 13 步尚未新增）
- `client/android/app/src/main/java/com/shopmate/app/ShopMateAppContainer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatUiState.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModelFactory.kt`

预计修改：

- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- 如需要，`client/android/app/build.gradle.kts` 增加 lifecycle viewmodel compose。

不修改：

- 后端 RAG / SSE 逻辑。
- 商品详情页真实 API。
- 购物车页面真实 API。

## Dependency

如果当前项目还没有 ViewModel 依赖，新增：

```kotlin
implementation("androidx.lifecycle:lifecycle-viewmodel-compose:<stable-version>")
implementation("androidx.lifecycle:lifecycle-runtime-compose:<stable-version>")
```

版本应与当前 Android / Compose 生态兼容。不要引入 Hilt / Koin 等大型 DI 框架，但也不要在多个 Composable 或页面里散落 `new OkHttpChatStreamClient()`。

第一版使用轻量 `ShopMateAppContainer` 集中组装依赖。

## Domain / UI Model

建议新增：

```kotlin
data class ChatMessageUi(
    val id: String,
    val text: String,
    val fromUser: Boolean,
    val isStreaming: Boolean = false
)

data class ChatUiState(
    val messages: List<ChatMessageUi>,
    val productCards: List<ProductCardUi>,
    val composerText: String,
    val isSending: Boolean,
    val errorMessage: String?,
    val canRetry: Boolean
)
```

规则：

- 初始状态可以复用当前 mock 演示内容，或显示空聊天页；但 Preview 必须继续可用。
- 发送时立即插入用户消息。
- assistant 消息先插入空文本且 `isStreaming=true`。
- 每个 `message_delta` append 到当前 assistant 消息。
- 收到 `done` 后 `isStreaming=false`、`isSending=false`。
- 收到 `error` 或 Flow exception 后显示可理解错误，停止 loading。

## Repository

建议接口：

```kotlin
interface ChatRepository {
    fun streamChat(
        message: String,
        history: List<ChatMessageUi>
    ): Flow<ChatStreamEvent>
}
```

`DefaultChatRepository` 负责：

- 裁剪 message。
- 把最近最多 4 条 user / assistant 文本映射成 `ChatHistoryMessageDto`。
- 调用 `ChatStreamClient.streamChat(ChatStreamRequestDto(...))`。
- 不直接处理 Compose state。
- 不依赖 `ChatRecommendationScreen`。

Repository 不做：

- mock fallback 决策之外的 UI 文案。
- 商品卡片 UI 排版。
- 购物车操作。

## ViewModel

`ChatViewModel` 负责：

- 持有 `ChatUiState`。
- `onComposerTextChange(text)`。
- `sendMessage()`。
- `retryLastMessage()`。
- `clearError()`。
- 收集 `ChatRepository.streamChat()`。
- 把 `ChatStreamEvent.ProductCards` 通过 `ChatProductMapper` 转成 `ProductCardUi`。
- 发送新消息时取消上一条仍在进行的 stream，或禁止重复发送；二选一，但必须行为明确。

建议第一版：发送中禁用发送按钮，避免并发 stream。

历史规则：

- 只把文本消息传给后端 `history`。
- 不把商品卡片 JSON 作为 history。
- 最近最多 4 条。

## UI 接入

`ChatRecommendationScreen` 改成接收 state 和 callbacks：

```kotlin
fun ChatRecommendationScreen(
    state: ChatUiState,
    onComposerTextChange: (String) -> Unit,
    onSend: () -> Unit,
    onRetry: () -> Unit,
    ...
)
```

要求：

- UI 只渲染 state，不直接调用 network client。
- Composer 使用 `state.composerText`。
- `sendEnabled = state.composerText.isNotBlank() && !state.isSending`。
- messages 列表动态渲染 `ChatMessageBubble`。
- `state.productCards` 动态渲染 `ProductCard`。
- 空结果显示现有 `ShopMateStatusMessage` 风格，不要弹 crash。
- 错误状态显示短提示，并可提供重试入口。
- 保持顶部栏、侧边栏、购物车按钮和现有视觉比例。

Preview：

- 新增或保留 mock `ChatUiState` preview。
- Preview 不创建真实 ViewModel。
- Preview 不访问 network。

## App Container

新增轻量依赖容器：

```kotlin
class ShopMateAppContainer {
    val chatStreamClient: ChatStreamClient by lazy {
        OkHttpChatStreamClient()
    }

    val chatRepository: ChatRepository by lazy {
        DefaultChatRepository(chatStreamClient)
    }

    fun chatViewModelFactory(): ViewModelProvider.Factory =
        ChatViewModelFactory(chatRepository)
}
```

要求：

- 依赖只在 container 中集中创建。
- `ChatRecommendationScreen` 不知道 `ChatRepository` 或 `ChatStreamClient`。
- `MainActivity` 不直接拼装 `DefaultChatRepository(OkHttpChatStreamClient())`。
- 不在 Composable recomposition 中创建新的 OkHttp client。
- 测试时仍然可以通过 fake `ChatRepository` / fake `ChatStreamClient` 替换依赖。
- 暂时不引入 Hilt / Koin；等功能规模扩大后再评估。

## MainActivity 接入

`MainActivity` 负责持有或取得 `ShopMateAppContainer`，并用 container 提供的 factory 创建 `ChatViewModel`：

- 使用 `viewModel(factory = appContainer.chatViewModelFactory())`。
- 只把 `state + callbacks` 传给 `ChatRecommendationScreen`。
- 不直接创建 `OkHttpChatStreamClient`、`DefaultChatRepository`。

注意：

- 不要在 Composable 里每次 recomposition 创建新的 OkHttp client。
- 不要把 `ChatStreamClient` 直接传进 UI 组件。

## Error Mapping

UI 文案建议：

- `INVALID_CHAT_REQUEST`：消息格式不正确，请调整后再试。
- `CHAT_STREAM_CONNECTION_FAILED`：无法连接导购服务，请确认后端正在运行。
- `CHAT_STREAM_ERROR`：导购暂时无法回复，请稍后再试。
- `SSE_SERIALIZATION_ERROR` / `ANDROID_STREAM_PARSE_ERROR`：回复数据格式异常，请稍后再试。
- unknown：导购暂时无法回复，请稍后再试。

如果 event / exception 表示 `retryable=true`，`canRetry=true`。

## Mock Fallback

保留两层 fallback：

- Preview / design-time：固定 mock `ChatUiState`。
- Repository / ViewModel 测试：fake `ChatRepository` 或 fake `ChatStreamClient`。

不要在真实 network client 里返回 mock 商品。

如果后端离线：

- UI 显示错误和重试。
- 不自动用 mock 商品冒充真实后端结果。

## 测试

如果 Android test 地基可用，覆盖：

- `ChatViewModel.sendMessage()` 会插入 user message 和 streaming assistant message。
- `MessageDelta` 会 append 到 assistant message。
- `ProductCards` 会更新 `productCards`。
- `Done` 会停止 loading。
- `Error` event 会设置 `errorMessage` 和 `canRetry`。
- Flow exception 会设置连接失败文案。
- 发送中再次发送不会启动并发 stream。
- history 只包含最近 4 条文本消息。
- `ChatProductMapper` 生成稳定 `ProductCardUi`。

如果 UI 测试暂时不做：

- 至少把 ViewModel / mapper 做成可测纯逻辑。
- 运行 Android build。

## 手动验证

建议手测：

1. 启动后端：`cd server && npm.cmd run dev`。
2. 确认 Android debug base URL 是 `http://10.0.2.2:3000/`。
3. 启动模拟器。
4. 进入聊天页，输入“推荐一款适合通勤的蓝牙耳机，预算 200 以内”。
5. 预期：
   - 用户消息立即出现。
   - assistant 文本逐步出现或至少分段出现。
   - 商品卡片出现。
   - 发送结束后按钮恢复可用。

如果后端 LLM / Qdrant / PostgreSQL 没启动，不把它当成 Android UI bug；先用 fake repository 验证 UI 状态。

## 验收标准

- 主聊天页能从用户输入发起真实 `/api/chat/stream` 请求。
- 文本 delta 能追加到 assistant message。
- 商品卡片能从 `product_cards` 渲染。
- `done` 后 loading 停止。
- `error` / network failure 有可理解 UI 状态。
- Preview 仍可打开，不依赖后端。
- UI 不直接发 HTTP 请求。
- 不新增商品详情真实 API、购物车 API、登录或部署配置。
- 不写真实 API key、prompt、`.env` 或 provider 私有字段。
- `cd client/android && .\gradlew.bat build` 通过。
- 如新增 Android unit tests，相关测试通过。
