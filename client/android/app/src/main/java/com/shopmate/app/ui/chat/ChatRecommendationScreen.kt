package com.shopmate.app.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.shopmate.app.R
import com.shopmate.app.ui.components.ChatComposer
import com.shopmate.app.ui.components.ChatMessageBubble
import com.shopmate.app.ui.components.ChatTypingIndicatorBubble
import com.shopmate.app.ui.components.ProductCard
import com.shopmate.app.ui.components.ShopMateEnterMotion
import com.shopmate.app.ui.components.ShopMateBuddyMotionState
import com.shopmate.app.ui.components.ShopMateFigmaFrameWidth
import com.shopmate.app.ui.components.ShopMateReadableControlScale
import com.shopmate.app.ui.components.ShopMateStatusMessage
import com.shopmate.app.ui.components.ShopMateTopActionBar
import com.shopmate.app.ui.components.scaledDp
import com.shopmate.app.ui.components.shopMatePressable
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.ProductAddCartState
import com.shopmate.app.ui.model.ProductCardUi
import com.shopmate.app.ui.sidebar.SidebarHistoryDrawer
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateLightGreen
import com.shopmate.app.ui.theme.ShopMateTheme
import com.shopmate.app.ui.theme.shopMateScreenBackground

private const val CHAT_COMPOSER_BOTTOM_OFFSET = 20f
private const val CHAT_AI_NOTICE_TOP_FROM_BOTTOM = 26f

