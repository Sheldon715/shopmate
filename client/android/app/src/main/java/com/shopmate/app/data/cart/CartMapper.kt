package com.shopmate.app.data.cart

import com.shopmate.app.R
import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.ui.cart.CartContentUi
import com.shopmate.app.ui.cart.CartSummaryUi
import com.shopmate.app.ui.model.CartItemUi
import com.shopmate.app.ui.model.ProductCardUi
import java.util.Locale

fun CartDto.toCartContentUi(
    imageUrlResolver: ShopMateImageUrlResolver? = null,
): CartContentUi =
    CartContentUi(
        items = items.map { item -> item.toCartItemUi(imageUrlResolver) },
        summary = summary.toCartSummaryUi(),
    )

private fun CartItemDto.toCartItemUi(
    imageUrlResolver: ShopMateImageUrlResolver?,
): CartItemUi =
    CartItemUi(
        id = id,
        product = ProductCardUi(
            id = productId,
            name = name.ifBlank { "未命名商品" },
            priceText = priceText.ifBlank { priceCents.formatPriceText() },
            imageRes = resolveProductImageRes(),
            tags = tags.filter { tag -> tag.isNotBlank() }.take(MAX_CART_TAGS),
            recommendationReason = buildCartReason(),
            imageUrl = imageUrlResolver?.resolve(imagePath),
        ),
        quantity = quantity.coerceAtLeast(1),
        subtotalText = subtotalCents.formatPriceText(),
        selected = selected,
        available = available,
    )

private fun CartSummaryDto.toCartSummaryUi(): CartSummaryUi =
    CartSummaryUi(
        totalCount = totalCount,
        selectedCount = selectedCount,
        selectedTotalCents = selectedTotalCents,
        selectedTotalText = selectedTotalCents.formatPriceText(),
        currency = currency,
    )

private fun CartItemDto.buildCartReason(): String {
    val brandText = brand.orEmpty().trim()
    val categoryText = category.orEmpty().trim()
    return listOf(brandText, categoryText)
        .filter { value -> value.isNotBlank() }
        .joinToString(" · ")
        .ifBlank { "已加入购物车，可调整数量和选择状态。" }
}

private fun CartItemDto.resolveProductImageRes(): Int {
    val searchableText = listOf(productId, name, brand, category, tags.joinToString(" "))
        .joinToString(" ")
        .lowercase(Locale.US)

    return when {
        "airpods" in searchableText || "apple" in searchableText ->
            R.drawable.product_redmi_buds_4

        "qcy" in searchableText -> R.drawable.product_qcy_t13_x

        "earbud" in searchableText ||
            "freebuds" in searchableText ||
            "耳机" in searchableText ||
            "数码" in searchableText ->
            R.drawable.product_zero_air

        else -> R.drawable.mascot_assistant
    }
}

private fun Int.formatPriceText(): String {
    val amount = if (this % 100 == 0) {
        (this / 100).toString()
    } else {
        String.format(Locale.US, "%.2f", this / 100.0)
    }
    return "¥$amount"
}

private const val MAX_CART_TAGS = 2
