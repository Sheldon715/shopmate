package com.shopmate.app.ui.cart

import com.shopmate.app.R
import com.shopmate.app.data.cart.CartOperationError
import com.shopmate.app.data.cart.CartRepository
import com.shopmate.app.data.orders.OrderOperationError
import com.shopmate.app.data.orders.OrderRepository
import com.shopmate.app.ui.model.CartItemUi
import com.shopmate.app.ui.model.ProductCardUi
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
class CartViewModelTest {
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
    fun initLoadsCart() = runTest {
        val repository = FakeCartRepository(Result.success(cartContent()))
        val viewModel = CartViewModel(repository, FakeOrderRepository())

        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertEquals("cart-item-1", state.items.single().id)
        assertEquals(2, state.summary.selectedCount)
    }

    @Test
    fun addProductUpdatesStateFromRepository() = runTest {
        val repository = FakeCartRepository(Result.success(cartContent()))
        val viewModel = CartViewModel(repository, FakeOrderRepository())
        advanceUntilIdle()

        viewModel.addProduct("product_001")
        advanceUntilIdle()

        assertEquals("product_001", repository.lastAddedProductId)
        assertEquals(null, viewModel.uiState.value.operationInFlightItemId)
        assertEquals(null, viewModel.uiState.value.errorMessage)
        assertEquals("已加入购物车", viewModel.uiState.value.operationMessage?.text)
    }

    @Test
    fun consumeOperationMessageClearsOnlyMatchingMessage() = runTest {
        val repository = FakeCartRepository(Result.success(cartContent()))
        val viewModel = CartViewModel(repository, FakeOrderRepository())
        advanceUntilIdle()

        viewModel.addProduct("product_001")
        advanceUntilIdle()
        val messageId = viewModel.uiState.value.operationMessage?.id ?: error("Missing message")

        viewModel.consumeOperationMessage(messageId + 1)
        assertEquals(messageId, viewModel.uiState.value.operationMessage?.id)

        viewModel.consumeOperationMessage(messageId)
        assertEquals(null, viewModel.uiState.value.operationMessage)
    }

    @Test
    fun addProductFailurePublishesFailureMessage() = runTest {
        val repository = FakeCartRepository(
            Result.failure(CartOperationError.ProductUnavailable),
        )
        val viewModel = CartViewModel(repository, FakeOrderRepository())
        advanceUntilIdle()

        viewModel.addProduct("product_001")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("商品当前不可加购。", state.errorMessage)
        assertEquals("商品当前不可加购。", state.operationMessage?.text)
    }

    @Test
    fun updateQuantityCapsQuantityAtMaxBeforeRepositoryCall() = runTest {
        val repository = FakeCartRepository(Result.success(cartContent()))
        val viewModel = CartViewModel(repository, FakeOrderRepository())
        advanceUntilIdle()

        viewModel.updateQuantity("cart-item-1", 100)
        advanceUntilIdle()

        assertEquals(99, repository.lastUpdatedQuantity)
    }

    @Test
    fun networkFailureShowsRetryableError() = runTest {
        val repository = FakeCartRepository(
            Result.failure(CartOperationError.NetworkFailure(RuntimeException())),
        )
        val viewModel = CartViewModel(repository, FakeOrderRepository())
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertTrue(state.canRetry)
        assertEquals("无法连接购物车服务，请确认后端正在运行。", state.errorMessage)
    }

