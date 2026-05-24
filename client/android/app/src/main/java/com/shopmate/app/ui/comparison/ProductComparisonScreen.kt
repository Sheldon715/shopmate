package com.shopmate.app.ui.comparison

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
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
import com.shopmate.app.ui.components.ChatComposer
import com.shopmate.app.ui.components.ShopMateRoundedIconButton
import com.shopmate.app.ui.model.ComparisonRowUi
import com.shopmate.app.ui.model.ComparisonUi
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.ProductCardUi
import com.shopmate.app.ui.sidebar.SidebarHistoryDrawer
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateSurface
import com.shopmate.app.ui.theme.ShopMateSurfaceSoft
import com.shopmate.app.ui.theme.ShopMateTheme

private const val FIGMA_WIDTH = 388.667f
private const val FIGMA_HEIGHT = 842.667f

@Composable
fun ProductComparisonScreen(
    onNewChatClick: () -> Unit,
    onCartClick: () -> Unit,
    onHistoryClick: (HistoryConversationUi) -> Unit,
    modifier: Modifier = Modifier
) {
    val comparison = MockShopMateData.sunscreenComparison
    var composerText by rememberSaveable { mutableStateOf("") }
    var isSidebarOpen by rememberSaveable { mutableStateOf(false) }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .figmaComparisonBackground()
    ) {
        val scale = maxWidth.value / FIGMA_WIDTH

        fun Float.s(): Dp = scaledDp(scale)

        val headerTop = 36f.s()
        val contentTop = 80f.s()
        val composerHeight = 52f.s()
        val composerBottom = 18f.s()
        val composerTop = maxHeight - composerHeight - composerBottom
        val contentBottomGap = 10f.s()
        val contentHeight = (composerTop - contentTop - contentBottomGap).coerceAtLeast(360.dp)
        val scrollContentHeight = 880f.s()

        ComparisonHeader(
            scale = scale,
            onMenuClick = { isSidebarOpen = true },
            onCartClick = onCartClick,
            modifier = Modifier
                .offset(x = 0.dp, y = headerTop)
                .size(width = FIGMA_WIDTH.s(), height = 44f.s())
        )

        Box(
            modifier = Modifier
                .offset(x = 0.dp, y = contentTop)
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
                MessageBubble(
                    text = comparison.queryText,
                    fromUser = true,
                    textScale = scale,
                    modifier = Modifier
                        .offset(x = 116f.s(), y = 14f.s())
                        .size(width = 256.667f.s(), height = 62f.s())
                )
                MessageBubble(
                    text = comparison.assistantText,
                    fromUser = false,
                    textScale = scale,
                    modifier = Modifier
                        .offset(x = 16f.s(), y = 86f.s())
                        .size(width = 296f.s(), height = 88f.s())
                )

                ComparisonResultCard(
                    comparison = comparison,
                    scale = scale,
                    modifier = Modifier
                        .offset(x = 14f.s(), y = 188f.s())
                        .size(width = 360.667f.s(), height = 668f.s())
                )
            }
        }

        ChatComposer(
            value = composerText,
            onValueChange = { composerText = it },
            onSend = {},
            onVoiceClick = {},
            onImageClick = {},
            shadowElevation = 0.dp,
            modifier = Modifier
                .offset(x = 18f.s(), y = composerTop)
                .imePadding()
                .navigationBarsPadding()
                .size(width = 352.667f.s(), height = composerHeight)
        )

        SidebarHistoryDrawer(
            isOpen = isSidebarOpen,
            conversations = MockShopMateData.historyConversations,
            onDismiss = { isSidebarOpen = false },
            onNewChatClick = {
                isSidebarOpen = false
                onNewChatClick()
            },
            onCartClick = onCartClick,
            onSettingsClick = {},
            onHistoryClick = { conversation ->
                isSidebarOpen = false
                onHistoryClick(conversation)
            }
        )
    }
}

