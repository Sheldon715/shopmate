package com.shopmate.app.ui.components

import android.view.MotionEvent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.pointer.pointerInteropFilter
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.shopmate.app.R
import com.shopmate.app.ui.chat.ChatImageAttachmentStatus
import com.shopmate.app.ui.chat.ChatImageAttachmentUi
import com.shopmate.app.ui.chat.VoiceInputUiState
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateLightGreen
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateSurfaceSoft

@Composable
fun ChatComposer(
    value: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    onVoicePressStart: () -> Unit,
    onVoicePressEnd: () -> Unit,
    modifier: Modifier = Modifier,
    shadowElevation: Dp = 10.dp,
    imageAttachment: ChatImageAttachmentUi? = null,
    onImagePickClick: () -> Unit = {},
    onImageRemoveClick: () -> Unit = {},
    onImageRetryClick: () -> Unit = {},
    sendEnabled: Boolean = value.isNotBlank() || imageAttachment != null,
    voiceInputState: VoiceInputUiState = VoiceInputUiState.Idle,
    voiceEnabled: Boolean = true,
    onVoiceCancel: () -> Unit = {},
    controlScale: Float = ShopMateReadableControlScale,
) {
    var inputMode by rememberSaveable { mutableStateOf(ComposerInputMode.Text) }

    ChatComposerContent(
        value = value,
        onValueChange = onValueChange,
        onSend = onSend,
        onVoicePressStart = onVoicePressStart,
        onVoicePressEnd = onVoicePressEnd,
        inputMode = inputMode,
        voiceInputState = voiceInputState,
        voiceEnabled = voiceEnabled,
        imageAttachment = imageAttachment,
        onImagePickClick = {
            inputMode = ComposerInputMode.Text
            onImagePickClick()
        },
        onImageRemoveClick = onImageRemoveClick,
        onImageRetryClick = onImageRetryClick,
        onInputModeChange = { mode ->
            inputMode = mode
        },
        onVoiceCancel = onVoiceCancel,
        modifier = modifier,
        shadowElevation = shadowElevation,
        sendEnabled = sendEnabled,
        controlScale = controlScale,
    )
}

@Composable
private fun ChatComposerContent(
    value: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    onVoicePressStart: () -> Unit,
    onVoicePressEnd: () -> Unit,
    inputMode: ComposerInputMode,
    voiceInputState: VoiceInputUiState,
    voiceEnabled: Boolean,
    imageAttachment: ChatImageAttachmentUi? = null,
    onImagePickClick: () -> Unit = {},
    onImageRemoveClick: () -> Unit = {},
    onImageRetryClick: () -> Unit = {},
    onInputModeChange: (ComposerInputMode) -> Unit,
    onVoiceCancel: () -> Unit,
    modifier: Modifier = Modifier,
    shadowElevation: Dp = 10.dp,
    sendEnabled: Boolean = value.isNotBlank(),
    controlScale: Float = ShopMateReadableControlScale,
) {
    val effectiveInputMode = if (imageAttachment != null) {
        ComposerInputMode.Text
    } else {
        when (voiceInputState) {
            VoiceInputUiState.Idle -> inputMode
            else -> ComposerInputMode.Voice
        }
    }
    fun Float.cs(): Dp = (this * controlScale).dp

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.Bottom,
    ) {
        imageAttachment?.let { attachment ->
            ComposerImagePreview(
                attachment = attachment,
                onRemoveClick = onImageRemoveClick,
                onRetryClick = onImageRetryClick,
                shadowElevation = shadowElevation,
                controlScale = controlScale,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52f.cs())
            )

            Spacer(modifier = Modifier.height(8f.cs()))
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(ComposerHeightValue.cs()),
            verticalAlignment = Alignment.CenterVertically
        ) {
            InputModeToggleButton(
                inputMode = effectiveInputMode,
                shadowElevation = shadowElevation,
                controlScale = controlScale,
                onClick = {
                    if (effectiveInputMode == ComposerInputMode.Text) {
                        onInputModeChange(ComposerInputMode.Voice)
                    } else {
                        onVoiceCancel()
                        onInputModeChange(ComposerInputMode.Text)
                    }
                }
            )

            Spacer(modifier = Modifier.width(8f.cs()))

            when (effectiveInputMode) {
                ComposerInputMode.Text -> {
                    TextInputSurface(
                        value = value,
                        onValueChange = onValueChange,
                        imagePickEnabled = voiceInputState == VoiceInputUiState.Idle &&
                            !sendEnabledStatusBusy(imageAttachment),
                        onImagePickClick = onImagePickClick,
                        shadowElevation = shadowElevation,
                        controlScale = controlScale,
                        modifier = Modifier
                            .weight(1f)
                            .height(ComposerHeightValue.cs())
                    )

                    Spacer(modifier = Modifier.width(8f.cs()))

                    SendButton(
                        enabled = sendEnabled,
                        shadowElevation = shadowElevation,
                        controlScale = controlScale,
                        onClick = onSend
                    )
                }

                ComposerInputMode.Voice -> VoiceInputSurface(
                    voiceInputState = voiceInputState,
                    enabled = voiceEnabled,
                    onPressStart = onVoicePressStart,
                    onPressEnd = onVoicePressEnd,
                    onPressCancel = onVoiceCancel,
                    shadowElevation = shadowElevation,
                    controlScale = controlScale,
                    modifier = Modifier
                        .weight(1f)
                        .height(ComposerHeightValue.cs())
                )
            }
        }
    }
}

