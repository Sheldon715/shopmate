package com.shopmate.app.ui.model

data class ProductDetailUi(
    val id: String,
    val name: String,
    val priceText: String,
    val imageRes: Int,
    val categoryText: String,
    val brandText: String,
    val tags: List<String>,
    val recommendationReason: String,
    val description: String,
    val highlights: List<String>
)
