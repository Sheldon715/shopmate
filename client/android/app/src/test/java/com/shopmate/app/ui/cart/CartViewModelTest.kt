package com.shopmate.app.ui.cart

import com.shopmate.app.R
import com.shopmate.app.data.cart.CartOperationError
import com.shopmate.app.data.cart.CartRepository
import com.shopmate.app.data.orders.OrderOperationError
import com.shopmate.app.data.orders.OrderRepository
import com.shopmate.app.ui.checkout.CheckoutAddressUi
import com.shopmate.app.ui.checkout.CheckoutDeliveryMethodUi
import com.shopmate.app.ui.checkout.CheckoutDraftUi
import com.shopmate.app.ui.checkout.CheckoutItemUi
import com.shopmate.app.ui.checkout.CheckoutOrderResultUi
import com.shopmate.app.ui.checkout.CheckoutPaymentMethodUi
import com.shopmate.app.ui.checkout.CheckoutShippingInputUi
import com.shopmate.app.ui.checkout.CheckoutSummaryUi
import com.shopmate.app.ui.model.CartItemUi
import com.shopmate.app.ui.model.ProductAddCartState
import com.shopmate.app.ui.model.ProductCardUi
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
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
    fun addProductTracksProductFeedbackState() = runTest {
        val repository = FakeCartRepository(Result.success(cartContent()))
        val viewModel = CartViewModel(repository, FakeOrderRepository())
        advanceUntilIdle()

        viewModel.addProduct(" product_001 ")

        assertEquals(ProductAddCartState.Loading, viewModel.uiState.value.productAddCartStates["product_001"])

        runCurrent()

        assertEquals("product_001", repository.lastAddedProductId)
        assertEquals(ProductAddCartState.Added, viewModel.uiState.value.productAddCartStates["product_001"])

        advanceTimeBy(1000)
        runCurrent()

        assertEquals(null, viewModel.uiState.value.productAddCartStates["product_001"])
    }

    @Test
    fun addProductIgnoresRepeatedClickWhileLoading() = runTest {
        val repository = FakeCartRepository(Result.success(cartContent()))
        val viewModel = CartViewModel(repository, FakeOrderRepository())
        advanceUntilIdle()

        viewModel.addProduct("product_001")
        viewModel.addProduct("product_001")
        runCurrent()

        assertEquals(1, repository.addCalls)
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
    fun addProductFailureMarksProductFailedUntilFeedbackExpires() = runTest {
        val repository = FakeCartRepository(
            Result.failure(CartOperationError.ProductUnavailable),
        )
        val viewModel = CartViewModel(repository, FakeOrderRepository())
        advanceUntilIdle()

        viewModel.addProduct("product_001")
        runCurrent()

        assertEquals(ProductAddCartState.Failed, viewModel.uiState.value.productAddCartStates["product_001"])
        assertEquals("商品当前不可加购。", viewModel.uiState.value.errorMessage)

        advanceTimeBy(1500)
        runCurrent()

        assertEquals(null, viewModel.uiState.value.productAddCartStates["product_001"])
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
    fun startCheckoutCreatesDraftForCheckoutScreen() = runTest {
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
        assertEquals("¥398", state.checkoutDraft?.summary?.totalText)
        assertEquals("ShopMate 收货点", state.checkoutDraft?.address?.fullAddress)
    }

    @Test
    fun buyNowProductCreatesSingleProductCheckoutWithoutAddingCart() = runTest {
        val cartRepository = FakeCartRepository(Result.success(cartContent()))
        val orderRepository = FakeOrderRepository()
        val viewModel = CartViewModel(cartRepository, orderRepository)
        advanceUntilIdle()

        viewModel.buyNowProduct(" product_001 ")

        assertEquals(ProductAddCartState.Loading, viewModel.uiState.value.productBuyNowStates["product_001"])
        assertEquals(null, viewModel.uiState.value.productAddCartStates["product_001"])

        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(0, cartRepository.addCalls)
        assertEquals(null, cartRepository.lastAddedProductId)
        assertEquals(0, orderRepository.createCalls)
        assertEquals(1, orderRepository.productCheckoutCalls)
        assertEquals("product_001", orderRepository.lastProductCheckoutId)
        assertEquals("draft-1", state.checkoutDraft?.id)
        assertEquals(ProductAddCartState.Added, state.productBuyNowStates["product_001"])
        assertFalse(state.isCheckoutDraftLoading)

        advanceTimeBy(1000)
        runCurrent()

        assertEquals(null, viewModel.uiState.value.productBuyNowStates["product_001"])
    }

    @Test
    fun buyNowProductFailureUsesBuyNowFeedbackStateOnly() = runTest {
        val cartRepository = FakeCartRepository(Result.success(cartContent()))
        val orderRepository = FakeOrderRepository(
            createResult = Result.failure(OrderOperationError.CartChanged),
        )
        val viewModel = CartViewModel(cartRepository, orderRepository)
        advanceUntilIdle()

        viewModel.buyNowProduct("product_001")
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(null, state.checkoutDraft)
        assertEquals(ProductAddCartState.Failed, state.productBuyNowStates["product_001"])
        assertEquals(null, state.productAddCartStates["product_001"])
        assertEquals("购物车商品已变化，请刷新后再试。", state.operationMessage?.text)
        assertFalse(state.isCheckoutDraftLoading)
    }

    @Test
    fun dismissCheckoutCancelsDraftAndClearsState() = runTest {
        val cartRepository = FakeCartRepository(Result.success(cartContent()))
        val orderRepository = FakeOrderRepository()
        val viewModel = CartViewModel(cartRepository, orderRepository)
        advanceUntilIdle()

        viewModel.startCheckout()
        advanceUntilIdle()
        viewModel.dismissCheckout()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, orderRepository.cancelCalls)
        assertEquals(null, state.checkoutDraft)
    }

    @Test
    fun startCheckoutFailureShowsCheckoutError() = runTest {
        val cartRepository = FakeCartRepository(Result.success(cartContent()))
        val orderRepository = FakeOrderRepository(
            createResult = Result.failure(OrderOperationError.CartChanged),
        )
        val viewModel = CartViewModel(cartRepository, orderRepository)
        advanceUntilIdle()

        viewModel.startCheckout()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(null, state.checkoutDraft)
        assertEquals("购物车商品已变化，请刷新后再试。", state.checkoutErrorMessage)
        assertEquals("购物车商品已变化，请刷新后再试。", state.operationMessage?.text)
    }

    private class FakeCartRepository(
        var result: Result<CartContentUi>,
    ) : CartRepository {
        var addCalls = 0
        var lastAddedProductId: String? = null
        var lastUpdatedQuantity: Int? = null

        override suspend fun getCart(): Result<CartContentUi> = result

        override suspend fun addProduct(productId: String, quantity: Int): Result<CartContentUi> {
            addCalls += 1
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
        private val createResult: Result<CheckoutDraftUi> = Result.success(checkoutDraft()),
        private val productCheckoutResult: Result<CheckoutDraftUi> = createResult,
        private val confirmResult: Result<CheckoutOrderResultUi> = Result.success(checkoutResult()),
        private val cancelResult: Result<Unit> = Result.success(Unit),
    ) : OrderRepository {
        var createCalls = 0
        var productCheckoutCalls = 0
        var confirmCalls = 0
        var cancelCalls = 0
        var lastProductCheckoutId: String? = null

        override suspend fun createMockCheckout(): Result<CheckoutDraftUi> {
            createCalls += 1
            return createResult
        }

        override suspend fun createProductCheckout(productId: String): Result<CheckoutDraftUi> {
            productCheckoutCalls += 1
            lastProductCheckoutId = productId
            return productCheckoutResult
        }

        override suspend fun confirmMockCheckout(
            conversationId: String,
            draftId: String,
            shipping: CheckoutShippingInputUi,
            deliveryMethodType: String,
            paymentMethodType: String,
        ): Result<CheckoutOrderResultUi> {
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
        fun checkoutDraft(): CheckoutDraftUi =
            CheckoutDraftUi(
                id = "draft-1",
                conversationId = "cart-button-checkout",
                items = listOf(
                    CheckoutItemUi(
                        cartItemId = "cart-item-1",
                        productId = "product_001",
                        productName = "通勤蓝牙耳机",
                        brand = "示例品牌",
                        category = "数码电子",
                        unitPriceText = "¥199",
                        unitPriceCents = 19900,
                        quantity = 2,
                        subtotalText = "¥398",
                        subtotalCents = 39800,
                        imageUrl = null,
                    )
                ),
                summary = CheckoutSummaryUi(
                    itemCount = 1,
                    selectedCount = 2,
                    subtotalText = "¥398",
                    subtotalCents = 39800,
                    shippingFeeText = "¥0",
                    shippingFeeCents = 0,
                    totalText = "¥398",
                    totalCents = 39800,
                ),
                address = CheckoutAddressUi(
                    label = "默认地址",
                    recipient = "ShopMate 用户",
                    phoneMasked = "138****0000",
                    fullAddress = "ShopMate 收货点",
                ),
                deliveryOptions = listOf(
                    CheckoutDeliveryMethodUi(
                        type = "standard",
                        label = "标准配送",
                        feeText = "¥0",
                        feeCents = 0,
                        etaText = "预计 2-4 天送达",
                    )
                ),
                paymentOptions = listOf(
                    CheckoutPaymentMethodUi(
                        type = "wechat",
                        label = "微信支付",
                    )
                ),
                expiresAt = "2026-06-06T00:15:00.000Z",
            )

        fun checkoutResult(): CheckoutOrderResultUi =
            CheckoutOrderResultUi(
                orderId = "order-1",
                orderNumber = "MOCK-1",
                displayOrderNumber = "1",
                totalText = "¥398",
                totalCents = 39800,
            )
    }
}