@Composable
private fun InputModeToggleButton(
    inputMode: ComposerInputMode,
    shadowElevation: Dp,
    controlScale: Float,
    onClick: () -> Unit
) {
    fun Float.cs(): Dp = (this * controlScale).dp
    val icon = if (inputMode == ComposerInputMode.Text) {
        R.drawable.ic_mic
    } else {
        R.drawable.ic_keyboard_mode
    }
    val contentDescription = if (inputMode == ComposerInputMode.Text) {
        "切换到语音输入"
    } else {
        "切换到文字输入"
    }

    Box(
        modifier = Modifier
            .size(ComposerToggleSizeValue.cs())
            .then(pillShadowModifier(shadowElevation))
            .clip(ShopMatePillShape)
            .background(Color.White, ShopMatePillShape)
            .border(
                width = 1.dp,
                color = Color(0xFFEEF3F2),
                shape = ShopMatePillShape
            )
            .shopMatePressable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = icon),
            contentDescription = contentDescription,
            modifier = Modifier.size(ComposerToggleIconSizeValue.cs())
        )
    }
}

@Composable
private fun ComposerImagePreview(
    attachment: ChatImageAttachmentUi,
    onRemoveClick: () -> Unit,
    onRetryClick: () -> Unit,
    shadowElevation: Dp,
    controlScale: Float,
    modifier: Modifier = Modifier,
) {
    fun Float.cs(): Dp = (this * controlScale).dp
    Row(
        modifier = modifier
            .then(pillShadowModifier(shadowElevation))
            .clip(ComposerPreviewShape)
            .background(Color.White, ComposerPreviewShape)
            .border(1.dp, Color(0xFFEDF2F1), ComposerPreviewShape)
            .padding(start = 8f.cs(), top = 6f.cs(), end = 8f.cs(), bottom = 6f.cs()),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = attachment.uriString,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(40f.cs())
                .clip(ComposerPreviewImageShape)
                .background(Color(0xFFF3F7F5), ComposerPreviewImageShape),
        )

        Spacer(modifier = Modifier.width(10f.cs()))

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = attachment.previewLabel,
                color = Color(0xFF394852),
                fontSize = (12f * controlScale).sp,
                lineHeight = (15f * controlScale).sp,
                letterSpacing = 0.sp,
                maxLines = 1,
            )
            Text(
                text = attachment.previewStatusText(),
                color = if (attachment.status == ChatImageAttachmentStatus.Failed) {
                    Color(0xFFB84A3A)
                } else {
                    Color(0xFF7A8791)
                },
                fontSize = (10.5f * controlScale).sp,
                lineHeight = (13f * controlScale).sp,
                letterSpacing = 0.sp,
                maxLines = 1,
            )
        }

        attachment.stateIndicatorState()?.let { indicatorState ->
            ShopMateLottieStateIndicator(
                state = indicatorState,
                contentDescription = attachment.previewStatusText(),
                modifier = Modifier
                    .padding(horizontal = 6f.cs())
                    .size(24f.cs()),
            )
        }

        if (attachment.status == ChatImageAttachmentStatus.Failed) {
            Text(
                text = "重试",
                color = ShopMateGreen,
                fontSize = (12f * controlScale).sp,
                lineHeight = (15f * controlScale).sp,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .padding(horizontal = 8f.cs())
                    .shopMatePressable(role = Role.Button, onClick = onRetryClick),
            )
        }

        Image(
            painter = painterResource(id = R.drawable.ic_cart_delete),
            contentDescription = "移除图片",
            modifier = Modifier
                .size(22f.cs())
                .clip(ShopMatePillShape)
                .shopMatePressable(role = Role.Button, onClick = onRemoveClick)
                .padding(4f.cs()),
            alpha = 0.72f,
        )
    }
}

