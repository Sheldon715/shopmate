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
import androidx.compose.foundation.layout.navigationBarsPadding
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
import androidx.compose.ui.zIndex
import com.shopmate.app.R
import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.components.ShopMateElevatedSurface
import com.shopmate.app.ui.components.ShopMateFigmaFrameHeight
import com.shopmate.app.ui.components.ShopMateFigmaFrameWidth
import com.shopmate.app.ui.components.ShopMateProductImage
import com.shopmate.app.ui.components.ShopMateRoundedIconButton
import com.shopmate.app.ui.components.ShopMateSkeletonBlock
import com.shopmate.app.ui.components.ShopMateSkeletonTextLine
import com.shopmate.app.ui.components.ShopMateStatusMessage
import com.shopmate.app.ui.components.scaledDp
import com.shopmate.app.ui.model.ProductDetailSpecUi
import com.shopmate.app.ui.model.ProductDetailUi
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateLightGreen
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.ShopMateTheme
import com.shopmate.app.ui.theme.shopMateScreenBackground

@Composable
fun ProductDetailScreen(
    state: ProductDetailUiState,
    onBackClick: () -> Unit,
    onCartClick: () -> Unit,
    onRetry: () -> Unit,
    onAddCartClick: () -> Unit,
    onBuyNowClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ProductDetailScreenContent(
        state = state,
        onBackClick = onBackClick,
        onCartClick = onCartClick,
        onRetry = onRetry,
        onAddCartClick = onAddCartClick,
        onBuyNowClick = onBuyNowClick,
        modifier = modifier
    )
}

