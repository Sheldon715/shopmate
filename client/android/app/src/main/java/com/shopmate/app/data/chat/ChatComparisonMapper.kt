package com.shopmate.app.data.chat

import com.shopmate.app.ui.model.ComparisonCellUi
import com.shopmate.app.ui.model.ComparisonHighlightUi
import com.shopmate.app.ui.model.ComparisonRowUi
import com.shopmate.app.ui.model.ComparisonUi
import com.shopmate.app.ui.model.ProductCardUi

fun ChatComparisonResultDto.toComparisonUi(
    products: List<ProductCardUi>,
    assistantText: String,
): ComparisonUi? {
    val productsById = products.associateBy { product -> product.id }
    val normalizedProductIds = productIds
        .map { productId -> productId.trim() }
        .filter { productId -> productId.isNotBlank() }
        .distinct()
    if (normalizedProductIds.size != COMPARISON_PRODUCT_COUNT) {
        return null
    }

    val comparisonProducts = normalizedProductIds.mapNotNull { productId -> productsById[productId] }
    if (comparisonProducts.size != COMPARISON_PRODUCT_COUNT) {
        return null
    }
    val productIdSet = comparisonProducts.map { product -> product.id }.toSet()
    val rows = dimensions.mapNotNull { dimension ->
        val cells = comparisonProducts.mapNotNull { product ->
            dimension.cells
                .firstOrNull { cell -> cell.productId == product.id }
                ?.takeIf { cell -> cell.value.isNotBlank() }
                ?.let { cell ->
                    ComparisonCellUi(
                        productId = cell.productId,
                        value = cell.value,
                        highlighted = cell.highlight,
                    )
                }
        }

        if (cells.size == comparisonProducts.size && dimension.label.isNotBlank()) {
            ComparisonRowUi(
                id = dimension.id.ifBlank { dimension.label },
                label = dimension.label,
                cells = cells,
            )
        } else {
            null
        }
    }
    val summary = conclusion.ifBlank { assistantText }

    if (rows.isEmpty() || summary.isBlank()) {
        return null
    }

    return ComparisonUi(
        id = id,
        queryText = query,
        assistantText = assistantText,
        title = title.ifBlank { "商品对比详情" },
        products = comparisonProducts,
        rows = rows,
        recommendedProductId = recommendedProductId?.takeIf(productIdSet::contains),
        summaryText = summary,
        highlights = highlights.mapNotNull { highlight ->
            if (
                highlight.productId in productIdSet &&
                highlight.label.isNotBlank() &&
                highlight.text.isNotBlank()
            ) {
                ComparisonHighlightUi(
                    productId = highlight.productId,
                    label = highlight.label,
                    text = highlight.text,
                )
            } else {
                null
            }
        },
    )
}

private const val COMPARISON_PRODUCT_COUNT = 2
