# Android Product API Integration

## 概述

把 Android 商品详情页接到真实后端商品 API。用户从聊天推荐卡片点击商品后，进入详情页并通过 `GET /api/products/:id` 读取 PostgreSQL 商品详情。

本 spec 只做商品详情真实读取链路：Product API client、repository、mapper、ViewModel 和详情页状态。不要把购物车 API、图片加载、商品列表页或部署配置混进来。

## 范围

本 spec 负责：

- 新增普通 JSON API client，调用 `GET /api/products/:id`。
- 新增 Android `ProductDetailDto` / `ProductSkuDto` / `ApiResponseDto`。
- 把后端 `ProductDetailDto` 映射成当前 `ProductDetailUi`。
- 新增 `ProductRepository`。
- 新增 `ProductDetailViewModel` 和 `ProductDetailUiState`。
- 让 `ProductDetailScreen(productId)` 从真实 API 加载详情。
- 推荐卡片点击进入详情页时使用后端真实 product id。
- 保留 Preview / mock fallback，不依赖后端在线。

不负责：

- `GET /api/products` 列表页。
- 图片远程加载。
- 购物车 API / 加购真实请求。
- 收藏真实状态。
- 登录 / user session。
- 商品对比页真实 API。
- Retrofit。
- 后端商品 API 改造。

## 前置条件

先完成：

- `android-network-client-spec.md`
- `android-chat-api-integration-spec.md`
- 后端 `product-api-spec.md`

后端必须已有：

- `GET /api/products/:id`
- 成功返回统一 `ApiResponse<ProductDetailDto>`
- 不存在返回 `404 PRODUCT_NOT_FOUND`

## 文件

预计新增：

- `client/android/app/src/main/java/com/shopmate/app/data/products/ProductApiClient.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/products/ProductDtos.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/products/ProductRepository.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/products/ProductDetailMapper.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailUiState.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailViewModel.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailViewModelFactory.kt`

预计修改：

- `client/android/app/src/main/java/com/shopmate/app/ShopMateAppContainer.kt`
- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/network/ShopMateNetworkError.kt`（如需补普通 HTTP 错误信息）

不修改：

- Chat SSE client。
- ChatViewModel。
- 后端 RAG / SSE。
- Cart screen 的真实加购逻辑。

## API Contract

请求：

```text
GET /api/products/{productId}
Accept: application/json
```

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "product_001",
    "name": "通勤蓝牙耳机 A",
    "brand": "示例品牌",
    "category": "数码电子",
    "subCategory": "耳机",
    "priceCents": 19900,
    "priceRangeCents": { "min": 17900, "max": 21900 },
    "currency": "CNY",
    "imagePath": "/images/product_001.png",
    "ratingAvg": 4.6,
    "tags": ["通勤", "蓝牙"],
    "available": true,
    "marketingDescription": "适合通勤和日常使用。",
    "skus": [],
    "attributes": {},
    "pros": ["续航稳定"],
    "cons": ["暂不支持主动降噪"],
    "recommendWhen": ["通勤"],
    "avoidWhen": ["需要强降噪"],
    "reviewSummary": {},
    "officialFaq": {},
    "contentBlocks": {}
  }
}
```

错误响应：

```json
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "商品不存在"
  }
}
```

Android 必须读取 `success`，不要假设 HTTP 200 一定有 `data`。

## DTO

新增：

```kotlin
@Serializable
data class ApiResponseDto<T>(
    val success: Boolean,
    val data: T? = null,
    val error: ApiErrorDto? = null
)

@Serializable
data class ApiErrorDto(
    val code: String,
    val message: String
)
```

`ProductDetailDto` 字段与后端 camelCase 对齐。JSON config 继续使用 `ignoreUnknownKeys = true`。

注意：

- `reviewSummary`、`officialFaq`、`contentBlocks` 第一版可以用 `JsonElement?` 接住，不要求完整 UI 展示。
- `attributes` 使用 `Map<String, List<String>>`。
- `skus` 第一版只需要解析基础字段，UI 不必完整展示每个 SKU。

## ProductApiClient

建议接口：

```kotlin
interface ProductApiClient {
    suspend fun getProductDetail(productId: String): ApiResponseDto<ProductDetailDto>
}
```

OkHttp 实现要求：

- 使用共享 `OkHttpClient` 或 `ShopMateHttpClient.create()`。
- URL 使用 `ShopMateApiConfig.resolve("api/products/$encodedProductId")`。
- productId 必须安全 path encode，不要直接拼未转义字符串。
- 解析 JSON 使用 `ShopMateJson.instance`。
- 非 2xx 转成 network error，但 404 body 如果能解析到 `ApiResponseDto.error`，repository 应能识别为 not found。
- 不在 client 里决定 UI 文案。

## Repository

建议接口：

```kotlin
interface ProductRepository {
    suspend fun getProductDetail(productId: String): Result<ProductDetailUi>
}
```

`DefaultProductRepository` 负责：

