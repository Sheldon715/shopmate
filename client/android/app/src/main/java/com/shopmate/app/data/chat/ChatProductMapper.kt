package com.shopmate.app.data.chat

import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.data.products.formatProductPriceRangeText
import com.shopmate.app.data.products.resolveProductPlaceholder
import com.shopmate.app.ui.model.ProductCardUi

private const val MAX_PRODUCT_TAGS = 3

fun ChatProductCardDto.toProductCardUi(
    imageUrlResolver: ShopMateImageUrlResolver? = null,
): ProductCardUi =
    ProductCardUi(
        id = id,
        name = name,
        priceText = formatProductPrice(),
        imageRes = resolveProductImageRes(),
        tags = tags.take(MAX_PRODUCT_TAGS),
        recommendationReason = buildRecommendationReason(),
        imageUrl = imageUrlResolver?.resolve(imagePath),
    )

fun List<ChatProductCardDto>.toProductCardUiList(
    imageUrlResolver: ShopMateImageUrlResolver? = null,
): List<ProductCardUi> =
    map { product -> product.toProductCardUi(imageUrlResolver) }

private fun ChatProductCardDto.formatProductPrice(): String {
    return formatProductPriceRangeText(
        priceCents = priceCents,
        minPriceCents = priceRangeCents.min,
        maxPriceCents = priceRangeCents.max,
        currency = currency,
    )
}

private fun ChatProductCardDto.buildRecommendationReason(): String {
    val availabilityText = if (available) "当前可选" else "当前暂不可选"
    val categoryText = listOf(brand, category)
        .filter { value -> value.isNotBlank() }
        .joinToString(" · ")
        .ifBlank { "商品信息" }
    return "推荐理由：$categoryText，$availabilityText。"
}

private fun ChatProductCardDto.resolveProductImageRes(): Int {
    return resolveProductPlaceholder(
        listOf(id, name, brand, category, subCategory, imagePath),
    )
}
