package com.shopmate.app.ui.product

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
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
import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.components.ShopMateRoundedIconButton
import com.shopmate.app.ui.model.ProductDetailSpecUi
import com.shopmate.app.ui.model.ProductDetailUi
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateLightGreen
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateSurface
import com.shopmate.app.ui.theme.ShopMateSurfaceSoft
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.ShopMateTheme

private const val FIGMA_WIDTH = 388.667f
private const val FIGMA_HEIGHT = 842.667f

@Composable
fun ProductDetailScreen(
    productId: String,
    onBackClick: () -> Unit,
    onCartClick: () -> Unit,
    onAddCartClick: () -> Unit,
    onBuyNowClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ProductDetailScreenContent(
        product = MockShopMateData.findProductDetail(productId),
        onBackClick = onBackClick,
        onCartClick = onCartClick,
        onAddCartClick = onAddCartClick,
        onBuyNowClick = onBuyNowClick,
        modifier = modifier
    )
}

@Composable
private fun ProductDetailScreenContent(
    product: ProductDetailUi?,
    onBackClick: () -> Unit,
    onCartClick: () -> Unit,
    onAddCartClick: () -> Unit,
    onBuyNowClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isFavorite by rememberSaveable(product?.id) { mutableStateOf(false) }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .figmaProductDetailBackground()
    ) {
        val scale = minOf(maxWidth.value / FIGMA_WIDTH, maxHeight.value / FIGMA_HEIGHT)
        val frameStart = ((maxWidth.value - FIGMA_WIDTH * scale) / 2f).dp

        fun Float.s(): Dp = scaledDp(scale)

        val headerTop = 36f.s()
        val contentTop = 80f.s()
        val footerHeight = 58f.s()
        val footerBottom = 18f.s()
        val footerTop = maxHeight - footerHeight - footerBottom
        val contentBottomGap = 10f.s()
        val contentHeight = (footerTop - contentTop - contentBottomGap).coerceAtLeast(360.dp)
        val scrollContentHeight = if (product == null) 430f.s() else 918f.s()

        ProductDetailHeader(
            scale = scale,
            onBackClick = onBackClick,
            onCartClick = onCartClick,
            modifier = Modifier
                .offset(x = frameStart, y = headerTop)
                .size(width = FIGMA_WIDTH.s(), height = 44f.s())
        )

        Box(
            modifier = Modifier
                .offset(x = frameStart, y = contentTop)
                .size(width = FIGMA_WIDTH.s(), height = contentHeight)
                .clipToBounds()
                .verticalScroll(rememberScrollState())
        ) {
            Box(
                modifier = Modifier.size(
                    width = FIGMA_WIDTH.s(),
                    height = scrollContentHeight
                )
            ) {
                if (product == null) {
                    ProductNotFoundCard(
                        scale = scale,
                        onBackClick = onBackClick,
                        modifier = Modifier
                            .offset(x = 18f.s(), y = 18f.s())
                            .size(width = 352.667f.s(), height = 252f.s())
                    )
                } else {
                    ProductHeroCard(
                        product = product,
                        isFavorite = isFavorite,
                        onFavoriteClick = { isFavorite = !isFavorite },
                        scale = scale,
                        modifier = Modifier
                            .offset(x = 18f.s(), y = 4f.s())
                            .size(width = 352.667f.s(), height = 419.531f.s())
                    )

                    RecommendationReasonCard(
                        product = product,
                        scale = scale,
                        modifier = Modifier
                            .offset(x = 18f.s(), y = 437.531f.s())
                            .size(width = 352.667f.s(), height = 201.01f.s())
                    )

                    ProductSpecGrid(
                        specs = product.specs,
                        scale = scale,
                        modifier = Modifier
                            .offset(x = 18f.s(), y = 652.541f.s())
                            .size(width = 352.667f.s(), height = 162f.s())
                    )

                    SuitabilityCard(
                        product = product,
                        scale = scale,
                        modifier = Modifier
                            .offset(x = 18f.s(), y = 828.541f.s())
                            .size(width = 352.667f.s(), height = 95.188f.s())
                    )
                }
            }
        }

        if (product != null) {
            ProductDetailFooter(
                scale = scale,
                onAddCartClick = onAddCartClick,
                onBuyNowClick = onBuyNowClick,
                modifier = Modifier
                    .offset(x = frameStart + 12f.s(), y = footerTop)
                    .size(width = 364.667f.s(), height = footerHeight)
            )
        }
    }
}

