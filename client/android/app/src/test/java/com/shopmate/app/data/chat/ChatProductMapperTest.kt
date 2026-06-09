package com.shopmate.app.data.chat

import com.shopmate.app.R
import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateImageUrlResolver
import kotlin.test.assertEquals
import org.junit.Test

class ChatProductMapperTest {
    @Test
    fun mapsProductCardDtoToUiModel() {
        val ui = productDto(
            priceCents = 17900,
            tags = listOf("通勤", "蓝牙", "轻巧", "长续航"),
            recommendationReason = "推荐理由：半入耳轻盈，适合通勤久戴。",
        ).toProductCardUi()

        assertEquals("product_001", ui.id)
        assertEquals("漫步者 Zero Air", ui.name)
        assertEquals("¥179", ui.priceText)
        assertEquals(R.drawable.product_zero_air, ui.imageRes)
        assertEquals(listOf("通勤", "蓝牙", "轻巧"), ui.tags)
        assertEquals("推荐理由：半入耳轻盈，适合通勤久戴。", ui.recommendationReason)
    }

    @Test
    fun fallsBackToFitTagsInsteadOfBrandCategoryTemplate() {
        val ui = productDto(
            priceCents = 17900,
            tags = listOf("通勤", "蓝牙"),
        ).toProductCardUi()

        assertEquals(
            "推荐理由：通勤，蓝牙，可结合预算和使用场景继续比较。",
            ui.recommendationReason,
        )
    }

    @Test
    fun ignoresDatasetHousekeepingRecommendationReasonFromBackend() {
        val ui = productDto(
            priceCents = 15900,
            category = "家用电器",
            subCategory = "厨房小电",
            tags = listOf("家用电器", "厨房小电"),
            recommendationReason = "推荐理由：本数据集保留真实品牌与产品名，便于后续查找对应商品图片和构建商品详情页。",
        ).toProductCardUi()

        assertEquals(
            "推荐理由：库内有货，可结合预算和使用场景继续比较。",
            ui.recommendationReason,
        )
    }

    @Test
    fun mapsRawCatalogSeoTitleToConciseDisplayName() {
        val ui = productDto(
            priceCents = 17000,
            name = "巴黎欧莱雅新多重防护隔离露水感轻薄高倍防晒修护提亮",
            brand = "巴黎欧莱雅",
            category = "美妆护肤",
            subCategory = "防晒",
            recommendationReason = "推荐理由：水感轻薄质地，适合清爽肤感。",
        ).toProductCardUi()

        assertEquals("巴黎欧莱雅新多重防护隔离露", ui.name)
    }

    @Test
    fun mapsShortBrandTitleWithImmediateProductTypeToConciseDisplayName() {
        val ui = productDto(
            priceCents = 15900,
            name = "小熊电炖盅适合炖汤小容量宿舍友好早餐制作一人食",
            brand = "小熊",
            category = "家用电器",
            subCategory = "厨房小电",
            recommendationReason = "推荐理由：适合炖汤，小容量，宿舍友好。",
        ).toProductCardUi()

        assertEquals("小熊电炖盅", ui.name)
    }

    @Test
    fun mapsProductImagePathToRemoteUrlWhenResolverIsProvided() {
        val ui = productDto(priceCents = 17900).toProductCardUi(
            ShopMateImageUrlResolver(ShopMateApiConfig("https://api.example.test/")),
        )

        assertEquals(
            "https://api.example.test/images/product_001.png",
            ui.imageUrl,
        )
    }

    @Test
    fun formatsPriceRangeAndNonCnyCurrency() {
        val rangeUi = productDto(
            priceCents = 19900,
            priceRangeCents = PriceRangeCentsDto(min = 17900, max = 21950),
        ).toProductCardUi()
        val usdUi = productDto(
            priceCents = 1299,
            priceRangeCents = PriceRangeCentsDto(min = 999, max = 1999),
            currency = "usd",
        ).toProductCardUi()

        assertEquals("¥179-219.50", rangeUi.priceText)
        assertEquals("USD 9.99-19.99", usdUi.priceText)
    }

    private fun productDto(
        priceCents: Int,
        priceRangeCents: PriceRangeCentsDto = PriceRangeCentsDto(min = priceCents, max = priceCents),
        currency: String = "CNY",
        name: String = "漫步者 Zero Air",
        brand: String = "漫步者",
        category: String = "数码电子",
        subCategory: String? = "耳机",
        tags: List<String> = emptyList(),
        recommendationReason: String? = null,
    ): ChatProductCardDto =
        ChatProductCardDto(
            id = "product_001",
            name = name,
            brand = brand,
            category = category,
            subCategory = subCategory,
            priceCents = priceCents,
            priceRangeCents = priceRangeCents,
            currency = currency,
            imagePath = "/images/product_001.png",
            ratingAvg = 4.6,
            tags = tags,
            available = true,
            recommendationReason = recommendationReason,
        )
}
