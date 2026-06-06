package com.shopmate.app.ui.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shopmate.app.data.cart.CartOperationError
import com.shopmate.app.data.cart.CartRepository
import com.shopmate.app.data.orders.OrderOperationError
import com.shopmate.app.data.orders.OrderRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CartViewModel(
    private val cartRepository: CartRepository,
    private val orderRepository: OrderRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CartUiState(isLoading = true))
    val uiState: StateFlow<CartUiState> = _uiState.asStateFlow()

    private var loadJob: Job? = null
    private var operationJob: Job? = null
    private var checkoutJob: Job? = null
    private var operationMessageSequence = 0L

    init {
        loadCart()
    }

    fun retry() {
        if (_uiState.value.isLoading) {
            return
        }
        loadCart()
    }

    fun refresh() {
        if (_uiState.value.isLoading || _uiState.value.isRefreshing) {
            return
        }
        loadCart()
    }

    fun addProduct(productId: String) {
        runCartOperation(
            operationItemId = ADD_OPERATION_ID,
            successMessage = "已加入购物车",
        ) {
            cartRepository.addProduct(productId)
        }
    }

    fun updateQuantity(itemId: String, quantity: Int) {
        if (quantity < 1) {
            return
        }
        runCartOperation(operationItemId = itemId) {
            cartRepository.updateQuantity(itemId, quantity.coerceAtMost(MAX_CART_QUANTITY))
        }
    }

    fun updateSelected(itemId: String, selected: Boolean) {
        runCartOperation(operationItemId = itemId) {
            cartRepository.updateSelected(itemId, selected)
        }
    }

    fun removeItem(itemId: String) {
        runCartOperation(operationItemId = itemId) {
            cartRepository.removeItem(itemId)
        }
    }

    fun selectAll(selected: Boolean) {
        if (_uiState.value.isSelectAllInFlight) {
            return
        }
        operationJob?.cancel()
        _uiState.update { state ->
            state.copy(
                errorMessage = null,
                canRetry = false,
                isSelectAllInFlight = true,
            )
        }
        operationJob = viewModelScope.launch {
            applyCartResult(cartRepository.selectAll(selected))
        }
    }

    fun startCheckout() {
        val state = _uiState.value
        if (
            state.isCheckoutDraftLoading ||
            state.isCheckoutConfirming ||
            state.operationInFlightItemId != null ||
            state.summary.selectedCount <= 0
        ) {
            return
        }

        checkoutJob?.cancel()
        _uiState.update { current ->
            current.copy(
                isCheckoutDraftLoading = true,
                checkoutErrorMessage = null,
                errorMessage = null,
                canRetry = false,
            )
        }
        checkoutJob = viewModelScope.launch {
            orderRepository.createMockCheckout().fold(
                onSuccess = { draft ->
                    _uiState.update { current ->
                        current.copy(
                            checkoutDraft = draft,
                            isCheckoutDraftLoading = false,
                            checkoutErrorMessage = null,
                        )
                    }
                },
                onFailure = { error ->
                    val message = error.toCheckoutDisplayMessage()
                    _uiState.update { current ->
                        current.copy(
                            isCheckoutDraftLoading = false,
                            checkoutErrorMessage = message,
                            errorMessage = message,
                            canRetry = error is OrderOperationError.NetworkFailure,
                            operationMessage = message.toOperationMessage(),
                        )
                    }
                },
            )
        }
    }

    fun dismissCheckout() {
        val state = _uiState.value
        if (state.isCheckoutConfirming) {
            return
        }

        val shouldCancelDraft = state.checkoutDraft != null
        checkoutJob?.cancel()
        _uiState.update { current ->
            current.copy(
                checkoutDraft = null,
                isCheckoutDraftLoading = false,
                checkoutErrorMessage = null,
            )
        }

        if (shouldCancelDraft) {
            viewModelScope.launch {
                orderRepository.cancelMockCheckout()
            }
        }
    }

    fun confirmCheckout() {
        val state = _uiState.value
        if (
            state.checkoutDraft == null ||
            state.isCheckoutConfirming ||
            state.isCheckoutDraftLoading
        ) {
            return
        }

        checkoutJob?.cancel()
        _uiState.update { current ->
            current.copy(
                isCheckoutConfirming = true,
                checkoutErrorMessage = null,
                errorMessage = null,
                canRetry = false,
            )
        }
        checkoutJob = viewModelScope.launch {
            orderRepository.confirmMockCheckout().fold(
                onSuccess = { result ->
                    val refreshedCart = cartRepository.getCart()
                    _uiState.update { current ->
                        current
                            .applyCartContentResult(refreshedCart)
                            .copy(
                                checkoutDraft = null,
                                isCheckoutConfirming = false,
                                isCheckoutDraftLoading = false,
                                checkoutErrorMessage = null,
                                operationMessage = "模拟订单 ${result.orderNumber} 已生成，合计 ${result.totalText}"
                                    .toOperationMessage(),
                            )
                    }
                },
                onFailure = { error ->
                    val message = error.toCheckoutDisplayMessage()
                    _uiState.update { current ->
                        current.copy(
                            isCheckoutConfirming = false,
                            checkoutErrorMessage = message,
                            operationMessage = message.toOperationMessage(),
                        )
                    }
                },
            )
        }
    }

    fun consumeOperationMessage(messageId: Long) {
        _uiState.update { state ->
            if (state.operationMessage?.id == messageId) {
                state.copy(operationMessage = null)
            } else {
                state
            }
        }
    }

    private fun loadCart() {
        loadJob?.cancel()
        _uiState.update { state ->
            state.copy(
                isLoading = state.items.isEmpty(),
                isRefreshing = state.items.isNotEmpty(),
                errorMessage = null,
                canRetry = false,
            )
        }
        loadJob = viewModelScope.launch {
            applyCartResult(cartRepository.getCart())
        }
    }

    private fun runCartOperation(
        operationItemId: String,
        successMessage: String? = null,
        block: suspend () -> Result<CartContentUi>,
    ) {
        if (_uiState.value.operationInFlightItemId != null) {
            return
        }
        operationJob?.cancel()
        _uiState.update { state ->
            state.copy(
                errorMessage = null,
                canRetry = false,
                operationInFlightItemId = operationItemId,
            )
        }
        operationJob = viewModelScope.launch {
            applyCartResult(
                result = block(),
                successMessage = successMessage,
            )
        }
    }

    private fun applyCartResult(
        result: Result<CartContentUi>,
        successMessage: String? = null,
    ) {
        _uiState.update { state ->
            result.fold(
                onSuccess = { content ->
                    state.copy(
                        items = content.items,
                        summary = content.summary,
                        isLoading = false,
                        isRefreshing = false,
                        errorMessage = null,
                        canRetry = false,
                        operationInFlightItemId = null,
                        isSelectAllInFlight = false,
                        operationMessage = successMessage?.toOperationMessage(),
                    )
                },
                onFailure = { error ->
                    val displayMessage = error.toDisplayMessage()
                    state.copy(
                        isLoading = false,
                        isRefreshing = false,
                        errorMessage = displayMessage,
                        canRetry = error is CartOperationError.NetworkFailure,
                        operationInFlightItemId = null,
                        isSelectAllInFlight = false,
                        operationMessage = successMessage?.let {
                            displayMessage.toOperationMessage()
                        },
                    )
                },
            )
        }
    }

    private fun String.toOperationMessage(): CartOperationMessage {
        operationMessageSequence += 1
        return CartOperationMessage(
            id = operationMessageSequence,
            text = this,
        )
    }

    private companion object {
        private const val ADD_OPERATION_ID = "cart-add-operation"
        private const val MAX_CART_QUANTITY = 99
    }
}