private fun sendEnabledStatusBusy(attachment: ChatImageAttachmentUi?): Boolean =
    attachment?.status in setOf(
        ChatImageAttachmentStatus.Uploading,
        ChatImageAttachmentStatus.Interpreting,
        ChatImageAttachmentStatus.Searching,
    )

private fun ChatImageAttachmentUi.previewStatusText(): String =
    when (status) {
        ChatImageAttachmentStatus.Selected -> sizeBytes?.let(::formatImageSize) ?: "准备上传"
        ChatImageAttachmentStatus.Uploading -> "正在上传图片"
        ChatImageAttachmentStatus.Interpreting -> "正在识别商品"
        ChatImageAttachmentStatus.Searching -> "正在找相似商品"
        ChatImageAttachmentStatus.Failed -> errorMessage ?: "图片找货失败"
    }

private fun ChatImageAttachmentUi.stateIndicatorState(): ShopMateLottieState? =
    status.lottieStateOrNull()

private fun formatImageSize(sizeBytes: Long): String =
    if (sizeBytes >= 1024 * 1024) {
        "%.1f MB".format(sizeBytes / (1024f * 1024f))
    } else {
        "${(sizeBytes / 1024).coerceAtLeast(1)} KB"
    }

@Composable
private fun TextInputSurface(
    value: String,
    onValueChange: (String) -> Unit,
    imagePickEnabled: Boolean,
    onImagePickClick: () -> Unit,
    shadowElevation: Dp,
    controlScale: Float,
    modifier: Modifier = Modifier
) {
    fun Float.cs(): Dp = (this * controlScale).dp
    Row(
        modifier = modifier
            .then(pillShadowModifier(shadowElevation))
            .background(
                color = Color.White,
                shape = ShopMatePillShape
            )
            .border(
                width = 1.dp,
                color = Color(0xFFEDF2F1),
                shape = ShopMatePillShape
            )
            .padding(start = 16f.cs(), top = 5f.cs(), end = 10f.cs(), bottom = 5f.cs()),
        verticalAlignment = Alignment.CenterVertically
    ) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(
                color = Color(0xFF53606B),
                fontSize = (15f * controlScale).sp,
                lineHeight = (20f * controlScale).sp,
                letterSpacing = 0.sp
            ),
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 2f.cs()),
            decorationBox = { innerTextField ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) {
                        Text(
                            text = "发消息",
                            color = Color(0xFFA3ADB6),
                            fontSize = (15f * controlScale).sp,
                            lineHeight = (20f * controlScale).sp,
                            letterSpacing = 0.sp
                        )
                    }
                    innerTextField()
                }
            }
        )

        Spacer(modifier = Modifier.width(8f.cs()))

        InlineImagePickButton(
            enabled = imagePickEnabled,
            onClick = onImagePickClick,
            controlScale = controlScale,
        )
    }
}

