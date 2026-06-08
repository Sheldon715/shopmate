package com.shopmate.app.ui.home

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.zIndex
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R
import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.components.ChatComposer
import com.shopmate.app.ui.chat.ChatImageAttachmentStatus
import com.shopmate.app.ui.chat.ChatImageAttachmentUi
import com.shopmate.app.ui.chat.VoiceInputUiState
import com.shopmate.app.ui.components.ShopMateBuddyMotion
import com.shopmate.app.ui.components.ShopMateBuddyMotionState
import com.shopmate.app.ui.components.ShopMateFigmaFrameWidth
import com.shopmate.app.ui.components.ShopMateLottieState
import com.shopmate.app.ui.components.ShopMateLottieStateIndicator
import com.shopmate.app.ui.components.ShopMateReadableControlScale
import com.shopmate.app.ui.components.ShopMateCircleIconButton
import com.shopmate.app.ui.components.scaledDp
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.PromptSuggestionIconType
import com.shopmate.app.ui.model.PromptSuggestionUi
import com.shopmate.app.ui.sidebar.SidebarHistoryDrawer
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.shopMateScreenBackground
import kotlinx.coroutines.delay

private const val PROMPT_LOOP_COPIES = 80
private const val PROMPT_LOOP_EDGE_COPIES = 8
private const val PROMPT_AUTO_SCROLL_SPEED_DP_PER_SECOND = 16f
private const val HOME_HEADER_X = 20f
private const val HOME_HEADER_Y = 36f
private const val HOME_HEADER_WIDTH = 348.667f
private const val HOME_HEADER_HEIGHT = 44f
private const val HOME_KEYBOARD_BUDDY_Y = 3f
private const val HOME_HERO_BUDDY_X = 70f
private const val HOME_HERO_BUDDY_Y = 204f
private const val HOME_HERO_BUDDY_WIDTH = 246f
private const val HOME_HERO_BUDDY_HEIGHT = 249.7f
private const val KEYBOARD_BUDDY_MORPH_DURATION_MS = 620

