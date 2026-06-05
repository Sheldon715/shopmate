package com.shopmate.app.data.chat

import com.shopmate.app.ui.chat.ChatMessageUi
import kotlinx.coroutines.flow.Flow

interface ChatRepository {
    fun streamChat(
        message: String,
        conversationId: String,
        history: List<ChatMessageUi>,
        recentProductIds: List<String> = emptyList(),
        filters: ChatStreamFiltersDto? = null,
        imageSearch: ChatImageSearchMetadataDto? = null,
    ): Flow<ChatStreamEvent>
}
