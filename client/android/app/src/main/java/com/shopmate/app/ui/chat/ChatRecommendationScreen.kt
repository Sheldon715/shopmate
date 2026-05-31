package com.shopmate.app.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.shopmate.app.R
import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.components.ChatComposer
import com.shopmate.app.ui.components.ChatMessageBubble
import com.shopmate.app.ui.components.ChatTypingIndicatorBubble
import com.shopmate.app.ui.components.ProductCard
import com.shopmate.app.ui.components.ShopMateFigmaFrameWidth
import com.shopmate.app.ui.components.ShopMateStatusMessage
import com.shopmate.app.ui.components.ShopMateTopActionBar
import com.shopmate.app.ui.components.scaledDp
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.ProductCardUi
import com.shopmate.app.ui.sidebar.SidebarHistoryDrawer
import com.shopmate.app.ui.theme.ShopMateTheme
import com.shopmate.app.ui.theme.shopMateScreenBackground

@Composable
fun ChatRecommendationScreen(
    state: ChatUiState,
    onComposerTextChange: (String) -> Unit,
    onSend: () -> Unit,
    onRetry: () -> Unit,
    onNewChatClick: () -> Unit,
    onCartClick: () -> Unit,
    onProductClick: (String) -> Unit,
    onAddCartClick: (String) -> Unit,
    onHistoryClick: (HistoryConversationUi) -> Unit,
    historyConversations: List<HistoryConversationUi> = MockShopMateData.historyConversations,
    editableConversationIds: Set<String> = emptySet(),
    onRenameHistory: (String, String) -> Unit = { _, _ -> },
    onDeleteHistory: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    var isSidebarOpen by rememberSaveable { mutableStateOf(false) }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .shopMateScreenBackground(),
    ) {
        val scale = maxWidth.value / ShopMateFigmaFrameWidth

        fun Float.s(): Dp = scaledDp(scale)

        val headerTop = 36f.s()
        val contentTop = 80f.s()
        val composerHeight = 52f.s()
        val composerBottom = 18f.s()
        val composerTop = maxHeight - composerHeight - composerBottom
        val topScrimHeight = 84f.s()
        val bottomScrimTop = composerTop - 28f.s()
        val scrollBottomPadding = (maxHeight - bottomScrimTop) + 18f.s()

        val scrollState = rememberScrollState()

        LaunchedEffect(
            state.messages.size,
            state.messages.lastOrNull()?.text,
            state.productCards.size,
            state.errorMessage,
        ) {
            withFrameNanos { }
            scrollState.animateScrollTo(scrollState.maxValue)
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .clipToBounds()
                .verticalScroll(scrollState),
        ) {
            ChatStreamColumnContent(
                state = state,
                scale = scale,
                contentTop = contentTop,
                bottomPadding = scrollBottomPadding,
                onRetry = onRetry,
                onNewChatClick = onNewChatClick,
                onCartClick = onCartClick,
                onProductClick = onProductClick,
                onAddCartClick = onAddCartClick,
            )
        }

        Box(
            modifier = Modifier
                .offset(x = 0.dp, y = 0.dp)
                .size(width = ShopMateFigmaFrameWidth.s(), height = topScrimHeight)
                .zIndex(1f)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.White,
                            Color.White.copy(alpha = 0.82f),
                            Color.Transparent,
                        ),
                    ),
                ),
        )

        Box(
            modifier = Modifier
                .offset(x = 0.dp, y = bottomScrimTop)
                .size(
                    width = ShopMateFigmaFrameWidth.s(),
                    height = (maxHeight - bottomScrimTop).coerceAtLeast(1.dp),
                )
                .zIndex(1f)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color.White.copy(alpha = 0.82f),
                            Color.White,
                        ),
                    ),
                ),
        )

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
                .size(width = ShopMateFigmaFrameWidth.s(), height = 44f.s())
                .zIndex(2f),
        )

        ChatComposer(
            value = state.composerText,
            onValueChange = onComposerTextChange,
            onSend = onSend,
            onVoiceClick = {},
            onImageClick = {},
            shadowElevation = 0.dp,
            sendEnabled = state.composerText.isNotBlank() && !state.isSending,
            modifier = Modifier
                .offset(x = 18f.s(), y = composerTop)
                .imePadding()
                .navigationBarsPadding()
                .size(width = 352.667f.s(), height = composerHeight)
                .zIndex(2f),
        )

        SidebarHistoryDrawer(
            isOpen = isSidebarOpen,
            conversations = historyConversations,
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
            },
            editableConversationIds = editableConversationIds,
            onRenameHistory = onRenameHistory,
            onDeleteHistory = onDeleteHistory,
        )
    }
}