@Composable
private fun ComparisonResultCard(
    comparison: ComparisonUi,
    scale: Float,
    modifier: Modifier = Modifier
) {
    val cardShape = RoundedCornerShape(26f.scaledDp(scale))

    Box(
        modifier = modifier
            .shadow(
                elevation = 14f.scaledDp(scale),
                shape = cardShape,
                clip = false
            )
            .clip(cardShape)
            .background(Color.White.copy(alpha = 0.97f))
            .border(
                width = 0.667.dp,
                color = Color(0xFFEFF3F2).copy(alpha = 0.96f),
                shape = cardShape
            )
    ) {
        ComparisonProductTile(
            product = comparison.products[0],
            index = 1,
            scale = scale,
            modifier = Modifier
                .offset(x = 12f.scaledDp(scale), y = 12f.scaledDp(scale))
                .size(width = 160.333f.scaledDp(scale), height = 198.667f.scaledDp(scale))
        )

        ComparisonProductTile(
            product = comparison.products[1],
            index = 2,
            scale = scale,
            withMintGlow = true,
            modifier = Modifier
                .offset(x = 184.33f.scaledDp(scale), y = 12f.scaledDp(scale))
                .size(width = 160.333f.scaledDp(scale), height = 198.667f.scaledDp(scale))
        )

        ComparisonTable(
            comparison = comparison,
            scale = scale,
            modifier = Modifier
                .offset(x = 12f.scaledDp(scale), y = 222.667f.scaledDp(scale))
                .size(width = 332.667f.scaledDp(scale), height = 300f.scaledDp(scale))
        )

        RecommendationConclusion(
            comparison = comparison,
            scale = scale,
            modifier = Modifier
                .offset(x = 12f.scaledDp(scale), y = 540f.scaledDp(scale))
                .size(width = 332.667f.scaledDp(scale), height = 112f.scaledDp(scale))
        )
    }
}

@Composable
private fun ComparisonProductTile(
    product: ProductCardUi,
    index: Int,
    scale: Float,
    modifier: Modifier = Modifier,
    withMintGlow: Boolean = false
) {
    val tileShape = RoundedCornerShape(22f.scaledDp(scale))

    Box(
        modifier = modifier
            .clip(tileShape)
            .background(
                brush = if (withMintGlow) {
                    Brush.radialGradient(
                        colorStops = arrayOf(
                            0f to ShopMateGreen.copy(alpha = 0.12f),
                            0.28f to Color.Transparent,
                            1f to Color.Transparent
                        ),
                        center = Offset(
                            147.51f.scaledDp(scale).value,
                            23.84f.scaledDp(scale).value
                        ),
                        radius = 24f.scaledDp(scale).value
                    )
                } else {
                    Brush.verticalGradient(listOf(Color.White, Color(0xFFFBFCFC)))
                }
            )
            .border(
                width = 0.667.dp,
                color = Color(0xFFF1F3F3).copy(alpha = 0.92f),
                shape = tileShape
            )
            .clickable(role = Role.Button, onClick = {})
    ) {
        Box(
            modifier = Modifier
                .offset(x = 26.83f.scaledDp(scale), y = 22f.scaledDp(scale))
                .size(width = 104f.scaledDp(scale), height = 86f.scaledDp(scale))
                .clip(RoundedCornerShape(16f.scaledDp(scale)))
                .background(Color(0xFFF7F8F8)),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = product.imageRes),
                contentDescription = product.name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        }

        Box(
            modifier = Modifier
                .offset(x = 12f.scaledDp(scale), y = 12f.scaledDp(scale))
                .size(30f.scaledDp(scale))
                .clip(CircleShape)
                .background(Color(0xFFA9F0D3)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = index.toString(),
                color = Color(0xFF18865C),
                fontSize = (15f * scale).sp,
                fontWeight = FontWeight.Bold,
                lineHeight = (18f * scale).sp,
                letterSpacing = 0.sp
            )
        }

        Text(
            text = comparisonTileTitle(product),
            color = Color(0xFF1E2A36),
            fontSize = (12.5f * scale).sp,
            lineHeight = (15.8f * scale).sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 12f.scaledDp(scale), y = 118f.scaledDp(scale))
                .size(width = 133.667f.scaledDp(scale), height = 34f.scaledDp(scale))
        )

        Text(
            text = comparisonTileSubtitle(product),
            color = Color(0xFF7C8791),
            fontSize = (11f * scale).sp,
            lineHeight = (13.75f * scale).sp,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 12f.scaledDp(scale), y = 151f.scaledDp(scale))
                .size(width = 133.667f.scaledDp(scale), height = 14f.scaledDp(scale))
        )

        Text(
            text = product.priceText,
            color = Color(0xFF172331),
            fontSize = (20f * scale).sp,
            lineHeight = (20f * scale).sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            letterSpacing = 0.sp,
            maxLines = 1,
            modifier = Modifier
                .offset(x = 40f.scaledDp(scale), y = 170f.scaledDp(scale))
                .size(width = 74f.scaledDp(scale), height = 22f.scaledDp(scale))
        )

        ShopMateRoundedIconButton(
            onClick = {},
            backgroundColor = Color.White,
            shape = CircleShape,
            elevation = 7f.scaledDp(scale),
            modifier = Modifier
                .offset(x = 114.67f.scaledDp(scale), y = 154f.scaledDp(scale))
                .size(31f.scaledDp(scale))
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_add_plus),
                contentDescription = "加入购物车",
                modifier = Modifier.size(16f.scaledDp(scale))
            )
        }
    }
}

