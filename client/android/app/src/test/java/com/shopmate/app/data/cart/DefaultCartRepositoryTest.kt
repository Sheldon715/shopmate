package com.shopmate.app.data.cart

import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateImageUrlResolver
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Test

class DefaultCartRepositoryTest {
    @Test
    fun getCartMapsDtoToUiContent() = runTest {
        val repository = DefaultCartRepository(
            FakeCartApiClient(response = successResponse()),
        )

        val result = repository.getCart()

        assertTrue(result.isSuccess)
        val content = result.getOrThrow()
        assertEquals("cart-item-1", content.items.single().id)
        assertEquals("通勤蓝牙耳机", content.items.single().product.name)
        assertEquals("¥398", content.items.single().subtotalText)
        assertEquals(2, content.summary.selectedCount)
        assertEquals("¥398", content.summary.selectedTotalText)
    }

    @Test
    fun getCartResolvesProductImageUrl() = runTest {
        val repository = DefaultCartRepository(
            cartApiClient = FakeCartApiClient(response = successResponse()),
            imageUrlResolver = ShopMateImageUrlResolver(
                ShopMateApiConfig("https://api.example.test/base/"),
            ),
        )

        val result = repository.getCart()

        assertEquals(
            "https://api.example.test/base/images/products/digital/images/product_001.png",
            result.getOrThrow().items.single().product.imageUrl,
        )
    }

    @Test
    fun addProductRejectsBlankProductId() = runTest {
        val repository = DefaultCartRepository(
            FakeCartApiClient(response = successResponse()),
        )

        val result = repository.addProduct(" ")

        assertTrue(result.isFailure)
        assertIs<CartOperationError.InvalidProductId>(result.exceptionOrNull())
    }

    @Test
    fun addProductCapsQuantityAtMax() = runTest {
        val apiClient = FakeCartApiClient(response = successResponse())
        val repository = DefaultCartRepository(apiClient)

        repository.addProduct("product_001", quantity = 100)

        assertEquals(99, apiClient.lastAddQuantity)
    }

    @Test
    fun updateQuantityCapsQuantityAtMax() = runTest {
        val apiClient = FakeCartApiClient(response = successResponse())
        val repository = DefaultCartRepository(apiClient)

        repository.updateQuantity("cart-item-1", quantity = 100)

        assertEquals(99, apiClient.lastUpdateQuantity)
    }

    @Test
    fun mapsProductUnavailableError() = runTest {
        val repository = DefaultCartRepository(
            FakeCartApiClient(
                response = CartApiResponseDto(
                    success = false,
                    error = CartApiErrorDto(
                        code = "PRODUCT_UNAVAILABLE",
                        message = "商品当前不可加购",
                    ),
                ),
            ),
        )

        val result = repository.addProduct("product_001")

        assertTrue(result.isFailure)
        assertIs<CartOperationError.ProductUnavailable>(result.exceptionOrNull())
    }

    @Test
    fun getCartRethrowsCancellation() = runTest {
        val repository = DefaultCartRepository(CancellingCartApiClient)

        assertFailsWith<CancellationException> {
            repository.getCart()
        }
    }

    private class FakeCartApiClient(
        private val response: CartApiResponseDto<CartDto>,
    ) : CartApiClient {
        var lastAddQuantity: Int? = null
        var lastUpdateQuantity: Int? = null

        override suspend fun getCart(): CartApiResponseDto<CartDto> = response

        override suspend fun addCartItem(
            productId: String,
            quantity: Int,
        ): CartApiResponseDto<CartDto> {
            lastAddQuantity = quantity
            return response
        }

        override suspend fun updateCartItem(
            itemId: String,
            quantity: Int?,
            selected: Boolean?,
        ): CartApiResponseDto<CartDto> {
            lastUpdateQuantity = quantity
            return response
        }

        override suspend fun deleteCartItem(itemId: String): CartApiResponseDto<CartDto> =
            response

        override suspend fun selectAll(selected: Boolean): CartApiResponseDto<CartDto> =
            response
    }

    private object CancellingCartApiClient : CartApiClient {
        override suspend fun getCart(): CartApiResponseDto<CartDto> {
            throw CancellationException("cancelled")
        }

        override suspend fun addCartItem(
            productId: String,
            quantity: Int,
        ): CartApiResponseDto<CartDto> {
            throw CancellationException("cancelled")
        }

        override suspend fun updateCartItem(
            itemId: String,
            quantity: Int?,
            selected: Boolean?,
        ): CartApiResponseDto<CartDto> {
            throw CancellationException("cancelled")
        }

        override suspend fun deleteCartItem(itemId: String): CartApiResponseDto<CartDto> {
            throw CancellationException("cancelled")
        }

        override suspend fun selectAll(selected: Boolean): CartApiResponseDto<CartDto> {
            throw CancellationException("cancelled")
        }
    }

    private fun successResponse(): CartApiResponseDto<CartDto> =
        CartApiResponseDto(
            success = true,
            data = CartDto(
                items = listOf(
                    CartItemDto(
                        id = "cart-item-1",
                        productId = "product_001",
                        name = "通勤蓝牙耳机",
                        brand = "示例品牌",
                        category = "数码电子",
                        priceCents = 19900,
                        priceText = "¥199",
                        quantity = 2,
                        selected = true,
                        subtotalCents = 39800,
                        available = true,
                        tags = listOf("通勤", "蓝牙"),
                        imagePath = "/images/products/digital/images/product_001.png",
                    ),
                ),
                summary = CartSummaryDto(
                    totalCount = 2,
                    selectedCount = 2,
                    selectedTotalCents = 39800,
                    currency = "CNY",
                ),
            ),
        )
}