    @Test
    fun startCheckoutCreatesDraftAndShowsCheckoutSheet() = runTest {
        val cartRepository = FakeCartRepository(Result.success(cartContent()))
        val orderRepository = FakeOrderRepository()
        val viewModel = CartViewModel(cartRepository, orderRepository)
        advanceUntilIdle()

        viewModel.startCheckout()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, orderRepository.createCalls)
        assertFalse(state.isCheckoutDraftLoading)
        assertEquals("draft-1", state.checkoutDraft?.id)
        assertEquals("¥398", state.checkoutDraft?.totalText)
        assertEquals("ShopMate Demo 收货点", state.checkoutDraft?.address?.fullAddress)
    }

    @Test
    fun confirmCheckoutCreatesOrderRefreshesCartAndClearsDraft() = runTest {
        val cartRepository = FakeCartRepository(Result.success(cartContent()))
        val orderRepository = FakeOrderRepository()
        val viewModel = CartViewModel(cartRepository, orderRepository)
        advanceUntilIdle()

        viewModel.startCheckout()
        advanceUntilIdle()
        cartRepository.result = Result.success(emptyCartContent())

        viewModel.confirmCheckout()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, orderRepository.confirmCalls)
        assertEquals(null, state.checkoutDraft)
        assertFalse(state.isCheckoutConfirming)
        assertEquals(0, state.items.size)
        assertEquals("模拟订单 MOCK-1 已生成，合计 ¥398", state.operationMessage?.text)
    }

    @Test
    fun confirmCheckoutFailureKeepsDraftAndShowsCheckoutError() = runTest {
        val cartRepository = FakeCartRepository(Result.success(cartContent()))
        val orderRepository = FakeOrderRepository(
            confirmResult = Result.failure(OrderOperationError.CartChanged),
        )
        val viewModel = CartViewModel(cartRepository, orderRepository)
        advanceUntilIdle()

        viewModel.startCheckout()
        advanceUntilIdle()
        viewModel.confirmCheckout()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("draft-1", state.checkoutDraft?.id)
        assertEquals("购物车商品已变化，请刷新后再试。", state.checkoutErrorMessage)
        assertEquals("购物车商品已变化，请刷新后再试。", state.operationMessage?.text)
    }

    private class FakeCartRepository(
        var result: Result<CartContentUi>,
    ) : CartRepository {
        var lastAddedProductId: String? = null
        var lastUpdatedQuantity: Int? = null

        override suspend fun getCart(): Result<CartContentUi> = result

        override suspend fun addProduct(productId: String, quantity: Int): Result<CartContentUi> {
            lastAddedProductId = productId
            return result
        }

        override suspend fun updateQuantity(
            itemId: String,
            quantity: Int,
        ): Result<CartContentUi> {
            lastUpdatedQuantity = quantity
            return result
        }

        override suspend fun updateSelected(
            itemId: String,
            selected: Boolean,
        ): Result<CartContentUi> = result

        override suspend fun removeItem(itemId: String): Result<CartContentUi> = result

        override suspend fun selectAll(selected: Boolean): Result<CartContentUi> = result
    }

    private class FakeOrderRepository(
        private val createResult: Result<CartCheckoutDraftUi> = Result.success(checkoutDraft()),
        private val confirmResult: Result<CartCheckoutResultUi> = Result.success(checkoutResult()),
        private val cancelResult: Result<Unit> = Result.success(Unit),
    ) : OrderRepository {
        var createCalls = 0
        var confirmCalls = 0
        var cancelCalls = 0

        override suspend fun createMockCheckout(): Result<CartCheckoutDraftUi> {
            createCalls += 1
            return createResult
        }

        override suspend fun confirmMockCheckout(): Result<CartCheckoutResultUi> {
            confirmCalls += 1
            return confirmResult
        }

        override suspend fun cancelMockCheckout(): Result<Unit> {
            cancelCalls += 1
            return cancelResult
        }
    }

    private fun cartContent(): CartContentUi =
        CartContentUi(
            items = listOf(
                CartItemUi(
                    id = "cart-item-1",
                    product = ProductCardUi(
                        id = "product_001",
                        name = "通勤蓝牙耳机",
                        priceText = "¥199",
                        imageRes = R.drawable.product_zero_air,
                        tags = listOf("通勤"),
                        recommendationReason = "示例品牌 · 数码电子",
                    ),
                    quantity = 2,
                    subtotalText = "¥398",
                    selected = true,
                    available = true,
                ),
            ),
            summary = CartSummaryUi(
                totalCount = 2,
                selectedCount = 2,
                selectedTotalCents = 39800,
                selectedTotalText = "¥398",
            ),
        )

    private fun emptyCartContent(): CartContentUi =
        CartContentUi(
            items = emptyList(),
            summary = CartSummaryUi(),
        )

    private companion object {
        fun checkoutDraft(): CartCheckoutDraftUi =
            CartCheckoutDraftUi(
                id = "draft-1",
                selectedCount = 2,
                totalText = "¥398",
                totalCents = 39800,
                address = CartCheckoutAddressUi(
                    label = "默认模拟地址",
                    recipient = "ShopMate Demo 用户",
                    phoneMasked = "138****0000",
                    fullAddress = "ShopMate Demo 收货点",
                ),
            )

        fun checkoutResult(): CartCheckoutResultUi =
            CartCheckoutResultUi(
                orderId = "order-1",
                orderNumber = "MOCK-1",
                totalText = "¥398",
                totalCents = 39800,
            )
    }
}
