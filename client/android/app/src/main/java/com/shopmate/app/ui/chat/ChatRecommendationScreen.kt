package com.shopmate.app.ui.chat

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R
import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.components.ChatComposer
import com.shopmate.app.ui.components.ProductCard
import com.shopmate.app.ui.components.ShopMateRoundedIconButton
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.sidebar.SidebarHistoryDrawer
import com.shopmate.app.ui.theme.ShopMateSurface
import com.shopmate.app.ui.theme.ShopMateSurfaceSoft
import com.shopmate.app.ui.theme.ShopMateTheme

private const val FIGMA_WIDTH = 388.667f
private const val FIGMA_HEIGHT = 842.667f
private const val USER_MESSAGE = "推荐一款适合通勤的蓝牙耳机，预算 200 以内"
private const val ASSISTANT_MESSAGE =
    "好的！为你筛选了几款 200 元以内、适合通勤的蓝牙耳机，综合音质、续航、降噪和佩戴舒适度，看看有没有喜欢的。"

@Composable
fun ChatRecommendationScreen(
    onNewChatClick: () -> Unit,
    onCartClick: () -> Unit,
    onHistoryClick: (HistoryConversationUi) -> Unit,
    modifier: Modifier = Modifier
) {
    var composerText by rememberSaveable { mutableStateOf("") }
    var isSidebarOpen by rememberSaveable { mutableStateOf(false) }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .figmaRecommendationBackground()
    ) {
        val scale = maxWidth.value / FIGMA_WIDTH

        fun Float.s(): Dp = (this * scale).dp

        val headerTop = 36f.s()
        val contentTop = 80f.s()
        val composerHeight = 52f.s()
        val composerBottom = 18f.s()
        val composerTop = maxHeight - composerHeight - composerBottom
        val contentBottomGap = 10f.s()
        val contentHeight = (composerTop - contentTop - contentBottomGap).coerceAtLeast(360.dp)
        val scrollContentHeight = 725.443f.s() + 118f.s()

        RecommendationHeader(
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
                modifier = Modifier
                    .size(width = FIGMA_WIDTH.s(), height = scrollContentHeight)
            ) {
                MessageBubble(
                    text = USER_MESSAGE,
                    fromUser = true,
                    textScale = scale,
                    modifier = Modifier
                        .offset(x = 100.45f.s(), y = 14f.s())
                        .size(width = 272.219f.s(), height = 43.198f.s())
                )
                MessageBubble(
                    text = ASSISTANT_MESSAGE,
                    fromUser = false,
                    textScale = scale,
                    modifier = Modifier
                        .offset(x = 16f.s(), y = 67.2f.s())
                        .size(width = 285f.s(), height = 82.927f.s())
                )

                MockShopMateData.bluetoothEarbuds.forEachIndexed { index, product ->
                    ProductCard(
                        product = product,
                        enabled = product.id != "ui-redmi-buds-4-lite",
                        onClick = {},
                        onAddCartClick = {},
                        modifier = Modifier
                            .offset(x = 14f.s(), y = (160.13f + index * 191.104f).s())
                            .size(width = 360.667f.s(), height = 179.104f.s())
                    )
                }
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
private fun RecommendationHeader(
    scale: Float,
    onMenuClick: () -> Unit,
    onCartClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = (this * scale).dp

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
            modifier = Modifier
                .padding(start = 14.dp, top = 12.dp, end = 14.dp)
        )
    }
}

private fun Modifier.figmaRecommendationBackground(): Modifier =
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

@Preview(
    name = "Chat recommendation - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true
)
@Composable
private fun ChatRecommendationScreenTargetPreview() {
    ShopMateTheme {
        ChatRecommendationScreen(
            onNewChatClick = {},
            onCartClick = {},
            onHistoryClick = {}
        )
    }
}
