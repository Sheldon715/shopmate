package com.shopmate.app.ui.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shopmate.app.data.cart.CartOperationError
import com.shopmate.app.data.cart.CartRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CartViewModel(
    private val cartRepository: CartRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CartUiState(isLoading = true))
    val uiState: StateFlow<CartUiState> = _uiState.asStateFlow()

    private var loadJob: Job? = null
    private var operationJob: Job? = null
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
