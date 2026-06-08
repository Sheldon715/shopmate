package com.shopmate.app.ui.cart

import com.shopmate.app.ui.checkout.CheckoutDraftUi
import com.shopmate.app.ui.model.CartItemUi
import com.shopmate.app.ui.model.ProductAddCartState

data class CartUiState(
    val items: List<CartItemUi> = emptyList(),
    val summary: CartSummaryUi = CartSummaryUi(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val canRetry: Boolean = false,
    val operationInFlightItemId: String? = null,
    val isSelectAllInFlight: Boolean = false,
    val operationMessage: CartOperationMessage? = null,
    val productAddCartStates: Map<String, ProductAddCartState> = emptyMap(),
    val productBuyNowStates: Map<String, ProductAddCartState> = emptyMap(),
    val checkoutDraft: CheckoutDraftUi? = null,
    val isCheckoutDraftLoading: Boolean = false,
    val checkoutErrorMessage: String? = null,
)

data class CartOperationMessage(
    val id: Long,
    val text: String,
)

data class CartSummaryUi(
    val totalCount: Int = 0,
    val selectedCount: Int = 0,
    val selectedTotalCents: Int = 0,
    val selectedTotalText: String = "¥0",
    val currency: String = "CNY",
)

data class CartContentUi(
    val items: List<CartItemUi>,
    val summary: CartSummaryUi,
)