@Composable
private fun InlineImagePickButton(
    enabled: Boolean,
    onClick: () -> Unit,
    controlScale: Float,
) {
    fun Float.cs(): Dp = (this * controlScale).dp
    Box(
        modifier = Modifier
            .size(28f.cs())
            .clip(ShopMatePillShape)
            .shopMatePressable(
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_image),
            contentDescription = "选择图片",
            modifier = Modifier.size(18f.cs()),
            alpha = if (enabled) 0.82f else 0.35f,
        )
    }
}

@Composable
private fun VoiceInputSurface(
    voiceInputState: VoiceInputUiState,
    enabled: Boolean,
    onPressStart: () -> Unit,
    onPressEnd: () -> Unit,
    onPressCancel: () -> Unit,
    shadowElevation: Dp,
    controlScale: Float,
    modifier: Modifier = Modifier
) {
    fun Float.cs(): Dp = (this * controlScale).dp
    val isListening = voiceInputState is VoiceInputUiState.Listening
    val isTranscribing = voiceInputState is VoiceInputUiState.Transcribing
    val label = when (voiceInputState) {
        VoiceInputUiState.Idle -> "按住说话"
        VoiceInputUiState.Listening -> "聆听中"
        VoiceInputUiState.Transcribing -> "识别中"
        is VoiceInputUiState.TranscriptReady -> "发送中"
        is VoiceInputUiState.PermissionDenied -> "需要麦克风权限"
        is VoiceInputUiState.Error -> "按住说话"
    }
    val accessibilityState = when (voiceInputState) {
        VoiceInputUiState.Idle -> "未开始"
        VoiceInputUiState.Listening -> "正在聆听"
        VoiceInputUiState.Transcribing -> "正在识别"
        is VoiceInputUiState.TranscriptReady -> "识别完成，正在发送"
        is VoiceInputUiState.PermissionDenied -> "麦克风权限被拒绝"
        is VoiceInputUiState.Error -> "语音输入出错"
    }
    val accessibilityActionLabel = when {
        !enabled -> "语音输入不可用"
        isTranscribing -> "正在识别"
        isListening -> "结束语音输入"
        else -> "开始语音输入"
    }
    val backgroundColor = when {
        voiceInputState is VoiceInputUiState.PermissionDenied -> Color(0xFFFFF5F3)
        else -> Color.White
    }
    val borderColor = when {
        isListening -> Color(0xFF8FEFA4)
        voiceInputState is VoiceInputUiState.PermissionDenied -> Color(0xFFFFD5CC)
        else -> Color(0xFFEDF2F1)
    }
    val busyHintText = when {
        isListening -> "松手发送 上滑取消"
        isTranscribing -> "正在转成文字"
        else -> null
    }
    val cancelDragDistancePx = with(LocalDensity.current) {
        VoiceCancelDragDistanceValue.cs().toPx()
    }
    var pressStarted by remember { mutableStateOf(false) }

    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center
    ) {
        busyHintText?.let { hintText ->
            VoiceInputHintChip(
                text = hintText,
                controlScale = controlScale,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = (-28f).cs()),
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(ComposerHeightValue.cs())
                .then(pillShadowModifier(shadowElevation))
                .clip(ShopMatePillShape)
                .background(
                    color = backgroundColor,
                    shape = ShopMatePillShape
                )
                .border(
                    width = 1.dp,
                    color = borderColor,
                    shape = ShopMatePillShape
                )
                .semantics(mergeDescendants = true) {
                    role = Role.Button
                    contentDescription = "语音输入"
                    stateDescription = accessibilityState
                    onClick(label = accessibilityActionLabel) {
                        if (!enabled || isTranscribing) {
                            false
                        } else if (isListening || pressStarted) {
                            pressStarted = false
                            onPressEnd()
                            true
                        } else {
                            pressStarted = true
                            onPressStart()
                            true
                        }
                    }
                }
                .pointerInteropFilter { event ->
                    if (!enabled) {
                        if (pressStarted) {
                            pressStarted = false
                            onPressCancel()
                        }
                        return@pointerInteropFilter false
                    }
                    if (isTranscribing) {
                        pressStarted = false
                        return@pointerInteropFilter false
                    }

                    when (event.actionMasked) {
                        MotionEvent.ACTION_DOWN -> {
                            pressStarted = true
                            onPressStart()
                            true
                        }

                        MotionEvent.ACTION_MOVE -> {
                            if (pressStarted && event.y < -cancelDragDistancePx) {
                                pressStarted = false
                                onPressCancel()
                            }
                            true
                        }

                        MotionEvent.ACTION_UP -> {
                            if (pressStarted) {
                                pressStarted = false
                                onPressEnd()
                                true
                            } else {
                                false
                            }
                        }

                        MotionEvent.ACTION_CANCEL -> {
                            if (pressStarted) {
                                pressStarted = false
                                onPressCancel()
                            }
                            true
                        }

                        else -> true
                    }
                },
            contentAlignment = Alignment.Center
        ) {
            if (isListening || isTranscribing) {
                ShopMateLottieStateIndicator(
                    state = if (isListening) {
                        ShopMateLottieState.VoiceListening
                    } else {
                        ShopMateLottieState.VoiceTranscribing
                    },
                    contentDescription = accessibilityState,
                    modifier = Modifier
                        .fillMaxWidth(0.76f)
                        .height(34f.cs()),
                )
            } else {
                Text(
                    text = label,
                    color = if (enabled) Color(0xFF172331) else Color(0xFF9AA2AD),
                    fontSize = (15f * controlScale).sp,
                    lineHeight = (20f * controlScale).sp,
                    letterSpacing = 0.sp
                )
            }
        }
    }
}

