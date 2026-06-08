package com.shopmate.app.ui.comparison

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
import com.shopmate.app.ui.components.ShopMateStatusMessage
import com.shopmate.app.ui.components.scaledDp
import com.shopmate.app.ui.model.ComparisonCellUi
import com.shopmate.app.ui.model.ComparisonHighlightUi
import com.shopmate.app.ui.model.ComparisonRowUi
import com.shopmate.app.ui.model.ComparisonUi
import com.shopmate.app.ui.model.ProductCardUi
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.ShopMateTheme
import com.shopmate.app.ui.theme.shopMateScreenBackground

@Composable
fun ProductComparisonScreen(
    comparison: ComparisonUi = MockShopMateData.sunscreenComparison,
    onBackClick: () -> Unit,
    onCartClick: () -> Unit,
    onAddCartClick: (String) -> Unit,
    onProductClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .shopMateScreenBackground(),
    ) {
        val scale = minOf(
            maxWidth.value / ShopMateFigmaFrameWidth,
            maxHeight.value / ShopMateFigmaFrameHeight,
        )
        val frameStart = ((maxWidth.value - ShopMateFigmaFrameWidth * scale) / 2f).dp

        fun Float.s(): Dp = scaledDp(scale)

        val headerTop = 36f.s()
        val contentTop = 96f.s()
        val contentWidth = 352.667f.s()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(top = contentTop, bottom = 32f.s())
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14f.s()),
        ) {
            ComparisonHeroCard(
                comparison = comparison,
                scale = scale,
                modifier = Modifier.width(contentWidth),
            )

            ComparisonProductSection(
                products = comparison.products,
                recommendedProductId = comparison.recommendedProductId,
                scale = scale,
                onProductClick = onProductClick,
                onAddCartClick = onAddCartClick,
                modifier = Modifier.width(contentWidth),
            )

            ComparisonRowsSection(
                rows = comparison.rows,
                products = comparison.products,
                scale = scale,
                modifier = Modifier.width(contentWidth),
            )

            if (comparison.highlights.isNotEmpty()) {
                ComparisonHighlightsSection(
                    highlights = comparison.highlights,
                    products = comparison.products,
                    scale = scale,
                    modifier = Modifier.width(contentWidth),
                )
            }

            RecommendationConclusionCard(
                comparison = comparison,
                scale = scale,
                modifier = Modifier.width(contentWidth),
            )
        }

        ShopMateRoundedIconButton(
            onClick = onBackClick,
            backgroundColor = Color.White.copy(alpha = 0.94f),
            elevation = 12f.s(),
            modifier = Modifier
                .offset(x = frameStart + 14f.s(), y = headerTop + 3f.s())
                .size(38f.s())
                .zIndex(2f),
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_back),
                contentDescription = "返回聊天",
                modifier = Modifier.size(16f.s()),
            )
        }

        ShopMateRoundedIconButton(
            onClick = onCartClick,
            backgroundColor = Color.White.copy(alpha = 0.94f),
            elevation = 12f.s(),
            modifier = Modifier
                .offset(x = frameStart + 337f.s(), y = headerTop + 3f.s())
                .size(38f.s())
                .zIndex(2f),
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_cart),
                contentDescription = "购物车",
                modifier = Modifier.size(17f.s()),
            )
        }
    }
}

@Composable
fun ProductComparisonUnavailableScreen(
    onBackClick: () -> Unit,
    onCartClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .shopMateScreenBackground(),
    ) {
        val scale = minOf(
            maxWidth.value / ShopMateFigmaFrameWidth,
            maxHeight.value / ShopMateFigmaFrameHeight,
        )
        val frameStart = ((maxWidth.value - ShopMateFigmaFrameWidth * scale) / 2f).dp

        fun Float.s(): Dp = scaledDp(scale)

        ShopMateStatusMessage(
            title = "暂时无法打开对比",
            message = "这组对比信息可能已更新，返回聊天后可以重新发起对比。",
            actionText = "返回聊天",
            onActionClick = onBackClick,
            scale = scale,
            modifier = Modifier
                .offset(x = frameStart + 18f.s(), y = 238f.s())
                .size(width = 352.667f.s(), height = 252f.s()),
        )

        ShopMateRoundedIconButton(
            onClick = onBackClick,
            backgroundColor = Color.White.copy(alpha = 0.94f),
            elevation = 12f.s(),
            modifier = Modifier
                .offset(x = frameStart + 14f.s(), y = 39f.s())
                .size(38f.s())
                .zIndex(2f),
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_back),
                contentDescription = "返回聊天",
                modifier = Modifier.size(16f.s()),
            )
        }

        ShopMateRoundedIconButton(
            onClick = onCartClick,
            backgroundColor = Color.White.copy(alpha = 0.94f),
            elevation = 12f.s(),
            modifier = Modifier
                .offset(x = frameStart + 337f.s(), y = 39f.s())
                .size(38f.s())
                .zIndex(2f),
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_cart),
                contentDescription = "购物车",
                modifier = Modifier.size(17f.s()),
            )
        }
    }
}