@Composable
fun ChatRecommendationScreen(
    state: ChatUiState,
    onComposerTextChange: (String) -> Unit,
    onSend: () -> Unit,
    onVoicePressStart: () -> Unit,
    onVoicePressEnd: () -> Unit,
    onVoiceCancel: () -> Unit,
    onImagePickClick: () -> Unit,
    onImageRemoveClick: () -> Unit,
    onImageRetryClick: () -> Unit,
    onRetry: () -> Unit,
    onNewChatClick: () -> Unit,
    onCartClick: () -> Unit,
    onProductClick: (String) -> Unit,
    onAddCartClick: (String) -> Unit,
    productAddCartStates: Map<String, ProductAddCartState> = emptyMap(),
    onComparisonClick: (String) -> Unit,
    onCheckoutViewClick: (String) -> Unit,
    onCheckoutCancelClick: () -> Unit,
    onCheckoutSubmitClick: () -> Unit,
    onHistoryClick: (HistoryConversationUi) -> Unit,
    historyConversations: List<HistoryConversationUi> = emptyList(),
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

        val headerTop = 40f.s()
        val contentTop = 88f.s()
        val composerHeightValue = if (state.selectedImage != null) 104f else 44f
        val composerHeight = (composerHeightValue * ShopMateReadableControlScale).s()
        val composerBottom = CHAT_COMPOSER_BOTTOM_OFFSET.s()
        val composerTop = maxHeight - composerHeight - composerBottom
        val aiNoticeTop = maxHeight - CHAT_AI_NOTICE_TOP_FROM_BOTTOM.s()
        val topScrimHeight = 92f.s()
        val bottomScrimTop = composerTop - 34f.s()
        val scrollBottomPadding = (maxHeight - bottomScrimTop) + 22f.s()

        val listState = rememberLazyListState()
        val shouldAutoScroll by remember {
            derivedStateOf {
                val layoutInfo = listState.layoutInfo
                val lastVisibleIndex = layoutInfo.visibleItemsInfo.lastOrNull()?.index

                lastVisibleIndex == null ||
                    lastVisibleIndex >= layoutInfo.totalItemsCount - 3
            }
        }

        LaunchedEffect(
            state.messages.size,
            state.messages.lastOrNull()?.text,
            state.productCards.size,
            state.productCardGroups.size,
            state.comparisonActions.size,
            state.isComparisonGenerating,
            state.comparisonResults.size,
            state.activeCheckoutDraft?.draft?.id,
            state.activeCheckoutDraft?.status,
            state.errorMessage,
            state.selectedImage?.status,
        ) {
            if (shouldAutoScroll) {
                withFrameNanos { }
                val targetIndex = listState.layoutInfo.totalItemsCount - 1

                if (targetIndex >= 0) {
                    listState.animateScrollToItem(targetIndex)
                }
            }
        }

        ChatStreamList(
            listState = listState,
            state = state,
            scale = scale,
            contentTop = contentTop,
            bottomPadding = scrollBottomPadding,
            onRetry = onRetry,
            onNewChatClick = onNewChatClick,
            onCartClick = onCartClick,
            onProductClick = onProductClick,
            onAddCartClick = onAddCartClick,
            productAddCartStates = productAddCartStates,
            onComparisonClick = onComparisonClick,
            onCheckoutViewClick = onCheckoutViewClick,
            onCheckoutCancelClick = onCheckoutCancelClick,
            onCheckoutSubmitClick = onCheckoutSubmitClick,
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .imePadding()
                .clipToBounds(),
        )

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
            centerBuddyMotionState = state.toBuddyMotionState(),
            modifier = Modifier
                .offset(x = 0.dp, y = headerTop)
                .size(width = ShopMateFigmaFrameWidth.s(), height = 44f.s())
                .zIndex(2f),
        )

        ChatComposer(
            value = state.composerText,
            onValueChange = onComposerTextChange,
            onSend = onSend,
            onVoicePressStart = onVoicePressStart,
            onVoicePressEnd = onVoicePressEnd,
            onVoiceCancel = onVoiceCancel,
            onImagePickClick = onImagePickClick,
            onImageRemoveClick = onImageRemoveClick,
            onImageRetryClick = onImageRetryClick,
            voiceInputState = state.voiceInput,
            voiceEnabled = !state.isSending,
            shadowElevation = 0.dp,
            imageAttachment = state.selectedImage,
            sendEnabled = (state.composerText.isNotBlank() || state.selectedImage != null) &&
                !state.isSending,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 18f.s(), bottom = composerBottom)
                .navigationBarsPadding()
                .imePadding()
                .size(width = 352.667f.s(), height = composerHeight)
                .zIndex(2f),
        )

        Text(
            text = "内容由 AI 生成，仅供参考",
            color = Color(0xFF7B8790).copy(alpha = 0.52f),
            fontSize = (10.8f * scale * ShopMateReadableControlScale).sp,
            lineHeight = (13.5f * scale * ShopMateReadableControlScale).sp,
            letterSpacing = 0.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .offset(x = 0.dp, y = aiNoticeTop)
                .fillMaxWidth()
                .zIndex(2f)
                .padding(horizontal = 18f.s()),
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
private fun ChatStreamList(
    listState: androidx.compose.foundation.lazy.LazyListState,
    state: ChatUiState,
    scale: Float,
    contentTop: Dp,
    bottomPadding: Dp,
    onRetry: () -> Unit,
    onNewChatClick: () -> Unit,
    onCartClick: () -> Unit,
    onProductClick: (String) -> Unit,
    onAddCartClick: (String) -> Unit,
    productAddCartStates: Map<String, ProductAddCartState>,
    onComparisonClick: (String) -> Unit,
    onCheckoutViewClick: (String) -> Unit,
    onCheckoutCancelClick: () -> Unit,
    onCheckoutSubmitClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    fun Float.s(): Dp = scaledDp(scale)
    val bubbleTextScale = scale * ShopMateReadableControlScale
    val messageIds = remember(state.messages) {
        state.messages.map { message -> message.id }.toSet()
    }
    val comparisonLoadingAnchorMessageId =
        if (state.isComparisonGenerating) {
            state.messages.lastOrNull { message -> !message.fromUser }?.id
        } else {
            null
        }

    LazyColumn(
        state = listState,
        modifier = modifier,
        contentPadding = PaddingValues(
            top = contentTop + 14f.s(),
            bottom = bottomPadding,
        ),
        verticalArrangement = Arrangement.spacedBy(10f.s()),
    ) {
        if (
            state.messages.isEmpty() &&
            state.productCards.isEmpty() &&
            state.productCardGroups.isEmpty() &&
            state.errorMessage == null
        ) {
            item(key = "empty-message") {
                Box(modifier = Modifier.fillMaxWidth()) {
                    ChatMessageBubble(
                        text = "说说你想买什么，我会从商品库里帮你筛选合适选择。",
                        fromUser = false,
                        textScale = bubbleTextScale,
                        modifier = Modifier
                            .padding(start = 16f.s(), end = 18f.s())
                            .align(Alignment.CenterStart)
                            .widthIn(max = 285f.s()),
                    )
                }
            }
            return@LazyColumn
        }

        items(
            items = state.messages,
            key = { message -> "message-${message.id}" },
        ) { message ->
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10f.s()),
            ) {
                ChatMessageItem(
                    message = message,
                    scale = scale,
                    bubbleTextScale = bubbleTextScale,
                    modifier = Modifier.align(
                        if (message.fromUser) Alignment.End else Alignment.Start,
                    ),
                )

                ComparisonEntryList(
                    actions = state.comparisonActions.filter { action ->
                        action.anchorMessageId == message.id
                    },
                    scale = scale,
                    onComparisonClick = onComparisonClick,
                )

                if (
                    message.id == comparisonLoadingAnchorMessageId &&
                    !message.isTypingPlaceholder()
                ) {
                    ChatTypingIndicatorBubble(
                        textScale = bubbleTextScale,
                        modifier = Modifier
                            .align(Alignment.Start)
                            .padding(start = 16f.s())
                            .size(width = 66f.s(), height = 34f.s()),
                    )
                }

                val productCardGroup = state.productCardGroups.firstOrNull { group ->
                    group.anchorMessageId == message.id
                }

                if (productCardGroup != null) {
                    ProductCardList(
                        products = productCardGroup.products,
                        scale = scale,
                        onProductClick = onProductClick,
                        onAddCartClick = onAddCartClick,
                        productAddCartStates = productAddCartStates,
                    )
                } else if (message.id == state.productCardsAnchorMessageId) {
                    ProductCardList(
                        products = state.productCards,
                        scale = scale,
                        onProductClick = onProductClick,
                        onAddCartClick = onAddCartClick,
                        productAddCartStates = productAddCartStates,
                    )
                }
            }
        }

        val unanchoredActions = state.comparisonActions.filter { action ->
            action.anchorMessageId !in messageIds
        }

        if (unanchoredActions.isNotEmpty()) {
            item(key = "unanchored-comparisons") {
                ComparisonEntryList(
                    actions = unanchoredActions,
                    scale = scale,
                    onComparisonClick = onComparisonClick,
                )
            }
        }

        state.activeCheckoutDraft
            ?.takeUnless { checkoutDraft ->
                checkoutDraft.status == ChatCheckoutDraftStatusUi.Submitted
            }
            ?.let { checkoutDraft ->
            item(key = "checkout-draft-${checkoutDraft.draft.id}") {
                ShopMateEnterMotion {
                    CheckoutDraftCard(
                        checkoutDraft = checkoutDraft,
                        scale = scale,
                        onViewClick = { onCheckoutViewClick(checkoutDraft.draft.id) },
                        onCancelClick = onCheckoutCancelClick,
                        onSubmitClick = onCheckoutSubmitClick,
                    )
                }
            }
        }

        if (state.productCardsAnchorMessageId == null && state.productCardGroups.isEmpty()) {
            item(key = "unanchored-product-cards") {
                ProductCardList(
                    products = state.productCards,
                    scale = scale,
                    onProductClick = onProductClick,
                    onAddCartClick = onAddCartClick,
                    productAddCartStates = productAddCartStates,
                )
            }
        }

        state.errorMessage?.let { errorMessage ->
            item(key = "error-message") {
                Box(modifier = Modifier.fillMaxWidth()) {
                    ShopMateStatusMessage(
                        title = "导购暂时无法回复",
                        message = errorMessage,
                        actionText = if (state.canRetry) "重试" else "重新输入",
                        onActionClick = if (state.canRetry) onRetry else onNewChatClick,
                        scale = scale,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .size(width = 352.667f.s(), height = 246f.s()),
                    )
                }
            }
        }
    }
}