@Composable
private fun ProductDetailHeader(
    scale: Float,
    onBackClick: () -> Unit,
    onCartClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)

    Box(modifier = modifier) {
        HeaderIconButton(
            icon = R.drawable.ic_menu,
            contentDescription = "返回推荐结果",
            onClick = onBackClick,
            modifier = Modifier
                .offset(x = 14f.s(), y = 3f.s())
                .size(38f.s()),
            iconSize = 16f.s()
        )

        Image(
            painter = painterResource(id = R.drawable.sidebar_shopmate_buddy),
            contentDescription = "Shopmate Buddy",
            modifier = Modifier
                .offset(x = 175.33f.s(), y = 3f.s())
                .size(38f.s())
                .shadow(
                    elevation = 8f.s(),
                    shape = CircleShape,
                    clip = false
                ),
            contentScale = ContentScale.Fit
        )

        HeaderIconButton(
            icon = R.drawable.ic_cart,
            contentDescription = "购物车",
            onClick = onCartClick,
            modifier = Modifier
                .offset(x = 332.67f.s(), y = 3f.s())
                .size(38f.s()),
            iconSize = 16f.s()
        )
    }
}

@Composable
private fun HeaderIconButton(
    icon: Int,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    iconSize: Dp
) {
    ShopMateRoundedIconButton(
        onClick = onClick,
        backgroundColor = Color.White.copy(alpha = 0.78f),
        shape = CircleShape,
        elevation = 8.dp,
        modifier = modifier
    ) {
        Image(
            painter = painterResource(id = icon),
            contentDescription = contentDescription,
            modifier = Modifier.size(iconSize)
        )
    }
}

@Composable
private fun ProductHeroCard(
    product: ProductDetailUi,
    isFavorite: Boolean,
    onFavoriteClick: () -> Unit,
    scale: Float,
    modifier: Modifier = Modifier
) {
    val cardShape = RoundedCornerShape(24f.scaledDp(scale))

    Box(
        modifier = modifier
            .shadow(
                elevation = 14f.scaledDp(scale),
                shape = cardShape,
                clip = false
            )
            .clip(cardShape)
            .background(Color.White)
            .border(
                width = 0.667.dp,
                color = Color(0xFFEFF3F2).copy(alpha = 0.96f),
                shape = cardShape
            )
    ) {
        Box(
            modifier = Modifier
                .offset(x = 16f.scaledDp(scale), y = 16f.scaledDp(scale))
                .size(width = 319.333f.scaledDp(scale), height = 238f.scaledDp(scale))
                .clip(RoundedCornerShape(20f.scaledDp(scale)))
                .background(Brush.verticalGradient(listOf(Color(0xFFF8FAF9), Color.White))),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = product.imageRes),
                contentDescription = product.name,
                modifier = Modifier
                    .size(width = 226f.scaledDp(scale), height = 209.438f.scaledDp(scale))
                    .shadow(
                        elevation = 18f.scaledDp(scale),
                        shape = RoundedCornerShape(22f.scaledDp(scale)),
                        clip = false
                    )
                    .clip(RoundedCornerShape(22f.scaledDp(scale))),
                contentScale = ContentScale.Crop
            )
        }

        FeaturedLabel(
            scale = scale,
            modifier = Modifier
                .offset(x = 16f.scaledDp(scale), y = 268f.scaledDp(scale))
                .size(width = 124f.scaledDp(scale), height = 26f.scaledDp(scale))
        )

        Text(
            text = product.name,
            color = ShopMateTextPrimary,
            fontSize = (20f * scale).sp,
            lineHeight = (27f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .offset(x = 16f.scaledDp(scale), y = 307f.scaledDp(scale))
                .size(width = 319.333f.scaledDp(scale), height = 32f.scaledDp(scale))
        )

        Text(
            text = product.priceText,
            color = ShopMateGreen,
            fontSize = (28f * scale).sp,
            lineHeight = (28f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1,
            modifier = Modifier
                .offset(x = 16f.scaledDp(scale), y = 343f.scaledDp(scale))
                .size(width = 319.333f.scaledDp(scale), height = 30f.scaledDp(scale))
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(6f.scaledDp(scale)),
            modifier = Modifier.offset(x = 16f.scaledDp(scale), y = 383f.scaledDp(scale))
        ) {
            product.tags.take(2).forEach { tag ->
                DetailTag(text = tag, scale = scale)
            }
        }

        FavoriteButton(
            isFavorite = isFavorite,
            onClick = onFavoriteClick,
            scale = scale,
            modifier = Modifier
                .offset(x = 293.33f.scaledDp(scale), y = 16f.scaledDp(scale))
                .size(42f.scaledDp(scale))
        )
    }
}