@Composable
fun HomeChatEntryScreen(
    composerText: String = "",
    isSending: Boolean = false,
    historyConversations: List<HistoryConversationUi> = emptyList(),
    voiceInputState: VoiceInputUiState = VoiceInputUiState.Idle,
    selectedImage: ChatImageAttachmentUi? = null,
    onComposerTextChange: (String) -> Unit = {},
    onSend: () -> Unit = {},
    onVoicePressStart: () -> Unit = {},
    onVoicePressEnd: () -> Unit = {},
    onVoiceCancel: () -> Unit = {},
    onImagePickClick: () -> Unit = {},
    onImageRemoveClick: () -> Unit = {},
    onImageRetryClick: () -> Unit = {},
    onMenuClick: () -> Unit = {},
    onCartClick: () -> Unit = {},
    onKeyboardAvatarVisibilityChange: (Boolean) -> Unit = {},
    onNewChatClick: () -> Unit = {},
    onHistoryClick: (HistoryConversationUi) -> Unit = {},
    editableConversationIds: Set<String> = emptySet(),
    onRenameHistory: (String, String) -> Unit = { _, _ -> },
    onDeleteHistory: (String) -> Unit = {},
) {
    var isSidebarOpen by rememberSaveable { mutableStateOf(false) }
    var hasObservedKeyboardState by remember { mutableStateOf(false) }
    var keyboardBuddyMorphId by remember { mutableStateOf(0L) }
    var keyboardBuddyMorphRequest by remember {
        mutableStateOf<KeyboardBuddyMorphRequest?>(null)
    }
    var settledKeyboardBuddyVisibility by remember { mutableStateOf<Boolean?>(null) }
    val latestOnKeyboardAvatarVisibilityChange by rememberUpdatedState(
        onKeyboardAvatarVisibilityChange
    )

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .shopMateScreenBackground()
    ) {
        val scale = maxWidth.value / ShopMateFigmaFrameWidth
        val textScale = (scale * ShopMateReadableControlScale).coerceIn(0.92f, 1.13f)

        fun Float.s(): Dp = scaledDp(scale)

        val composerHeightValue = if (selectedImage != null) 104f else 44f
        val composerHeight = (composerHeightValue * ShopMateReadableControlScale).s()
        val density = LocalDensity.current
        val imeBottom = WindowInsets.ime.getBottom(density)
        val isKeyboardVisible = imeBottom > 0
        val isBuddyMorphing = keyboardBuddyMorphRequest != null
        val isKeyboardBuddySettling = settledKeyboardBuddyVisibility?.let { settled ->
            settled != isKeyboardVisible
        } ?: false
        val hideStaticBuddyForMorph = isBuddyMorphing || isKeyboardBuddySettling
        val composerBottom = 18f.s()
        val composerTop = maxHeight - composerHeight - composerBottom
        val promptPanelHeight = 327f.s()
        val figmaPromptPanelTop = 437.667f.s()
        val promptPanelTop = if (figmaPromptPanelTop + promptPanelHeight + 14f.s() > composerTop) {
            (composerTop - promptPanelHeight - 14f.s()).coerceAtLeast(320f.s())
        } else {
            figmaPromptPanelTop
        }
        val promptClicksEnabled = !isSending &&
            !voiceInputState.blocksPromptSelection() &&
            !selectedImage.blocksPromptSelection()

        DisposableEffect(Unit) {
            onDispose {
                latestOnKeyboardAvatarVisibilityChange(false)
            }
        }

        LaunchedEffect(isKeyboardVisible) {
            latestOnKeyboardAvatarVisibilityChange(isKeyboardVisible)
            if (!hasObservedKeyboardState) {
                hasObservedKeyboardState = true
                settledKeyboardBuddyVisibility = isKeyboardVisible
                return@LaunchedEffect
            }

            keyboardBuddyMorphId += 1
            keyboardBuddyMorphRequest = KeyboardBuddyMorphRequest(
                id = keyboardBuddyMorphId,
                target = if (isKeyboardVisible) {
                    KeyboardBuddyMorphTarget.Avatar
                } else {
                    KeyboardBuddyMorphTarget.Hero
                },
            )
        }

        if (isKeyboardVisible) {
            KeyboardHeader(
                scale = scale,
                showBuddy = !hideStaticBuddyForMorph,
                onMenuClick = {
                    isSidebarOpen = true
                    onMenuClick()
                },
                onCartClick = onCartClick,
                modifier = Modifier
                    .offset(x = HOME_HEADER_X.s(), y = HOME_HEADER_Y.s())
                    .width(HOME_HEADER_WIDTH.s())
                    .height(HOME_HEADER_HEIGHT.s())
                    .zIndex(2f),
            )
        } else {
            Header(
                scale = scale,
                onMenuClick = {
                    isSidebarOpen = true
                    onMenuClick()
                },
                onCartClick = onCartClick,
                modifier = Modifier
                    .offset(x = HOME_HEADER_X.s(), y = HOME_HEADER_Y.s())
                    .width(HOME_HEADER_WIDTH.s())
                    .height(HOME_HEADER_HEIGHT.s())
            )

            BrandCopy(
                textScale = textScale,
                scale = scale,
                modifier = Modifier
                    .offset(x = 20f.s(), y = 83f.s())
                    .width(348.667f.s())
            )

            HeroMascot(
                scale = scale,
                showBuddy = !hideStaticBuddyForMorph,
            )

            PromptPanel(
                prompts = MockShopMateData.promptSuggestions,
                textScale = textScale,
                scale = scale,
                enabled = promptClicksEnabled,
                onPromptClick = { prompt -> onComposerTextChange(prompt.title) },
                modifier = Modifier
                    .offset(x = 20f.s(), y = promptPanelTop)
                    .size(width = 348.667f.s(), height = promptPanelHeight)
            )
        }

        KeyboardBuddyMorphOverlay(
            request = keyboardBuddyMorphRequest,
            scale = scale,
            onFinished = { request ->
                if (keyboardBuddyMorphRequest == request) {
                    keyboardBuddyMorphRequest = null
                    settledKeyboardBuddyVisibility = request.target == KeyboardBuddyMorphTarget.Avatar
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        ChatComposer(
            value = composerText,
            onValueChange = onComposerTextChange,
            onSend = onSend,
            onVoicePressStart = onVoicePressStart,
            onVoicePressEnd = onVoicePressEnd,
            onVoiceCancel = onVoiceCancel,
            onImagePickClick = onImagePickClick,
            onImageRemoveClick = onImageRemoveClick,
            onImageRetryClick = onImageRetryClick,
            voiceInputState = voiceInputState,
            voiceEnabled = !isSending,
            imageAttachment = selectedImage,
            sendEnabled = (composerText.isNotBlank() || selectedImage != null) && !isSending,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 18f.s(), bottom = composerBottom)
                .navigationBarsPadding()
                .imePadding()
                .size(width = 352.667f.s(), height = composerHeight)
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
            onDeleteHistory = onDeleteHistory
        )
    }
}

@Composable
private fun KeyboardHeader(
    scale: Float,
    showBuddy: Boolean,
    onMenuClick: () -> Unit,
    onCartClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)
    val controlSize = 38f * ShopMateReadableControlScale
    val controlOffset = (controlSize - 38f) / 2f

    Box(modifier = modifier) {
        Header(
            scale = scale,
            onMenuClick = onMenuClick,
            onCartClick = onCartClick,
            modifier = Modifier
                .width(HOME_HEADER_WIDTH.s())
                .height(HOME_HEADER_HEIGHT.s()),
        )

        if (showBuddy) {
            ShopMateBuddyMotion(
                state = ShopMateBuddyMotionState.Idle,
                fallbackRes = R.drawable.sidebar_shopmate_buddy,
                contentDescription = "Shopmate Buddy",
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = (HOME_KEYBOARD_BUDDY_Y - controlOffset).s())
                    .size(controlSize.s()),
            )
        }
    }
}