@Composable
private fun CheckoutDraftCard(
    checkoutDraft: ChatCheckoutDraftCardUi,
    scale: Float,
    onViewClick: () -> Unit,
    onCancelClick: () -> Unit,
    onSubmitClick: () -> Unit,
) {
    fun Float.s(): Dp = scaledDp(scale)
    val draft = checkoutDraft.draft
    val selectedDelivery = draft.deliveryOptions.firstOrNull { option ->
        option.type == draft.selectedDeliveryMethodType
    }
    val selectedPayment = draft.paymentOptions.firstOrNull { option ->
        option.type == draft.selectedPaymentMethodType
    }
    val actionsEnabled = checkoutDraft.status == ChatCheckoutDraftStatusUi.Pending ||
        checkoutDraft.status == ChatCheckoutDraftStatusUi.Updated
    val itemSummary = draft.items
        .take(2)
        .joinToString("、") { item -> item.productName }
        .ifBlank { "${draft.summary.selectedCount} 件商品" }
    val extraCount = (draft.summary.selectedCount - draft.items.take(2).sumOf { item -> item.quantity })
        .coerceAtLeast(0)
    val itemText = if (extraCount > 0) {
        "$itemSummary 等 $extraCount 件"
    } else {
        itemSummary
    }

    Column(
        modifier = Modifier
            .padding(horizontal = 18f.s())
            .fillMaxWidth()
            .clip(RoundedCornerShape(18f.s()))
            .background(Color.White.copy(alpha = 0.98f))
            .border(0.667.dp, Color(0xFFE8EFED), RoundedCornerShape(18f.s()))
            .padding(horizontal = 16f.s(), vertical = 14f.s()),
        verticalArrangement = Arrangement.spacedBy(10f.s()),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "订单草稿",
                    color = Color(0xFF172331),
                    fontSize = (15f * scale).sp,
                    lineHeight = (19f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                )
                Text(
                    text = checkoutDraft.status.toCheckoutStatusText(checkoutDraft.orderNumber),
                    color = checkoutDraft.status.toCheckoutStatusColor(),
                    fontSize = (11.5f * scale).sp,
                    lineHeight = (15f * scale).sp,
                    letterSpacing = 0.sp,
                    modifier = Modifier.padding(top = 3f.s()),
                )
            }
            Text(
                text = draft.summary.totalText,
                color = ShopMateGreen,
                fontSize = (17f * scale).sp,
                lineHeight = (21f * scale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
            )
        }

        CheckoutInfoLine("商品", itemText, scale)
        CheckoutInfoLine("收货", "${draft.address.recipient} ${draft.address.phoneMasked}", scale)
        CheckoutInfoLine("地址", draft.address.fullAddress, scale, maxLines = 2)
        CheckoutInfoLine(
            "配送",
            listOfNotNull(selectedDelivery?.label, selectedDelivery?.feeText, selectedDelivery?.etaText)
                .filter { value -> value.isNotBlank() }
                .joinToString(" · ")
                .ifBlank { "待确认" },
            scale,
        )
        CheckoutInfoLine("支付", selectedPayment?.label?.ifBlank { null } ?: "待确认", scale)

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8f.s()),
        ) {
            CheckoutDraftActionButton(
                text = "查看订单",
                primary = false,
                enabled = actionsEnabled,
                scale = scale,
                onClick = onViewClick,
                modifier = Modifier.weight(1f),
            )
            CheckoutDraftActionButton(
                text = "取消",
                primary = false,
                enabled = actionsEnabled,
                scale = scale,
                onClick = onCancelClick,
                modifier = Modifier.weight(1f),
            )
            CheckoutDraftActionButton(
                text = if (checkoutDraft.status == ChatCheckoutDraftStatusUi.Updating) {
                    "处理中"
                } else {
                    "提交订单"
                },
                primary = true,
                enabled = actionsEnabled,
                scale = scale,
                onClick = onSubmitClick,
                modifier = Modifier.weight(1.2f),
            )
        }
    }
}