@Composable
private fun ComparisonHeroCard(
    comparison: ComparisonUi,
    scale: Float,
    modifier: Modifier = Modifier,
) {
    ComparisonSectionSurface(
        scale = scale,
        modifier = modifier,
        backgroundColor = Color.White.copy(alpha = 0.98f),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Box(
                modifier = Modifier
                    .size(42f.scaledDp(scale))
                    .clip(CircleShape)
                    .background(Color(0xFFE8F9F2)),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(id = R.drawable.sidebar_shopmate_buddy),
                    contentDescription = null,
                    modifier = Modifier.size(31f.scaledDp(scale)),
                    contentScale = ContentScale.Fit,
                )
            }

            Column(
                modifier = Modifier
                    .padding(start = 12f.scaledDp(scale))
                    .weight(1f),
            ) {
                Text(
                    text = "商品对比详情",
                    color = ShopMateGreen,
                    fontSize = (12f * scale).sp,
                    lineHeight = (16f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                )
                Text(
                    text = comparison.title.ifBlank { "商品对比" },
                    color = ShopMateTextPrimary,
                    fontSize = (19f * scale).sp,
                    lineHeight = (26f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                    modifier = Modifier.padding(top = 4f.scaledDp(scale)),
                )
            }
        }

        Text(
            text = comparison.assistantText.ifBlank { comparison.summaryText },
            color = Color(0xFF5F6975),
            fontSize = (13f * scale).sp,
            lineHeight = (21f * scale).sp,
            letterSpacing = 0.sp,
            modifier = Modifier.padding(top = 14f.scaledDp(scale)),
        )

        if (comparison.queryText.isNotBlank()) {
            Text(
                text = comparison.queryText,
                color = Color(0xFF7A858F),
                fontSize = (11.5f * scale).sp,
                lineHeight = (17f * scale).sp,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .padding(top = 10f.scaledDp(scale))
                    .clip(RoundedCornerShape(12f.scaledDp(scale)))
                    .background(Color(0xFFF5F8F7))
                    .padding(
                        horizontal = 12f.scaledDp(scale),
                        vertical = 8f.scaledDp(scale),
                    ),
            )
        }
    }
}

@Composable
private fun ComparisonProductSection(
    products: List<ProductCardUi>,
    recommendedProductId: String?,
    scale: Float,
    onProductClick: (String) -> Unit,
    onAddCartClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    ComparisonSectionCard(
        title = "对比商品",
        scale = scale,
        modifier = modifier,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10f.scaledDp(scale)),
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
        ) {
            products.take(COMPARISON_PRODUCT_COUNT).forEachIndexed { index, product ->
                ComparisonProductSummaryCard(
                    product = product,
                    index = index + 1,
                    isRecommended = product.id == recommendedProductId,
                    scale = scale,
                    onProductClick = { onProductClick(product.id) },
                    onAddCartClick = { onAddCartClick(product.id) },
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
            }
        }
    }
}