@Composable
private fun ChatStreamColumnContent(
    state: ChatUiState,
    scale: Float,
    contentTop: Dp,
    bottomPadding: Dp,
    onRetry: () -> Unit,
    onNewChatClick: () -> Unit,
    onCartClick: () -> Unit,
    onProductClick: (String) -> Unit,
    onAddCartClick: (String) -> Unit,
) {
    fun Float.s(): Dp = scaledDp(scale)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = contentTop + 14f.s(), bottom = bottomPadding),
        verticalArrangement = Arrangement.spacedBy(10f.s()),
    ) {
        if (state.messages.isEmpty() && state.productCards.isEmpty() && state.errorMessage == null) {
            ChatMessageBubble(
                text = "说说你想买什么，我会从商品库里帮你筛选合适选择。",
                fromUser = false,
                textScale = scale,
                modifier = Modifier
                    .padding(start = 16f.s(), end = 18f.s())
                    .align(Alignment.Start)
                    .widthIn(max = 285f.s()),
            )
            return@Column
        }

        state.messages.forEach { message ->
            ChatMessageItem(
                message = message,
                scale = scale,
                modifier = Modifier.align(
                    if (message.fromUser) Alignment.End else Alignment.Start,
                ),
            )

            if (message.id == state.productCardsAnchorMessageId) {
                ProductCardList(
                    products = state.productCards,
                    scale = scale,
                    onProductClick = onProductClick,
                    onAddCartClick = onAddCartClick,
                )
            }
        }

        if (state.productCardsAnchorMessageId == null) {
            ProductCardList(
                products = state.productCards,
                scale = scale,
                onProductClick = onProductClick,
                onAddCartClick = onAddCartClick,
            )
        }

        state.errorMessage?.let { errorMessage ->
            ShopMateStatusMessage(
                title = "导购暂时无法回复",
                message = errorMessage,
                actionText = if (state.canRetry) "重试" else "重新输入",
                onActionClick = if (state.canRetry) onRetry else onNewChatClick,
                scale = scale,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .size(width = 352.667f.s(), height = 246f.s()),
            )
        }
    }
}

@Composable
private fun ChatMessageItem(
    message: ChatMessageUi,
    scale: Float,
    modifier: Modifier = Modifier,
) {
    fun Float.s(): Dp = scaledDp(scale)

    if (message.isTypingPlaceholder()) {
        ChatTypingIndicatorBubble(
            textScale = scale,
            modifier = modifier
                .padding(start = 16f.s())
                .size(width = 66f.s(), height = 34f.s()),
        )
    } else {
        ChatMessageBubble(
            text = message.displayText(),
            fromUser = message.fromUser,
            textScale = scale,
            modifier = modifier
                .padding(
                    start = if (message.fromUser) 72f.s() else 16f.s(),
                    end = if (message.fromUser) 16f.s() else 18f.s(),
                )
                .widthIn(max = if (message.fromUser) 272f.s() else 285f.s()),
        )
    }
}

@Composable
private fun ColumnScope.ProductCardList(
    products: List<ProductCardUi>,
    scale: Float,
    onProductClick: (String) -> Unit,
    onAddCartClick: (String) -> Unit,
) {
    fun Float.s(): Dp = scaledDp(scale)

    products.forEach { product ->
        ProductCard(
            product = product,
            enabled = true,
            onClick = {
                onProductClick(product.id)
            },
            onAddCartClick = {
                onAddCartClick(product.id)
            },
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .size(width = 360.667f.s(), height = 179.104f.s()),
        )
    }
}

private fun ChatMessageUi.displayText(): String =
    if (text.isBlank() && isStreaming) {
        "正在为你整理推荐..."
    } else {
        text
    }

private fun ChatMessageUi.isTypingPlaceholder(): Boolean =
    !fromUser && isStreaming && text.isBlank()

@Preview(
    name = "Chat recommendation - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true,
)
@Composable
private fun ChatRecommendationScreenTargetPreview() {
    ShopMateTheme {
        ChatRecommendationScreen(
            state = ChatPreviewUiState,
            onComposerTextChange = {},
            onSend = {},
            onRetry = {},
            onNewChatClick = {},
            onCartClick = {},
            onProductClick = {},
            onAddCartClick = {},
            onHistoryClick = {},
        )
    }
}

@Preview(
    name = "Chat recommendation - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true,
)
@Composable
private fun ChatRecommendationScreenCompactPreview() {
    ShopMateTheme {
        ChatRecommendationScreen(
            state = ChatPreviewUiState,
            onComposerTextChange = {},
            onSend = {},
            onRetry = {},
            onNewChatClick = {},
            onCartClick = {},
            onProductClick = {},
            onAddCartClick = {},
            onHistoryClick = {},
        )
    }
}

@Preview(
    name = "Chat recommendation empty - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true,
)
@Composable
private fun ChatRecommendationScreenEmptyCompactPreview() {
    ShopMateTheme {
        ChatRecommendationScreen(
            state = ChatEmptyPreviewUiState,
            onComposerTextChange = {},
            onSend = {},
            onRetry = {},
            onNewChatClick = {},
            onCartClick = {},
            onProductClick = {},
            onAddCartClick = {},
            onHistoryClick = {},
        )
    }
}
