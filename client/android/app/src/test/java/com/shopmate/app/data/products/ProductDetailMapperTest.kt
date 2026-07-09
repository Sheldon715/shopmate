package com.shopmate.app.data.products

import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.ui.model.ProductDetailSpecUi
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Test

class ProductDetailMapperTest {
    @Test
    fun mapsAiGeneratedProductDetailDisplayFieldsToUiModel() {
        val ui = productDto().toProductDetailUi()

        assertEquals("product_001", ui.id)
        assertEquals("漫步者 Zero Air", ui.name)
        assertEquals("¥179-219", ui.priceText)
        assertEquals("数码电子 / 耳机", ui.categoryText)
        assertEquals("示例品牌", ui.brandText)
        assertEquals(listOf("半入耳", "通勤久戴", "通话清晰"), ui.tags)
        assertEquals("半入耳佩戴轻松，适合通勤和办公长时间使用。", ui.recommendationReason)
        assertEquals(listOf("通勤办公久戴不闷", "通话清晰度更稳"), ui.highlights)
        assertEquals("适合想要久戴轻松和日常通话的用户，如果更看重地铁深度降噪，可以比较高阶款。", ui.suitedForText)
        assertEquals(
            listOf(
                ProductDetailSpecUi("佩戴", "半入耳轻量"),
                ProductDetailSpecUi("场景", "通勤 / 办公"),
                ProductDetailSpecUi("通话", "清晰度更稳"),
                ProductDetailSpecUi("取舍", "弱于深度降噪"),
            ),
            ui.specs,
        )
    }

    @Test
    fun mapsProductImagePathToRemoteUrlWhenResolverIsProvided() {
        val ui = productDto().copy(
            imagePath = "digital/images/product_001.png",
        ).toProductDetailUi(
            ShopMateImageUrlResolver(ShopMateApiConfig("https://api.example.test/")),
        )

        assertEquals(
            "https://api.example.test/images/products/digital/images/product_001.png",
            ui.imageUrl,
        )
    }

    @Test
    fun filtersTemplateAndCautionCopyOutOfAiDisplayFields() {
        val error = assertFailsWith<IllegalStateException> {
            productDto(
                recommendationReason = "推荐理由：配置清晰，适合参数比较。",
                recommendationHighlights = listOf("SKU 选择较多", "通勤办公久戴不闷"),
                displayTags = listOf("数码电子", "通勤"),
                displaySpecs = listOf(
                    ProductDetailDisplaySpecDto("规格", "SKU 选择较多"),
                    ProductDetailDisplaySpecDto("场景", "通勤"),
                    ProductDetailDisplaySpecDto("注意", "不适合强降噪需求"),
                    ProductDetailDisplaySpecDto("品牌", "示例品牌"),
                ),
            ).toProductDetailUi()
        }

        assertTrue(error.message.orEmpty().contains("Product detail AI"))
    }

    @Test
    fun requiresAiRecommendationReasonForProductDetail() {
        assertFailsWith<IllegalStateException> {
            productDto(recommendationReason = null).toProductDetailUi()
        }
    }

    @Test
    fun requiresAiHighlightsForProductDetail() {
        assertFailsWith<IllegalStateException> {
            productDto(recommendationHighlights = emptyList()).toProductDetailUi()
        }
    }

    @Test
    fun requiresAiDisplayNameForProductDetail() {
        assertFailsWith<IllegalStateException> {
            productDto(displayName = null).toProductDetailUi()
        }
    }

    @Test
    fun requiresFourAiDisplaySpecsForProductDetail() {
        assertFailsWith<IllegalStateException> {
            productDto(
                displaySpecs = listOf(
                    ProductDetailDisplaySpecDto("佩戴", "半入耳轻量"),
                    ProductDetailDisplaySpecDto("场景", "通勤 / 办公"),
                ),
            ).toProductDetailUi()
        }
    }

    @Test
    fun keepsHardFactsFromBackendStructuredFields() {
        val ui = productDto(
            displayName = "AI 缩略耳机名",
            displayTags = listOf("差异标签"),
            recommendationReason = "推荐理由：AI 只写导购理由，不改价格品牌和品类。",
            recommendationHighlights = listOf("导购亮点来自 AI"),
            displaySpecs = listOf(
                ProductDetailDisplaySpecDto("人群", "学生通勤"),
                ProductDetailDisplaySpecDto("场景", "宿舍网课"),
                ProductDetailDisplaySpecDto("佩戴", "半入耳"),
                ProductDetailDisplaySpecDto("取舍", "弱于旗舰降噪"),
            ),
            suitabilityText = "适合学生通勤和宿舍网课，价格品牌仍以商品事实为准。",
        ).toProductDetailUi()

        assertEquals("AI 缩略耳机名", ui.name)
        assertEquals("¥179-219", ui.priceText)
        assertEquals("数码电子 / 耳机", ui.categoryText)
        assertEquals("示例品牌", ui.brandText)
    }

