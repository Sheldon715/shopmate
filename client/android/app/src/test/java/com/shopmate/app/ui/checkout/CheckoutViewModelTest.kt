package com.shopmate.app.ui.checkout

import com.shopmate.app.data.orders.OrderOperationError
import com.shopmate.app.data.orders.OrderRepository
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
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
class CheckoutViewModelTest {
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
    fun initializesEditableShippingAndDefaultMethodsFromDraft() = runTest {
        val viewModel = CheckoutViewModel(checkoutDraft(), FakeOrderRepository())

        val state = viewModel.uiState.value

        assertEquals("ShopMate 用户", state.editableShipping.recipient)
        assertEquals("", state.editableShipping.phone)
        assertEquals("ShopMate 演示配送区 ShopMate 收货点", state.editableShipping.fullAddress)
        assertEquals(1, state.savedAddresses.size)
        assertEquals("draft-address", state.selectedAddressId)
        assertEquals("standard", state.selectedDeliveryMethodType)
        assertEquals("wechat", state.selectedPaymentMethodType)
    }

    @Test
    fun invalidShippingDoesNotSubmit() = runTest {
        val repository = FakeOrderRepository()
        val viewModel = CheckoutViewModel(checkoutDraft(), repository)

        viewModel.submitOrder()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(0, repository.confirmCalls)
        assertEquals("请输入完整手机号", state.fieldErrors.phone)
        assertFalse(state.isSubmitting)
    }

    @Test
    fun selectingSavedAddressUpdatesShippingSnapshot() = runTest {
        val repository = FakeOrderRepository()
        val viewModel = CheckoutViewModel(checkoutDraft(), repository)

        viewModel.addAddress()
        viewModel.onAddressFormRecipientChange("王同学")
        viewModel.onAddressFormPhoneChange("13900001111")
        viewModel.onAddressFormFullAddressChange("ShopMate 演示宿舍 6 栋 302")
        viewModel.selectAddressTag("学校")
        viewModel.saveAddressForm()
        viewModel.addAddress()
        viewModel.onAddressFormRecipientChange("陈先生")
        viewModel.onAddressFormPhoneChange("18948775237")
        viewModel.onAddressFormFullAddressChange("ShopMate 演示收货点 1 栋 201")
        viewModel.selectAddressTag("公司")
        viewModel.saveAddressForm()
        viewModel.openAddressBook()
        viewModel.selectSavedAddress("local-address-1")
        viewModel.submitOrder()
        advanceUntilIdle()

        val request = repository.lastConfirmRequest

        assertEquals(CheckoutAddressModeUi.Summary, viewModel.uiState.value.addressMode)
        assertEquals(1, repository.confirmCalls)
        assertNotNull(request)
        assertEquals("王同学", request.shipping.recipient)
        assertEquals("13900001111", request.shipping.phone)
        assertEquals(
            "ShopMate 演示配送区 ShopMate 演示宿舍 6 栋 302",
            request.shipping.fullAddress,
        )
    }

    @Test
    fun savingNewAddressAddsCardAndUsesItForSubmit() = runTest {
        val repository = FakeOrderRepository()
        val viewModel = CheckoutViewModel(checkoutDraft(), repository)

        viewModel.addAddress()
        viewModel.onAddressFormRecipientChange("王同学")
        viewModel.onAddressFormPhoneChange("13900001111")
        viewModel.onAddressFormFullAddressChange("ShopMate 演示宿舍 6 栋 302")
        viewModel.selectAddressTag("学校")
        viewModel.saveAddressForm()
        viewModel.submitOrder()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        val request = repository.lastConfirmRequest

        assertEquals(CheckoutAddressModeUi.Summary, state.addressMode)
        assertTrue(state.savedAddresses.any { address ->
            address.recipient == "王同学" && address.tag == "学校"
        })
        assertEquals(1, repository.confirmCalls)
        assertNotNull(request)
        assertEquals("王同学", request.shipping.recipient)
        assertEquals("13900001111", request.shipping.phone)
        assertEquals(
            "ShopMate 演示配送区 ShopMate 演示宿舍 6 栋 302",
            request.shipping.fullAddress,
        )
    }