@Composable
private fun ComparisonHeader(
    scale: Float,
    onMenuClick: () -> Unit,
    onCartClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)

    Box(modifier = modifier) {
        HeaderIconButton(
            icon = R.drawable.ic_menu,
            contentDescription = "打开侧边栏",
            onClick = onMenuClick,
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
private fun MessageBubble(
    text: String,
    fromUser: Boolean,
    textScale: Float,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .shadow(
                elevation = 8.dp,
                shape = RoundedCornerShape(16.dp),
                clip = false
            )
            .background(
                brush = if (fromUser) {
                    Brush.linearGradient(
                        colors = listOf(Color(0xFFCEF5E5), Color(0xFFB5EFD9))
                    )
                } else {
                    Brush.linearGradient(listOf(Color.White, Color.White))
                },
                shape = RoundedCornerShape(16.dp)
            )
            .border(
                width = if (fromUser) 0.dp else 0.667.dp,
                color = if (fromUser) Color.Transparent else Color(0xFFF0F3F3),
                shape = RoundedCornerShape(16.dp)
            )
    ) {
        Text(
            text = text,
            color = if (fromUser) Color(0xFF275747) else Color(0xFF53606B),
            fontSize = (12f * textScale).sp,
            lineHeight = (19.2f * textScale).sp,
            letterSpacing = 0.sp,
            modifier = Modifier.padding(start = 14.dp, top = 12.dp, end = 14.dp)
        )
    }
}

@Composable
private fun ComparisonTable(
    comparison: ComparisonUi,
    scale: Float,
    modifier: Modifier = Modifier
) {
    val firstProduct = comparison.products[0]
    val secondProduct = comparison.products[1]
    val tableShape = RoundedCornerShape(20f.scaledDp(scale))

    Column(
        modifier = modifier
            .clip(tableShape)
            .background(Color.White.copy(alpha = 0.96f))
            .border(
                width = 0.667.dp,
                color = Color(0xFFEDF2F1),
                shape = tableShape
            )
    ) {
        comparison.rows.forEachIndexed { index, row ->
            ComparisonTableRow(
                row = row,
                firstProduct = firstProduct,
                secondProduct = secondProduct,
                scale = scale,
                showTopDivider = index > 0,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            )
        }
    }
}

@Composable
private fun ComparisonTableRow(
    row: ComparisonRowUi,
    firstProduct: ProductCardUi,
    secondProduct: ProductCardUi,
    scale: Float,
    showTopDivider: Boolean,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .drawBehind {
                val strokeWidth = 0.667.dp.toPx()
                val labelWidth = 82f.scaledDp(scale).toPx()
                val productWidth = (size.width - labelWidth) / 2f

                if (showTopDivider) {
                    drawLine(
                        color = Color(0xFFEDF2F1),
                        start = Offset(0f, strokeWidth / 2f),
                        end = Offset(size.width, strokeWidth / 2f),
                        strokeWidth = strokeWidth
                    )
                }
                drawLine(
                    color = Color(0xFFEDF2F1),
                    start = Offset(labelWidth, 0f),
                    end = Offset(labelWidth, size.height),
                    strokeWidth = strokeWidth
                )
                drawLine(
                    color = Color(0xFFEDF2F1),
                    start = Offset(labelWidth + productWidth, 0f),
                    end = Offset(labelWidth + productWidth, size.height),
                    strokeWidth = strokeWidth
                )
            }
    ) {
        val labelWidth = 82f.scaledDp(scale)

        Row(modifier = Modifier.fillMaxSize()) {
            ComparisonCell(
                text = row.label,
                scale = scale,
                isLabel = true,
                isHighlighted = false,
                modifier = Modifier
                    .width(labelWidth)
                    .fillMaxHeight()
                    .background(Color(0xFFFBFDFC))
            )
            ComparisonCell(
                text = row.firstProductValue,
                scale = scale,
                isLabel = false,
                isHighlighted = row.highlightedProductId == firstProduct.id,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
            )
            ComparisonCell(
                text = row.secondProductValue,
                scale = scale,
                isLabel = false,
                isHighlighted = row.highlightedProductId == secondProduct.id,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
            )
        }
    }
}

