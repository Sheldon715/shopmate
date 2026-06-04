package com.shopmate.app.data.chat

import com.shopmate.app.ui.chat.ChatMessageUi
import kotlinx.coroutines.flow.Flow

class DefaultChatRepository(
    private val chatStreamClient: ChatStreamClient,
) : ChatRepository {
    override fun streamChat(
        message: String,
        conversationId: String,
        history: List<ChatMessageUi>,
        recentProductIds: List<String>,
    ): Flow<ChatStreamEvent> =
        chatStreamClient.streamChat(
            ChatStreamRequestDto(
                conversationId = conversationId,
                message = message.trim(),
                history = history
                    .filter { chatMessage -> chatMessage.text.isNotBlank() }
                    .map { chatMessage ->
                        ChatHistoryMessageDto(
                            role = if (chatMessage.fromUser) USER_ROLE else ASSISTANT_ROLE,
                            content = chatMessage.text.trim(),
                        )
                    }
                    .takeLast(MAX_HISTORY_MESSAGES)
                    .toList(),
                recentProductIds = recentProductIds
                    .map(String::trim)
                    .filter(String::isNotBlank)
                    .distinct(),
            ),
        )

    companion object {
        private const val USER_ROLE = "user"
        private const val ASSISTANT_ROLE = "assistant"
        private const val MAX_HISTORY_MESSAGES = 4
    }
}