@Composable
private fun FeaturedLabel(
    scale: Float,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier) {
        Image(
            painter = painterResource(id = R.drawable.sidebar_shopmate_buddy),
            contentDescription = "Shopmate Buddy",
            modifier = Modifier
                .offset(x = 0.dp, y = 0.dp)
                .size(26f.scaledDp(scale))
                .shadow(
                    elevation = 8f.scaledDp(scale),
                    shape = CircleShape,
                    clip = false
                ),
            contentScale = ContentScale.Fit
        )

        Text(
            text = "Shopmate 精选",
            color = ShopMateGreen,
            fontSize = (12f * scale).sp,
            lineHeight = (16f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1,
            modifier = Modifier.offset(x = 34f.scaledDp(scale), y = 5f.scaledDp(scale))
        )
    }
}

@Composable
private fun FavoriteButton(
    isFavorite: Boolean,
    onClick: () -> Unit,
    scale: Float,
    modifier: Modifier = Modifier
) {
    ShopMateRoundedIconButton(
        onClick = onClick,
        backgroundColor = Color.White.copy(alpha = 0.92f),
        shape = RoundedCornerShape(
            topStart = 21f.scaledDp(scale),
            topEnd = 21f.scaledDp(scale),
            bottomStart = 16f.scaledDp(scale),
            bottomEnd = 21f.scaledDp(scale)
        ),
        elevation = 12f.scaledDp(scale),
        modifier = modifier
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_home_heart),
            contentDescription = if (isFavorite) "取消收藏" else "收藏商品",
            colorFilter = if (isFavorite) ColorFilter.tint(ShopMateGreen) else null,
            modifier = Modifier.size(16f.scaledDp(scale))
        )
    }
}

@Composable
private fun DetailTag(
    text: String,
    scale: Float,
    modifier: Modifier = Modifier
) {
    Text(
        text = text,
        color = ShopMateGreen,
        fontSize = (11f * scale).sp,
        lineHeight = (13.2f * scale).sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.sp,
        maxLines = 1,
        modifier = modifier
            .clip(ShopMatePillShape)
            .background(Color(0xFFE8F9F2))
            .padding(
                horizontal = 8f.scaledDp(scale),
                vertical = 3f.scaledDp(scale)
            )
    )
}

