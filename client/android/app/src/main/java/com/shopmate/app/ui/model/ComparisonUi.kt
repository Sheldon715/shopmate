package com.shopmate.app.ui.model

data class ComparisonUi(
    val id: String,
    val queryText: String,
    val assistantText: String,
    val products: List<ProductCardUi>,
    val rows: List<ComparisonRowUi>,
    val recommendedProductId: String,
    val summaryText: String
)

data class ComparisonRowUi(
    val label: String,
    val firstProductValue: String,
    val secondProductValue: String,
    val highlightedProductId: String? = null
)