    @Test
    fun trimsLongAiDisplayCopiesAndAvoidsDanglingParentheses() {
        val ui = productDto(
            displayName = "这是一个非常非常非常非常长的 AI 商品名",
            recommendationHighlights = listOf(
                "这是一段非常非常非常非常长的真实商品优势文案应该被截短",
                "含五胜肽（Pal-KTTKS）",
            ),
            displaySpecs = listOf(
                ProductDetailDisplaySpecDto("核心亮点很长", "这是一段非常非常非常长的规格文案"),
                ProductDetailDisplaySpecDto("肤感", "水感轻薄不厚重"),
                ProductDetailDisplaySpecDto("场景", "通勤防晒"),
                ProductDetailDisplaySpecDto("取舍", "户外暴晒看高阶款"),
            ),
        ).toProductDetailUi()

        assertTrue(ui.name.length <= 22)
        assertTrue(ui.highlights.all { highlight -> highlight.length <= 34 })
        assertTrue(ui.specs.all { spec -> spec.label.length <= 8 && spec.value.length <= 32 })
        val displayCopies = listOf(ui.recommendationReason) + ui.highlights + ui.specs.map { spec -> spec.value }
        assertTrue(displayCopies.none { value -> value.contains("（") && !value.contains("）") })
        assertTrue(displayCopies.none { value -> value.contains("(") && !value.contains(")") })
    }

    @Test
    fun doesNotUseRawTagsOrAttributesAsFallbackWhenAiTagsAreMissing() {
        assertFailsWith<IllegalStateException> {
            productDto(
                displayTags = emptyList(),
                tags = listOf("通勤", "蓝牙"),
                attributes = mapOf(
                    "适用人群" to listOf("学生"),
                    "使用场景" to listOf("办公学习"),
                ),
            ).toProductDetailUi()
        }
    }

    @Test
    fun filtersBrandAndCategoryOutOfAiTagsAndSpecs() {
        val ui = productDto(
            displayTags = listOf("示例品牌", "数码电子", "半入耳"),
            displaySpecs = listOf(
                ProductDetailDisplaySpecDto("品牌", "示例品牌"),
                ProductDetailDisplaySpecDto("品类", "耳机"),
                ProductDetailDisplaySpecDto("佩戴", "半入耳轻量"),
                ProductDetailDisplaySpecDto("场景", "通勤 / 办公"),
                ProductDetailDisplaySpecDto("通话", "清晰度更稳"),
                ProductDetailDisplaySpecDto("取舍", "弱于深度降噪"),
            ),
        ).toProductDetailUi()

        assertEquals(listOf("半入耳"), ui.tags)
        assertEquals(
            listOf(
                ProductDetailSpecUi("品牌", "示例品牌"),
                ProductDetailSpecUi("佩戴", "半入耳轻量"),
                ProductDetailSpecUi("场景", "通勤 / 办公"),
                ProductDetailSpecUi("通话", "清晰度更稳"),
            ),
            ui.specs,
        )
        assertFalse(ui.tags.contains("示例品牌"))
        assertFalse(ui.tags.contains("数码电子"))
    }

    @Test
    fun allowsFactuallyCorrectBrandAndCategorySpecsFromAi() {
        val ui = productDto(
            brand = "苏泊尔",
            category = "家用电器",
            subCategory = "厨房小电",
            displayName = "苏泊尔智能电饭煲",
            displayTags = listOf("操作简单", "小家庭", "一人食", "早餐"),
            recommendationReason = "推荐理由：操作简单，适合小家庭和一人食，日常早餐制作更省心。",
            recommendationHighlights = listOf(
                "操作简单，容易上手",
                "适合早餐制作、一人食",
                "可选3L、4L规格",
            ),
            displaySpecs = listOf(
                ProductDetailDisplaySpecDto("品牌", "苏泊尔"),
                ProductDetailDisplaySpecDto("规格", "3L、4L可选"),
                ProductDetailDisplaySpecDto("适合", "小家庭/一人食"),
                ProductDetailDisplaySpecDto("注意", "功能偏基础"),
            ),
            suitabilityText = "适合租房党、小家庭和早餐需求用户，日常做饭以简单实用为主。",
        ).toProductDetailUi()

        assertEquals(
            listOf(
                ProductDetailSpecUi("品牌", "苏泊尔"),
                ProductDetailSpecUi("规格", "3L、4L可选"),
                ProductDetailSpecUi("适合", "小家庭/一人食"),
                ProductDetailSpecUi("注意", "功能偏基础"),
            ),
            ui.specs,
        )
    }