@Composable
private fun VoiceInputHintChip(
    text: String,
    controlScale: Float,
    modifier: Modifier = Modifier,
) {
    fun Float.cs(): Dp = (this * controlScale).dp
    Text(
        text = text,
        color = Color(0xFF65717C),
        fontSize = (11.5f * controlScale).sp,
        lineHeight = (14f * controlScale).sp,
        letterSpacing = 0.sp,
        maxLines = 1,
        modifier = modifier
            .clip(ShopMatePillShape)
            .background(Color.White.copy(alpha = 0.88f), ShopMatePillShape)
            .border(1.dp, Color(0xFFE8EFED), ShopMatePillShape)
            .padding(horizontal = 10f.cs(), vertical = 4f.cs()),
    )
}

@Composable
private fun SendButton(
    enabled: Boolean,
    shadowElevation: Dp,
    controlScale: Float,
    onClick: () -> Unit
) {
    fun Float.cs(): Dp = (this * controlScale).dp
    Box(
        modifier = Modifier
            .size(ComposerToggleSizeValue.cs())
            .then(pillShadowModifier(shadowElevation))
            .clip(ShopMatePillShape)
            .background(
                brush = if (enabled) {
                    Brush.linearGradient(
                        colors = listOf(ShopMateLightGreen, ShopMateGreen)
                    )
                } else {
                    Brush.linearGradient(
                        colors = listOf(Color(0xFFE7ECEA), Color(0xFFD8E0DD))
                    )
                }
            )
            .shopMatePressable(
                enabled = enabled,
                role = Role.Button,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_send),
            contentDescription = "发送",
            modifier = Modifier.size(ComposerToggleIconSizeValue.cs()),
            alpha = if (enabled) 1f else 0.5f
        )
    }
}

private fun pillShadowModifier(elevation: Dp): Modifier =
    if (elevation > 0.dp) {
        Modifier.shadow(
            elevation = elevation,
            shape = ShopMatePillShape,
            clip = false
        )
    } else {
        Modifier
    }

private enum class ComposerInputMode {
    Text,
    Voice
}

private const val ComposerHeightValue = 44f
private const val ComposerToggleSizeValue = 38f
private const val ComposerToggleIconSizeValue = 16f
private val ComposerPreviewShape = androidx.compose.foundation.shape.RoundedCornerShape(18.dp)
private val ComposerPreviewImageShape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
private const val VoiceCancelDragDistanceValue = 36f