- trim / 校验 productId 非空。
- 调用 `ProductApiClient.getProductDetail(productId)`。
- 处理 `success=false` 和 `PRODUCT_NOT_FOUND`。
- 调用 `ProductDetailMapper`。
- 不依赖 Compose。

## Mapper

`ProductDetailDto -> ProductDetailUi`：

- `id` -> `id`
- `name` -> `name`
- `priceCents` / `priceRangeCents` / `currency` -> `priceText`
- `imagePath` 第一版映射到 placeholder `imageRes`，复用 chat card mapper 的占位策略或抽共享 helper。
- `category` / `subCategory` -> `categoryText`
- `brand` -> `brandText`
- `tags` -> `tags`，最多 4 个
- `marketingDescription` -> `description`
- `pros` + `recommendWhen` -> `highlights`
- `attributes` -> `specs`
- `avoidWhen` / `cons` -> `suitedForText` 的一部分或详情提示文案

规则：

- 不让 Android 编造商品功效。
- 缺字段时显示保守 fallback，例如“暂无详细说明”。
- 不把完整 JSON dump 显示在 UI。

## ViewModel

新增：

```kotlin
data class ProductDetailUiState(
    val productId: String,
    val product: ProductDetailUi? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val canRetry: Boolean = false
)
```

`ProductDetailViewModel` 负责：

- `load(productId)`。
- `retry()`。
- 在 productId 变化时重新加载。
- loading / success / not found / network error 状态。

错误文案：

- `PRODUCT_NOT_FOUND`：商品不存在或已下架。
- network failure：无法加载商品详情，请确认后端正在运行。
- parse failure：商品详情数据格式异常。
- unknown：暂时无法加载商品详情。

## AppContainer

扩展 `ShopMateAppContainer`：

```kotlin
val productApiClient: ProductApiClient by lazy { OkHttpProductApiClient() }
val productRepository: ProductRepository by lazy {
    DefaultProductRepository(productApiClient)
}
fun productDetailViewModelFactory(productId: String): ProductDetailViewModelFactory =
    ProductDetailViewModelFactory(productId, productRepository)
```

要求：

- 依赖集中在 container。
- 不在 `ProductDetailScreen` 里创建 OkHttp client。
- 不引入 Hilt / Koin。

## UI 接入

`ProductDetailScreen` 改为 state-driven：

```kotlin
fun ProductDetailScreen(
    state: ProductDetailUiState,
    onBackClick: () -> Unit,
    onCartClick: () -> Unit,
    onRetry: () -> Unit,
    onAddCartClick: () -> Unit,
    onBuyNowClick: () -> Unit,
    ...
)
```

要求：

- loading：显示当前页面风格的加载状态，不闪退。
- success：渲染真实 `ProductDetailUi`。
- not found / error：复用 `ShopMateStatusMessage` 风格，提供返回或重试。
- Preview 继续使用 mock `ProductDetailUi`，不创建真实 ViewModel。
- 收藏按钮保持本地 UI 状态即可，不接 API。
- 加购 / 立即购买继续走当前占位逻辑，真实 cart API 留给第 16 步。

## MainActivity 接入

当 `currentScreen is ProductDetail`：

- 使用 productId 创建 `ProductDetailViewModel`。
- 把 `state + callbacks` 传给 `ProductDetailScreen`。
- productId 来自聊天商品卡片 id，不做 mock id 转换。

如果 productId 为空：

- ViewModel 进入 not found / invalid id 状态。
- UI 显示错误，不崩溃。

## 测试

如果 Android test 地基可用，覆盖：

- `ProductDetailMapper` 正常映射价格、tags、attributes、pros。
- 缺少 optional 字段时 mapper 有保守 fallback。
- `ProductApiClient` 对 MockWebServer 发起 `GET /api/products/:id`。
- 成功 `ApiResponseDto` 能解析成 `ProductDetailDto`。
- `success=false PRODUCT_NOT_FOUND` 映射到 not found。
- `ProductDetailViewModel.load()` 覆盖 loading -> success。
- 网络错误覆盖 loading -> error。
- productId 变化会重新加载。

如果 UI 测试暂时不做：

- 至少保持 mapper / repository / ViewModel 可测。
- 运行 Android build。

## 手动验证

建议手测：

1. 启动后端：`cd server && npm.cmd run dev`。
2. 启动模拟器。
3. 在聊天页输入问题，等待商品卡片。
4. 点击商品卡片。
5. 详情页应加载真实商品名称、价格、描述、标签和属性。

如果后端不可用：

- 详情页显示错误和重试。
- Preview 仍然可打开。

## 验收标准

- 商品详情页不再只依赖 `MockShopMateData.findProductDetail(productId)`。
- 推荐卡片点击的真实 product id 能请求 `GET /api/products/:id`。
- 成功时显示真实商品详情。
- 404 / 不存在商品有稳定错误状态。
- 网络失败有可理解提示和重试入口。
- Preview 不依赖后端。
- 不实现购物车真实 API、商品列表页、图片加载或部署配置。
- 不写真实 API key、`.env` 或 provider 私有字段。
- `cd client/android && .\gradlew.bat build` 通过。
- 如新增 Android unit tests，相关测试通过。
