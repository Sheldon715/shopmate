# Android Product Image Loading

## 概述

把商品卡片、商品详情页和购物车里的商品图从本地 placeholder 升级为可加载后端返回的 `imagePath` / `imageUrl`，让最终 demo 更像真实 App。

本 spec 只做图片加载和 fallback，不改变推荐逻辑、不采集新图片、不做图片找货。

## 范围

本 spec 负责：

- 接入 Android 图片加载库 Coil。
- 为商品 UI model 增加远程图片 URL 字段，同时保留本地 placeholder。
- 统一解析后端返回的相对路径和绝对 URL。
- 商品推荐卡片、商品详情页、购物车商品行使用远程图片。
- 保留 loading / error / placeholder 状态。
- Preview 和 mock 数据仍能离线显示。

不负责：

- 后端图片 serving 的实现；那属于 `backend-deployment-readiness-spec.md`。
- 新增商品图片采集。
- 图片找货、多模态图片检索、以图搜图。
- 商品推荐排序或 RAG prompt。
- 重做商品卡片视觉设计。
- 对比页真实数据改造。

## 前置条件

先完成：

- `android-runtime-config-spec.md`
- `backend-deployment-readiness-spec.md`
- `android-product-api-integration-spec.md`
- `android-cart-api-foundation-spec.md`

后端应保证：

- Product API / Chat SSE product card 中的 `imagePath` 是以下之一：
  - 绝对 URL：`https://...`
  - 可基于 API Base URL 解析的相对路径：`/images/products/...`
- 图片请求失败时返回正常 404 / 500，不泄露本机路径。

## 技术路线

使用 Coil Compose。

根据 Context7 查询到的 Coil 3 用法，Compose 网络图片需要：

- `io.coil-kt.coil3:coil-compose`
- `io.coil-kt.coil3:coil-network-okhttp`
- `coil3.compose.AsyncImage`

实现时如果 Gradle 无法解析版本，先查官方文档或 Context7，不要靠猜测连续改版本。

## 数据模型

当前：

```kotlin
data class ProductCardUi(
    val id: String,
    val name: String,
    val priceText: String,
    val imageRes: Int,
    val tags: List<String>,
    val recommendationReason: String
)
```

建议改成兼容式扩展：

```kotlin
data class ProductCardUi(
    val id: String,
    val name: String,
    val priceText: String,
    val imageRes: Int,
    val tags: List<String>,
    val recommendationReason: String,
    val imageUrl: String? = null
)
```

`ProductDetailUi` 同样增加：

```kotlin
val imageUrl: String? = null
```

规则：

- `imageRes` 继续作为 placeholder / error fallback。
- `imageUrl` 为空时保持现有本地图。
- 不删除现有 preview / mock 依赖的 `imageRes`。
- 不把 URL 解析逻辑放进 Composable。

## URL 解析

新增：

- `client/android/app/src/main/java/com/shopmate/app/data/network/ShopMateImageUrlResolver.kt`

建议接口：

```kotlin
class ShopMateImageUrlResolver(
    private val apiConfig: ShopMateApiConfig
) {
    fun resolve(imagePathOrUrl: String?): String?
}
```

规则：

- `null` / blank -> `null`。
- `https://...` 或 `http://...` -> 原样返回。
- `/images/products/...` -> 基于 `ShopMateApiConfig.baseUrl` 解析成绝对 URL。
- `images/products/...` -> 同样基于 Base URL 解析。
- 其他相对 raw path 如果后端仍返回，例如 `beauty/images/...`，先基于后端公开图片前缀解析，最终目标仍应是 `/images/products/beauty/images/...`。
- 解析失败返回 `null`，不要崩溃。
- 不允许 UI 层自己拼 host。

## Mapper 接入

需要更新：

- `ChatProductMapper.kt`
- `ProductDetailMapper.kt`
- `CartMapper.kt`
- 相关 repository / ViewModel / app container wiring

目标：

- Chat SSE 的 `ChatProductCardDto.imagePath` -> `ProductCardUi.imageUrl`
- Product detail 的 `ProductDetailDto.imagePath` -> `ProductDetailUi.imageUrl`
- Cart item 如果后端 DTO 暂时没有 image 字段：
  - 优先补后端 cart DTO 返回 `imagePath`。
  - 如果暂不补，购物车先继续 placeholder，并在 spec 完成记录里说明限制。

