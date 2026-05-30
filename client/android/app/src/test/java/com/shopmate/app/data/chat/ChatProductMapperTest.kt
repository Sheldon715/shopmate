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
        ).toProductCardUi()

        assertEquals("product_001", ui.id)
        assertEquals("漫步者 Zero Air", ui.name)
        assertEquals("¥179", ui.priceText)
        assertEquals(R.drawable.product_zero_air, ui.imageRes)
        assertEquals(listOf("通勤", "蓝牙", "轻巧"), ui.tags)
        assertEquals("推荐理由：漫步者 · 数码电子，当前可选。", ui.recommendationReason)
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
        tags: List<String> = emptyList(),
    ): ChatProductCardDto =
        ChatProductCardDto(
            id = "product_001",
            name = "漫步者 Zero Air",
            brand = "漫步者",
            category = "数码电子",
            subCategory = "耳机",
            priceCents = priceCents,
            priceRangeCents = priceRangeCents,
            currency = currency,
            imagePath = "/images/product_001.png",
            ratingAvg = 4.6,
            tags = tags,
            available = true,
        )
}
