package com.shopmate.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R
import com.shopmate.app.ui.model.ProductAddCartState
import com.shopmate.app.ui.model.ProductCardUi
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateMotion
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.ShopMateTheme

private const val FIGMA_PRODUCT_CARD_WIDTH = 360.667f
private const val PRODUCT_CARD_REASON_CHARS_PER_LINE = 16
private const val PRODUCT_CARD_REASON_MIN_LINES = 3
private const val PRODUCT_CARD_REASON_MAX_LINES = 7
private const val PRODUCT_CARD_REASON_LINE_HEIGHT = 16.4f

@Composable
fun ProductCard(
    product: ProductCardUi,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    addCartState: ProductAddCartState = ProductAddCartState.Idle,
    onClick: () -> Unit = {},
    onAddCartClick: () -> Unit = {}
) {
    BoxWithConstraints(
        modifier = modifier
    ) {
        val scale = maxWidth.value / FIGMA_PRODUCT_CARD_WIDTH

        fun Float.s(): Dp = (this * scale).dp

        val effectiveAddCartState = if (enabled) addCartState else ProductAddCartState.Disabled
        val reasonLines = product.recommendationReason.estimatedProductCardReasonLines()
        val reasonHeight = reasonLines * PRODUCT_CARD_REASON_LINE_HEIGHT
        val addCartButtonTop = productCardAddCartButtonTop(reasonLines)
        val contentHeight = maxOf(171f, addCartButtonTop + 32f)
        val cardInteractionSource = remember { MutableInteractionSource() }
        val isCardPressed by cardInteractionSource.collectIsPressedAsState()
        val cardScale by animateFloatAsState(
            targetValue = if (enabled && isCardPressed) ShopMateMotion.SubtlePressedScale else 1f,
            animationSpec = tween(
                durationMillis = ShopMateMotion.FastMillis,
                easing = ShopMateMotion.StandardEasing,
            ),
            label = "product-card-press-scale",
        )
        val cardElevation by animateDpAsState(
            targetValue = if (enabled && isCardPressed) 7f.s() else 12f.s(),
            label = "product-card-press-elevation",
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleX = cardScale
                    scaleY = cardScale
                }
                .shadow(
                    elevation = cardElevation,
                    shape = RoundedCornerShape(22f.s()),
                    clip = false
                )
                .clip(RoundedCornerShape(22f.s()))
                .background(Color.White.copy(alpha = 0.96f))
                .border(
                    width = 0.667.dp,
                    color = Color(0xFFF1F3F3).copy(alpha = 0.9f),
                    shape = RoundedCornerShape(22f.s())
                )
                .clickable(
                    interactionSource = cardInteractionSource,
                    indication = LocalIndication.current,
                    enabled = enabled,
                    role = Role.Button,
                    onClick = onClick
                )
        ) {
            ProductImage(
                product = product,
                enabled = enabled,
                scale = scale,
                modifier = Modifier
                    .offset(x = 12f.s(), y = 12f.s())
                    .size(width = 112f.s(), height = 132f.s())
            )

            Box(
                modifier = Modifier
                    .offset(x = 138f.s(), y = 12f.s())
                    .size(width = 209.333f.s(), height = contentHeight.s())
            ) {
                Text(
                    text = product.name,
                    color = ShopMateTextPrimary.disabledAware(enabled),
                    fontSize = (13.6f * scale).sp,
                    lineHeight = (17.2f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .offset(y = 0.5f.s())
                        .width(209.333f.s())
                        .heightIn(min = 17.2f.s(), max = 38f.s())
                )

                Text(
                    text = product.priceText,
                    color = ShopMateGreen.disabledAware(enabled),
                    fontSize = (16f * scale).sp,
                    lineHeight = (16f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                    maxLines = 1,
                    modifier = Modifier
                        .offset(y = 40.8f.s())
                        .size(width = 209.333f.s(), height = 16f.s())
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(6f.s()),
                    modifier = Modifier
                        .offset(y = 62.8f.s())
                        .width(209.333f.s())
                ) {
                    product.tags.take(2).forEach { tag ->
                        ProductTag(
                            text = tag,
                            enabled = enabled,
                            scale = scale
                        )
                    }
                }

                Text(
                    text = product.recommendationReason,
                    color = Color(0xFF5F6975).disabledAware(enabled),
                    fontSize = (11.5f * scale).sp,
                    lineHeight = (16.4f * scale).sp,
                    letterSpacing = 0.sp,
                    maxLines = reasonLines,
                    overflow = TextOverflow.Visible,
                    modifier = Modifier
                        .offset(y = 86.8f.s())
                        .size(width = 209.333f.s(), height = reasonHeight.s())
                )

                AddCartButton(
                    enabled = enabled,
                    state = effectiveAddCartState,
                    onClick = onAddCartClick,
                    scale = scale,
                    modifier = Modifier
                        .offset(
                            x = 101.333f.s(),
                            y = addCartButtonTop.s()
                        )
                        .size(
                            width = 108f.s(),
                            height = 32f.s()
                        )
                )
            }
        }
    }
}

fun ProductCardUi.estimatedProductCardHeight(scale: Float): Dp {
    val reasonLines = recommendationReason.estimatedProductCardReasonLines()
    val buttonTop = productCardAddCartButtonTop(reasonLines)
    val height = 12f + buttonTop + 32f + 14f

    return maxOf(196f, height).s(scale)
}

private fun String.estimatedProductCardReasonLines(): Int {
    val compactLength = trim().replace("\\s+".toRegex(), "").length.coerceAtLeast(1)
    val lines = (compactLength + PRODUCT_CARD_REASON_CHARS_PER_LINE - 1) /
        PRODUCT_CARD_REASON_CHARS_PER_LINE

    return lines.coerceIn(PRODUCT_CARD_REASON_MIN_LINES, PRODUCT_CARD_REASON_MAX_LINES)
}

private fun productCardAddCartButtonTop(reasonLines: Int): Float =
    if (reasonLines <= PRODUCT_CARD_REASON_MIN_LINES) {
        137.6f
    } else {
        86.8f + reasonLines * PRODUCT_CARD_REASON_LINE_HEIGHT + 8.4f
    }

@Composable
private fun ProductImage(
    product: ProductCardUi,
    enabled: Boolean,
    scale: Float,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(17f.s(scale)))
            .background(Color(0xFFF7F8F8)),
        contentAlignment = Alignment.Center
    ) {
        ShopMateProductImage(
            imageUrl = product.imageUrl,
            placeholderRes = product.imageRes,
            contentDescription = product.name,
            modifier = Modifier
                .fillMaxSize()
                .alpha(if (enabled) 1f else DISABLED_CONTENT_ALPHA),
            contentScale = ContentScale.Crop
        )
    }
}

