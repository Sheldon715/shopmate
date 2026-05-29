package com.shopmate.app.data.products

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Test

class ProductDetailMapperTest {
    @Test
    fun mapsProductDetailDtoToPolishedUiModel() {
        val ui = productDto().toProductDetailUi()

        assertEquals("product_001", ui.id)
        assertEquals("通勤蓝牙耳机 A", ui.name)
        assertEquals("¥179-219", ui.priceText)
        assertEquals("数码电子 / 耳机", ui.categoryText)
        assertEquals("示例品牌", ui.brandText)
        assertEquals(listOf("通勤", "蓝牙", "轻巧", "办公"), ui.tags)
        assertTrue(ui.recommendationReason.contains("通勤"))
        assertFalse(ui.recommendationReason.contains(ui.highlights.first()))
        assertTrue(ui.highlights.contains("续航稳定"))
        assertTrue(ui.highlights.contains("半入耳轻盈"))
        assertTrue(ui.suitedForText.contains("适合通勤"))
        assertTrue(ui.suitedForText.contains("强降噪"))
    }

    @Test
    fun filtersTemplateAndCautionCopyOutOfHighlights() {
        val ui = beautyDto().toProductDetailUi()

        assertFalse(ui.recommendationReason.contains("可以结合价格、规格和注意事项继续比较"))
        assertFalse(ui.highlights.any { value -> value.contains("功效描述明确") })
        assertFalse(ui.highlights.any { value -> value.contains("适用场景清楚") })
        assertFalse(ui.highlights.any { value -> value.contains("不应替代医疗建议") })
        assertFalse(ui.highlights.any { value -> value.contains("过敏") })
        assertFalse(ui.recommendationReason.contains(ui.highlights.first()))
        assertTrue(ui.highlights.any { value -> value.contains("夜间肌底修护") })
        assertTrue(ui.suitedForText.contains("局部测试") || ui.suitedForText.contains("过敏"))
    }

    @Test
    fun mapsReadableAttributesAndSkuSummaryToSpecs() {
        val ui = productDto().toProductDetailUi()

        assertEquals("适用人群", ui.specs[0].label)
        assertEquals("通勤 / 办公", ui.specs[0].value)
        assertEquals("使用场景", ui.specs[1].label)
        assertEquals("通勤 / 办公", ui.specs[1].value)
        assertEquals("规格", ui.specs[2].label)
        assertEquals("标准版 / 续航版", ui.specs[2].value)
        assertEquals("品牌", ui.specs[3].label)
        assertEquals("示例品牌", ui.specs[3].value)
    }

    @Test
    fun keepsCautionAttributesOutOfSpecs() {
        val ui = beautyDto().toProductDetailUi()

        assertFalse(ui.specs.any { spec -> spec.label == "注意事项" })
        assertFalse(ui.specs.any { spec -> spec.label == "不适合" })
        assertFalse(ui.specs.any { spec -> spec.value.contains("医疗") })
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
        assertTrue(ui.recommendationReason.contains("可以结合价格、规格和适用场景继续比较"))
    }

    @Test
    fun trimsLongHighlights() {
        val ui = productDto(
            pros = listOf("这是一段非常非常非常非常长的真实商品优势文案应该被截短"),
            recommendWhen = emptyList(),
            attributes = emptyMap(),
        ).toProductDetailUi()

        assertTrue(ui.highlights.isNotEmpty())
        assertTrue(ui.highlights.all { highlight -> highlight.length <= 34 })
    }

    @Test
    fun avoidsDanglingParenthesesWhenShorteningCopy() {
        val ui = beautyDto().copy(
            marketingDescription = "玉兰油新生塑颜金纯面霜（大红瓶）是针对25+初老肌的面霜。核心成分含高浓度烟酰胺与五胜肽（Pal-KTTKS），帮助提亮肤色。烟酰胺助力提亮肤色、促进胶原蛋白生成。",
            attributes = mapOf(
                "适用人群" to listOf("初老肌用户", "关注纹路改善的人群"),
                "使用场景" to listOf("日常护理", "抗老护理"),
                "核心卖点" to emptyList(),
            ),
            pros = emptyList(),
            recommendWhen = emptyList(),
        ).toProductDetailUi()

        val displayCopies = listOf(ui.recommendationReason) + ui.highlights + ui.specs.map { spec -> spec.value }
        assertTrue(displayCopies.none { value -> value.contains("（") && !value.contains("）") })
        assertTrue(displayCopies.none { value -> value.contains("(") && !value.contains(")") })
        assertTrue(ui.highlights.any { value -> value.contains("五胜肽") })
    }

    private fun productDto(
        pros: List<String> = listOf("续航稳定", "半入耳轻盈"),
        recommendWhen: List<String> = listOf("通勤"),
        attributes: Map<String, List<String>> = mapOf(
            "适用人群" to listOf("通勤用户", "办公用户"),
            "使用场景" to listOf("通勤", "办公"),
            "核心卖点" to listOf("续航稳定", "半入耳轻盈"),
            "不适合" to listOf("需要强降噪"),
            "注意事项" to listOf("购买前确认佩戴方式"),
        ),
    ): ProductDetailDto =
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
            marketingDescription = "适合通勤和日常使用。轻巧佩戴，通话清晰。",
            skus = listOf(
                ProductSkuDto(
                    skuId = "sku_001",
                    attributes = mapOf("版本" to "标准版"),
                ),
                ProductSkuDto(
                    skuId = "sku_002",
                    attributes = mapOf("版本" to "续航版"),
                ),
            ),
            attributes = attributes,
            pros = pros,
            recommendWhen = recommendWhen,
            avoidWhen = listOf("需要强降噪"),
        )

    private fun beautyDto(): ProductDetailDto =
        ProductDetailDto(
            id = "beauty_001",
            name = "雅诗兰黛特润修护肌活精华露",
            brand = "雅诗兰黛",
            category = "美妆护肤",
            subCategory = "精华",
            priceCents = 72000,
            tags = listOf("精华", "保湿"),
            available = true,
            marketingDescription = "雅诗兰黛特润修护肌活精华露是品牌经典单品，主打夜间肌底修护。搭配透明质酸锁水保湿，适合夜间护肤使用。敏感肌先做耳后测试，避免不适。",
            attributes = mapOf(
                "适用人群" to listOf("日常护肤用户", "关注肤感的人群"),
                "使用场景" to listOf("日常护理", "换季护理"),
                "核心卖点" to listOf("功效描述明确", "适用场景清楚", "便于按肤质筛选"),
                "不适合" to listOf("对相关成分过敏的人群", "希望获得医疗效果的用户"),
                "注意事项" to listOf("敏感肌建议先做局部测试，不应替代医疗建议"),
            ),
            pros = listOf("功效描述明确", "适用场景清楚"),
            cons = listOf("对相关成分过敏的人群", "敏感肌建议先做局部测试，不应替代医疗建议"),
            recommendWhen = listOf("功效描述明确", "适用场景清楚"),
            avoidWhen = listOf("对相关成分过敏的人群", "希望获得医疗效果的用户"),
        )
}