private enum class KeyboardBuddyMorphTarget {
    Avatar,
    Hero,
}

private data class KeyboardBuddyMorphRequest(
    val id: Long,
    val target: KeyboardBuddyMorphTarget,
)

@Composable
private fun KeyboardBuddyMorphOverlay(
    request: KeyboardBuddyMorphRequest?,
    scale: Float,
    onFinished: (KeyboardBuddyMorphRequest) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (request == null) {
        return
    }

    fun Float.s(): Dp = scaledDp(scale)

    val controlSize = 38f * ShopMateReadableControlScale
    val controlOffset = (controlSize - 38f) / 2f
    val avatarX = HOME_HEADER_X + (HOME_HEADER_WIDTH - controlSize) / 2f
    val avatarY = HOME_HEADER_Y + HOME_KEYBOARD_BUDDY_Y - controlOffset
    val startsAtHero = request.target == KeyboardBuddyMorphTarget.Avatar

    val startX = if (startsAtHero) HOME_HERO_BUDDY_X else avatarX
    val startY = if (startsAtHero) HOME_HERO_BUDDY_Y else avatarY
    val startWidth = if (startsAtHero) HOME_HERO_BUDDY_WIDTH else controlSize
    val startHeight = if (startsAtHero) HOME_HERO_BUDDY_HEIGHT else controlSize
    val targetX = if (startsAtHero) avatarX else HOME_HERO_BUDDY_X
    val targetY = if (startsAtHero) avatarY else HOME_HERO_BUDDY_Y
    val targetWidth = if (startsAtHero) controlSize else HOME_HERO_BUDDY_WIDTH
    val targetHeight = if (startsAtHero) controlSize else HOME_HERO_BUDDY_HEIGHT

    var started by remember(request.id) { mutableStateOf(false) }
    val animatedX by animateDpAsState(
        targetValue = if (started) targetX.s() else startX.s(),
        animationSpec = tween(
            durationMillis = KEYBOARD_BUDDY_MORPH_DURATION_MS,
            easing = FastOutSlowInEasing,
        ),
        label = "keyboardBuddyMorphX",
    )
    val animatedY by animateDpAsState(
        targetValue = if (started) targetY.s() else startY.s(),
        animationSpec = tween(
            durationMillis = KEYBOARD_BUDDY_MORPH_DURATION_MS,
            easing = FastOutSlowInEasing,
        ),
        label = "keyboardBuddyMorphY",
    )
    val animatedWidth by animateDpAsState(
        targetValue = if (started) targetWidth.s() else startWidth.s(),
        animationSpec = tween(
            durationMillis = KEYBOARD_BUDDY_MORPH_DURATION_MS,
            easing = FastOutSlowInEasing,
        ),
        label = "keyboardBuddyMorphWidth",
    )
    val animatedHeight by animateDpAsState(
        targetValue = if (started) targetHeight.s() else startHeight.s(),
        animationSpec = tween(
            durationMillis = KEYBOARD_BUDDY_MORPH_DURATION_MS,
            easing = FastOutSlowInEasing,
        ),
        label = "keyboardBuddyMorphHeight",
    )

    LaunchedEffect(request.id) {
        started = true
        delay(KEYBOARD_BUDDY_MORPH_DURATION_MS.toLong())
        onFinished(request)
    }

    Box(
        modifier = modifier.zIndex(3f)
    ) {
        ShopMateBuddyMotion(
            state = ShopMateBuddyMotionState.Arrival,
            fallbackRes = R.drawable.home_chat_buddy,
            fallbackContentScale = ContentScale.Crop,
            reverseLottieProgress = request.target == KeyboardBuddyMorphTarget.Hero,
            contentDescription = null,
            modifier = Modifier
                .offset(x = animatedX, y = animatedY)
                .size(width = animatedWidth, height = animatedHeight),
        )
    }
}