@Composable
private fun RecommendationReasonCard(
    product: ProductDetailUi,
    scale: Float,
    modifier: Modifier = Modifier
) {
    val cardShape = RoundedCornerShape(24f.scaledDp(scale))

    Box(
        modifier = modifier
            .shadow(
                elevation = 14f.scaledDp(scale),
                shape = cardShape,
                clip = false
            )
            .clip(cardShape)
            .background(Color.White)
            .border(
                width = 0.667.dp,
                color = Color(0xFFEFF3F2).copy(alpha = 0.96f),
                shape = cardShape
            )
    ) {
        Box(
            modifier = Modifier
                .offset(x = 16f.scaledDp(scale), y = 16.667f.scaledDp(scale))
                .size(30f.scaledDp(scale))
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(Color(0xFF58D8A2), ShopMateGreen))),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_ai_reason_check),
                contentDescription = null,
                modifier = Modifier.size(16f.scaledDp(scale))
            )
        }

        Text(
            text = "AI 推荐理由",
            color = ShopMateTextPrimary,
            fontSize = (15f * scale).sp,
            lineHeight = (20f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1,
            modifier = Modifier.offset(x = 55f.scaledDp(scale), y = 21f.scaledDp(scale))
        )

        Text(
            text = product.recommendationReason,
            color = Color(0xFF5F6975),
            fontSize = (13f * scale).sp,
            lineHeight = (21.45f * scale).sp,
            letterSpacing = 0.sp,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .offset(x = 16f.scaledDp(scale), y = 58f.scaledDp(scale))
                .size(width = 320f.scaledDp(scale), height = 58f.scaledDp(scale))
        )

        product.highlights.take(3).forEachIndexed { index, highlight ->
            HighlightRow(
                text = highlight,
                scale = scale,
                modifier = Modifier
                    .offset(
                        x = 16f.scaledDp(scale),
                        y = (116f + index * 26.6f).scaledDp(scale)
                    )
                    .size(width = 319.333f.scaledDp(scale), height = 19f.scaledDp(scale))
            )
        }
    }
}

@Composable
private fun HighlightRow(
    text: String,
    scale: Float,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .offset(x = 2f.scaledDp(scale), y = 6f.scaledDp(scale))
                .size(5f.scaledDp(scale))
                .clip(CircleShape)
                .background(ShopMateGreen.copy(alpha = 0.28f))
        )
        Text(
            text = text,
            color = Color(0xFF3F4A56),
            fontSize = (12f * scale).sp,
            lineHeight = (18.6f * scale).sp,
            letterSpacing = 0.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.offset(x = 18f.scaledDp(scale), y = 0.dp)
        )
    }
}

@Composable
private fun ProductSpecGrid(
    specs: List<ProductDetailSpecUi>,
    scale: Float,
    modifier: Modifier = Modifier
) {
    val displaySpecs = specs.take(4)

    Box(modifier = modifier) {
        displaySpecs.forEachIndexed { index, spec ->
            val column = index % 2
            val row = index / 2

            ProductSpecTile(
                spec = spec,
                scale = scale,
                modifier = Modifier
                    .offset(
                        x = (column * 181.333f).scaledDp(scale),
                        y = (row * 86f).scaledDp(scale)
                    )
                    .size(width = 171.333f.scaledDp(scale), height = 76f.scaledDp(scale))
            )
        }
    }
}