    @Test
    fun allowsCautionStyleAiSpecValuesForReminderLabels() {
        val ui = productDto(
            brand = "苏泊尔",
            category = "家用电器",
            subCategory = "厨房小电",
            displayName = "苏泊尔智能电饭煲",
            displayTags = listOf("操作简单", "一人食", "小家庭", "早餐"),
            recommendationReason = "推荐理由：主打操作简单，适合早餐和一人食场景。",
            recommendationHighlights = listOf(
                "操作简单，上手门槛低",
                "适合早餐制作和一人食",
                "可选3L、4L等规格",
            ),
            displaySpecs = listOf(
                ProductDetailDisplaySpecDto("容量", "可选3L、4L等"),
                ProductDetailDisplaySpecDto("适合", "小家庭、租房党"),
                ProductDetailDisplaySpecDto("场景", "早餐制作、一人食"),
                ProductDetailDisplaySpecDto("提醒", "功能偏基础，不适合复杂烹饪"),
            ),
            suitabilityText = "适合预算有限、空间不大、主要做早餐或一人食的人。",
        ).toProductDetailUi()

        assertTrue(ui.specs.any { spec ->
            spec.label == "提醒" && spec.value.contains("不适合复杂烹饪")
        })
    }

    @Test
    fun allowsLimitationStyleAiSpecValuesForConstraintLabels() {
        val ui = productDto(
            displayName = "小熊电炖盅",
            displayTags = listOf("一人食", "宿舍友好", "炖汤", "小容量"),
            recommendationReason = "推荐理由：适合炖汤和早餐制作，小容量更适合一人食。",
            recommendationHighlights = listOf(
                "适合炖汤、小容量",
                "更适合一人食早餐",
                "宿舍、租房场景友好",
            ),
            displaySpecs = listOf(
                ProductDetailDisplaySpecDto("容量", "可选1L、1.5L等"),
                ProductDetailDisplaySpecDto("场景", "早餐制作、一人食"),
                ProductDetailDisplaySpecDto("限制", "烹饪速度较慢"),
                ProductDetailDisplaySpecDto("建议", "结合预算、空间和频率"),
            ),
            suitabilityText = "适合一人食、早餐制作和宿舍租房场景。",
        ).toProductDetailUi()

        assertTrue(ui.specs.any { spec ->
            spec.label == "限制" && spec.value.contains("烹饪速度较慢")
        })
    }

    @Test
    fun allowsAiRecommendationReasonWithNormalTradeoffAdvice() {
        val ui = productDto(
            recommendationReason = "这款主打操作简单，适合小家庭、租房党和早餐需求用户，日常做早餐或一人食更合适。若是多人聚餐，建议先对比同类其他商品。",
            suitabilityText = "适合预算有限、空间不大、主要做早餐或一人食的人。若经常多人聚餐，建议优先对比更大容量的同类商品。",
        ).toProductDetailUi()

        assertTrue(ui.recommendationReason.contains("建议先对比同类其他商品"))
        assertTrue(ui.suitedForText.contains("建议优先对比更大容量"))
    }

    private fun productDto(
        name: String = "通勤蓝牙耳机 A",
        brand: String = "示例品牌",
        category: String = "数码电子",
        subCategory: String = "耳机",
        tags: List<String> = listOf("通勤", "蓝牙", "轻巧", "办公", "长续航"),
        recommendationReason: String? = "推荐理由：半入耳佩戴轻松，适合通勤和办公长时间使用。",
        recommendationHighlights: List<String> = listOf(
            "半入耳佩戴轻松",
            "通勤办公久戴不闷",
            "通话清晰度更稳",
        ),
        displayName: String? = "漫步者 Zero Air",
        displayTags: List<String> = listOf("半入耳", "通勤久戴", "通话清晰"),
        displaySpecs: List<ProductDetailDisplaySpecDto> = listOf(
            ProductDetailDisplaySpecDto("佩戴", "半入耳轻量"),
            ProductDetailDisplaySpecDto("场景", "通勤 / 办公"),
            ProductDetailDisplaySpecDto("通话", "清晰度更稳"),
            ProductDetailDisplaySpecDto("取舍", "弱于深度降噪"),
        ),
        suitabilityText: String? = "适合想要久戴轻松和日常通话的用户，如果更看重地铁深度降噪，可以比较高阶款。",
        marketingDescription: String = "适合通勤和日常使用。轻巧佩戴，通话清晰。",
        attributes: Map<String, List<String>> = mapOf(
            "适用人群" to listOf("通勤用户", "办公用户"),
            "使用场景" to listOf("通勤", "办公"),
            "核心卖点" to listOf("续航稳定", "半入耳轻盈"),
        ),
    ): ProductDetailDto =
        ProductDetailDto(
            id = "product_001",
            name = name,
            brand = brand,
            category = category,
            subCategory = subCategory,
            priceCents = 19900,
            priceRangeCents = PriceRangeCentsDto(min = 17900, max = 21900),
            currency = "CNY",
            tags = tags,
            available = true,
            recommendationReason = recommendationReason,
            marketingDescription = marketingDescription,
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
            recommendationHighlights = recommendationHighlights,
            displayName = displayName,
            displayTags = displayTags,
            displaySpecs = displaySpecs,
            suitabilityText = suitabilityText,
        )
}
