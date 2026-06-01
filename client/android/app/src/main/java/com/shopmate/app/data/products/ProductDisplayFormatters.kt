package com.shopmate.app.data.products

import com.shopmate.app.R
import java.util.Locale

fun formatProductPriceRangeText(
    priceCents: Int,
    minPriceCents: Int?,
    maxPriceCents: Int?,
    currency: String,
    unavailableText: String? = null,
): String {
    val normalizedCurrency = currency.uppercase(Locale.US)
    val minPrice = minPriceCents ?: 0
    val maxPrice = maxPriceCents ?: 0
    val hasRange = minPrice > 0 &&
        maxPrice > 0 &&
        minPrice != maxPrice

    return when {
        normalizedCurrency == CNY_CURRENCY && hasRange ->
            "¥${minPrice.formatCnyCentsAmount()}-${maxPrice.formatCnyCentsAmount()}"

        normalizedCurrency == CNY_CURRENCY && (priceCents > 0 || unavailableText == null) ->
            formatCnyCentsText(priceCents)

        hasRange ->
            "$normalizedCurrency ${minPrice.formatDecimalCentsAmount()}-${maxPrice.formatDecimalCentsAmount()}"

        priceCents > 0 || unavailableText == null ->
            "$normalizedCurrency ${priceCents.formatDecimalCentsAmount()}"

        else -> unavailableText
    }
}

fun formatCnyCentsText(priceCents: Int): String =
    "¥${priceCents.formatCnyCentsAmount()}"

fun resolveProductPlaceholder(searchableParts: Iterable<String?>): Int {
    val searchableText = searchableParts
        .filterNotNull()
        .joinToString(" ")
        .lowercase(Locale.US)

    return when {
        "airpods" in searchableText || "apple" in searchableText ->
            R.drawable.product_redmi_buds_4

        "qcy" in searchableText -> R.drawable.product_qcy_t13_x

        "earbud" in searchableText ||
            "freebuds" in searchableText ||
            "耳机" in searchableText ||
            "digital/images" in searchableText ||
            "数码" in searchableText ->
            R.drawable.product_zero_air

        else -> R.drawable.mascot_assistant
    }
}

private fun Int.formatCnyCentsAmount(): String =
    if (this % 100 == 0) {
        (this / 100).toString()
    } else {
        formatDecimalCentsAmount()
    }

private fun Int.formatDecimalCentsAmount(): String =
    String.format(Locale.US, "%.2f", this / 100.0)

private const val CNY_CURRENCY = "CNY"
