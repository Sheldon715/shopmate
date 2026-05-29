package com.shopmate.app.data.products

import com.shopmate.app.R
import com.shopmate.app.ui.model.ProductDetailSpecUi
import com.shopmate.app.ui.model.ProductDetailUi
import java.util.Locale

private const val MAX_DETAIL_TAGS = 4
private const val MAX_DETAIL_HIGHLIGHTS = 3
private const val MAX_DETAIL_SPECS = 4

fun ProductDetailDto.toProductDetailUi(): ProductDetailUi =
    ProductDetailUi(
        id = id,
        name = name.ifBlank { "未命名商品" },
        priceText = formatProductPrice(),
        imageRes = resolveProductImageRes(),
        categoryText = listOfNotNull(
            category?.takeIf { value -> value.isNotBlank() },
            subCategory?.takeIf { value -> value.isNotBlank() },
        ).joinToString(" / ").ifBlank { "商品" },
        brandText = brand.orEmpty().ifBlank { "品牌信息待补充" },
        tags = tags.filter { tag -> tag.isNotBlank() }.take(MAX_DETAIL_TAGS),
        recommendationReason = buildRecommendationReason(),
        description = marketingDescription.orEmpty().ifBlank { "暂无详细说明" },
        highlights = buildHighlights(),
        specs = buildSpecs(),
        suitedForText = buildSuitabilityText(),
    )

private fun ProductDetailDto.formatProductPrice(): String {
    val minPrice = priceRangeCents?.min ?: 0
    val maxPrice = priceRangeCents?.max ?: 0
    return when {
        currency.equals("CNY", ignoreCase = true) && minPrice > 0 && maxPrice > 0 && minPrice != maxPrice ->
            "¥${minPrice.formatCnyCents()}-${maxPrice.formatCnyCents()}"

        currency.equals("CNY", ignoreCase = true) && priceCents > 0 ->
            "¥${priceCents.formatCnyCents()}"

        minPrice > 0 && maxPrice > 0 && minPrice != maxPrice ->
            "${currency.uppercase(Locale.US)} ${minPrice.formatDecimalCents()}-${maxPrice.formatDecimalCents()}"

        priceCents > 0 ->
            "${currency.uppercase(Locale.US)} ${priceCents.formatDecimalCents()}"

        else -> "价格待确认"
    }
}

private fun ProductDetailDto.buildRecommendationReason(): String {
    val brandText = brand.orEmpty().ifBlank { "该商品" }
    val categoryText = listOfNotNull(category, subCategory)
        .filter { value -> value.isNotBlank() }
        .joinToString(" / ")
        .ifBlank { "当前类目" }
    val availabilityText = if (available) "当前可选" else "当前暂不可选"
    return "$brandText · $categoryText，$availabilityText。"
}

private fun ProductDetailDto.buildHighlights(): List<String> {
    val highlights = (pros + recommendWhen)
        .map { value -> value.trim() }
        .filter { value -> value.isNotBlank() }
        .distinct()
        .take(MAX_DETAIL_HIGHLIGHTS)
    return highlights.ifEmpty { listOf("暂无更多商品亮点") }
}

private fun ProductDetailDto.buildSpecs(): List<ProductDetailSpecUi> {
    val attributeSpecs = attributes.entries
        .filter { entry -> entry.key.isNotBlank() && entry.value.any { value -> value.isNotBlank() } }
        .map { entry ->
            ProductDetailSpecUi(
                label = entry.key,
                value = entry.value.filter { value -> value.isNotBlank() }.joinToString(" / "),
            )
        }

    val fallbackSpecs = listOfNotNull(
        brand?.takeIf { value -> value.isNotBlank() }?.let { value ->
            ProductDetailSpecUi(label = "品牌", value = value)
        },
        category?.takeIf { value -> value.isNotBlank() }?.let { value ->
            ProductDetailSpecUi(label = "类目", value = value)
        },
        subCategory?.takeIf { value -> value.isNotBlank() }?.let { value ->
            ProductDetailSpecUi(label = "细分类目", value = value)
        },
    )

    return (attributeSpecs + fallbackSpecs)
        .distinctBy { spec -> spec.label to spec.value }
        .take(MAX_DETAIL_SPECS)
}

private fun ProductDetailDto.buildSuitabilityText(): String {
    val positiveText = recommendWhen
        .map { value -> value.trim() }
        .filter { value -> value.isNotBlank() }
        .take(2)
        .joinToString("、")

    val cautionText = (avoidWhen + cons)
        .map { value -> value.trim() }
        .filter { value -> value.isNotBlank() }
        .take(2)
        .joinToString("、")

    return when {
        positiveText.isNotBlank() && cautionText.isNotBlank() ->
            "适合：$positiveText；谨慎选择：$cautionText。"

        positiveText.isNotBlank() -> "适合：$positiveText。"
        cautionText.isNotBlank() -> "谨慎选择：$cautionText。"
        else -> marketingDescription.orEmpty().ifBlank { "暂无适用场景说明" }
    }
}

private fun ProductDetailDto.resolveProductImageRes(): Int {
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
