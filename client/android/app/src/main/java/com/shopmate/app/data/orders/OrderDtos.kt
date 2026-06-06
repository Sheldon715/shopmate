package com.shopmate.app.data.orders

import kotlinx.serialization.Serializable

@Serializable
data class OrderApiResponseDto<T>(
    val success: Boolean,
    val data: T? = null,
    val error: OrderApiErrorDto? = null,
)

@Serializable
data class OrderApiErrorDto(
    val code: String,
    val message: String,
)

@Serializable
data class MockCheckoutRequestDto(
    val conversationId: String,
)

@Serializable
data class MockCheckoutDraftResponseDto(
    val draft: MockCheckoutDraftDto,
    val checkoutAction: MockCheckoutActionDto,
)

@Serializable
data class MockCheckoutConfirmResponseDto(
    val order: OrderDto,
    val checkoutAction: MockCheckoutActionDto,
)

@Serializable
data class MockCheckoutCancelResponseDto(
    val checkoutAction: MockCheckoutActionDto,
)

@Serializable
data class MockCheckoutActionDto(
    val type: String,
    val status: String,
    val draftId: String? = null,
    val orderId: String? = null,
    val orderNumber: String? = null,
    val selectedCount: Int? = null,
    val totalCents: Int? = null,
    val address: MockCheckoutAddressDto? = null,
    val cartRefreshRequired: Boolean? = null,
)

@Serializable
data class MockCheckoutDraftDto(
    val id: String,
    val conversationId: String,
    val address: MockCheckoutAddressDto,
    val summary: MockCheckoutSummaryDto,
    val expiresAt: String,
)

@Serializable
data class MockCheckoutSummaryDto(
    val itemCount: Int = 0,
    val selectedCount: Int = 0,
    val subtotalCents: Int = 0,
    val shippingFeeCents: Int = 0,
    val totalCents: Int = 0,
    val currency: String = "CNY",
)

@Serializable
data class MockCheckoutAddressDto(
    val label: String,
    val recipient: String,
    val phoneMasked: String,
    val fullAddress: String,
)

@Serializable
data class OrderDto(
    val id: String,
    val orderNumber: String,
    val status: String,
    val currency: String = "CNY",
    val subtotalCents: Int = 0,
    val shippingFeeCents: Int = 0,
    val totalCents: Int = 0,
    val shippingAddress: MockCheckoutAddressDto,
    val source: String,
    val createdAt: String,
    val items: List<OrderItemDto> = emptyList(),
)

@Serializable
data class OrderItemDto(
    val id: String,
    val productId: String,
    val productName: String,
    val brand: String,
    val category: String,
    val unitPriceCents: Int,
    val quantity: Int,
    val subtotalCents: Int,
    val imagePath: String? = null,
)
