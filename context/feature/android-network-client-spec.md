# Android Network Client

## 概述

建立 Phase 3 的 Android 网络层基础，让后续聊天、商品详情和购物车功能都通过统一 client 访问后端。

技术路线固定为：

- OkHttp：普通 HTTP 请求。
- okhttp-sse：`POST /api/chat/stream` SSE。
- kotlinx.serialization-json：JSON request / response / SSE payload 解析。
- Kotlin Coroutines / Flow：聊天流暴露为 `Flow<ChatStreamEvent>`。

第一版不引入 Retrofit。原因是当前最关键的是 Chat SSE；Retrofit 对普通 JSON API 有帮助，但不能替代 SSE，等商品 / 购物车 API 变多后再评估是否补 Retrofit。

## 范围

本 spec 负责：

- 给 Android 增加网络层依赖和基础配置。
- 配置 API base URL，不在 UI / repository 中硬编码 `localhost`。
- 新增共享 OkHttp client。
- 新增 Chat SSE network client，能发送 `POST /api/chat/stream` 并解析 SSE event。
- 复用 `android-chat-contract-parser-spec.md` 中的 `ChatStreamEvent` parser。
- 增加最小网络错误类型和 timeout 设置。
- 保留 mock / preview 不依赖后端在线的边界。

不负责：

- ChatRepository / ChatViewModel。
- Compose UI 接真实状态。
- 商品详情 API client。
- 购物车 API client。
- 图片加载。
- 登录、token、用户会话。
- Retrofit。
- 后端部署和公网 Base URL 策略；Phase 3.5 再细化。

## 前置条件

先完成：

- `chat-contract-fixtures-spec.md`
- `android-chat-contract-parser-spec.md`
- `chat-sse-api-spec.md`

后端必须已有：

- `POST /api/chat/stream`
- SSE event：`message_delta`、`product_cards`、`done`、`error`

## Gradle 依赖

修改 Android Gradle 配置：

- root `client/android/build.gradle.kts`
  - 增加 `org.jetbrains.kotlin.plugin.serialization`，版本与当前 Kotlin plugin 对齐。
- app `client/android/app/build.gradle.kts`
  - 应用 serialization plugin。
  - 启用 `buildFeatures.buildConfig = true`。
  - 增加 OkHttp、okhttp-sse、kotlinx-serialization-json、kotlinx-coroutines-android。
  - 如果要写本 spec 的本地单元测试，再增加 kotlin test、coroutines test、MockWebServer。

不要手写 JSON 字符串拼接。

## Android Manifest

新增：

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

说明：

- Phase 3 真机 / 模拟器接后端必须有 `INTERNET` 权限。
- Phase 3.5 的 `android-runtime-config-spec.md` 仍然负责更完整的 debug / release / 公网 URL / APK 演示配置。

## Base URL 配置

新增：

- `client/android/app/src/main/java/com/shopmate/app/data/network/ShopMateApiConfig.kt`

建议：

```kotlin
data class ShopMateApiConfig(
    val baseUrl: String
)
```

Gradle debug 默认值：

```text
http://10.0.2.2:3000/
```

规则：

- Android 模拟器访问宿主机后端用 `10.0.2.2`。
- 真机本地 Wi-Fi、临时公网隧道和云部署 URL 留给 Phase 3.5 配置。
- UI 层不能出现 base URL。
- 如果 base URL 为空或不是 http / https URL，network client 初始化时抛固定错误。
- URL 拼接必须处理末尾 `/`，不要生成 `//api/...` 或漏 `/`。

## 文件

预计新增：

- `client/android/app/src/main/java/com/shopmate/app/data/network/ShopMateApiConfig.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/network/ShopMateHttpClient.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/network/ShopMateNetworkError.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatStreamRequestDto.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatStreamClient.kt`

如果测试地基可用，再新增：

- `client/android/app/src/test/java/com/shopmate/app/data/network/ShopMateApiConfigTest.kt`
- `client/android/app/src/test/java/com/shopmate/app/data/chat/ChatStreamClientTest.kt`

预计修改：

- `client/android/build.gradle.kts`
- `client/android/app/build.gradle.kts`
- `client/android/app/src/main/AndroidManifest.xml`

不修改：

- `ChatRecommendationScreen.kt`
- `MainActivity.kt`
- mock data
- Compose components

## Chat Request DTO

新增 DTO，与后端 request contract 对齐：

```kotlin
@Serializable
data class ChatStreamRequestDto(
    val message: String,
    val history: List<ChatHistoryMessageDto> = emptyList(),
    val filters: ChatStreamFiltersDto? = null,
    val topK: Int? = null,
    val maxRecommendedProducts: Int? = null
)

@Serializable
data class ChatHistoryMessageDto(
    val role: String,
    val content: String
)
```