@Composable
private fun Header(
    scale: Float,
    onMenuClick: () -> Unit,
    onCartClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        HeaderIconButton(
            icon = R.drawable.ic_menu,
            contentDescription = "打开侧边栏",
            onClick = onMenuClick,
            scale = scale,
        )
        Spacer(modifier = Modifier.weight(1f))
        HeaderIconButton(
            icon = R.drawable.ic_cart,
            contentDescription = "购物车",
            onClick = onCartClick,
            scale = scale,
        )
    }
}

@Composable
private fun HeaderIconButton(
    icon: Int,
    contentDescription: String,
    onClick: () -> Unit,
    scale: Float,
) {
    fun Float.s(): Dp = scaledDp(scale)

    ShopMateCircleIconButton(
        icon = icon,
        contentDescription = contentDescription,
        onClick = onClick,
        modifier = Modifier.size((38f * ShopMateReadableControlScale).s()),
        iconSize = (16f * ShopMateReadableControlScale).s(),
        backgroundColor = Color.White,
        showPressIndication = false,
    )
}

@Composable
private fun BrandCopy(
    textScale: Float,
    scale: Float,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)

    Box(modifier = modifier.height(44.667f.s())) {
        Text(
            text = buildAnnotatedString {
                append("抖选选 ")
                withStyle(SpanStyle(color = ShopMateGreen)) {
                    append("/ Shopmate")
                }
            },
            color = ShopMateTextPrimary,
            fontSize = (19f * textScale).sp,
            lineHeight = (25f * textScale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            modifier = Modifier.width(348.667f.s())
        )
        Text(
            text = "AI 购物助手 · 懂你所需，帮你选得更好",
            color = Color(0xFF9AA2AD),
            fontSize = (12f * textScale).sp,
            lineHeight = (16f * textScale).sp,
            letterSpacing = 0.sp,
            modifier = Modifier.offset(y = 28.667f.s())
        )
    }
}

@Composable
private fun HeroMascot(
    scale: Float,
    showBuddy: Boolean = true,
) {
    fun Float.s(): Dp = scaledDp(scale)

    Box(
        modifier = Modifier
            .offset(x = 266.667f.s(), y = 140f.s())
            .size(58f.s())
            .shadow(
                elevation = 12f.s(),
                shape = RoundedCornerShape(
                    topStart = 29f.s(),
                    topEnd = 29f.s(),
                    bottomEnd = 29f.s(),
                    bottomStart = 16f.s()
                ),
                clip = false
            )
            .background(
                color = Color.White.copy(alpha = 0.92f),
                shape = RoundedCornerShape(
                    topStart = 29f.s(),
                    topEnd = 29f.s(),
                    bottomEnd = 29f.s(),
                    bottomStart = 16f.s()
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_home_heart),
            contentDescription = null,
            modifier = Modifier.size(16f.s())
        )
    }

    if (showBuddy) {
        ShopMateBuddyMotion(
            state = ShopMateBuddyMotionState.Idle,
            fallbackRes = R.drawable.home_chat_buddy,
            fallbackContentScale = ContentScale.Crop,
            contentDescription = null,
            modifier = Modifier
                .offset(x = HOME_HERO_BUDDY_X.s(), y = HOME_HERO_BUDDY_Y.s())
                .size(width = HOME_HERO_BUDDY_WIDTH.s(), height = HOME_HERO_BUDDY_HEIGHT.s()),
        )
    }
}

