package com.shopmate.app.ui.chat

import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.model.ComparisonUi
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.ProductCardUi

data class ChatMessageUi(
    val id: String,
    val text: String,
    val fromUser: Boolean,
    val isStreaming: Boolean = false,
    val isVoiceTranscribing: Boolean = false,
    val imageAttachment: ChatImageAttachmentUi? = null,
    val excludeFromChatHistory: Boolean = false,
)

data class ChatImageAttachmentUi(
    val uriString: String,
    val previewLabel: String = "已选择图片",
    val mimeType: String? = null,
    val sizeBytes: Long? = null,
    val status: ChatImageAttachmentStatus = ChatImageAttachmentStatus.Selected,
    val errorMessage: String? = null,
)

enum class ChatImageAttachmentStatus {
    Selected,
    Uploading,
    Interpreting,
    Searching,
    Failed,
}

data class ChatComparisonActionUi(
    val comparisonId: String,
    val title: String,
    val summaryText: String,
    val anchorMessageId: String,
)

data class ChatUiState(
    val messages: List<ChatMessageUi> = emptyList(),
    val productCards: List<ProductCardUi> = emptyList(),
    val productCardsAnchorMessageId: String? = null,
    val comparisonResults: List<ComparisonUi> = emptyList(),
    val comparisonActions: List<ChatComparisonActionUi> = emptyList(),
    val historyConversations: List<HistoryConversationUi> = emptyList(),
    val composerText: String = "",
    val isSending: Boolean = false,
    val errorMessage: String? = null,
    val canRetry: Boolean = false,
    val voiceInput: VoiceInputUiState = VoiceInputUiState.Idle,
    val selectedImage: ChatImageAttachmentUi? = null,
)

sealed interface ChatSideEffect {
    data class RefreshCart(val message: String? = null) : ChatSideEffect
}

sealed interface VoiceInputUiState {
    object Idle : VoiceInputUiState
    object Listening : VoiceInputUiState
    object Transcribing : VoiceInputUiState
    data class TranscriptReady(val transcript: String) : VoiceInputUiState
    data class PermissionDenied(
        val message: String = "需要开启麦克风权限才能语音输入。",
    ) : VoiceInputUiState
    data class Error(
        val message: String,
    ) : VoiceInputUiState
}

internal val ChatPreviewUiState = ChatUiState(
    messages = listOf(
        ChatMessageUi(
            id = "preview-user",
            text = "推荐一款适合通勤的蓝牙耳机，预算 200 以内",
            fromUser = true,
        ),
        ChatMessageUi(
            id = "preview-assistant",
            text = "好的！为你筛选了几款 200 元以内、适合通勤的蓝牙耳机，综合音质、续航、降噪和佩戴舒适度，看看有没有喜欢的。",
            fromUser = false,
        ),
    ),
    productCards = MockShopMateData.bluetoothEarbuds,
)

internal val ChatEmptyPreviewUiState = ChatUiState(
    messages = listOf(
        ChatMessageUi(
            id = "preview-empty-user",
            text = "帮我找一款 50 元以内的主动降噪耳机",
            fromUser = true,
        ),
        ChatMessageUi(
            id = "preview-empty-assistant",
            text = "这个条件下我在库里还没找到合适商品。你可以放宽预算、补充用途或偏好，我再继续帮你筛。",
            fromUser = false,
        ),
    ),
)
