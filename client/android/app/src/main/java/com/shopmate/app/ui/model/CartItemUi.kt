package com.shopmate.app.ui.model

data class CartItemUi(
    val id: String,
    val product: ProductCardUi,
    val quantity: Int,
    val subtotalText: String,
    val selected: Boolean = true,
    val available: Boolean = true,
)
