package com.shopmate.app.data.cart

import kotlin.test.assertEquals
import org.junit.Test

class CartMapperTest {
    @Test
    fun mapsUnitPriceSubtotalAndSummarySeparately() {
        val ui = CartDto(
            items = listOf(
                CartItemDto(
                    id = "cart-item-1",
                    productId = "product_001",
                    name = "小熊多功能早餐机",
                    brand = "小熊",
                    category = "家用电器",
                    priceCents = 26900,
                    priceText = "¥269",
                    quantity = 4,
                    subtotalCents = 107600,
                    selected = true,
                    tags = listOf("家用电器", "厨房小电"),
                ),
            ),
            summary = CartSummaryDto(
                totalCount = 4,
                selectedCount = 4,
                selectedTotalCents = 107600,
            ),
        ).toCartContentUi()

        val item = ui.items.single()
        assertEquals("¥269", item.product.priceText)
        assertEquals("¥1076", item.subtotalText)
        assertEquals("¥1076", ui.summary.selectedTotalText)
        assertEquals(107600, ui.summary.selectedTotalCents)
    }
}