@Composable
private fun ComparisonCell(
    text: String,
    scale: Float,
    isLabel: Boolean,
    isHighlighted: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.background(
            brush = if (isHighlighted) {
                Brush.linearGradient(
                    colors = listOf(
                        Color(0xFFE8FAF3).copy(alpha = 0.95f),
                        Color.White.copy(alpha = 0.6f)
                    )
                )
            } else {
                Brush.linearGradient(listOf(Color.Transparent, Color.Transparent))
            }
        ),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = text,
            color = when {
                isHighlighted -> Color(0xFF18865C)
                isLabel -> Color(0xFF344150)
                else -> Color(0xFF35404C)
            },
            fontSize = ((if (isLabel) 11.5f else 11f) * scale).sp,
            lineHeight = (15.5f * scale).sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            letterSpacing = 0.sp,
            modifier = Modifier.padding(horizontal = 6f.scaledDp(scale))
        )
        if (isHighlighted) {
            Text(
                text = "更优",
                color = ShopMateGreen,
                fontSize = (10f * scale).sp,
                lineHeight = (12f * scale).sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .padding(top = 3f.scaledDp(scale))
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xFFE7F9F2))
                    .padding(
                        horizontal = 8f.scaledDp(scale),
                        vertical = 2f.scaledDp(scale)
                    )
            )
        }
        Spacer(modifier = Modifier.weight(1f))
    }
}

@Composable
private fun RecommendationConclusion(
    comparison: ComparisonUi,
    scale: Float,
    modifier: Modifier = Modifier
) {
    val cardShape = RoundedCornerShape(22f.scaledDp(scale))

    Box(
        modifier = modifier
            .clip(cardShape)
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(Color.White, Color(0xFFF5FCF9))
                )
            )
            .border(
                width = 0.667.dp,
                color = Color(0xFFF1F3F3).copy(alpha = 0.9f),
                shape = cardShape
            )
            .drawBehind {
                drawCircle(
                    color = ShopMateGreen.copy(alpha = 0.1f),
                    center = Offset(54f.scaledDp(scale).toPx(), 18f.scaledDp(scale).toPx()),
                    radius = 30f.scaledDp(scale).toPx()
                )
            }
    ) {
        Image(
            painter = painterResource(id = R.drawable.comparison_recommendation_buddy),
            contentDescription = "Shopmate Buddy",
            modifier = Modifier
                .offset(x = 10f.scaledDp(scale), y = 15f.scaledDp(scale))
                .size(80f.scaledDp(scale)),
            contentScale = ContentScale.Fit
        )

        Column(
            modifier = Modifier
                .offset(x = 102f.scaledDp(scale), y = 18f.scaledDp(scale))
                .size(width = 214f.scaledDp(scale), height = 84f.scaledDp(scale))
        ) {
            Text(
                text = "推荐结论",
                color = ShopMateGreen,
                fontSize = (15f * scale).sp,
                fontWeight = FontWeight.Bold,
                lineHeight = (18f * scale).sp,
                letterSpacing = 0.sp,
                maxLines = 1
            )
            Spacer(modifier = Modifier.size(8f.scaledDp(scale)))
            Text(
                text = comparison.summaryText,
                color = Color(0xFF5F6975),
                fontSize = (12f * scale).sp,
                lineHeight = (19.2f * scale).sp,
                letterSpacing = 0.sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

private fun Modifier.figmaComparisonBackground(): Modifier =
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

private fun comparisonTileTitle(product: ProductCardUi): String =
    when (product.id) {
        "ui-la-roche-posay-sunscreen" -> "理肤泉 清透防晒乳"
        "ui-anessa-perfect-uv-sunscreen" -> "安热沙 小金瓶防晒乳"
        else -> product.name
    }

private fun comparisonTileSubtitle(product: ProductCardUi): String =
    when (product.id) {
        "ui-la-roche-posay-sunscreen" -> "清透通勤防晒"
        "ui-anessa-perfect-uv-sunscreen" -> "耐汗户外防晒"
        else -> product.tags.firstOrNull().orEmpty()
    }

@Preview(
    name = "Product comparison - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true
)
@Composable
private fun ProductComparisonScreenTargetPreview() {
    ShopMateTheme {
        ProductComparisonScreen(
            onNewChatClick = {},
            onCartClick = {},
            onHistoryClick = {}
        )
    }
}

@Preview(
    name = "Product comparison - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true
)
@Composable
private fun ProductComparisonScreenCompactPreview() {
    ShopMateTheme {
        ProductComparisonScreen(
            onNewChatClick = {},
            onCartClick = {},
            onHistoryClick = {}
        )
    }
}
