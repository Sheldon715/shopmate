package com.shopmate.app.data.chat

import com.shopmate.app.R
import com.shopmate.app.ui.model.ProductCardUi
import java.util.Locale

private const val MAX_PRODUCT_TAGS = 3

fun ChatProductCardDto.toProductCardUi(): ProductCardUi =
    ProductCardUi(
        id = id,
        name = name,
        priceText = formatProductPrice(),
        imageRes = resolveProductImageRes(),
        tags = tags.take(MAX_PRODUCT_TAGS),
        recommendationReason = buildRecommendationReason(),
    )

fun List<ChatProductCardDto>.toProductCardUiList(): List<ProductCardUi> =
    map { product -> product.toProductCardUi() }

private fun ChatProductCardDto.formatProductPrice(): String {
    val minPrice = priceRangeCents.min
    val maxPrice = priceRangeCents.max
    return when {
        currency.equals("CNY", ignoreCase = true) && minPrice > 0 && maxPrice > 0 && minPrice != maxPrice ->
            "¥${minPrice.formatCnyCents()}-${maxPrice.formatCnyCents()}"

        currency.equals("CNY", ignoreCase = true) ->
            "¥${priceCents.formatCnyCents()}"

        minPrice > 0 && maxPrice > 0 && minPrice != maxPrice ->
            "${currency.uppercase(Locale.US)} ${minPrice.formatDecimalCents()}-${maxPrice.formatDecimalCents()}"

        else ->
            "${currency.uppercase(Locale.US)} ${priceCents.formatDecimalCents()}"
    }
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
    val searchableText = listOf(id, name, brand, category, subCategory, imagePath)
        .joinToString(" ")
        .lowercase(Locale.US)

    return when {
        "airpods" in searchableText || "apple" in searchableText ->
            R.drawable.product_redmi_buds_4

        "qcy" in searchableText ->
            R.drawable.product_qcy_t13_x

        "earbud" in searchableText ||
            "freebuds" in searchableText ||
            "耳机" in searchableText ||
            "digital/images" in searchableText ->
            R.drawable.product_zero_air

        else -> R.drawable.mascot_assistant
    }
}

private fun Int.formatCnyCents(): String =
    if (this % 100 == 0) {
        (this / 100).toString()
    } else {
        formatDecimalCents()
    }

private fun Int.formatDecimalCents(): String =
    String.format(Locale.US, "%.2f", this / 100.0)
