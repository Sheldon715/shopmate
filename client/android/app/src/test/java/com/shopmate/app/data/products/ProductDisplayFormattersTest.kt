package com.shopmate.app.data.products

import com.shopmate.app.R
import kotlin.test.assertEquals
import org.junit.Test

class ProductDisplayFormattersTest {
    @Test
    fun formatsCnyAndNonCnyPriceRanges() {
        assertEquals(
            "¥179-219.50",
            formatProductPriceRangeText(
                priceCents = 19900,
                minPriceCents = 17900,
                maxPriceCents = 21950,
                currency = "CNY",
            ),
        )
        assertEquals(
            "USD 9.99-19.99",
            formatProductPriceRangeText(
                priceCents = 1299,
                minPriceCents = 999,
                maxPriceCents = 1999,
                currency = "usd",
            ),
        )
    }

    @Test
    fun keepsZeroPriceFallbackOptional() {
        assertEquals(
            "价格待确认",
            formatProductPriceRangeText(
                priceCents = 0,
                minPriceCents = null,
                maxPriceCents = null,
                currency = "CNY",
                unavailableText = "价格待确认",
            ),
        )
        assertEquals("¥0", formatCnyCentsText(0))
    }

    @Test
    fun resolvesKnownProductPlaceholders() {
        assertEquals(
            R.drawable.product_redmi_buds_4,
            resolveProductPlaceholder(listOf("Apple AirPods")),
        )
        assertEquals(
            R.drawable.product_qcy_t13_x,
            resolveProductPlaceholder(listOf("QCY T13 X")),
        )
        assertEquals(
            R.drawable.product_zero_air,
            resolveProductPlaceholder(listOf("数码电子", "digital/images/product_001.png")),
        )
        assertEquals(
            R.drawable.mascot_assistant,
            resolveProductPlaceholder(listOf("保湿面霜")),
        )
    }
}
