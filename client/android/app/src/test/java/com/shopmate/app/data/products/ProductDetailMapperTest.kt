package com.shopmate.app.data.products

import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateImageUrlResolver
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Test

class ProductDetailMapperTest {
    @Test
    fun mapsProductDetailDtoToPolishedUiModel() {
        val ui = productDto().toProductDetailUi()

        assertEquals("product_001", ui.id)
        assertEquals("通勤蓝牙耳机", ui.name)
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
    fun usesGroundedRecommendationReasonFromBackendWhenPresent() {
        val ui = productDto(
            recommendationReason = "推荐理由：适合学生党通勤训练，轻便耐穿。",
            pros = listOf("适合学生党通勤训练", "轻便耐穿", "鞋面透气"),
        ).toProductDetailUi()

        assertEquals("适合学生党通勤训练，轻便耐穿。", ui.recommendationReason)
        assertFalse(ui.recommendationReason.contains("推荐理由：推荐理由"))
        assertFalse(ui.recommendationReason.contains("示例品牌"))
        assertFalse(ui.highlights.any { value -> value.contains("适合学生党通勤训练") })
        assertFalse(ui.highlights.any { value -> value.contains("轻便耐穿") })
        assertTrue(ui.highlights.any { value -> value.contains("鞋面透气") })
    }

    @Test
    fun usesGeneratedRecommendationHighlightsFromBackendWhenPresent() {
        val ui = productDto(
            recommendationReason = "推荐理由：半入耳佩戴轻松，适合通勤办公久戴。",
            recommendationHighlights = listOf(
                "半入耳佩戴轻松",
                "通勤办公久戴不闷",
                "SKU 选择较多",
            ),
            pros = listOf("续航稳定", "半入耳轻盈"),
        ).toProductDetailUi()

        assertEquals(listOf("通勤办公久戴不闷"), ui.highlights)
    }

    @Test
    fun filtersDatasetHousekeepingCopyOutOfDetailRecommendationContent() {
        val dirtyCopies = listOf(
            "本数据集保留真实品牌与产品名",
            "便于后续查找对应商品图片和构建商品详情页",
            "导购信息经过脱敏和结构化整理",
            "价格、SKU、评论和 FAQ 为比赛数据集模拟内容，不代表实时售价或真实用户反馈",
        )
        val ui = productDto(
            recommendationReason = "推荐理由：适合炖汤，小容量，宿舍友好。",
            pros = dirtyCopies + listOf("适合炖汤", "小容量"),
            recommendWhen = listOf("适合炖汤", "小容量"),
            attributes = mapOf(
                "适用人群" to listOf("租房党", "早餐需求用户"),
                "使用场景" to listOf("早餐制作", "一人食"),
                "核心卖点" to dirtyCopies + listOf("适合炖汤", "小容量", "宿舍友好"),
            ),
            marketingDescription = "小熊 DDZ-C06A1 电炖盅 是真实品牌 小熊 旗下的家用电器/厨房小电商品，本数据集保留真实品牌与产品名，便于后续查找对应商品图片和构建商品详情页。导购信息经过脱敏和结构化整理，主要卖点包括适合炖汤、小容量、宿舍友好，适合早餐制作、一人食。价格、SKU、评论和 FAQ 为比赛数据集模拟内容，不代表实时售价或真实用户反馈。",
        ).toProductDetailUi()

        assertEquals("适合炖汤，小容量，宿舍友好。", ui.recommendationReason)
        val displayCopies = listOf(ui.recommendationReason, ui.description, ui.suitedForText) +
            ui.highlights +
            ui.specs.map { spec -> spec.value }
        dirtyCopies.forEach { dirtyCopy ->
            assertFalse(displayCopies.any { value -> value.contains(dirtyCopy) })
        }
        assertTrue(ui.highlights.any { value -> value.contains("早餐制作") || value.contains("一人食") })
    }

    @Test
    fun buildsDenseRecommendationReasonFromCleanMarketingCopyWhenBackendReasonIsMissing() {
        val ui = productDto(
            name = "小天鹅滚筒洗衣机",
            brand = "小天鹅",
            category = "家用电器",
            subCategory = "洗护电器",
            recommendationReason = null,
            pros = listOf("洗涤更柔和", "运行较安静", "小户型友好"),
            recommendWhen = listOf("日常洗衣", "小户型阳台"),
            attributes = mapOf(
                "适用人群" to listOf("家庭", "租房党"),
                "使用场景" to listOf("日常洗衣", "小户型阳台"),
                "核心卖点" to listOf("洗涤更柔和", "运行较安静", "小户型友好"),
            ),
            marketingDescription = "洗涤更柔和，运行较安静，适合家庭使用。支持日常洗衣和小户型阳台摆放。",
        ).toProductDetailUi()

        assertEquals("洗涤更柔和，运行较安静，适合家庭使用。", ui.recommendationReason)
        assertFalse(ui.recommendationReason.contains("时重点比较"))
        assertFalse(ui.recommendationReason.contains("推荐理由"))
        assertFalse(ui.highlights.any { highlight -> ui.recommendationReason.contains(highlight) })
    }

    @Test
    fun preservesLongGroundedRecommendationReasonFromBackend() {
        val reason = "推荐理由：适合油皮或混合皮在夏季使用，适合追求自然妆感的人群，50ml容量刚好满足日常通勤或短途旅行需求。"
        val ui = productDto(
            recommendationReason = reason,
            pros = listOf("专为易敏肌设计", "50ml容量适合通勤或短途旅行"),
            attributes = mapOf(
                "适用人群" to listOf("日常护肤用户", "关注肤感的人群"),
                "使用场景" to listOf("日常护理", "换季护理"),
                "核心卖点" to listOf("清爽控油", "轻薄不油腻"),
            ),
        ).toProductDetailUi()

        assertEquals(
            "适合油皮或混合皮在夏季使用，适合追求自然妆感的人群，50ml容量刚好满足日常通勤或短途旅行需求。",
            ui.recommendationReason,
        )
    }

    @Test
    fun mapsRawCatalogSeoTitleToConciseDetailDisplayNameAndFiltersTitleEchoHighlights() {
        val ui = productDto(
            name = "安热沙金灿倍护防晒乳高倍防水防汗清爽户外面部身体防晒",
            brand = "安热沙",
            category = "美妆护肤",
            subCategory = "防晒",
            recommendationReason = "推荐理由：适合户外爱好者、通勤族及易出汗人群，防水配方需用卸妆产品清洁。",
            pros = listOf("安热沙金灿倍护防晒乳", "遇水增强技术", "SPF50+ PA++++高倍防护"),
            recommendWhen = listOf("安热沙金灿倍护防晒乳", "户外通勤"),
            attributes = mapOf(
                "适用人群" to listOf("户外爱好者", "通勤族"),
                "使用场景" to listOf("户外防晒", "日常上班"),
                "核心卖点" to listOf("安热沙金灿倍护防晒乳", "遇水增强技术", "质地清爽不油腻"),
            ),
        ).toProductDetailUi()

        assertEquals("安热沙金灿倍护防晒乳", ui.name)
        assertFalse(ui.highlights.any { value -> value == "安热沙金灿倍护防晒乳" })
        assertTrue(ui.highlights.any { value -> value.contains("遇水增强") })
    }

    @Test
    fun mapsShortBrandTitleWithImmediateProductTypeToConciseDetailDisplayName() {
        val ui = productDto(
            name = "小熊电炖盅适合炖汤小容量宿舍友好早餐制作一人食",
            brand = "小熊",
            category = "家用电器",
            subCategory = "厨房小电",
            recommendationReason = "推荐理由：适合炖汤，小容量，宿舍友好。",
            pros = listOf("小熊电炖盅", "适合炖汤", "小容量"),
            recommendWhen = listOf("早餐制作", "一人食"),
            attributes = mapOf(
                "适用人群" to listOf("租房党", "早餐需求"),
                "使用场景" to listOf("早餐制作", "一人食"),
                "核心卖点" to listOf("小熊电炖盅", "适合炖汤", "小容量"),
            ),
        ).toProductDetailUi()

        assertEquals("小熊电炖盅", ui.name)
        assertFalse(ui.highlights.any { value -> value == "小熊电炖盅" })
        assertTrue(ui.highlights.any { value -> value.contains("早餐制作") || value.contains("一人食") })
    }

    @Test
    fun detailMapperDoesNotBuildTagsFromRecommendationReasonWhenBackendTagsAreEmpty() {
        val ui = productDto(
            name = "华为无线耳机专业五代主动降噪真无线蓝牙耳机高解析音质",
            recommendationReason = "推荐理由：半入耳式真无线设计，适合通勤和移动使用，学生与上班族都能轻松搭配。",
        ).copy(
            tags = emptyList(),
        ).toProductDetailUi()

        assertEquals(emptyList(), ui.tags)
        assertTrue(ui.name.contains("蓝牙耳机"))
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
        name: String = "通勤蓝牙耳机 A",
        brand: String = "示例品牌",
        category: String = "数码电子",
        subCategory: String = "耳机",
        pros: List<String> = listOf("续航稳定", "半入耳轻盈"),
        recommendWhen: List<String> = listOf("通勤"),
        recommendationReason: String? = null,
        recommendationHighlights: List<String> = emptyList(),
        marketingDescription: String = "适合通勤和日常使用。轻巧佩戴，通话清晰。",
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
            name = name,
            brand = brand,
            category = category,
            subCategory = subCategory,
            priceCents = 19900,
            priceRangeCents = PriceRangeCentsDto(min = 17900, max = 21900),
            currency = "CNY",
            tags = listOf("通勤", "蓝牙", "轻巧", "办公", "长续航"),
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
            pros = pros,
            recommendWhen = recommendWhen,
            avoidWhen = listOf("需要强降噪"),
            recommendationHighlights = recommendationHighlights,
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
