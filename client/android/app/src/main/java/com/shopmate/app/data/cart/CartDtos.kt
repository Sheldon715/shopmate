package com.shopmate.app.data.cart

import kotlinx.serialization.Serializable

@Serializable
data class CartApiResponseDto<T>(
    val success: Boolean,
    val data: T? = null,
    val error: CartApiErrorDto? = null,
)

@Serializable
data class CartApiErrorDto(
    val code: String,
    val message: String,
)

@Serializable
data class CartDto(
    val items: List<CartItemDto> = emptyList(),
    val summary: CartSummaryDto = CartSummaryDto(),
)

@Serializable
data class CartSummaryDto(
    val totalCount: Int = 0,
    val selectedCount: Int = 0,
    val selectedTotalCents: Int = 0,
    val currency: String = "CNY",
)

@Serializable
data class CartItemDto(
    val id: String,
    val productId: String,
    val name: String,
    val brand: String? = null,
    val category: String? = null,
    val priceCents: Int = 0,
    val priceText: String = "",
    val quantity: Int = 1,
    val selected: Boolean = true,
    val subtotalCents: Int = 0,
    val available: Boolean = true,
    val tags: List<String> = emptyList(),
)

@Serializable
data class AddCartItemRequestDto(
    val productId: String,
    val quantity: Int = 1,
)

@Serializable
data class PatchCartItemRequestDto(
    val quantity: Int? = null,
    val selected: Boolean? = null,
)

@Serializable
data class SelectAllCartItemsRequestDto(
    val selected: Boolean,
)
