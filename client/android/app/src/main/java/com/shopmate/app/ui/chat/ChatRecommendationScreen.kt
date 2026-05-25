package com.shopmate.app.ui.chat

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.shopmate.app.R
import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.components.ChatComposer
import com.shopmate.app.ui.components.ChatMessageBubble
import com.shopmate.app.ui.components.ProductCard
import com.shopmate.app.ui.components.ShopMateStatusMessage
import com.shopmate.app.ui.components.ShopMateTopActionBar
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.sidebar.SidebarHistoryDrawer
import com.shopmate.app.ui.theme.ShopMateTheme
import com.shopmate.app.ui.theme.shopMateScreenBackground

private const val FIGMA_WIDTH = 388.667f
private const val FIGMA_HEIGHT = 842.667f
private const val USER_MESSAGE = "推荐一款适合通勤的蓝牙耳机，预算 200 以内"
private const val ASSISTANT_MESSAGE =
    "好的！为你筛选了几款 200 元以内、适合通勤的蓝牙耳机，综合音质、续航、降噪和佩戴舒适度，看看有没有喜欢的。"

@Composable
fun ChatRecommendationScreen(
    onNewChatClick: () -> Unit,
    onCartClick: () -> Unit,
    onProductClick: (String) -> Unit,
    onHistoryClick: (HistoryConversationUi) -> Unit,
    showEmptyState: Boolean = false,
    modifier: Modifier = Modifier
) {
    var composerText by rememberSaveable { mutableStateOf("") }
    var isSidebarOpen by rememberSaveable { mutableStateOf(false) }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .shopMateScreenBackground()
    ) {
        val scale = maxWidth.value / FIGMA_WIDTH

        fun Float.s(): Dp = (this * scale).dp

        val headerTop = 36f.s()
        val contentTop = 80f.s()
        val composerHeight = 52f.s()
        val composerBottom = 18f.s()
        val composerTop = maxHeight - composerHeight - composerBottom
        val scrollBodyHeight = if (showEmptyState) {
            390f.s()
        } else {
            725.443f.s() + 132f.s()
        }
        val scrollContentHeight =
            (contentTop + scrollBodyHeight + composerHeight + composerBottom + 28f.s())
                .coerceAtLeast(maxHeight + 1.dp)

        Box(
            modifier = Modifier
                .fillMaxSize()
                .clipToBounds()
                .verticalScroll(rememberScrollState())
        ) {
            Box(
                modifier = Modifier
                    .size(width = FIGMA_WIDTH.s(), height = scrollContentHeight)
            ) {
                if (showEmptyState) {
                    ChatMessageBubble(
                        text = "帮我找一款 50 元以内的主动降噪耳机",
                        fromUser = true,
                        textScale = scale,
                        modifier = Modifier
                            .offset(x = 88f.s(), y = contentTop + 14f.s())
                            .size(width = 284.667f.s(), height = 43.198f.s())
                    )
                    ShopMateStatusMessage(
                        title = "暂时没有找到结果",
                        message = "当前商品库里没有同时满足预算和降噪的耳机，可以放宽价格再试试。",
                        actionText = "调整需求",
                        onActionClick = {},
                        scale = scale,
                        modifier = Modifier
                            .offset(x = 18f.s(), y = contentTop + 76f.s())
                            .size(width = 352.667f.s(), height = 246f.s())
                    )
                } else {
                    ChatMessageBubble(
                        text = USER_MESSAGE,
                        fromUser = true,
                        textScale = scale,
                        modifier = Modifier
                            .offset(x = 100.45f.s(), y = contentTop + 14f.s())
                            .size(width = 272.219f.s(), height = 43.198f.s())
                    )
                    ChatMessageBubble(
                        text = ASSISTANT_MESSAGE,
                        fromUser = false,
                        textScale = scale,
                        modifier = Modifier
                            .offset(x = 16f.s(), y = contentTop + 67.2f.s())
                            .size(width = 285f.s(), height = 82.927f.s())
                    )

                    MockShopMateData.bluetoothEarbuds.forEachIndexed { index, product ->
                        ProductCard(
                            product = product,
                            enabled = product.id != "ui-redmi-buds-4-lite",
                            onClick = {
                                onProductClick(product.id)
                            },
                            onAddCartClick = {},
                            modifier = Modifier
                                .offset(
                                    x = 14f.s(),
                                    y = contentTop + (160.13f + index * 191.104f).s()
                                )
                                .size(width = 360.667f.s(), height = 179.104f.s())
                        )
                    }
                }
            }
        }

        ShopMateTopActionBar(
            scale = scale,
            leftIcon = R.drawable.ic_menu,
            leftContentDescription = "打开侧边栏",
            onLeftClick = { isSidebarOpen = true },
            rightIcon = R.drawable.ic_cart,
            rightContentDescription = "购物车",
            onRightClick = onCartClick,
            modifier = Modifier
                .offset(x = 0.dp, y = headerTop)
                .size(width = FIGMA_WIDTH.s(), height = 44f.s())
                .zIndex(2f)
        )

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
                .zIndex(2f)
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
            onProductClick = {},
            onHistoryClick = {}
        )
    }
}

@Preview(
    name = "Chat recommendation - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true
)
@Composable
private fun ChatRecommendationScreenCompactPreview() {
    ShopMateTheme {
        ChatRecommendationScreen(
            onNewChatClick = {},
            onCartClick = {},
            onProductClick = {},
            onHistoryClick = {}
        )
    }
}

@Preview(
    name = "Chat recommendation empty - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true
)
@Composable
private fun ChatRecommendationScreenEmptyCompactPreview() {
    ShopMateTheme {
        ChatRecommendationScreen(
            onNewChatClick = {},
            onCartClick = {},
            onProductClick = {},
            onHistoryClick = {},
            showEmptyState = true
        )
    }
}
