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
            priceCents = 19900,
            available = true,
        )
}