private fun CartUiState.applyCartContentResult(
    result: Result<CartContentUi>,
): CartUiState =
    result.fold(
        onSuccess = { content ->
            copy(
                items = content.items,
                summary = content.summary,
                isLoading = false,
                isRefreshing = false,
                errorMessage = null,
                canRetry = false,
                operationInFlightItemId = null,
                isSelectAllInFlight = false,
            )
        },
        onFailure = { error ->
            copy(
                isLoading = false,
                isRefreshing = false,
                errorMessage = error.toDisplayMessage(),
                canRetry = error is CartOperationError.NetworkFailure,
                operationInFlightItemId = null,
                isSelectAllInFlight = false,
            )
        },
    )

private fun Throwable.toDisplayMessage(): String =
    when (this) {
        CartOperationError.InvalidProductId -> "商品信息不完整，暂时无法加入购物车。"
        CartOperationError.InvalidCartItemId,
        CartOperationError.CartItemNotFound -> "购物车商品已变化，请刷新后再试。"

        CartOperationError.InvalidRequest -> "购物车请求格式不正确，请重试。"
        CartOperationError.ProductNotFound -> "商品不存在或已下架。"
        CartOperationError.ProductUnavailable -> "商品当前不可加购。"
        is CartOperationError.NetworkFailure -> "无法连接购物车服务，请确认后端正在运行。"
        CartOperationError.ParseFailure -> "购物车数据格式异常。"
        else -> "暂时无法更新购物车。"
    }

private fun Throwable.toCheckoutDisplayMessage(): String =
    when (this) {
        OrderOperationError.EmptyCart -> "购物车没有可结算商品。"
        OrderOperationError.Expired -> "待确认订单已过期，请重新结算。"
        OrderOperationError.CartChanged -> "购物车商品已变化，请刷新后再试。"
        OrderOperationError.ProductUnavailable -> "部分商品当前不可结算。"
        OrderOperationError.InvalidRequest -> "模拟结算请求无效，请重新结算。"
        OrderOperationError.ParseFailure -> "模拟订单数据格式异常。"
        is OrderOperationError.NetworkFailure -> "无法连接订单服务，请确认后端正在运行。"
        else -> "暂时无法创建模拟订单。"
    }
