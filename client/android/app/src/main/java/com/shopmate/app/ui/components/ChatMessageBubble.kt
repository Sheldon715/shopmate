package com.shopmate.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.shopmate.app.ui.chat.ChatImageAttachmentStatus
import com.shopmate.app.ui.chat.ChatImageAttachmentUi

@Composable
fun ChatMessageBubble(
    text: String,
    fromUser: Boolean,
    textScale: Float,
    modifier: Modifier = Modifier,
    imageAttachment: ChatImageAttachmentUi? = null,
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
        Column(
            modifier = Modifier
                .padding(
                    horizontal = if (fromUser) 14.dp else 12.dp,
                    vertical = 10.dp,
                )
        ) {
            imageAttachment?.let { attachment ->
                ChatBubbleImageAttachment(
                    attachment = attachment,
                    fromUser = fromUser,
                    textScale = textScale,
                )
                if (text.isNotBlank()) {
                    Spacer(modifier = Modifier.size(8.dp))
                }
            }
            if (text.isNotBlank()) {
                Text(
                    text = text,
                    color = if (fromUser) Color(0xFF275747) else Color(0xFF53606B),
                    fontSize = (12f * textScale).sp,
                    lineHeight = (18.6f * textScale).sp,
                    letterSpacing = 0.sp,
                    overflow = TextOverflow.Clip,
                )
            }
        }
    }
}

@Composable
private fun ChatBubbleImageAttachment(
    attachment: ChatImageAttachmentUi,
    fromUser: Boolean,
    textScale: Float,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = attachment.uriString,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(56.dp)
                .background(
                    color = Color.White.copy(alpha = if (fromUser) 0.55f else 1f),
                    shape = RoundedCornerShape(12.dp),
                ),
        )
        Column(
            verticalArrangement = Arrangement.spacedBy(2.dp),
            modifier = Modifier.weight(1f),
        ) {
            Text(
                text = attachment.previewLabel,
                color = if (fromUser) Color(0xFF275747) else Color(0xFF53606B),
                fontSize = (11.5f * textScale).sp,
                lineHeight = (15f * textScale).sp,
                letterSpacing = 0.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            attachment.statusLabel()?.let { statusLabel ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    attachment.stateIndicatorState()?.let { indicatorState ->
                        ShopMateLottieStateIndicator(
                            state = indicatorState,
                            contentDescription = statusLabel,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    Text(
                        text = statusLabel,
                        color = if (attachment.status == ChatImageAttachmentStatus.Failed) {
                            Color(0xFFB84A3A)
                        } else {
                            Color(0xFF65717C)
                        },
                        fontSize = (10.5f * textScale).sp,
                        lineHeight = (13.5f * textScale).sp,
                        letterSpacing = 0.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

private fun ChatImageAttachmentUi.statusLabel(): String? =
    when (status) {
        ChatImageAttachmentStatus.Selected -> null
        ChatImageAttachmentStatus.Uploading -> "正在上传图片"
        ChatImageAttachmentStatus.Interpreting -> "正在识别商品"
        ChatImageAttachmentStatus.Searching -> "正在找相似商品"
        ChatImageAttachmentStatus.Failed -> errorMessage ?: "图片找货失败"
    }

private fun ChatImageAttachmentUi.stateIndicatorState(): ShopMateLottieState? =
    status.lottieStateOrNull()

@Composable
fun ChatTypingIndicatorBubble(
    textScale: Float,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .shadow(
                elevation = 8.dp,
                shape = RoundedCornerShape(16.dp),
                clip = false,
            )
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(
                width = 0.667.dp,
                color = Color(0xFFF0F3F3),
                shape = RoundedCornerShape(16.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        ShopMateLottieStateIndicator(
            state = ShopMateLottieState.AiThinking,
            contentDescription = "正在思考",
            modifier = Modifier.size(
                width = (48f * textScale).dp,
                height = (24f * textScale).dp,
            ),
        )
    }
}