@Composable
private fun PromptPanel(
    prompts: List<PromptSuggestionUi>,
    textScale: Float,
    scale: Float,
    enabled: Boolean,
    onPromptClick: (PromptSuggestionUi) -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)
    var selectedPromptId by rememberSaveable { mutableStateOf<String?>(null) }
    val promptCount = prompts.size
    val virtualPromptCount = if (promptCount > 1) {
        promptCount * PROMPT_LOOP_COPIES
    } else {
        promptCount
    }
    val loopStartIndex = remember(promptCount) {
        if (promptCount > 1) {
            (PROMPT_LOOP_COPIES / 2) * promptCount
        } else {
            0
        }
    }
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = loopStartIndex)
    val isUserDragging by listState.interactionSource.collectIsDraggedAsState()
    val shouldAutoScroll by rememberUpdatedState(promptCount > 1 && !isUserDragging)
    val autoScrollSpeedPx = with(LocalDensity.current) {
        (PROMPT_AUTO_SCROLL_SPEED_DP_PER_SECOND * scale).dp.toPx()
    }
    val loopResetIndex by remember(promptCount, virtualPromptCount, loopStartIndex) {
        derivedStateOf {
            if (promptCount <= 1) {
                null
            } else {
                val currentIndex = listState.firstVisibleItemIndex
                val edgeSize = promptCount * PROMPT_LOOP_EDGE_COPIES
                if (currentIndex < edgeSize || currentIndex > virtualPromptCount - edgeSize) {
                    loopStartIndex + (currentIndex % promptCount)
                } else {
                    null
                }
            }
        }
    }

    LaunchedEffect(loopResetIndex, promptCount) {
        val targetIndex = loopResetIndex
        if (promptCount > 1 && targetIndex != null) {
            listState.scrollToItem(targetIndex, listState.firstVisibleItemScrollOffset)
        }
    }

    LaunchedEffect(promptCount, autoScrollSpeedPx) {
        if (promptCount <= 1) {
            return@LaunchedEffect
        }

        var previousFrameNanos = withFrameNanos { frameNanos -> frameNanos }
        while (true) {
            val frameNanos = withFrameNanos { currentFrameNanos -> currentFrameNanos }
            if (shouldAutoScroll) {
                val deltaSeconds = (frameNanos - previousFrameNanos) / 1_000_000_000f
                listState.scrollBy(autoScrollSpeedPx * deltaSeconds)
            }
            previousFrameNanos = frameNanos
        }
    }

    Box(
        modifier = modifier
    ) {
        Box(
            modifier = Modifier
                .offset(x = 23f.s(), y = 0f.s())
                .size(width = 302.667f.s(), height = 84f.s())
                .shadow(
                    elevation = 5f.s(),
                    shape = RoundedCornerShape(22f.s()),
                    clip = false
                )
                .background(
                    color = Color.White,
                    shape = RoundedCornerShape(22f.s())
                )
                .border(
                    width = 0.667.dp,
                    color = Color(0xFFF0F5F2),
                    shape = RoundedCornerShape(22f.s())
                ),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 18f.s(), vertical = 10f.s()),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    text = "今天想买点什么？",
                    color = ShopMateTextPrimary,
                    fontSize = (19.5f * textScale).sp,
                    lineHeight = (25f * textScale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(4f.s()))

                Text(
                    text = "告诉我你的需求，我来帮你挑选最合适的商品",
                    color = Color(0xFF8D96A0),
                    fontSize = (11.5f * textScale).sp,
                    lineHeight = (15.5f * textScale).sp,
                    letterSpacing = 0.sp,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        Box(
            modifier = Modifier
                .offset(x = 296f.s(), y = 14f.s())
                .size(width = 37f.s(), height = 22f.s())
                .background(
                    color = Color(0xFFF7FEFB),
                    shape = RoundedCornerShape(999.dp)
                )
                .border(
                    width = 0.667.dp,
                    color = Color(0xFFD6F2E8),
                    shape = RoundedCornerShape(999.dp)
                )
                .padding(horizontal = 6f.s(), vertical = 4f.s()),
            contentAlignment = Alignment.Center
        ) {
            ShopMateLottieStateIndicator(
                state = ShopMateLottieState.AiThinking,
                modifier = Modifier.fillMaxSize()
            )
        }

        Box(
            modifier = Modifier
                .offset(x = 31f.s(), y = 112f.s())
                .size(width = 286.667f.s(), height = 218f.s())
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12f.s())
            ) {
                items(
                    count = virtualPromptCount,
                    key = { index -> "prompt-loop-$index" }
                ) { index ->
                    val prompt = prompts[index % promptCount]
                    PromptRow(
                        prompt = prompt,
                        selected = prompt.id == selectedPromptId,
                        enabled = enabled,
                        icon = prompt.iconType.toPromptIconRes(),
                        textScale = textScale,
                        scale = scale,
                        onClick = {
                            selectedPromptId = prompt.id
                            onPromptClick(prompt)
                        },
                        modifier = Modifier
                            .size(width = 286.667f.s(), height = 54f.s())
                    )
                }
            }

            if (prompts.size > 4) {
                PromptScrollScrim(
                    top = true,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .size(width = 286.667f.s(), height = 14f.s())
                )
            }

            if (prompts.size > 4) {
                PromptScrollScrim(
                    top = false,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .size(width = 286.667f.s(), height = 40f.s())
                )
            }
        }
    }
}