第一版 Android 调用只需要传：

- `message`
- 最近最多 4 条 `history`

没有 UI 来源时不要硬编码复杂 `filters`。

## ChatStreamClient

建议接口：

```kotlin
interface ChatStreamClient {
    fun streamChat(request: ChatStreamRequestDto): Flow<ChatStreamEvent>
}
```

OkHttp 实现要求：

- 使用 `POST {baseUrl}/api/chat/stream`。
- request headers：
  - `Content-Type: application/json`
  - `Accept: text/event-stream`
- request body 使用 kotlinx.serialization encode。
- 使用 okhttp-sse `EventSourceListener` 接收事件。
- `onEvent` 中调用 `parseChatStreamEvent(eventName, data)`。
- 收到 `ChatStreamEvent.Error` 时 emit 给上层，不在 client 里吞掉。
- stream 正常关闭时结束 Flow。
- Flow 被取消时必须 cancel EventSource。
- 不在 client 中直接更新 UI state。

## JSON 配置

统一 JSON instance：

```kotlin
Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}
```

规则：

- 忽略后端新增字段。
- 对必填字段缺失、类型错误返回 parse/network error，不让 app 崩溃。
- 不把 provider 原始报错、prompt、API key 或 `.env` 内容写入 Android log。

## 错误类型

新增 sealed error 或 exception：

```kotlin
sealed class ShopMateNetworkError(message: String, cause: Throwable? = null) :
    Exception(message, cause)
```

至少覆盖：

- invalid base URL
- request serialization failed
- response parse failed
- stream connection failed
- HTTP non-2xx
- stream cancelled

错误对象只给 repository / ViewModel 判断，不直接决定 UI 文案。UI 文案在后续 chat integration spec 里处理。

## Timeout

OkHttp client 第一版建议：

- connect timeout：10 秒
- read timeout：0 或足够长，避免 SSE 被普通 read timeout 中断
- write timeout：10 秒

如果设置 read timeout 为 0，需要在代码注释说明这是为 SSE 长连接准备，不代表所有普通 HTTP API 都无限等待。后续普通 JSON API 如需不同 timeout，再拆 client 或 request-level 配置。

## Mock / Preview 边界

- Compose Preview 继续使用 mock data。
- `ChatRecommendationScreen` 不在本 spec 接真实网络。
- 后续 `android-chat-api-integration-spec.md` 再决定 repository 如何在后端不可用时 fallback。
- Network client 不能依赖 mock data；mock fallback 属于 repository / UI state 层。

## 测试

如果新增 Android local unit test 依赖，覆盖：

- base URL normalization。
- invalid base URL 会报固定错误。
- `ChatStreamRequestDto` JSON 与后端 contract 字段一致。
- MockWebServer 收到 `POST /api/chat/stream`、正确 headers 和 JSON body。
- MockWebServer 返回 SSE 后，Flow 依次 emit `MessageDelta`、`ProductCards`、`Done`。
- SSE `error` event 会 emit `ChatStreamEvent.Error`。
- malformed event data 不让测试进程崩溃，返回 parse error 或 Unknown。
- Flow cancellation 会 cancel EventSource。

如果 Android 测试地基暂时不可用：

- 至少运行 `cd client/android && .\gradlew.bat build`。
- 在完成记录中写明测试缺口，Phase 3 后续补测试。

## 手动验证

本 spec 不要求接 UI，但可以做最小后端联调：

1. 启动后端：`cd server && npm.cmd run dev`。
2. Android debug base URL 使用 `http://10.0.2.2:3000/`。
3. 用临时 debug 调用或测试 client 请求 `/api/chat/stream`。

如果后端真实 LLM / Qdrant / PostgreSQL 未启动，不要把这当成 Android network client 失败；先用 MockWebServer 或 fake SSE response 验证 client。

## 验收标准

- Android Gradle 已加入 OkHttp、okhttp-sse、kotlinx.serialization、coroutines 所需配置。
- Android Manifest 有 `INTERNET` 权限。
- Base URL 不在 UI 中硬编码。
- `ChatStreamClient.streamChat()` 暴露 `Flow<ChatStreamEvent>`。
- Chat SSE client 能发送 POST JSON，并解析后端 SSE event。
- Flow cancellation 会关闭 SSE 连接。
- 没有引入 Retrofit、ViewModel、Repository 或 Compose UI 改动。
- 没有写入真实 API key、prompt、`.env` 或 provider 私有字段。
- `cd client/android && .\gradlew.bat build` 通过。
- 如新增 Android local tests，相关测试通过。
