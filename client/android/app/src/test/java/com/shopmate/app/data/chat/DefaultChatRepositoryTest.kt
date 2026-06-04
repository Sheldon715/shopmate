package com.shopmate.app.data.chat

import com.shopmate.app.ui.chat.ChatMessageUi
import kotlin.test.assertEquals
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import org.junit.Test

class DefaultChatRepositoryTest {
    @Test
    fun streamChatTrimsMessageAndMapsRecentTextHistory() {
        val client = RecordingChatStreamClient()
        val repository = DefaultChatRepository(client)

        repository.streamChat(
            message = "  推荐耳机  ",
            conversationId = "local-chat-session-1",
            history = listOf(
                ChatMessageUi(id = "1", text = "oldest", fromUser = true),
                ChatMessageUi(id = "2", text = "one", fromUser = false),
                ChatMessageUi(id = "3", text = "two", fromUser = true),
                ChatMessageUi(id = "4", text = "three", fromUser = false),
                ChatMessageUi(id = "5", text = "four", fromUser = true),
                ChatMessageUi(id = "6", text = "", fromUser = false),
            ),
            recentProductIds = listOf(" product_001 ", "", "product_002", "product_001"),
        )

        val request = client.lastRequest
        assertEquals("local-chat-session-1", request.conversationId)
        assertEquals("推荐耳机", request.message)
        assertEquals(
            listOf(
                ChatHistoryMessageDto("assistant", "one"),
                ChatHistoryMessageDto("user", "two"),
                ChatHistoryMessageDto("assistant", "three"),
                ChatHistoryMessageDto("user", "four"),
            ),
            request.history,
        )
        assertEquals(listOf("product_001", "product_002"), request.recentProductIds)
    }

    private class RecordingChatStreamClient : ChatStreamClient {
        lateinit var lastRequest: ChatStreamRequestDto

        override fun streamChat(request: ChatStreamRequestDto): Flow<ChatStreamEvent> {
            lastRequest = request
            return emptyFlow()
        }
    }
}