    @Test
    fun submitSendsEditedShippingAndSelectedMethods() = runTest {
        val repository = FakeOrderRepository()
        val viewModel = CheckoutViewModel(checkoutDraft(), repository)

        viewModel.onRecipientChange("张三")
        viewModel.onPhoneChange("13800000000")
        viewModel.onAddressChange("ShopMate 演示公寓")
        viewModel.selectDeliveryMethod("express")
        viewModel.selectPaymentMethod("alipay")
        viewModel.submitOrder()
        advanceUntilIdle()

        val request = repository.lastConfirmRequest
        val state = viewModel.uiState.value

        assertEquals(1, repository.confirmCalls)
        assertNotNull(request)
        assertEquals("draft-1", request.draftId)
        assertEquals("张三", request.shipping.recipient)
        assertEquals("13800000000", request.shipping.phone)
        assertEquals("ShopMate 演示公寓", request.shipping.fullAddress)
        assertEquals("express", request.deliveryMethodType)
        assertEquals("alipay", request.paymentMethodType)
        assertEquals("order-1", state.orderResult?.orderId)
        assertFalse(state.isSubmitting)
    }

    @Test
    fun submitFailureShowsCheckoutError() = runTest {
        val repository = FakeOrderRepository(
            confirmResult = Result.failure(OrderOperationError.CartChanged),
        )
        val viewModel = CheckoutViewModel(checkoutDraft(), repository)

        viewModel.onPhoneChange("13800000000")
        viewModel.submitOrder()
        advanceUntilIdle()

        val state = viewModel.uiState.value

        assertEquals(1, repository.confirmCalls)
        assertEquals("购物车商品已变化，请返回购物车刷新后再试。", state.errorMessage)
        assertEquals(null, state.orderResult)
        assertFalse(state.isSubmitting)
    }

    private class FakeOrderRepository(
        private val createResult: Result<CheckoutDraftUi> = Result.success(checkoutDraft()),
        private val confirmResult: Result<CheckoutOrderResultUi> = Result.success(checkoutResult()),
        private val cancelResult: Result<Unit> = Result.success(Unit),
    ) : OrderRepository {
        var confirmCalls = 0
        var lastConfirmRequest: ConfirmRequest? = null

        override suspend fun createMockCheckout(): Result<CheckoutDraftUi> = createResult

        override suspend fun confirmMockCheckout(
            conversationId: String,
            draftId: String,
            shipping: CheckoutShippingInputUi,
            deliveryMethodType: String,
            paymentMethodType: String,
        ): Result<CheckoutOrderResultUi> {
            confirmCalls += 1
            lastConfirmRequest = ConfirmRequest(
                conversationId = conversationId,
                draftId = draftId,
                shipping = shipping,
                deliveryMethodType = deliveryMethodType,
                paymentMethodType = paymentMethodType,
            )
            return confirmResult
        }

        override suspend fun cancelMockCheckout(): Result<Unit> = cancelResult
    }

    private data class ConfirmRequest(
        val conversationId: String,
        val draftId: String,
        val shipping: CheckoutShippingInputUi,
        val deliveryMethodType: String,
        val paymentMethodType: String,
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
                        quantity = 1,
                        subtotalText = "¥199",
                        subtotalCents = 19900,
                        imageUrl = null,
                    )
                ),
                summary = CheckoutSummaryUi(
                    itemCount = 1,
                    selectedCount = 1,
                    subtotalText = "¥199",
                    subtotalCents = 19900,
                    shippingFeeText = "¥0",
                    shippingFeeCents = 0,
                    totalText = "¥199",
                    totalCents = 19900,
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
                    ),
                    CheckoutDeliveryMethodUi(
                        type = "express",
                        label = "加急配送",
                        feeText = "¥12",
                        feeCents = 1200,
                        etaText = "预计明天送达",
                    ),
                ),
                paymentOptions = listOf(
                    CheckoutPaymentMethodUi("wechat", "微信支付"),
                    CheckoutPaymentMethodUi("alipay", "支付宝"),
                ),
                expiresAt = "2026-06-06T00:15:00.000Z",
            )

        fun checkoutResult(): CheckoutOrderResultUi =
            CheckoutOrderResultUi(
                orderId = "order-1",
                orderNumber = "MOCK-20260606000000-TEST",
                displayOrderNumber = "TEST",
                totalText = "¥211",
                totalCents = 21100,
            )
    }
}