推荐：

- 在 `ShopMateAppContainer` 中创建一个共享 `ShopMateImageUrlResolver`。
- 把 resolver 注入 mapper 所在的数据层或 repository。
- 不要在每个 Composable 里 `ShopMateApiConfig.default()`。

## UI 组件

新增或抽取：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateProductImage.kt`

职责：

- 输入：
  - `imageUrl: String?`
  - `placeholderRes: Int`
  - `contentDescription: String?`
  - `modifier`
  - `contentScale`
- `imageUrl` 有值时使用 `AsyncImage`。
- loading / error 使用 `placeholderRes`。
- `imageUrl` 为空时直接显示本地 `Image(painterResource(...))`。

要求：

- 组件不能改变父容器尺寸。
- loading、error、success 三种状态下布局尺寸一致。
- 商品名、价格、tag 不应因为图片加载状态发生跳动。
- 图片失败时不显示空白块。
- 不在 UI 中展示远程 URL。

## 接入位置

预计修改：

- `ProductCard.kt`
  - 卡片商品图使用 `ShopMateProductImage`。
- `ProductDetailScreen.kt`
  - hero 商品图使用 `ShopMateProductImage`。
- `CartScreen.kt`
  - 购物车商品行使用 `ShopMateProductImage`。
- `ProductComparisonScreen.kt`
  - 如果对比页仍是 mock 数据，可以先保留本地 placeholder；不要为了图片加载强行做真实对比。

保持：

- Preview mock 商品 `imageUrl = null`。
- 现有固定图片容器尺寸。
- 现有文字裁切和稳定高度规则。

## Gradle 依赖

修改：

- `client/android/app/build.gradle.kts`

新增 Coil 依赖：

```kotlin
implementation("io.coil-kt.coil3:coil-compose:<version>")
implementation("io.coil-kt.coil3:coil-network-okhttp:<version>")
```

版本要求：

- 使用同一 Coil 版本。
- 实现时以官方文档 / Context7 / Gradle 可解析结果为准。
- 不引入第二套图片加载库。

## 错误与离线 fallback

规则：

- 后端离线时，已有 Product / Chat / Cart 网络错误照常显示。
- 图片单独失败时，只降级为 placeholder，不让整个商品卡片失败。
- 不因为图片 404 影响加购、详情、聊天继续使用。
- 不把图片 URL 的错误堆栈刷到用户界面。

## 文件

预计新增：

- `client/android/app/src/main/java/com/shopmate/app/data/network/ShopMateImageUrlResolver.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateProductImage.kt`
- `client/android/app/src/test/java/com/shopmate/app/data/network/ShopMateImageUrlResolverTest.kt`

预计修改：

- `client/android/app/build.gradle.kts`
- `client/android/app/src/main/java/com/shopmate/app/ShopMateAppContainer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductCardUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductDetailUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatProductMapper.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/products/ProductDetailMapper.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/cart/CartMapper.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ProductCard.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/cart/CartScreen.kt`

不修改：

- 后端 RAG。
- 商品推荐 prompt。
- 商品数据采集脚本。
- Android Base URL 策略。

## 运行与验证

必须运行：

```powershell
cd client/android
.\gradlew.bat build
```

建议本地验证：

- 启动后端，确认 Product API 返回可访问图片路径。
- debug build 指向本机后端。
- 进入聊天页，触发商品推荐，卡片图片能加载或稳定 fallback。
- 点击商品详情，hero 图片能加载或稳定 fallback。
- 进入购物车，商品图区域不跳动。

如果后端图片 serving 尚未完成：

- 不编造远程图片验证结果。
- 可以完成 Android fallback 逻辑，但在完成记录里说明远程加载等待 `backend-deployment-readiness-spec.md`。

## 完成标准

- Coil 依赖接入成功。
- `imageUrl` 字段加入 UI model，旧 preview / mock 不崩。
- 相对路径和绝对 URL 都能通过统一 resolver 处理。
- 商品卡片、商品详情、购物车商品图使用同一个图片组件或同一套 fallback 规则。
- 图片 loading / error 不改变布局尺寸。
- 后端离线或图片 404 时显示稳定 placeholder。
- Android build 通过，或记录真实环境失败原因。