@Composable
private fun ProductDetailScreenContent(
    state: ProductDetailUiState,
    onBackClick: () -> Unit,
    onCartClick: () -> Unit,
    onRetry: () -> Unit,
    onAddCartClick: () -> Unit,
    onBuyNowClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val product = state.product
    var isFavorite by rememberSaveable(product?.id) { mutableStateOf(false) }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .shopMateScreenBackground()
    ) {
        val scale = minOf(
            maxWidth.value / ShopMateFigmaFrameWidth,
            maxHeight.value / ShopMateFigmaFrameHeight
        )
        val screenWidth = maxWidth
        val frameStart = ((maxWidth.value - ShopMateFigmaFrameWidth * scale) / 2f).dp

        fun Float.s(): Dp = scaledDp(scale)

        val headerTop = 36f.s()
        val contentTop = 80f.s()
        val footerHeight = 58f.s()
        val footerBottom = 18f.s()
        val footerTop = maxHeight - footerHeight - footerBottom
        val recommendationHeight = product?.recommendationCardHeight(scale) ?: 201.01f.s()
        val recommendationGap = 14f.s()
        val specTop = contentTop + 437.531f.s() + recommendationHeight + recommendationGap
        val suitabilityTop = specTop + 176f.s()
        val productBodyBottom = suitabilityTop + 95.188f.s()
        val scrollBodyHeight = if (product == null && !state.isLoading) {
            430f.s()
        } else {
            productBodyBottom - contentTop
        }
        val scrollContentHeight =
            (contentTop + scrollBodyHeight + footerHeight + footerBottom + 28f.s())
                .coerceAtLeast(maxHeight + 1.dp)

        Box(
            modifier = Modifier
                .fillMaxSize()
                .clipToBounds()
                .verticalScroll(rememberScrollState())
        ) {
            Box(
                modifier = Modifier.size(
                    width = screenWidth,
                    height = scrollContentHeight
                )
            ) {
                if (state.isLoading) {
                    ProductHeroSkeletonCard(
                        scale = scale,
                        modifier = Modifier
                            .offset(x = frameStart + 18f.s(), y = contentTop + 4f.s())
                            .size(width = 352.667f.s(), height = 419.531f.s())
                    )

                    RecommendationSkeletonCard(
                        scale = scale,
                        modifier = Modifier
                            .offset(x = frameStart + 18f.s(), y = contentTop + 437.531f.s())
                            .size(width = 352.667f.s(), height = recommendationHeight)
                    )

                    ProductSpecSkeletonCard(
                        scale = scale,
                        modifier = Modifier
                            .offset(x = frameStart + 18f.s(), y = specTop)
                            .size(width = 352.667f.s(), height = 162f.s())
                    )

                    SuitabilitySkeletonCard(
                        scale = scale,
                        modifier = Modifier
                            .offset(x = frameStart + 18f.s(), y = suitabilityTop)
                            .size(width = 352.667f.s(), height = 95.188f.s())
                    )
                } else if (product == null) {
                    ProductDetailStatusCard(
                        title = "暂时无法加载商品",
                        message = state.errorMessage ?: "可能是推荐结果已更新，返回后可以重新选择一个商品。",
                        actionText = if (state.canRetry) "重试" else "返回推荐结果",
                        onActionClick = if (state.canRetry) onRetry else onBackClick,
                        scale = scale,
                        modifier = Modifier
                            .offset(x = frameStart + 18f.s(), y = contentTop + 18f.s())
                            .size(width = 352.667f.s(), height = 252f.s())
                    )
                } else {
                    ProductHeroCard(
                        product = product,
                        isFavorite = isFavorite,
                        onFavoriteClick = { isFavorite = !isFavorite },
                        scale = scale,
                        modifier = Modifier
                            .offset(x = frameStart + 18f.s(), y = contentTop + 4f.s())
                            .size(width = 352.667f.s(), height = 419.531f.s())
                    )

                    RecommendationReasonCard(
                        product = product,
                        scale = scale,
                        modifier = Modifier
                            .offset(x = frameStart + 18f.s(), y = contentTop + 437.531f.s())
                            .size(width = 352.667f.s(), height = recommendationHeight)
                    )

                    ProductSpecGrid(
                        specs = product.specs,
                        scale = scale,
                        modifier = Modifier
                            .offset(x = frameStart + 18f.s(), y = specTop)
                            .size(width = 352.667f.s(), height = 162f.s())
                    )

                    SuitabilityCard(
                        product = product,
                        scale = scale,
                        modifier = Modifier
                            .offset(x = frameStart + 18f.s(), y = suitabilityTop)
                            .size(width = 352.667f.s(), height = 95.188f.s())
                    )
                }
            }
        }

        ShopMateRoundedIconButton(
            onClick = onBackClick,
            backgroundColor = Color.White.copy(alpha = 0.92f),
            modifier = Modifier
                .offset(x = frameStart + 14f.s(), y = headerTop + 3f.s())
                .size(38f.s())
                .zIndex(2f)
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_back),
                contentDescription = "返回推荐结果",
                modifier = Modifier.size(16f.s())
            )
        }

        if (product != null) {
            ProductDetailFooter(
                scale = scale,
                onAddCartClick = onAddCartClick,
                onBuyNowClick = onBuyNowClick,
                modifier = Modifier
                    .offset(x = frameStart + 12f.s(), y = footerTop)
                    .navigationBarsPadding()
                    .size(width = 364.667f.s(), height = footerHeight)
                    .zIndex(2f)
            )
        }
    }
}

private fun ProductDetailUi.recommendationCardHeight(scale: Float): Dp {
    val reasonLines = estimatedLineCount(recommendationReason, charsPerLine = 24, maxLines = 2)
    val highlightLines = highlights.take(3).sumOf { highlight ->
        estimatedLineCount(highlight, charsPerLine = 25, maxLines = 2)
    }
    val baseHeight = 86f + reasonLines * 21.45f + highlightLines * 18.6f +
        (highlights.take(3).size.coerceAtLeast(1) - 1) * 8f
    return baseHeight.coerceIn(166f, 268f).scaledDp(scale)
}

