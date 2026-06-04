package com.shopmate.app.ui.comparison

import com.shopmate.app.ui.model.ComparisonHighlightUi
import com.shopmate.app.ui.model.ProductCardUi
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Test

class ProductComparisonScreenTest {
    @Test
    fun comparisonHighlightsStayEmptyWithoutGeneratedHighlights() {
        val items = comparisonHighlightDisplayItems(
            highlights = emptyList(),
            products = listOf(
                product(id = "product_001"),
                product(id = "product_002"),
            ),
        )

        assertTrue(items.isEmpty())
    }

    @Test
    fun comparisonHighlightsUseOnlyMatchingGeneratedHighlights() {
        val items = comparisonHighlightDisplayItems(
            highlights = listOf(
                highlight(productId = "product_002", text = "更适合户外长时间防晒。"),
                highlight(productId = "product_999", text = "不在当前对比商品中。"),
                highlight(productId = "product_001", text = ""),
            ),
            products = listOf(
                product(id = "product_001"),
                product(id = "product_002"),
            ),
        )

        assertEquals(1, items.size)
        assertEquals("product_002", items.single().product.id)
        assertEquals(2, items.single().productIndex)
        assertEquals("更适合户外长时间防晒。", items.single().highlight.text)
    }

    private fun product(id: String): ProductCardUi =
        ProductCardUi(
            id = id,
            name = id,
            priceText = "¥100",
            imageRes = 0,
            tags = emptyList(),
            recommendationReason = "推荐理由：品牌 · 类目，当前可选。",
        )

    private fun highlight(
        productId: String,
        text: String,
    ): ComparisonHighlightUi =
        ComparisonHighlightUi(
            productId = productId,
            label = "亮点",
            text = text,
        )
}