@Composable
private fun PromptScrollScrim(
    top: Boolean,
    modifier: Modifier = Modifier
) {
    val colors = if (top) {
        listOf(
            Color(0xFFF6FCFA).copy(alpha = 0.82f),
            Color(0xFFF6FCFA).copy(alpha = 0.18f),
            Color.Transparent
        )
    } else {
        listOf(
            Color.Transparent,
            Color(0xFFF6FCFA).copy(alpha = 0.28f),
            Color(0xFFF6FCFA).copy(alpha = 0.78f)
        )
    }

    Box(
        modifier = modifier
            .background(Brush.verticalGradient(colors))
    )
}

private fun PromptSuggestionIconType.toPromptIconRes(): Int =
    when (this) {
        PromptSuggestionIconType.Bag -> R.drawable.ic_prompt_bag
        PromptSuggestionIconType.Cart -> R.drawable.ic_prompt_cart
        PromptSuggestionIconType.Search -> R.drawable.ic_prompt_search
        PromptSuggestionIconType.Camera -> R.drawable.ic_prompt_camera
    }

@Composable
private fun PromptRow(
    prompt: PromptSuggestionUi,
    selected: Boolean,
    enabled: Boolean,
    icon: Int,
    textScale: Float,
    scale: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)

    val borderColor = if (selected) {
        ShopMateGreen.copy(alpha = 0.36f)
    } else {
        Color(0xFFEAF2EF)
    }
    val backgroundColor = if (selected) {
        Color(0xFFF3FCF8)
    } else {
        Color.White
    }
    val contentAlpha = if (enabled) 1f else 0.46f

    Row(
        modifier = modifier
            .shadow(
                elevation = if (selected && enabled) 5f.s() else 2f.s(),
                shape = RoundedCornerShape(22f.s()),
                clip = false
            )
            .background(backgroundColor, RoundedCornerShape(22f.s()))
            .border(1.dp, borderColor, RoundedCornerShape(22f.s()))
            .clickable(
                enabled = enabled,
                role = Role.Button,
                onClick = onClick
            )
            .padding(start = 16f.s(), end = 18f.s()),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            painter = painterResource(id = icon),
            contentDescription = null,
            alpha = contentAlpha,
            modifier = Modifier.size(18f.s())
        )
        Spacer(modifier = Modifier.width(12f.s()))
        if (prompt.categoryLabel.isNotBlank()) {
            Text(
                text = prompt.categoryLabel,
                color = ShopMateGreen.copy(alpha = if (enabled) 0.86f else 0.45f),
                fontSize = (10.8f * textScale).sp,
                lineHeight = (13.5f * textScale).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.width(34f.s())
            )
            Spacer(modifier = Modifier.width(8f.s()))
        }
        Text(
            text = prompt.title,
            color = Color(0xFF4D5660).copy(alpha = contentAlpha),
            fontSize = (14.6f * textScale).sp,
            lineHeight = (19.5f * textScale).sp,
            letterSpacing = 0.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
    }
}

private fun VoiceInputUiState.blocksPromptSelection(): Boolean =
    this is VoiceInputUiState.Listening ||
        this is VoiceInputUiState.Transcribing ||
        this is VoiceInputUiState.TranscriptReady

private fun ChatImageAttachmentUi?.blocksPromptSelection(): Boolean =
    this?.status in setOf(
        ChatImageAttachmentStatus.Uploading,
        ChatImageAttachmentStatus.Interpreting,
        ChatImageAttachmentStatus.Searching,
    )

@Preview(
    name = "Figma target - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true
)
@Composable
private fun HomeChatEntryScreenTargetPreview() {
    HomeChatEntryScreenPreviewContent()
}

@Preview(
    name = "Compact Android - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true
)
@Composable
private fun HomeChatEntryScreenCompactPreview() {
    HomeChatEntryScreenPreviewContent()
}

@Composable
private fun HomeChatEntryScreenPreviewContent() {
    var composerText by rememberSaveable { mutableStateOf("") }

    HomeChatEntryScreen(
        composerText = composerText,
        onComposerTextChange = { composerText = it },
    )
}
