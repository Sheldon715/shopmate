package com.shopmate.app.ui.model

data class ComparisonUi(
    val id: String,
    val queryText: String,
    val assistantText: String,
    val title: String,
    val products: List<ProductCardUi>,
    val rows: List<ComparisonRowUi>,
    val recommendedProductId: String?,
    val summaryText: String,
    val highlights: List<ComparisonHighlightUi> = emptyList()
)

data class ComparisonRowUi(
    val id: String,
    val label: String,
    val cells: List<ComparisonCellUi>
)

data class ComparisonCellUi(
    val productId: String,
    val value: String,
    val highlighted: Boolean = false
)

data class ComparisonHighlightUi(
    val productId: String,
    val label: String,
    val text: String
)