@Composable
private fun CheckoutInfoLine(
    label: String,
    value: String,
    scale: Float,
    maxLines: Int = 1,
) {
    fun Float.s(): Dp = scaledDp(scale)

    Row(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label,
            color = Color(0xFF8B949D),
            fontSize = (11.5f * scale).sp,
            lineHeight = (16f * scale).sp,
            letterSpacing = 0.sp,
            modifier = Modifier.width(42f.s()),
        )
        Text(
            text = value.ifBlank { "待确认" },
            color = Color(0xFF394852),
            fontSize = (12.5f * scale).sp,
            lineHeight = (17f * scale).sp,
            letterSpacing = 0.sp,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun CheckoutDraftActionButton(
    text: String,
    primary: Boolean,
    enabled: Boolean,
    scale: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    fun Float.s(): Dp = scaledDp(scale)
    val shape = RoundedCornerShape(14f.s())
    val background = if (primary) {
        Brush.linearGradient(listOf(ShopMateLightGreen, ShopMateGreen))
    } else {
        Brush.linearGradient(listOf(Color(0xFFF5F8F7), Color(0xFFEFF5F2)))
    }

    Box(
        modifier = modifier
            .height(36f.s())
            .clip(shape)
            .background(background)
            .border(
                width = 0.667.dp,
                color = if (primary) Color.Transparent else Color(0xFFE2ECE8),
                shape = shape,
            )
            .shopMatePressable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = if (primary) Color.White else ShopMateGreen,
            fontSize = (12f * scale).sp,
            lineHeight = (15f * scale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 4f.s()),
        )
    }
}

private fun ChatCheckoutDraftStatusUi.toCheckoutStatusText(
    orderNumber: String?,
): String =
    when (this) {
        ChatCheckoutDraftStatusUi.Pending -> "待确认"
        ChatCheckoutDraftStatusUi.Updating -> "正在同步订单信息"
        ChatCheckoutDraftStatusUi.Updated -> "信息已更新，等待确认"
        ChatCheckoutDraftStatusUi.Cancelled -> "已取消"
        ChatCheckoutDraftStatusUi.Expired -> "已过期"
        ChatCheckoutDraftStatusUi.Submitted -> orderNumber
            ?.takeIf { value -> value.isNotBlank() }
            ?.let { value -> "已提交 · ${value.substringAfterLast("-")}" }
            ?: "已提交"
        ChatCheckoutDraftStatusUi.Failed -> "更新失败，请稍后再试"
    }

private fun ChatCheckoutDraftStatusUi.toCheckoutStatusColor(): Color =
    when (this) {
        ChatCheckoutDraftStatusUi.Pending,
        ChatCheckoutDraftStatusUi.Updated,
        ChatCheckoutDraftStatusUi.Updating,
        -> ShopMateGreen
        ChatCheckoutDraftStatusUi.Submitted -> Color(0xFF2F7D5F)
        ChatCheckoutDraftStatusUi.Cancelled,
        ChatCheckoutDraftStatusUi.Expired,
        ChatCheckoutDraftStatusUi.Failed,
        -> Color(0xFFB04D2D)
    }

@Composable
private fun ComparisonEntryList(
    actions: List<ChatComparisonActionUi>,
    scale: Float,
    onComparisonClick: (String) -> Unit,
) {
    fun Float.s(): Dp = scaledDp(scale)

    actions.forEachIndexed { index, action ->
        ShopMateEnterMotion(delayMillis = index * 35) {
            Column(
                modifier = Modifier
                    .padding(horizontal = 18f.s())
                    .fillMaxWidth()
                    .background(
                        color = Color.White.copy(alpha = 0.98f),
                        shape = RoundedCornerShape(18f.s()),
                    )
                    .padding(horizontal = 16f.s(), vertical = 12f.s()),
            ) {
                Text(
                    text = action.title.ifBlank { "商品对比详情" },
                    color = Color(0xFF172331),
                    fontSize = (14f * scale).sp,
                    lineHeight = (18f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                )
                if (action.summaryText.isNotBlank()) {
                    Text(
                        text = action.summaryText,
                        color = Color(0xFF65717C),
                        fontSize = (11.5f * scale).sp,
                        lineHeight = (16f * scale).sp,
                        letterSpacing = 0.sp,
                        modifier = Modifier.padding(top = 4f.s()),
                    )
                }

                Text(
                    text = "打开对比详情",
                    color = ShopMateGreen,
                    fontSize = (12.5f * scale).sp,
                    lineHeight = (16f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                    modifier = Modifier
                        .padding(top = 10f.s())
                        .shopMatePressable(onClick = { onComparisonClick(action.comparisonId) }),
                )
            }
        }
    }
}

@Composable
private fun ChatMessageItem(
    message: ChatMessageUi,
    scale: Float,
    bubbleTextScale: Float,
    modifier: Modifier = Modifier,
) {
    fun Float.s(): Dp = scaledDp(scale)

    if (message.isTypingPlaceholder()) {
        ChatTypingIndicatorBubble(
            textScale = bubbleTextScale,
            modifier = modifier
                .padding(start = 16f.s())
                .size(width = 66f.s(), height = 34f.s()),
        )
    } else {
        ChatMessageBubble(
            text = message.displayText(),
            fromUser = message.fromUser,
            textScale = bubbleTextScale,
            imageAttachment = message.imageAttachment,
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
private fun ProductCardList(
    products: List<ProductCardUi>,
    scale: Float,
    onProductClick: (String) -> Unit,
    onAddCartClick: (String) -> Unit,
    productAddCartStates: Map<String, ProductAddCartState>,
) {
    fun Float.s(): Dp = scaledDp(scale)

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10f.s()),
    ) {
        products.forEachIndexed { index, product ->
            ShopMateEnterMotion(delayMillis = index * 45) {
                ProductCard(
                    product = product,
                    enabled = true,
                    addCartState = productAddCartStates[product.id] ?: ProductAddCartState.Idle,
                    onClick = {
                        onProductClick(product.id)
                    },
                    onAddCartClick = {
                        onAddCartClick(product.id)
                    },
                    modifier = Modifier
                        .size(width = 360.667f.s(), height = 179.104f.s()),
                )
            }
        }
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

private fun ChatUiState.toBuddyMotionState(): ShopMateBuddyMotionState {
    val imageBusy = selectedImage?.status in setOf(
        ChatImageAttachmentStatus.Uploading,
        ChatImageAttachmentStatus.Interpreting,
        ChatImageAttachmentStatus.Searching,
    )
    val voiceBusy = voiceInput is VoiceInputUiState.Listening ||
        voiceInput is VoiceInputUiState.Transcribing

    return if (isSending || voiceBusy || imageBusy) {
        ShopMateBuddyMotionState.Thinking
    } else {
        ShopMateBuddyMotionState.Idle
    }
}

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
            onVoicePressStart = {},
            onVoicePressEnd = {},
            onVoiceCancel = {},
            onImagePickClick = {},
            onImageRemoveClick = {},
            onImageRetryClick = {},
            onRetry = {},
            onNewChatClick = {},
            onCartClick = {},
            onProductClick = {},
            onAddCartClick = {},
            onComparisonClick = {},
            onCheckoutViewClick = {},
            onCheckoutCancelClick = {},
            onCheckoutSubmitClick = {},
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
            onVoicePressStart = {},
            onVoicePressEnd = {},
            onVoiceCancel = {},
            onImagePickClick = {},
            onImageRemoveClick = {},
            onImageRetryClick = {},
            onRetry = {},
            onNewChatClick = {},
            onCartClick = {},
            onProductClick = {},
            onAddCartClick = {},
            onComparisonClick = {},
            onCheckoutViewClick = {},
            onCheckoutCancelClick = {},
            onCheckoutSubmitClick = {},
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
            onVoicePressStart = {},
            onVoicePressEnd = {},
            onVoiceCancel = {},
            onImagePickClick = {},
            onImageRemoveClick = {},
            onImageRetryClick = {},
            onRetry = {},
            onNewChatClick = {},
            onCartClick = {},
            onProductClick = {},
            onAddCartClick = {},
            onComparisonClick = {},
            onCheckoutViewClick = {},
            onCheckoutCancelClick = {},
            onCheckoutSubmitClick = {},
            onHistoryClick = {},
        )
    }
}
