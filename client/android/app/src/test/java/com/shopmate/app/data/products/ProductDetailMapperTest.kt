package com.shopmate.app.data.products

import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Test

class ProductDetailMapperTest {
    @Test
    fun mapsProductDetailDtoToUiModel() {
        val ui = productDto().toProductDetailUi()

        assertEquals("product_001", ui.id)
        assertEquals("通勤蓝牙耳机 A", ui.name)
        assertEquals("¥179-219", ui.priceText)
        assertEquals("数码电子 / 耳机", ui.categoryText)
        assertEquals("示例品牌", ui.brandText)
        assertEquals(listOf("通勤", "蓝牙", "轻巧", "办公"), ui.tags)
        assertEquals("续航", ui.specs.first().label)
        assertEquals("20h", ui.specs.first().value)
        assertTrue(ui.highlights.contains("续航稳定"))
        assertTrue(ui.suitedForText.contains("通勤"))
        assertTrue(ui.suitedForText.contains("强降噪"))
    }

    @Test
    fun mapperUsesConservativeFallbacksForMissingOptionalFields() {
        val ui = ProductDetailDto(
            id = "product_missing",
            name = "",
            priceCents = 0,
        ).toProductDetailUi()

        assertEquals("未命名商品", ui.name)
        assertEquals("价格待确认", ui.priceText)
        assertEquals("商品", ui.categoryText)
        assertEquals("品牌信息待补充", ui.brandText)
        assertEquals("暂无详细说明", ui.description)
        assertEquals(listOf("暂无更多商品亮点"), ui.highlights)
    }

    private fun productDto(): ProductDetailDto =
        ProductDetailDto(
            id = "product_001",
            name = "通勤蓝牙耳机 A",
            brand = "示例品牌",
            category = "数码电子",
            subCategory = "耳机",
            priceCents = 19900,
            priceRangeCents = PriceRangeCentsDto(min = 17900, max = 21900),
            currency = "CNY",
            tags = listOf("通勤", "蓝牙", "轻巧", "办公", "长续航"),
            available = true,
            marketingDescription = "适合通勤和日常使用。",
            attributes = mapOf("续航" to listOf("20h")),
            pros = listOf("续航稳定"),
            recommendWhen = listOf("通勤"),
            avoidWhen = listOf("需要强降噪"),
        )
}