@Composable
private fun ComparisonProductSummaryCard(
    product: ProductCardUi,
    index: Int,
    isRecommended: Boolean,
    scale: Float,
    onProductClick: () -> Unit,
    onAddCartClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(18f.scaledDp(scale))
    val background = if (isRecommended) {
        Brush.linearGradient(listOf(Color(0xFFE9FBF4), Color.White))
    } else {
        Brush.linearGradient(listOf(Color(0xFFF9FBFB), Color.White))
    }

    Box(
        modifier = modifier
            .clip(shape)
            .background(background)
            .border(
                width = 0.667.dp,
                color = if (isRecommended) ShopMateGreen.copy(alpha = 0.22f) else Color(0xFFEFF3F2),
                shape = shape,
            )
            .padding(12f.scaledDp(scale)),
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .size(29f.scaledDp(scale))
                .clip(CircleShape)
                .background(Color(0xFFA9F0D3)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = index.toString(),
                color = Color(0xFF18865C),
                fontSize = (13f * scale).sp,
                lineHeight = (16f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
            )
        }

        Column(
            horizontalAlignment = Alignment.Start,
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(),
        ) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .size(86f.scaledDp(scale))
                    .clip(RoundedCornerShape(16f.scaledDp(scale)))
                    .background(Color.White)
                    .clickable(onClick = onProductClick),
                contentAlignment = Alignment.Center,
            ) {
                ShopMateProductImage(
                    imageUrl = product.imageUrl,
                    placeholderRes = product.imageRes,
                    contentDescription = product.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            }

            Text(
                text = "商品$index",
                color = ShopMateGreen,
                fontSize = (11f * scale).sp,
                lineHeight = (15f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .padding(top = 10f.scaledDp(scale))
                    .clip(ShopMatePillShape)
                    .background(Color(0xFFE8F9F2))
                    .padding(
                        horizontal = 8f.scaledDp(scale),
                        vertical = 3f.scaledDp(scale),
                    ),
            )

            Text(
                text = product.name,
                color = ShopMateTextPrimary,
                fontSize = (13.2f * scale).sp,
                lineHeight = (18.5f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .padding(top = 8f.scaledDp(scale))
                    .clickable(onClick = onProductClick),
            )

            Text(
                text = product.priceText,
                color = ShopMateGreen,
                fontSize = (18f * scale).sp,
                lineHeight = (22f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                modifier = Modifier.padding(top = 6f.scaledDp(scale)),
            )

            ProductTagRow(
                tags = product.tags.take(2),
                scale = scale,
                modifier = Modifier.padding(top = 6f.scaledDp(scale)),
            )

            if (isRecommended) {
                Text(
                    text = "当前推荐",
                    color = ShopMateGreen,
                    fontSize = (10.5f * scale).sp,
                    lineHeight = (14.5f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                    modifier = Modifier
                        .padding(top = 7f.scaledDp(scale))
                        .clip(ShopMatePillShape)
                        .background(Color(0xFFDDF8EC))
                        .padding(
                            horizontal = 9f.scaledDp(scale),
                            vertical = 4f.scaledDp(scale),
                        ),
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            ComparisonActionPill(
                text = "加入购物车",
                iconRes = R.drawable.ic_cart,
                scale = scale,
                onClick = onAddCartClick,
                modifier = Modifier
                    .padding(top = 10f.scaledDp(scale))
                    .fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ComparisonRowsSection(
    rows: List<ComparisonRowUi>,
    products: List<ProductCardUi>,
    scale: Float,
    modifier: Modifier = Modifier,
) {
    ComparisonSectionCard(
        title = "核心参数",
        scale = scale,
        modifier = modifier,
    ) {
        rows.forEachIndexed { index, row ->
            if (index > 0) {
                Spacer(modifier = Modifier.height(12f.scaledDp(scale)))
            }
            ComparisonDimensionCard(
                row = row,
                products = products.take(COMPARISON_PRODUCT_COUNT),
                scale = scale,
            )
        }
    }
}

@Composable
private fun ComparisonDimensionCard(
    row: ComparisonRowUi,
    products: List<ProductCardUi>,
    scale: Float,
) {
    val shape = RoundedCornerShape(16f.scaledDp(scale))

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Color(0xFFFBFDFC))
            .border(
                width = 0.667.dp,
                color = Color(0xFFEEF2F1),
                shape = shape,
            )
            .padding(12f.scaledDp(scale)),
    ) {
        Text(
            text = row.label,
            color = ShopMateTextPrimary,
            fontSize = (14f * scale).sp,
            lineHeight = (20f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(8f.scaledDp(scale)),
            modifier = Modifier
                .padding(top = 10f.scaledDp(scale))
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
        ) {
            products.forEachIndexed { index, product ->
                val cell = row.cells.firstOrNull { item -> item.productId == product.id }
                ComparisonValueBlock(
                    product = product,
                    index = index + 1,
                    cell = cell,
                    scale = scale,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
            }
        }
    }
}

@Composable
private fun ComparisonValueBlock(
    product: ProductCardUi,
    index: Int,
    cell: ComparisonCellUi?,
    scale: Float,
    modifier: Modifier = Modifier,
) {
    val highlighted = cell?.highlighted == true
    val shape = RoundedCornerShape(14f.scaledDp(scale))

    Column(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 64f.scaledDp(scale))
            .clip(shape)
            .background(
                if (highlighted) {
                    Color(0xFFE8F9F2)
                } else {
                    Color.White
                },
            )
            .border(
                width = 0.667.dp,
                color = if (highlighted) ShopMateGreen.copy(alpha = 0.18f) else Color(0xFFF0F3F3),
                shape = shape,
            )
            .padding(11f.scaledDp(scale)),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = "商品$index",
                color = ShopMateGreen,
                fontSize = (11f * scale).sp,
                lineHeight = (15f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .clip(ShopMatePillShape)
                    .background(if (highlighted) Color.White else Color(0xFFE8F9F2))
                    .padding(
                        horizontal = 8f.scaledDp(scale),
                        vertical = 3f.scaledDp(scale),
                    ),
            )

            if (highlighted) {
                Text(
                    text = "更优",
                    color = ShopMateGreen,
                    fontSize = (11f * scale).sp,
                    lineHeight = (15f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                    modifier = Modifier.padding(start = 7f.scaledDp(scale)),
                )
            }
        }

        Text(
            text = cell?.value.orEmpty().ifBlank { "暂无参数" },
            color = if (highlighted) Color(0xFF16885E) else Color(0xFF25313D),
            fontSize = (13f * scale).sp,
            lineHeight = (20f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            modifier = Modifier.padding(top = 5f.scaledDp(scale)),
        )
    }
}

@Composable
private fun ComparisonHighlightsSection(
    highlights: List<ComparisonHighlightUi>,
    products: List<ProductCardUi>,
    scale: Float,
    modifier: Modifier = Modifier,
) {
    val highlightedProducts = comparisonHighlightDisplayItems(
        highlights = highlights,
        products = products,
    )

    if (highlightedProducts.isEmpty()) {
        return
    }

    ComparisonSectionCard(
        title = "推荐亮点",
        scale = scale,
        modifier = modifier,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8f.scaledDp(scale)),
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
        ) {
            highlightedProducts.forEach { item ->
                HighlightBlock(
                    index = item.productIndex,
                    highlight = item.highlight,
                    scale = scale,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
            }
        }
    }
}

@Composable
private fun HighlightBlock(
    index: Int,
    highlight: ComparisonHighlightUi,
    scale: Float,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16f.scaledDp(scale)))
            .background(Color(0xFFF5FCF9))
            .border(
                width = 0.667.dp,
                color = Color(0xFFE5F3EE),
                shape = RoundedCornerShape(16f.scaledDp(scale)),
            )
            .padding(12f.scaledDp(scale)),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "商品$index",
                color = ShopMateGreen,
                fontSize = (11f * scale).sp,
                lineHeight = (15f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .clip(ShopMatePillShape)
                    .background(Color.White)
                    .padding(
                        horizontal = 8f.scaledDp(scale),
                        vertical = 3f.scaledDp(scale),
                    ),
            )
            highlight.label.takeIf { label -> label.isNotBlank() }?.let { label ->
                Text(
                    text = label,
                    color = ShopMateGreen,
                    fontSize = (11f * scale).sp,
                    lineHeight = (15f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                    modifier = Modifier.padding(start = 7f.scaledDp(scale)),
                )
            }
        }

        Text(
            text = highlight.text,
            color = Color(0xFF2D3945),
            fontSize = (13f * scale).sp,
            lineHeight = (20f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            modifier = Modifier.padding(top = 7f.scaledDp(scale)),
        )
    }
}

@Composable
private fun ProductTagRow(
    tags: List<String>,
    scale: Float,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(5f.scaledDp(scale)),
        verticalArrangement = Arrangement.spacedBy(5f.scaledDp(scale)),
        modifier = modifier.fillMaxWidth(),
    ) {
        tags.forEach { tag ->
            Text(
                text = tag,
                color = ShopMateGreen,
                fontSize = (10.5f * scale).sp,
                lineHeight = (14.5f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .clip(ShopMatePillShape)
                    .background(Color(0xFFE6F8F0))
                    .padding(
                        horizontal = 8f.scaledDp(scale),
                        vertical = 3f.scaledDp(scale),
                    ),
            )
        }
    }
}

@Composable
private fun RecommendationConclusionCard(
    comparison: ComparisonUi,
    scale: Float,
    modifier: Modifier = Modifier,
) {
    ComparisonSectionSurface(
        scale = scale,
        modifier = modifier,
        backgroundColor = Color.White.copy(alpha = 0.98f),
    ) {
        Row(
            verticalAlignment = Alignment.Top,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Box(
                modifier = Modifier
                    .size(76f.scaledDp(scale))
                    .clip(CircleShape)
                    .background(Color(0xFFE8F9F2)),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(id = R.drawable.comparison_recommendation_buddy),
                    contentDescription = "Shopmate Buddy",
                    modifier = Modifier.size(72f.scaledDp(scale)),
                    contentScale = ContentScale.Fit,
                )
            }

            Column(
                modifier = Modifier
                    .padding(start = 13f.scaledDp(scale))
                    .weight(1f),
            ) {
                Text(
                    text = "推荐结论",
                    color = ShopMateGreen,
                    fontSize = (16f * scale).sp,
                    lineHeight = (21f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                )
                Text(
                    text = comparison.summaryWithHighlight(),
                    color = Color(0xFF5F6975),
                    fontSize = (13f * scale).sp,
                    lineHeight = (21f * scale).sp,
                    letterSpacing = 0.sp,
                    modifier = Modifier.padding(top = 8f.scaledDp(scale)),
                )
            }
        }
    }
}

@Composable
private fun ComparisonSectionCard(
    title: String,
    scale: Float,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    ComparisonSectionSurface(
        scale = scale,
        modifier = modifier,
    ) {
        Text(
            text = title,
            color = ShopMateTextPrimary,
            fontSize = (16f * scale).sp,
            lineHeight = (21f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )
        Spacer(modifier = Modifier.height(12f.scaledDp(scale)))
        content()
    }
}

@Composable
private fun ComparisonSectionSurface(
    scale: Float,
    modifier: Modifier = Modifier,
    backgroundColor: Color = Color.White,
    content: @Composable ColumnScope.() -> Unit,
) {
    ShopMateElevatedSurface(
        modifier = modifier,
        shape = RoundedCornerShape(24f.scaledDp(scale)),
        elevation = 14f.scaledDp(scale),
        backgroundColor = backgroundColor,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16f.scaledDp(scale)),
            content = content,
        )
    }
}

@Composable
private fun ComparisonActionPill(
    text: String,
    iconRes: Int?,
    scale: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .heightIn(min = 32f.scaledDp(scale))
            .clip(ShopMatePillShape)
            .background(Color.White.copy(alpha = 0.9f))
            .border(
                width = 0.667.dp,
                color = Color(0xFFE8F0EE),
                shape = ShopMatePillShape,
            )
            .clickable(role = Role.Button, onClick = onClick)
            .padding(
                horizontal = 10f.scaledDp(scale),
                vertical = 7f.scaledDp(scale),
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        iconRes?.let { resId ->
            Image(
                painter = painterResource(id = resId),
                contentDescription = null,
                colorFilter = ColorFilter.tint(ShopMateGreen),
                modifier = Modifier.size(13f.scaledDp(scale)),
            )
            Spacer(modifier = Modifier.width(5f.scaledDp(scale)))
        }

        Text(
            text = text,
            color = ShopMateGreen,
            fontSize = (11.5f * scale).sp,
            lineHeight = (15f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            textAlign = TextAlign.Center,
        )
    }
}

private fun ComparisonUi.summaryWithHighlight(): String {
    val firstHighlight = highlights.firstOrNull() ?: return summaryText
    return "$summaryText ${firstHighlight.label}：${firstHighlight.text}"
}

private const val COMPARISON_PRODUCT_COUNT = 2

internal data class ComparisonHighlightDisplayItem(
    val product: ProductCardUi,
    val productIndex: Int,
    val highlight: ComparisonHighlightUi,
)

internal fun comparisonHighlightDisplayItems(
    highlights: List<ComparisonHighlightUi>,
    products: List<ProductCardUi>,
): List<ComparisonHighlightDisplayItem> =
    products
        .take(COMPARISON_PRODUCT_COUNT)
        .mapIndexedNotNull { index, product ->
            highlights
                .firstOrNull { highlight ->
                    highlight.productId == product.id && highlight.text.isNotBlank()
                }
                ?.let { highlight ->
                    ComparisonHighlightDisplayItem(
                        product = product,
                        productIndex = index + 1,
                        highlight = highlight,
                    )
                }
        }

@Preview(
    name = "Product comparison - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true,
)
@Composable
private fun ProductComparisonScreenTargetPreview() {
    ShopMateTheme {
        ProductComparisonScreen(
            onBackClick = {},
            onCartClick = {},
            onAddCartClick = {},
            onProductClick = {},
        )
    }
}

@Preview(
    name = "Product comparison - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true,
)
@Composable
private fun ProductComparisonScreenCompactPreview() {
    ShopMateTheme {
        ProductComparisonScreen(
            onBackClick = {},
            onCartClick = {},
            onAddCartClick = {},
            onProductClick = {},
        )
    }
}
