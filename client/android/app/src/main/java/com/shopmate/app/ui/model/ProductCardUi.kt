package com.shopmate.app.ui.model

data class ProductCardUi(
    val id: String,
    val name: String,
    val priceText: String,
    val imageRes: Int,
    val tags: List<String>,
    val recommendationReason: String
)
