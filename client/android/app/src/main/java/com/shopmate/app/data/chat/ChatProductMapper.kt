package com.shopmate.app.data.chat

import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.data.products.cleanProductDisplayName
import com.shopmate.app.data.products.formatProductPriceRangeText
import com.shopmate.app.data.products.resolveProductPlaceholder
import com.shopmate.app.ui.model.ProductCardUi

private const val MAX_PRODUCT_TAGS = 3
private val TemplateRecommendationMarkers = listOf(
    "本数据集",
    "真实品牌",
    "真实用户反馈",
    "产品名",
    "后续查找",
    "对应商品图片",
    "构建商品详情页",
    "导购信息经过",
    "脱敏",
    "结构化整理",
    "课程 Demo",
    "课程Demo",
    "检索实验",
    "最终展示",
    "PostgreSQL",
    "比赛数据集",
    "模拟内容",
    "不代表实时售价",
    "如果用户属于",
    "推荐时需要结合限制条件",
)

fun ChatProductCardDto.toProductCardUi(
    imageUrlResolver: ShopMateImageUrlResolver? = null,
): ProductCardUi =
    ProductCardUi(
        id = id,
        name = cleanProductDisplayName(
            rawName = name,
            brand = brand,
            category = category,
            subCategory = subCategory,
        ),
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
    recommendationReason
        ?.trim()
        ?.takeIf { reason -> reason.isNotBlank() && !reason.isTemplateRecommendationCopy() }
        ?.let { reason ->
            return if (reason.startsWith("推荐理由")) reason else "推荐理由：$reason"
        }

    val fitFacts = tags
        .map { value -> value.trim() }
        .filter { value -> value.isNotBlank() && isUsefulFitTag(value) }
        .take(2)

    return when {
        fitFacts.isNotEmpty() -> "推荐理由：${fitFacts.joinToString("，")}，可结合预算和使用场景继续比较。"
        available -> "推荐理由：库内有货，可结合预算和使用场景继续比较。"
        else -> "推荐理由：当前暂不可选，可以看看同类可选商品。"
    }
}

private fun String.isTemplateRecommendationCopy(): Boolean =
    TemplateRecommendationMarkers.any { marker -> contains(marker) }

private fun ChatProductCardDto.isUsefulFitTag(value: String): Boolean {
    val normalizedValue = value.normalizedCopy()
    val weakTags = listOf(
        brand,
        category,
        subCategory.orEmpty(),
        "主图",
        "占位图",
        "商品",
    ).map { tag -> tag.normalizedCopy() }

    return weakTags.none { weakTag ->
        weakTag.isNotBlank() && (normalizedValue == weakTag || normalizedValue == "适合$weakTag")
    }
}

private fun String.normalizedCopy(): String =
    replace("\\s+".toRegex(), "")

private fun ChatProductCardDto.resolveProductImageRes(): Int {
    return resolveProductPlaceholder(
        listOf(id, name, brand, category, subCategory, imagePath),
    )
}
