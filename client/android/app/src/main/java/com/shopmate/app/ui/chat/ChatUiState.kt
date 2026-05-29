package com.shopmate.app.ui.chat

import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.ProductCardUi

data class ChatMessageUi(
    val id: String,
    val text: String,
    val fromUser: Boolean,
    val isStreaming: Boolean = false,
)

data class ChatUiState(
    val messages: List<ChatMessageUi> = emptyList(),
    val productCards: List<ProductCardUi> = emptyList(),
    val historyConversations: List<HistoryConversationUi> = emptyList(),
    val composerText: String = "",
    val isSending: Boolean = false,
    val errorMessage: String? = null,
    val canRetry: Boolean = false,
)

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
    ),
    errorMessage = "当前商品库里没有同时满足预算和降噪的耳机，可以放宽价格再试试。",
    canRetry = true,
)