@Composable
private fun ProductTag(
    text: String,
    enabled: Boolean,
    scale: Float,
    modifier: Modifier = Modifier
) {
    Text(
        text = text,
        color = ShopMateGreen.disabledAware(enabled),
        fontSize = (10f * scale).sp,
        lineHeight = (12f * scale).sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.sp,
        maxLines = 1,
        softWrap = false,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier
            .widthIn(max = 86f.s(scale))
            .clip(ShopMatePillShape)
            .background(Color(0xFFE8F9F2).copy(alpha = if (enabled) 1f else 0.58f))
            .padding(horizontal = 8f.s(scale), vertical = 3f.s(scale))
    )
}

@Composable
private fun AddCartButton(
    enabled: Boolean,
    state: ProductAddCartState,
    onClick: () -> Unit,
    scale: Float,
    modifier: Modifier = Modifier
) {
    val buttonSpec = state.toButtonSpec(enabled)
    val buttonInteractionSource = remember { MutableInteractionSource() }
    val isPressed by buttonInteractionSource.collectIsPressedAsState()
    val pressScale by animateFloatAsState(
        targetValue = if (buttonSpec.clickable && isPressed) ShopMateMotion.PressedScale else 1f,
        animationSpec = tween(
            durationMillis = ShopMateMotion.FastMillis,
            easing = ShopMateMotion.StandardEasing,
        ),
        label = "product-add-cart-press-scale",
    )
    val backgroundColor by animateColorAsState(
        targetValue = buttonSpec.backgroundColor,
        label = "product-add-cart-background",
    )
    val contentColor by animateColorAsState(
        targetValue = buttonSpec.contentColor,
        label = "product-add-cart-content",
    )

    Box(
        modifier = modifier
            .graphicsLayer {
                scaleX = pressScale
                scaleY = pressScale
            }
            .clip(ShopMatePillShape)
            .background(backgroundColor)
            .border(
                width = 0.667.dp,
                color = buttonSpec.borderColor,
                shape = ShopMatePillShape,
            )
            .semantics {
                contentDescription = buttonSpec.contentDescription
            }
            .clickable(
                interactionSource = buttonInteractionSource,
                indication = LocalIndication.current,
                enabled = buttonSpec.clickable,
                role = Role.Button,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(5f.s(scale)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (state == ProductAddCartState.Loading) {
                CircularProgressIndicator(
                    color = contentColor,
                    strokeWidth = 1.7f.s(scale),
                    modifier = Modifier.size(13.5f.s(scale)),
                )
            } else {
                Image(
                    painter = painterResource(id = buttonSpec.iconRes),
                    contentDescription = null,
                    colorFilter = ColorFilter.tint(contentColor),
                    modifier = Modifier.size(15f.s(scale))
                )
            }

            Text(
                text = buttonSpec.text,
                color = contentColor,
                fontSize = (12f * scale).sp,
                lineHeight = (16f * scale).sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Visible,
                letterSpacing = 0.sp,
                modifier = Modifier.width(buttonSpec.textWidth.s(scale))
            )
        }
    }
}

private data class AddCartButtonSpec(
    val text: String,
    val contentDescription: String,
    val iconRes: Int,
    val backgroundColor: Color,
    val borderColor: Color,
    val contentColor: Color,
    val clickable: Boolean,
    val textWidth: Float,
)

private fun ProductAddCartState.toButtonSpec(enabled: Boolean): AddCartButtonSpec =
    when {
        !enabled || this == ProductAddCartState.Disabled -> AddCartButtonSpec(
            text = "暂不可选",
            contentDescription = "暂不可选",
            iconRes = R.drawable.ic_add_cart,
            backgroundColor = Color(0xFFEFF2F2),
            borderColor = Color(0xFFE1E7E7),
            contentColor = Color(0xFF99A4AA),
            clickable = false,
            textWidth = 58f,
        )

        this == ProductAddCartState.Loading -> AddCartButtonSpec(
            text = "加入中",
            contentDescription = "正在加入购物车",
            iconRes = R.drawable.ic_add_cart,
            backgroundColor = Color(0xFFE8F9F2),
            borderColor = Color(0xFFCFF3E3),
            contentColor = ShopMateGreen,
            clickable = false,
            textWidth = 54f,
        )

        this == ProductAddCartState.Added -> AddCartButtonSpec(
            text = "已加入",
            contentDescription = "已加入购物车",
            iconRes = R.drawable.ic_cart_check,
            backgroundColor = Color(0xFFDDF8EC),
            borderColor = Color(0xFFB8EFD7),
            contentColor = Color(0xFF16895E),
            clickable = false,
            textWidth = 50f,
        )

        this == ProductAddCartState.Failed -> AddCartButtonSpec(
            text = "重试",
            contentDescription = "加入购物车失败，点按重试",
            iconRes = R.drawable.ic_add_cart,
            backgroundColor = Color(0xFFFFF0EA),
            borderColor = Color(0xFFFFD2C0),
            contentColor = Color(0xFFB54B2A),
            clickable = true,
            textWidth = 34f,
        )

        else -> AddCartButtonSpec(
            text = "加入购物车",
            contentDescription = "加入购物车",
            iconRes = R.drawable.ic_add_cart,
            backgroundColor = Color(0xFFE8F9F2),
            borderColor = Color(0xFFCFF3E3),
            contentColor = ShopMateGreen,
            clickable = true,
            textWidth = 65f,
        )
    }

private const val DISABLED_CONTENT_ALPHA = 0.62f

private fun Float.s(scale: Float): Dp = (this * scale).dp

private fun Color.disabledAware(enabled: Boolean): Color =
    if (enabled) this else copy(alpha = DISABLED_CONTENT_ALPHA)

private val PreviewProduct = ProductCardUi(
    id = "preview-zero-air",
    name = "漫步者 Zero Air 真无线蓝牙耳机",
    priceText = "¥179",
    imageRes = R.drawable.product_zero_air,
    tags = listOf("半入耳舒适", "20h 续航"),
    recommendationReason = "推荐理由：轻盈半入耳，佩戴无感，通勤久戴不累，通话清晰，日常使用足够省心。"
)

private val PreviewDisabledProduct = ProductCardUi(
    id = "preview-redmi-buds",
    name = "小米 Redmi Buds 4 青春版",
    priceText = "¥129",
    imageRes = R.drawable.product_redmi_buds_4,
    tags = listOf("蓝牙 5.3", "20h 续航"),
    recommendationReason = "推荐理由：价格友好，机身轻巧，适合作为入门备用耳机。"
)

private val PreviewLongProduct = ProductCardUi(
    id = "preview-long-product",
    name = "超长商品名示例 防晒修护清透控油乳 SPF50+ PA++++ 学生通勤版",
    priceText = "¥199",
    imageRes = R.drawable.product_zero_air,
    tags = listOf("长效防晒", "敏感肌可用", "通勤"),
    recommendationReason = "推荐理由：这是一段特意加长的推荐理由，用来确认小屏和长文案时不会撑破商品卡片。"
)

@Preview(
    name = "Product card - enabled",
    widthDp = 361,
    heightDp = 196,
    showBackground = true
)
@Composable
private fun ProductCardEnabledPreview() {
    ShopMateTheme {
        ProductCard(product = PreviewProduct)
    }
}

@Preview(
    name = "Product card - disabled",
    widthDp = 361,
    heightDp = 196,
    showBackground = true
)
@Composable
private fun ProductCardDisabledPreview() {
    ShopMateTheme {
        ProductCard(
            product = PreviewDisabledProduct,
            enabled = false
        )
    }
}

@Preview(
    name = "Product card - long copy compact",
    widthDp = 332,
    heightDp = 236,
    showBackground = true
)
@Composable
private fun ProductCardLongCopyPreview() {
    ShopMateTheme {
        ProductCard(product = PreviewLongProduct)
    }
}
