package com.shopmate.app.ui.checkout

internal const val CHECKOUT_DEMO_REGION = "ShopMate 演示配送区"

data class CheckoutUiState(
    val draft: CheckoutDraftUi? = null,
    val editableShipping: CheckoutShippingInputUi = CheckoutShippingInputUi(),
    val addressMode: CheckoutAddressModeUi = CheckoutAddressModeUi.Summary,
    val savedAddresses: List<CheckoutSavedAddressUi> = emptyList(),
    val selectedAddressId: String? = null,
    val addressForm: CheckoutAddressFormUi = CheckoutAddressFormUi(),
    val editingAddressId: String? = null,
    val selectedDeliveryMethodType: String? = null,
    val selectedPaymentMethodType: String? = null,
    val isSubmitting: Boolean = false,
    val fieldErrors: CheckoutFieldErrorsUi = CheckoutFieldErrorsUi(),
    val errorMessage: String? = null,
    val orderResult: CheckoutOrderResultUi? = null,
)

data class CheckoutDraftUi(
    val id: String,
    val conversationId: String,
    val items: List<CheckoutItemUi>,
    val summary: CheckoutSummaryUi,
    val address: CheckoutAddressUi,
    val deliveryOptions: List<CheckoutDeliveryMethodUi>,
    val paymentOptions: List<CheckoutPaymentMethodUi>,
    val expiresAt: String,
)

data class CheckoutItemUi(
    val cartItemId: String,
    val productId: String,
    val productName: String,
    val brand: String,
    val category: String,
    val unitPriceText: String,
    val unitPriceCents: Int,
    val quantity: Int,
    val subtotalText: String,
    val subtotalCents: Int,
    val imageUrl: String?,
)

data class CheckoutSummaryUi(
    val itemCount: Int = 0,
    val selectedCount: Int = 0,
    val subtotalText: String = "¥0",
    val subtotalCents: Int = 0,
    val shippingFeeText: String = "¥0",
    val shippingFeeCents: Int = 0,
    val totalText: String = "¥0",
    val totalCents: Int = 0,
    val currency: String = "CNY",
)

data class CheckoutAddressUi(
    val label: String,
    val recipient: String,
    val phoneMasked: String,
    val fullAddress: String,
)

data class CheckoutShippingInputUi(
    val recipient: String = "",
    val phone: String = "",
    val fullAddress: String = "",
)

enum class CheckoutAddressModeUi {
    Summary,
    Edit,
    Book,
}

data class CheckoutSavedAddressUi(
    val id: String,
    val recipient: String,
    val phone: String,
    val phoneMasked: String,
    val fullAddress: String,
    val region: String,
    val tag: String,
    val isDefault: Boolean = false,
)

data class CheckoutAddressFormUi(
    val recipient: String = "",
    val phone: String = "",
    val fullAddress: String = "",
    val region: String = CHECKOUT_DEMO_REGION,
    val tag: String = "公司",
)

data class CheckoutFieldErrorsUi(
    val recipient: String? = null,
    val phone: String? = null,
    val fullAddress: String? = null,
    val deliveryMethod: String? = null,
    val paymentMethod: String? = null,
)

data class CheckoutDeliveryMethodUi(
    val type: String,
    val label: String,
    val feeText: String,
    val feeCents: Int,
    val etaText: String,
)

data class CheckoutPaymentMethodUi(
    val type: String,
    val label: String,
)

data class CheckoutOrderResultUi(
    val orderId: String,
    val orderNumber: String,
    val displayOrderNumber: String,
    val totalText: String,
    val totalCents: Int,
)

val CheckoutUiState.selectedDeliveryMethod: CheckoutDeliveryMethodUi?
    get() = draft?.deliveryOptions?.firstOrNull { option ->
        option.type == selectedDeliveryMethodType
    }

val CheckoutUiState.selectedPaymentMethod: CheckoutPaymentMethodUi?
    get() = draft?.paymentOptions?.firstOrNull { option ->
        option.type == selectedPaymentMethodType
    }

val CheckoutUiState.estimatedTotalCents: Int
    get() = (draft?.summary?.subtotalCents ?: 0) +
        (selectedDeliveryMethod?.feeCents ?: draft?.summary?.shippingFeeCents ?: 0)

val CheckoutUiState.estimatedTotalText: String
    get() = estimatedTotalCents.toCheckoutPriceText()

fun Int.toCheckoutPriceText(): String {
    val whole = this / 100
    val cents = this % 100

    return if (cents == 0) {
        "¥$whole"
    } else {
        "¥$whole.${cents.toString().padStart(2, '0')}"
    }
}
