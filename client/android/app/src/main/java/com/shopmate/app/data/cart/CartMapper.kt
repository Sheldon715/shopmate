package com.shopmate.app.data.cart

import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.data.products.formatCnyCentsText
import com.shopmate.app.data.products.resolveProductPlaceholder
import com.shopmate.app.ui.cart.CartContentUi
import com.shopmate.app.ui.cart.CartSummaryUi
import com.shopmate.app.ui.model.CartItemUi
import com.shopmate.app.ui.model.ProductCardUi

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
            priceText = priceText.ifBlank { formatCnyCentsText(priceCents) },
            imageRes = resolveProductImageRes(),
            tags = tags.filter { tag -> tag.isNotBlank() }.take(MAX_CART_TAGS),
            recommendationReason = buildCartReason(),
            imageUrl = imageUrlResolver?.resolve(imagePath),
        ),
        quantity = quantity.coerceAtLeast(1),
        subtotalText = formatCnyCentsText(subtotalCents),
        selected = selected,
        available = available,
    )

private fun CartSummaryDto.toCartSummaryUi(): CartSummaryUi =
    CartSummaryUi(
        totalCount = totalCount,
        selectedCount = selectedCount,
        selectedTotalCents = selectedTotalCents,
        selectedTotalText = formatCnyCentsText(selectedTotalCents),
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
    return resolveProductPlaceholder(
        listOf(productId, name, brand, category, tags.joinToString(" "), imagePath),
    )
}

private const val MAX_CART_TAGS = 2
