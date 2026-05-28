package com.shopmate.app.ui.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R
import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.components.ChatComposer
import com.shopmate.app.ui.components.ShopMateFigmaFrameWidth
import com.shopmate.app.ui.components.ShopMateCircleIconButton
import com.shopmate.app.ui.components.scaledDp
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.PromptSuggestionUi
import com.shopmate.app.ui.sidebar.SidebarHistoryDrawer
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.shopMateScreenBackground

@Composable
fun HomeChatEntryScreen(
    onMenuClick: () -> Unit = {},
    onCartClick: () -> Unit = {},
    onNewChatClick: () -> Unit = {},
    onHistoryClick: (HistoryConversationUi) -> Unit = {}
) {
    var composerText by rememberSaveable { mutableStateOf("") }
    var isSidebarOpen by rememberSaveable { mutableStateOf(false) }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .shopMateScreenBackground()
    ) {
        val scale = maxWidth.value / ShopMateFigmaFrameWidth
        val textScale = scale.coerceIn(0.88f, 1.08f)

        fun Float.s(): Dp = scaledDp(scale)

        val composerHeight = 52f.s()
        val composerBottom = 18f.s()
        val composerTop = maxHeight - composerHeight - composerBottom
        val promptPanelHeight = 327f.s()
        val figmaPromptPanelTop = 437.667f.s()
        val promptPanelTop = if (figmaPromptPanelTop + promptPanelHeight + 14f.s() > composerTop) {
            (composerTop - promptPanelHeight - 14f.s()).coerceAtLeast(320f.s())
        } else {
            figmaPromptPanelTop
        }

        Header(
            onMenuClick = {
                isSidebarOpen = true
                onMenuClick()
            },
            onCartClick = onCartClick,
            modifier = Modifier
                .offset(x = 20f.s(), y = 36f.s())
                .width(348.667f.s())
                .height(44f.s())
        )

        BrandCopy(
            textScale = textScale,
            scale = scale,
            modifier = Modifier
                .offset(x = 20f.s(), y = 83f.s())
                .width(348.667f.s())
        )

        HeroMascot(
            scale = scale
        )

        PromptPanel(
            prompts = MockShopMateData.promptSuggestions,
            textScale = textScale,
            scale = scale,
            onPromptClick = { prompt -> composerText = prompt.title },
            modifier = Modifier
                .offset(x = 20f.s(), y = promptPanelTop)
                .size(width = 348.667f.s(), height = promptPanelHeight)
        )

        ChatComposer(
            value = composerText,
            onValueChange = { composerText = it },
            onSend = {},
            onVoiceClick = {},
            onImageClick = {},
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
private fun Header(
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
            onClick = onMenuClick
        )
        Spacer(modifier = Modifier.weight(1f))
        HeaderIconButton(
            icon = R.drawable.ic_cart,
            contentDescription = "购物车",
            onClick = onCartClick
        )
    }
}

@Composable
private fun HeaderIconButton(
    icon: Int,
    contentDescription: String,
    onClick: () -> Unit
) {
    ShopMateCircleIconButton(
        icon = icon,
        contentDescription = contentDescription,
        onClick = onClick,
        modifier = Modifier.size(38.dp),
        iconSize = 16.dp
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
    scale: Float
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

    Image(
        painter = painterResource(id = R.drawable.home_chat_buddy),
        contentDescription = null,
        modifier = Modifier
            .offset(x = 68.333f.s(), y = 198.18f.s())
            .size(width = 252f.s(), height = 255.823f.s()),
        contentScale = ContentScale.Crop
    )
}

@Composable
private fun PromptPanel(
    prompts: List<PromptSuggestionUi>,
    textScale: Float,
    scale: Float,
    onPromptClick: (PromptSuggestionUi) -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)

    Box(
        modifier = modifier
            .shadow(
                elevation = 18.dp,
                shape = RoundedCornerShape(
                    topStart = 34.dp,
                    topEnd = 34.dp,
                    bottomStart = 22.dp,
                    bottomEnd = 22.dp
                ),
                clip = false
            )
            .background(
                color = Color.White.copy(alpha = 0.94f),
                shape = RoundedCornerShape(
                    topStart = 34.dp,
                    topEnd = 34.dp,
                    bottomStart = 22.dp,
                    bottomEnd = 22.dp
                )
            )
            .border(
                width = 1.dp,
                color = Color(0xFFEFF4F2).copy(alpha = 0.94f),
                shape = RoundedCornerShape(
                    topStart = 34.dp,
                    topEnd = 34.dp,
                    bottomStart = 22.dp,
                    bottomEnd = 22.dp
                )
            )
    ) {
        Text(
            text = "今天想买点什么？",
            color = ShopMateTextPrimary,
            fontSize = (20f * textScale).sp,
            lineHeight = (27f * textScale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 16f.s(), y = 30f.s())
                .width(315.333f.s()),
            textAlign = TextAlign.Center
        )

        Text(
            text = "告诉我你的需求，我来帮你挑选最合适的商品",
            color = Color(0xFF8D96A0),
            fontSize = (12f * textScale).sp,
            lineHeight = (16f * textScale).sp,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 16f.s(), y = 63.667f.s())
                .width(315.333f.s()),
            textAlign = TextAlign.Center
        )

        prompts.take(4).forEachIndexed { index, prompt ->
            PromptRow(
                prompt = prompt,
                selected = index == 0,
                icon = promptIconForIndex(index),
                textScale = textScale,
                scale = scale,
                onClick = { onPromptClick(prompt) },
                modifier = Modifier
                    .offset(x = 16f.s(), y = (95.667f + (index * 55f)).s())
                    .size(width = 315.333f.s(), height = 45f.s())
            )
        }
    }
}

private fun promptIconForIndex(index: Int): Int =
    when (index) {
        0 -> R.drawable.ic_prompt_bag
        1 -> R.drawable.ic_prompt_cart
        2 -> R.drawable.ic_prompt_search
        else -> R.drawable.ic_prompt_camera
    }

@Composable
private fun PromptRow(
    prompt: PromptSuggestionUi,
    selected: Boolean,
    icon: Int,
    textScale: Float,
    scale: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)

    val borderColor = if (selected) {
        ShopMateGreen.copy(alpha = 0.32f)
    } else {
        Color(0xFFEDF1F2)
    }
    val backgroundColor = if (selected) {
        Color(0xFFF5FCF9)
    } else {
        Color.White
    }

    Row(
        modifier = modifier
            .shadow(
                elevation = if (selected) 7f.s() else 0.dp,
                shape = RoundedCornerShape(14f.s()),
                clip = false
            )
            .background(backgroundColor, RoundedCornerShape(14f.s()))
            .border(1.dp, borderColor, RoundedCornerShape(14f.s()))
            .clickable(onClick = onClick)
            .padding(start = 13f.s(), end = 14f.s()),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            painter = painterResource(id = icon),
            contentDescription = null,
            modifier = Modifier.size(16f.s())
        )
        Spacer(modifier = Modifier.width(19f.s()))
        Text(
            text = prompt.title,
            color = Color(0xFF4D5660),
            fontSize = (16f * textScale).sp,
            lineHeight = (21f * textScale).sp,
            letterSpacing = 0.sp,
            maxLines = 1,
            modifier = Modifier.weight(1f)
        )
    }
}

@Preview(
    name = "Figma target - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true
)
@Composable
private fun HomeChatEntryScreenTargetPreview() {
    HomeChatEntryScreen()
}

@Preview(
    name = "Compact Android - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true
)
@Composable
private fun HomeChatEntryScreenCompactPreview() {
    HomeChatEntryScreen()
}