@Composable
private fun ProductSpecTile(
    spec: ProductDetailSpecUi,
    scale: Float,
    modifier: Modifier = Modifier
) {
    val tileShape = RoundedCornerShape(18f.scaledDp(scale))

    Box(
        modifier = modifier
            .shadow(
                elevation = 10f.scaledDp(scale),
                shape = tileShape,
                clip = false
            )
            .clip(tileShape)
            .background(Color.White)
            .border(
                width = 0.667.dp,
                color = Color(0xFFEFF3F2).copy(alpha = 0.96f),
                shape = tileShape
            )
    ) {
        Text(
            text = spec.label,
            color = Color(0xFF89939E),
            fontSize = (12f * scale).sp,
            lineHeight = (16f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1,
            modifier = Modifier
                .offset(x = 14f.scaledDp(scale), y = 16f.scaledDp(scale))
                .width(142f.scaledDp(scale))
        )

        Text(
            text = spec.value,
            color = ShopMateTextPrimary,
            fontSize = (15f * scale).sp,
            lineHeight = (18.75f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .offset(x = 14f.scaledDp(scale), y = 39f.scaledDp(scale))
                .width(142f.scaledDp(scale))
        )
    }
}

@Composable
private fun SuitabilityCard(
    product: ProductDetailUi,
    scale: Float,
    modifier: Modifier = Modifier
) {
    val cardShape = RoundedCornerShape(24f.scaledDp(scale))

    Box(
        modifier = modifier
            .shadow(
                elevation = 14f.scaledDp(scale),
                shape = cardShape,
                clip = false
            )
            .clip(cardShape)
            .background(Color.White)
            .border(
                width = 0.667.dp,
                color = Color(0xFFEFF3F2).copy(alpha = 0.96f),
                shape = cardShape
            )
    ) {
        Text(
            text = "适合你如果",
            color = ShopMateTextPrimary,
            fontSize = (15f * scale).sp,
            lineHeight = (20f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1,
            modifier = Modifier.offset(x = 15f.scaledDp(scale), y = 15.5f.scaledDp(scale))
        )

        Text(
            text = product.suitedForText.ifBlank { product.description },
            color = Color(0xFF6E7781),
            fontSize = (12f * scale).sp,
            lineHeight = (18.6f * scale).sp,
            letterSpacing = 0.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .offset(x = 15f.scaledDp(scale), y = 41.667f.scaledDp(scale))
                .size(width = 319f.scaledDp(scale), height = 38f.scaledDp(scale))
        )
    }
}

@Composable
private fun ProductDetailFooter(
    scale: Float,
    onAddCartClick: () -> Unit,
    onBuyNowClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val footerShape = RoundedCornerShape(22f.scaledDp(scale))

    Box(
        modifier = modifier
            .shadow(
                elevation = 14f.scaledDp(scale),
                shape = footerShape,
                clip = false
            )
            .clip(footerShape)
            .background(Color.White)
            .border(
                width = 0.667.dp,
                color = Color(0xFFEEF2F1),
                shape = footerShape
            )
    ) {
        Box(
            modifier = Modifier
                .offset(x = 8f.scaledDp(scale), y = 8f.scaledDp(scale))
                .size(width = 153.333f.scaledDp(scale), height = 42f.scaledDp(scale))
                .clip(ShopMatePillShape)
                .background(Color(0xFFE9FBF3))
                .clickable(role = Role.Button, onClick = onAddCartClick)
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_cart),
                contentDescription = null,
                colorFilter = ColorFilter.tint(ShopMateGreen),
                modifier = Modifier
                    .offset(x = 35f.scaledDp(scale), y = 14.5f.scaledDp(scale))
                    .size(13f.scaledDp(scale))
            )

            Text(
                text = "加入购物车",
                color = ShopMateGreen,
                fontSize = (13f * scale).sp,
                lineHeight = (17f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                textAlign = TextAlign.Center,
                maxLines = 1,
                modifier = Modifier
                    .offset(x = 55f.scaledDp(scale), y = 12.33f.scaledDp(scale))
                    .width(72f.scaledDp(scale))
            )
        }

        Box(
            modifier = Modifier
                .offset(x = 171.333f.scaledDp(scale), y = 8f.scaledDp(scale))
                .size(width = 184f.scaledDp(scale), height = 42f.scaledDp(scale))
                .shadow(
                    elevation = 12f.scaledDp(scale),
                    shape = ShopMatePillShape,
                    clip = false
                )
                .clip(ShopMatePillShape)
                .background(
                    Brush.linearGradient(
                        colors = listOf(ShopMateLightGreen, ShopMateGreen)
                    )
                )
                .clickable(role = Role.Button, onClick = onBuyNowClick)
        ) {
            Text(
                text = "立即购买",
                color = Color.White,
                fontSize = (14f * scale).sp,
                lineHeight = (18f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                textAlign = TextAlign.Center,
                maxLines = 1,
                modifier = Modifier
                    .offset(x = 50f.scaledDp(scale), y = 12f.scaledDp(scale))
                    .width(72f.scaledDp(scale))
            )

            Image(
                painter = painterResource(id = R.drawable.ic_send),
                contentDescription = null,
                modifier = Modifier
                    .offset(x = 117f.scaledDp(scale), y = 14f.scaledDp(scale))
                    .size(14f.scaledDp(scale))
            )
        }
    }
}

@Composable
private fun ProductNotFoundCard(
    scale: Float,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val cardShape = RoundedCornerShape(24f.scaledDp(scale))

    Box(
        modifier = modifier
            .shadow(
                elevation = 14f.scaledDp(scale),
                shape = cardShape,
                clip = false
            )
            .clip(cardShape)
            .background(Color.White)
            .border(
                width = 0.667.dp,
                color = Color(0xFFEFF3F2).copy(alpha = 0.96f),
                shape = cardShape
            )
    ) {
        Image(
            painter = painterResource(id = R.drawable.sidebar_shopmate_buddy),
            contentDescription = "Shopmate Buddy",
            modifier = Modifier
                .offset(x = 146f.scaledDp(scale), y = 38f.scaledDp(scale))
                .size(60f.scaledDp(scale)),
            contentScale = ContentScale.Fit
        )

        Text(
            text = "暂时找不到这个商品",
            color = ShopMateTextPrimary,
            fontSize = (20f * scale).sp,
            lineHeight = (27f * scale).sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            letterSpacing = 0.sp,
            maxLines = 1,
            modifier = Modifier
                .offset(x = 36f.scaledDp(scale), y = 116f.scaledDp(scale))
                .width(280f.scaledDp(scale))
        )

        Text(
            text = "可能是推荐结果已更新，返回后可以重新选择一个商品。",
            color = Color(0xFF6E7781),
            fontSize = (13f * scale).sp,
            lineHeight = (21f * scale).sp,
            textAlign = TextAlign.Center,
            letterSpacing = 0.sp,
            maxLines = 2,
            modifier = Modifier
                .offset(x = 42f.scaledDp(scale), y = 150f.scaledDp(scale))
                .width(268f.scaledDp(scale))
        )

        Box(
            modifier = Modifier
                .offset(x = 94f.scaledDp(scale), y = 202f.scaledDp(scale))
                .size(width = 164f.scaledDp(scale), height = 38f.scaledDp(scale))
                .clip(ShopMatePillShape)
                .background(Color(0xFFE9FBF3))
                .clickable(role = Role.Button, onClick = onBackClick),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "返回推荐结果",
                color = ShopMateGreen,
                fontSize = (13f * scale).sp,
                lineHeight = (17f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp
            )
        }
    }
}

private fun Modifier.figmaProductDetailBackground(): Modifier =
    background(
        Brush.verticalGradient(
            colors = listOf(ShopMateSurface, ShopMateSurfaceSoft)
        )
    ).drawBehind {
        drawCircle(
            brush = Brush.radialGradient(
                colorStops = arrayOf(
                    0f to Color(0xFF7FDCC1).copy(alpha = 0.17f),
                    0.125f to Color(0xFF406E61).copy(alpha = 0.085f),
                    0.25f to Color.Transparent,
                    1f to Color.Transparent
                ),
                center = Offset(
                    x = size.width * (299.27f / FIGMA_WIDTH),
                    y = size.height * (101.12f / FIGMA_HEIGHT)
                ),
                radius = size.minDimension * (79.966f / FIGMA_WIDTH)
            )
        )
    }

private fun Float.scaledDp(scale: Float): Dp = (this * scale).dp

@Preview(
    name = "Product detail - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true
)
@Composable
private fun ProductDetailScreenTargetPreview() {
    ShopMateTheme {
        ProductDetailScreenContent(
            product = MockShopMateData.findProductDetail("ui-edifier-zero-air"),
            onBackClick = {},
            onCartClick = {},
            onAddCartClick = {},
            onBuyNowClick = {}
        )
    }
}

@Preview(
    name = "Product detail not found - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true
)
@Composable
private fun ProductDetailNotFoundPreview() {
    ShopMateTheme {
        ProductDetailScreenContent(
            product = null,
            onBackClick = {},
            onCartClick = {},
            onAddCartClick = {},
            onBuyNowClick = {}
        )
    }
}