@Preview(
    name = "Chat composer - disabled send",
    widthDp = 360,
    showBackground = true,
    backgroundColor = 0xFFFBFDFC
)
@Composable
private fun ChatComposerDisabledSendPreview() {
    ChatComposer(
        value = "",
        onValueChange = {},
        onSend = {},
        onVoicePressStart = {},
        onVoicePressEnd = {},
        voiceInputState = VoiceInputUiState.Idle,
        modifier = Modifier
            .padding(horizontal = 18.dp)
            .background(ShopMateSurfaceSoft)
    )
}

@Preview(
    name = "Chat composer - empty",
    widthDp = 389,
    showBackground = true,
    backgroundColor = 0xFFFBFDFC
)
@Composable
private fun ChatComposerEmptyPreview() {
    ChatComposer(
        value = "",
        onValueChange = {},
        onSend = {},
        onVoicePressStart = {},
        onVoicePressEnd = {},
        voiceInputState = VoiceInputUiState.Idle,
        modifier = Modifier
            .padding(horizontal = 18.dp)
            .background(ShopMateSurfaceSoft)
    )
}

@Preview(
    name = "Chat composer - typed",
    widthDp = 389,
    showBackground = true,
    backgroundColor = 0xFFFBFDFC
)
@Composable
private fun ChatComposerTypedPreview() {
    ChatComposer(
        value = "推荐适合通勤的蓝牙耳机",
        onValueChange = {},
        onSend = {},
        onVoicePressStart = {},
        onVoicePressEnd = {},
        voiceInputState = VoiceInputUiState.Idle,
        modifier = Modifier
            .padding(horizontal = 18.dp)
            .background(ShopMateSurfaceSoft)
    )
}

@Preview(
    name = "Chat composer - voice idle",
    widthDp = 389,
    showBackground = true,
    backgroundColor = 0xFFFBFDFC
)
@Composable
private fun ChatComposerVoiceIdlePreview() {
    ChatComposerContent(
        value = "",
        onValueChange = {},
        onSend = {},
        onVoicePressStart = {},
        onVoicePressEnd = {},
        inputMode = ComposerInputMode.Voice,
        voiceInputState = VoiceInputUiState.Idle,
        voiceEnabled = true,
        onInputModeChange = {},
        onVoiceCancel = {},
        modifier = Modifier
            .padding(horizontal = 18.dp)
            .background(ShopMateSurfaceSoft)
    )
}

@Preview(
    name = "Chat composer - voice pressed",
    widthDp = 389,
    showBackground = true,
    backgroundColor = 0xFFFBFDFC
)
@Composable
private fun ChatComposerVoicePressedPreview() {
    ChatComposerContent(
        value = "",
        onValueChange = {},
        onSend = {},
        onVoicePressStart = {},
        onVoicePressEnd = {},
        inputMode = ComposerInputMode.Voice,
        voiceInputState = VoiceInputUiState.Listening,
        voiceEnabled = true,
        onInputModeChange = {},
        onVoiceCancel = {},
        modifier = Modifier
            .padding(start = 18.dp, top = 44.dp, end = 18.dp)
            .background(ShopMateSurfaceSoft)
    )
}

@Preview(
    name = "Chat composer - voice transcribing",
    widthDp = 389,
    showBackground = true,
    backgroundColor = 0xFFFBFDFC
)
@Composable
private fun ChatComposerVoiceTranscribingPreview() {
    ChatComposerContent(
        value = "",
        onValueChange = {},
        onSend = {},
        onVoicePressStart = {},
        onVoicePressEnd = {},
        inputMode = ComposerInputMode.Voice,
        voiceInputState = VoiceInputUiState.Transcribing,
        voiceEnabled = true,
        onInputModeChange = {},
        onVoiceCancel = {},
        modifier = Modifier
            .padding(start = 18.dp, top = 44.dp, end = 18.dp)
            .background(ShopMateSurfaceSoft)
    )
}