private fun estimatedLineCount(
    text: String,
    charsPerLine: Int,
    maxLines: Int,
): Int {
    val count = ((text.length + charsPerLine - 1) / charsPerLine)
        .coerceAtLeast(1)
    return count.coerceAtMost(maxLines)
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

    ShopMateElevatedSurface(
        modifier = modifier,
        shape = cardShape,
        elevation = 14f.scaledDp(scale)
    ) {
        Box(
            modifier = Modifier
                .offset(x = 16f.scaledDp(scale), y = 16f.scaledDp(scale))
                .size(width = 319.333f.scaledDp(scale), height = 238f.scaledDp(scale))
                .clip(RoundedCornerShape(20f.scaledDp(scale)))
                .background(Brush.verticalGradient(listOf(Color(0xFFF8FAF9), Color.White))),
            contentAlignment = Alignment.Center
        ) {
            ShopMateProductImage(
                imageUrl = product.imageUrl,
                placeholderRes = product.imageRes,
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

    ShopMateElevatedSurface(
        modifier = modifier,
        shape = cardShape,
        elevation = 14f.scaledDp(scale)
    ) {
        val reasonLines = estimatedLineCount(
            product.recommendationReason,
            charsPerLine = 24,
            maxLines = 2
        )
        val reasonHeight = (reasonLines * 21.45f).scaledDp(scale)
        var highlightTop = 60f + reasonLines * 21.45f + 10f

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
            text = "导购推荐理由",
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
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .offset(x = 16f.scaledDp(scale), y = 58f.scaledDp(scale))
                .size(width = 320f.scaledDp(scale), height = reasonHeight)
        )

        product.highlights.take(3).forEach { highlight ->
            val highlightLines = estimatedLineCount(
                text = highlight,
                charsPerLine = 25,
                maxLines = 2
            )
            val highlightHeight = highlightLines * 18.6f
            HighlightRow(
                text = highlight,
                scale = scale,
                modifier = Modifier
                    .offset(
                        x = 16f.scaledDp(scale),
                        y = highlightTop.scaledDp(scale)
                    )
                    .size(width = 319.333f.scaledDp(scale), height = highlightHeight.scaledDp(scale))
            )
            highlightTop += highlightHeight + 8f
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
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .offset(x = 18f.scaledDp(scale), y = 0.dp)
                .width(296f.scaledDp(scale))
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

    ShopMateElevatedSurface(
        modifier = modifier,
        shape = tileShape,
        elevation = 10f.scaledDp(scale)
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
            fontSize = (14f * scale).sp,
            lineHeight = (17f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .offset(x = 14f.scaledDp(scale), y = 36f.scaledDp(scale))
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
            text = "选择建议",
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
private fun ProductHeroSkeletonCard(
    scale: Float,
    modifier: Modifier = Modifier
) {
    ShopMateElevatedSurface(
        modifier = modifier,
        shape = RoundedCornerShape(24f.scaledDp(scale)),
        elevation = 14f.scaledDp(scale)
    ) {
        ShopMateSkeletonBlock(
            cornerRadius = 20f.scaledDp(scale),
            modifier = Modifier
                .offset(x = 16f.scaledDp(scale), y = 16f.scaledDp(scale))
                .size(width = 319.333f.scaledDp(scale), height = 238f.scaledDp(scale))
        )
        ShopMateSkeletonTextLine(
            modifier = Modifier
                .offset(x = 22f.scaledDp(scale), y = 282f.scaledDp(scale))
                .size(width = 210f.scaledDp(scale), height = 18f.scaledDp(scale))
        )
        ShopMateSkeletonTextLine(
            modifier = Modifier
                .offset(x = 22f.scaledDp(scale), y = 313f.scaledDp(scale))
                .size(width = 286f.scaledDp(scale), height = 13f.scaledDp(scale))
        )
        ShopMateSkeletonTextLine(
            modifier = Modifier
                .offset(x = 22f.scaledDp(scale), y = 336f.scaledDp(scale))
                .size(width = 240f.scaledDp(scale), height = 13f.scaledDp(scale))
        )
        ShopMateSkeletonBlock(
            cornerRadius = 999.dp,
            modifier = Modifier
                .offset(x = 22f.scaledDp(scale), y = 372f.scaledDp(scale))
                .size(width = 126f.scaledDp(scale), height = 34f.scaledDp(scale))
        )
        ShopMateSkeletonBlock(
            cornerRadius = 999.dp,
            modifier = Modifier
                .offset(x = 238f.scaledDp(scale), y = 372f.scaledDp(scale))
                .size(width = 90f.scaledDp(scale), height = 34f.scaledDp(scale))
        )
    }
}

@Composable
private fun RecommendationSkeletonCard(
    scale: Float,
    modifier: Modifier = Modifier
) {
    ProductSkeletonSurface(
        scale = scale,
        modifier = modifier
    ) {
        ShopMateSkeletonTextLine(
            modifier = Modifier
                .offset(x = 18f.scaledDp(scale), y = 18f.scaledDp(scale))
                .size(width = 112f.scaledDp(scale), height = 16f.scaledDp(scale))
        )
        ShopMateSkeletonTextLine(
            modifier = Modifier
                .offset(x = 18f.scaledDp(scale), y = 52f.scaledDp(scale))
                .size(width = 286f.scaledDp(scale), height = 13f.scaledDp(scale))
        )
        ShopMateSkeletonTextLine(
            modifier = Modifier
                .offset(x = 18f.scaledDp(scale), y = 76f.scaledDp(scale))
                .size(width = 250f.scaledDp(scale), height = 13f.scaledDp(scale))
        )
        repeat(3) { index ->
            ShopMateSkeletonTextLine(
                modifier = Modifier
                    .offset(
                        x = 18f.scaledDp(scale),
                        y = (112f + index * 28f).scaledDp(scale)
                    )
                    .size(width = (210f - index * 18f).scaledDp(scale), height = 12f.scaledDp(scale))
            )
        }
    }
}

@Composable
private fun ProductSpecSkeletonCard(
    scale: Float,
    modifier: Modifier = Modifier
) {
    ProductSkeletonSurface(
        scale = scale,
        modifier = modifier
    ) {
        ShopMateSkeletonTextLine(
            modifier = Modifier
                .offset(x = 18f.scaledDp(scale), y = 18f.scaledDp(scale))
                .size(width = 92f.scaledDp(scale), height = 16f.scaledDp(scale))
        )
        repeat(4) { index ->
            val column = index % 2
            val row = index / 2
            ShopMateSkeletonBlock(
                cornerRadius = 14f.scaledDp(scale),
                modifier = Modifier
                    .offset(
                        x = (18f + column * 162f).scaledDp(scale),
                        y = (52f + row * 54f).scaledDp(scale)
                    )
                    .size(width = 144f.scaledDp(scale), height = 42f.scaledDp(scale))
            )
        }
    }
}

@Composable
private fun SuitabilitySkeletonCard(
    scale: Float,
    modifier: Modifier = Modifier
) {
    ProductSkeletonSurface(
        scale = scale,
        modifier = modifier
    ) {
        ShopMateSkeletonTextLine(
            modifier = Modifier
                .offset(x = 18f.scaledDp(scale), y = 18f.scaledDp(scale))
                .size(width = 118f.scaledDp(scale), height = 16f.scaledDp(scale))
        )
        ShopMateSkeletonTextLine(
            modifier = Modifier
                .offset(x = 18f.scaledDp(scale), y = 52f.scaledDp(scale))
                .size(width = 276f.scaledDp(scale), height = 13f.scaledDp(scale))
        )
    }
}

@Composable
private fun ProductSkeletonSurface(
    scale: Float,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    ShopMateElevatedSurface(
        modifier = modifier,
        shape = RoundedCornerShape(22f.scaledDp(scale)),
        elevation = 8f.scaledDp(scale),
        backgroundColor = Color.White.copy(alpha = 0.96f),
        borderColor = Color(0xFFF0F3F2)
    ) {
        content()
    }
}

@Composable
private fun ProductDetailStatusCard(
    title: String,
    message: String,
    actionText: String,
    onActionClick: () -> Unit,
    scale: Float,
    modifier: Modifier = Modifier
) {
    ShopMateStatusMessage(
        title = title,
        message = message,
        actionText = actionText,
        onActionClick = onActionClick,
        scale = scale,
        modifier = modifier
    )
}

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
            state = ProductDetailUiState(
                productId = "ui-edifier-zero-air",
                product = MockShopMateData.findProductDetail("ui-edifier-zero-air")
            ),
            onBackClick = {},
            onCartClick = {},
            onRetry = {},
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
            state = ProductDetailUiState(
                productId = "missing",
                errorMessage = "商品不存在或已下架。"
            ),
            onBackClick = {},
            onCartClick = {},
            onRetry = {},
            onAddCartClick = {},
            onBuyNowClick = {}
        )
    }
}

@Preview(
    name = "Product detail long title - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true
)
@Composable
private fun ProductDetailCompactPreview() {
    ShopMateTheme {
        ProductDetailScreenContent(
            state = ProductDetailUiState(
                productId = "ui-la-roche-posay-sunscreen",
                product = MockShopMateData.findProductDetail("ui-la-roche-posay-sunscreen")
            ),
            onBackClick = {},
            onCartClick = {},
            onRetry = {},
            onAddCartClick = {},
            onBuyNowClick = {}
        )
    }
}
