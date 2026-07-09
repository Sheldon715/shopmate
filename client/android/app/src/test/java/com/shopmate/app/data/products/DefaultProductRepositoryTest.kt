package com.shopmate.app.data.products

import com.shopmate.app.data.network.ShopMateNetworkError
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import org.junit.Test

class DefaultProductRepositoryTest {
    @Test
    fun getProductDetailMapsSuccessResponse() = runTest {
        val repository = DefaultProductRepository(
            FakeProductApiClient(
                response = ApiResponseDto(
                    success = true,
                    data = productDto(),
                ),
            ),
        )

        val result = repository.getProductDetail(" product_001 ")

        assertTrue(result.isSuccess)
        assertEquals("product_001", result.getOrThrow().id)
    }

    @Test
    fun getProductDetailMapsProductNotFound() = runTest {
        val repository = DefaultProductRepository(
            FakeProductApiClient(
                response = ApiResponseDto(
                    success = false,
                    error = ApiErrorDto("PRODUCT_NOT_FOUND", "商品不存在"),
                ),
            ),
        )

        val error = assertFails(repository.getProductDetail("missing"))

        assertIs<ProductDetailError.NotFound>(error)
    }

    @Test
    fun getProductDetailMapsAiCopyGenerationFailureToParseFailure() = runTest {
        val repository = DefaultProductRepository(
            FakeProductApiClient(
                response = ApiResponseDto(
                    success = false,
                    error = ApiErrorDto(
                        "PRODUCT_DETAIL_COPY_GENERATION_FAILED",
                        "商品详情页导购文案生成失败",
                    ),
                ),
            ),
        )

        val error = assertFails(repository.getProductDetail("product_001"))

        assertIs<ProductDetailError.ParseFailure>(error)
    }

    @Test
    fun getProductDetailRejectsBlankProductId() = runTest {
        val repository = DefaultProductRepository(FakeProductApiClient(response = null))

        val error = assertFails(repository.getProductDetail(" "))

        assertIs<ProductDetailError.InvalidProductId>(error)
    }

    @Test
    fun getProductDetailMapsNetworkFailure() = runTest {
        val repository = DefaultProductRepository(
            FakeProductApiClient(
                error = ShopMateNetworkError.ProductConnectionFailed(),
            ),
        )

        val error = assertFails(repository.getProductDetail("product_001"))

        assertIs<ProductDetailError.NetworkFailure>(error)
    }

    private class FakeProductApiClient(
        private val response: ApiResponseDto<ProductDetailDto>? = null,
        private val error: Throwable? = null,
    ) : ProductApiClient {
        override suspend fun getProductDetail(productId: String): ApiResponseDto<ProductDetailDto> {
            error?.let { throw it }
            return requireNotNull(response)
        }
    }

    private fun assertFails(result: Result<*>): Throwable =
        requireNotNull(result.exceptionOrNull())

    private fun productDto(): ProductDetailDto =
        ProductDetailDto(
            id = "product_001",
            name = "通勤蓝牙耳机 A",
            brand = "示例品牌",
            category = "数码电子",
            subCategory = "耳机",
            priceCents = 19900,
            priceRangeCents = PriceRangeCentsDto(min = 17900, max = 21900),
            currency = "CNY",
            tags = listOf("通勤", "蓝牙"),
            available = true,
            recommendationReason = "推荐理由：半入耳佩戴轻松，适合通勤办公久戴。",
            recommendationHighlights = listOf("半入耳佩戴轻松", "通勤办公久戴不闷"),
            displayName = "漫步者 Zero Air",
            displayTags = listOf("半入耳", "通勤久戴"),
            displaySpecs = listOf(
                ProductDetailDisplaySpecDto("佩戴", "半入耳轻量"),
                ProductDetailDisplaySpecDto("场景", "通勤 / 办公"),
                ProductDetailDisplaySpecDto("通话", "清晰度更稳"),
                ProductDetailDisplaySpecDto("取舍", "弱于深度降噪"),
            ),
            suitabilityText = "适合想要久戴轻松和日常通话的用户，如果更看重地铁深度降噪，可以比较高阶款。",
            skus = listOf(
                ProductSkuDto(
                    skuId = "sku_001",
                    attributes = mapOf("版本" to "标准版"),
                ),
            ),
            attributes = mapOf(
                "适用人群" to listOf("通勤用户", "办公用户"),
                "使用场景" to listOf("通勤", "办公"),
                "核心卖点" to listOf("续航稳定", "半入耳轻盈"),
            ),
        )
}
