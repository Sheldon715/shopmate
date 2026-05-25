package com.shopmate.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R
import com.shopmate.app.ui.model.ProductCardUi
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.ShopMateTheme

private const val FIGMA_PRODUCT_CARD_WIDTH = 360.667f

@Composable
fun ProductCard(
    product: ProductCardUi,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit = {},
    onAddCartClick: () -> Unit = {}
) {
    BoxWithConstraints(
        modifier = modifier
    ) {
        val scale = maxWidth.value / FIGMA_PRODUCT_CARD_WIDTH

        fun Float.s(): Dp = (this * scale).dp

        Box(
            modifier = Modifier
                .fillMaxSize()
                .shadow(
                    elevation = 12f.s(),
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
                    .size(width = 209.333f.s(), height = 153.771f.s())
            ) {
                Text(
                    text = product.name,
                    color = ShopMateTextPrimary.disabledAware(enabled),
                    fontSize = (14f * scale).sp,
                    lineHeight = (18.9f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .offset(y = 1f.s())
                        .size(width = 209.333f.s(), height = 18.896f.s())
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
                        .offset(y = 24.9f.s())
                        .size(width = 209.333f.s(), height = 16f.s())
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(6f.s()),
                    modifier = Modifier.offset(y = 48.9f.s())
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
                    fontSize = (12f * scale).sp,
                    lineHeight = (19.44f * scale).sp,
                    letterSpacing = 0.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier
                        .offset(y = 75.9f.s())
                        .size(width = 209.333f.s(), height = 38.875f.s())
                )

                AddCartButton(
                    enabled = enabled,
                    onClick = onAddCartClick,
                    scale = scale,
                    modifier = Modifier
                        .offset(
                            x = if (enabled) 108.333f.s() else 120.333f.s(),
                            y = 123.77f.s()
                        )
                        .size(
                            width = if (enabled) 101f.s() else 89f.s(),
                            height = 30f.s()
                        )
                )
            }
        }
    }
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
        Image(
            painter = painterResource(id = product.imageRes),
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
        color = Color(0xFF77828B).disabledAware(enabled),
        fontSize = (10f * scale).sp,
        lineHeight = (12f * scale).sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.sp,
        modifier = modifier
            .clip(ShopMatePillShape)
            .background(Color(0xFFF3F5F5).copy(alpha = if (enabled) 1f else 0.58f))
            .padding(horizontal = 8f.s(scale), vertical = 3f.s(scale))
    )
}

@Composable
private fun AddCartButton(
    enabled: Boolean,
    onClick: () -> Unit,
    scale: Float,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(ShopMatePillShape)
            .background(if (enabled) Color(0xFFE8F9F2) else Color(0xFFEFF2F2))
            .clickable(
                enabled = enabled,
                role = Role.Button,
                onClick = onClick
            )
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_add_cart),
            contentDescription = null,
            colorFilter = ColorFilter.tint(if (enabled) ShopMateGreen else Color(0xFFCDD4D7)),
            modifier = Modifier
                .offset(x = 10f.s(scale), y = 7.5f.s(scale))
                .size(15f.s(scale))
        )

        Text(
            text = if (enabled) "加入购物车" else "暂不可选",
            color = if (enabled) ShopMateGreen else Color(0xFF99A4AA),
            fontSize = (12f * scale).sp,
            lineHeight = (16f * scale).sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Visible,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(
                    x = if (enabled) 28f.s(scale) else 25.5f.s(scale),
                    y = 6.8f.s(scale)
                )
                .width(if (enabled) 65f.s(scale) else 55f.s(scale))
        )
    }
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
    heightDp = 179,
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
    heightDp = 179,
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
    heightDp = 168,
    showBackground = true
)
@Composable
private fun ProductCardLongCopyPreview() {
    ShopMateTheme {
        ProductCard(product = PreviewLongProduct)
    }
}
