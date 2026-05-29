package com.shopmate.app.ui.product

import com.shopmate.app.data.products.ProductDetailError
import com.shopmate.app.data.products.ProductRepository
import com.shopmate.app.ui.model.ProductDetailUi
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProductDetailViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun initLoadsProductDetailSuccessfully() = runTest {
        val repository = FakeProductRepository(Result.success(productUi()))
        val viewModel = ProductDetailViewModel("product_001", repository)

        assertTrue(viewModel.uiState.value.isLoading)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertEquals("product_001", state.product?.id)
        assertEquals(null, state.errorMessage)
        assertEquals(listOf("product_001"), repository.productIds)
    }

    @Test
    fun loadMapsNotFoundToStableErrorWithoutRetry() = runTest {
        val viewModel = ProductDetailViewModel(
            "missing",
            FakeProductRepository(Result.failure(ProductDetailError.NotFound)),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertEquals("商品不存在或已下架。", state.errorMessage)
        assertFalse(state.canRetry)
    }

    @Test
    fun loadMapsNetworkFailureToRetryableError() = runTest {
        val viewModel = ProductDetailViewModel(
            "product_001",
            FakeProductRepository(Result.failure(ProductDetailError.NetworkFailure(RuntimeException()))),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertEquals("无法加载商品详情，请确认后端正在运行。", state.errorMessage)
        assertTrue(state.canRetry)
    }

    @Test
    fun loadRejectsBlankProductIdWithoutRepositoryCall() = runTest {
        val repository = FakeProductRepository(Result.success(productUi()))
        val viewModel = ProductDetailViewModel(" ", repository)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("商品不存在或已下架。", state.errorMessage)
        assertFalse(state.canRetry)
        assertEquals(emptyList(), repository.productIds)
    }

    @Test
    fun loadWithNewProductIdReloadsDetail() = runTest {
        val repository = FakeProductRepository(Result.success(productUi()))
        val viewModel = ProductDetailViewModel("product_001", repository)
        advanceUntilIdle()

        viewModel.load("product_002")
        advanceUntilIdle()

        assertEquals(listOf("product_001", "product_002"), repository.productIds)
        assertEquals("product_002", viewModel.uiState.value.productId)
    }

    private class FakeProductRepository(
        private val result: Result<ProductDetailUi>,
    ) : ProductRepository {
        val productIds = mutableListOf<String>()

        override suspend fun getProductDetail(productId: String): Result<ProductDetailUi> {
            productIds += productId
            return result
        }
    }

    private fun productUi(): ProductDetailUi =
        ProductDetailUi(
            id = "product_001",
            name = "通勤蓝牙耳机 A",
            priceText = "¥199",
            imageRes = 0,
            categoryText = "数码电子",
            brandText = "示例品牌",
            tags = listOf("通勤"),
            recommendationReason = "适合通勤。",
            description = "适合通勤和日常使用。",
            highlights = listOf("续航稳定"),
        )
}
