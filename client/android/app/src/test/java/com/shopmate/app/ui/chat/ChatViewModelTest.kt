package com.shopmate.app.ui.chat

import com.shopmate.app.data.chat.ChatProductCardDto
import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.chat.ChatClarificationDto
import com.shopmate.app.data.chat.ChatRetrievalDto
import com.shopmate.app.data.chat.ChatStreamEvent
import com.shopmate.app.data.chat.PriceRangeCentsDto
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun sendMessageInsertsUserAndStreamingAssistantMessages() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("", state.composerText)
        assertTrue(state.isSending)
        assertEquals("推荐耳机", state.messages[0].text)
        assertEquals("", state.messages[1].text)
        assertTrue(state.messages[1].isStreaming)
    }

    @Test
    fun messageDeltaProductCardsAndDoneUpdateState() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(ChatStreamEvent.MessageDelta("好的，", 0))
        repository.events.emit(ChatStreamEvent.MessageDelta("推荐这款。", 1))
        repository.events.emit(ChatStreamEvent.ProductCards(listOf(productDto())))
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_001"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 1),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertEquals("好的，推荐这款。", state.messages.last().text)
        assertFalse(state.messages.last().isStreaming)
        assertEquals("product_001", state.productCards.single().id)
        assertEquals(null, state.errorMessage)
    }

    @Test
    fun clarificationDoneKeepsAssistantTextEditableComposerAndNoRetry() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐一款手机")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(
            ChatStreamEvent.MessageDelta(
                text = "你更看重拍照、续航、预算还是性价比？告诉我一两个重点，我再帮你筛。",
                index = 0,
            ),
        )
        repository.events.emit(ChatStreamEvent.ProductCards(emptyList()))
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = true,
                fallbackReason = "NEEDS_CLARIFICATION",
                clarification = ChatClarificationDto(
                    missingSlots = listOf("budget", "priority"),
                ),
                retrieval = ChatRetrievalDto(candidateCount = 0),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertEquals(
            "你更看重拍照、续航、预算还是性价比？告诉我一两个重点，我再帮你筛。",
            state.messages.last().text,
        )
        assertFalse(state.messages.last().isStreaming)
        assertEquals(null, state.errorMessage)
        assertFalse(state.canRetry)
        assertEquals(1, state.historyConversations.size)
        assertEquals("推荐一款手机", state.historyConversations.single().title)

        viewModel.onComposerTextChange("预算 3000 左右，拍照好一点")
        assertEquals("预算 3000 左右，拍照好一点", viewModel.uiState.value.composerText)

        viewModel.sendMessage()
        advanceUntilIdle()

        assertEquals(2, repository.conversationIds.size)
        assertEquals(repository.conversationIds.first(), repository.conversationIds.last())
    }

    @Test
    fun unknownEmptyFallbackReasonStillShowsNoMatchMessage() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("很难匹配的需求")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(ChatStreamEvent.ProductCards(emptyList()))
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = true,
                fallbackReason = "SOME_NEW_REASON",
                retrieval = ChatRetrievalDto(candidateCount = 0),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("当前商品库暂时没有完全匹配的商品，可以调整需求再试试。", state.errorMessage)
        assertFalse(state.canRetry)
    }

    @Test
    fun errorEventSetsDisplayMessageAndRetryFlag() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(
            ChatStreamEvent.Error(
                code = "CHAT_STREAM_CONNECTION_FAILED",
                message = "failed",
                retryable = true,
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertEquals("无法连接导购服务，请确认后端正在运行。", state.errorMessage)
        assertTrue(state.canRetry)
    }

    @Test
    fun flowExceptionSetsConnectionFailureMessage() = runTest {
        val viewModel = ChatViewModel(
            object : ChatRepository {
                override fun streamChat(
                    message: String,
                    conversationId: String,
                    history: List<ChatMessageUi>,
                ): Flow<ChatStreamEvent> = flow {
                    throw IllegalStateException("offline")
                }
            },
        )

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertEquals("无法连接导购服务，请确认后端正在运行。", state.errorMessage)
        assertTrue(state.canRetry)
    }

    @Test
    fun streamCompletesWithoutTerminalEventStopsSendingAndAllowsRetry() = runTest {
        val viewModel = ChatViewModel(
            object : ChatRepository {
                override fun streamChat(
                    message: String,
                    conversationId: String,
                    history: List<ChatMessageUi>,
                ): Flow<ChatStreamEvent> = emptyFlow()
            },
        )

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertEquals("导购连接已结束，请重试。", state.errorMessage)
        assertTrue(state.canRetry)
    }

    @Test
    fun secondSendWhileSendingDoesNotStartConcurrentStream() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()
        viewModel.onComposerTextChange("再推荐一个")
        viewModel.sendMessage()
        advanceUntilIdle()

        assertEquals(1, repository.streamCalls)
        assertEquals(2, viewModel.uiState.value.messages.size)
    }

    @Test
    fun startNewChatClearsConversationAndStopsSending() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(ChatStreamEvent.MessageDelta("推荐这款。", 0))
        repository.events.emit(ChatStreamEvent.ProductCards(listOf(productDto())))
        advanceUntilIdle()

        viewModel.startNewChat()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertEquals(emptyList(), state.messages)
        assertEquals(emptyList(), state.productCards)
        assertEquals("", state.composerText)
        assertEquals(null, state.errorMessage)
        assertFalse(state.canRetry)
    }

    @Test
    fun startNewChatClearsErrorAndRetryState() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(
            ChatStreamEvent.Error(
                code = "CHAT_STREAM_CONNECTION_FAILED",
                message = "failed",
                retryable = true,
            ),
        )
        advanceUntilIdle()

        viewModel.startNewChat()

        val state = viewModel.uiState.value
        assertEquals(emptyList(), state.messages)
        assertEquals(null, state.errorMessage)
        assertFalse(state.canRetry)
    }

    @Test
    fun hasActiveConversationReflectsConversationState() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        assertFalse(viewModel.hasActiveConversation())

        viewModel.onComposerTextChange("推荐耳机")
        assertFalse(viewModel.hasActiveConversation())

        viewModel.sendMessage()
        advanceUntilIdle()
        assertTrue(viewModel.hasActiveConversation())

        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 0),
            ),
        )
        advanceUntilIdle()
        assertTrue(viewModel.hasActiveConversation())

        viewModel.startNewChat()
        assertFalse(viewModel.hasActiveConversation())
    }

    @Test
    fun startNewChatAddsCurrentConversationToInMemoryHistory() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐一款适合通勤的蓝牙耳机，预算 200 以内")
        viewModel.sendMessage()
        advanceUntilIdle()

        viewModel.startNewChat()

        val state = viewModel.uiState.value
        assertEquals(1, state.historyConversations.size)
        assertEquals(
            "推荐一款适合通勤的蓝牙耳机，预算 200 以内",
            state.historyConversations.single().title,
        )
        assertEquals("刚刚", state.historyConversations.single().timeText)
        assertEquals(emptyList(), state.messages)
    }

    @Test
    fun sendMessageAddsCurrentConversationToHistoryImmediately() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("你好")
        viewModel.sendMessage()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, state.historyConversations.size)
        assertEquals("你好", state.historyConversations.single().title)
        assertEquals("刚刚", state.historyConversations.single().timeText)
    }

    @Test
    fun followUpMessageKeepsFirstUserMessageAsHistoryTitle() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("你好")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 0),
            ),
        )
        advanceUntilIdle()

        viewModel.onComposerTextChange("再推荐一个")
        viewModel.sendMessage()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, state.historyConversations.size)
        assertEquals("你好", state.historyConversations.single().title)
    }

    @Test
    fun newChatUsesNewConversationId() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("帮我推荐跑鞋")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 0),
            ),
        )
        advanceUntilIdle()
        val firstConversationId = repository.conversationIds.single()

        viewModel.startNewChat()
        viewModel.onComposerTextChange("帮我推荐手机")
        viewModel.sendMessage()
        advanceUntilIdle()

        assertEquals(2, repository.conversationIds.size)
        assertNotEquals(firstConversationId, repository.conversationIds.last())
    }

    @Test
    fun retryKeepsCurrentConversationId() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("帮我推荐跑鞋")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(
            ChatStreamEvent.Error(
                code = "CHAT_STREAM_CONNECTION_FAILED",
                message = "failed",
                retryable = true,
            ),
        )
        advanceUntilIdle()
        val firstConversationId = repository.conversationIds.single()

        viewModel.retryLastMessage()
        advanceUntilIdle()

        assertEquals(listOf(firstConversationId, firstConversationId), repository.conversationIds)
    }

    @Test
    fun openHistoryConversationRestoresSavedSessionSnapshot() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(ChatStreamEvent.MessageDelta("推荐这款。", 0))
        repository.events.emit(ChatStreamEvent.ProductCards(listOf(productDto())))
        advanceUntilIdle()

        viewModel.startNewChat()
        val historyId = viewModel.uiState.value.historyConversations.single().id

        assertTrue(viewModel.openHistoryConversation(historyId))

        val restoredState = viewModel.uiState.value
        assertEquals("推荐耳机", restoredState.messages.first().text)
        assertEquals("推荐这款。", restoredState.messages.last().text)
        assertFalse(restoredState.messages.last().isStreaming)
        assertEquals("product_001", restoredState.productCards.single().id)
        assertEquals("", restoredState.composerText)
        assertFalse(restoredState.isSending)
    }

    @Test
    fun restoredHistoryConversationContinuesWithOriginalConversationId() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("帮我推荐跑鞋")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 0),
            ),
        )
        advanceUntilIdle()
        val originalConversationId = repository.conversationIds.single()

        viewModel.startNewChat()
        assertTrue(viewModel.openHistoryConversation(originalConversationId))
        viewModel.onComposerTextChange("要轻量的")
        viewModel.sendMessage()
        advanceUntilIdle()

        assertEquals(
            listOf(originalConversationId, originalConversationId),
            repository.conversationIds,
        )
        assertEquals(2, repository.histories.last().size)
    }

    @Test
    fun openHistoryConversationReturnsFalseForMockOrUnknownHistoryIds() = runTest {
        val viewModel = ChatViewModel(FakeChatRepository())

        assertFalse(viewModel.openHistoryConversation("history-commute-earbuds"))
        assertFalse(viewModel.openHistoryConversation("missing"))
    }

    @Test
    fun renameHistoryConversationUpdatesLocalHistoryTitle() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()
        val historyId = viewModel.uiState.value.historyConversations.single().id

        assertTrue(viewModel.renameHistoryConversation(historyId, "通勤耳机备选"))

        assertEquals("通勤耳机备选", viewModel.uiState.value.historyConversations.single().title)
    }

    @Test
    fun deleteCurrentHistoryConversationClearsConversation() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()
        val historyId = viewModel.uiState.value.historyConversations.single().id

        assertTrue(viewModel.deleteHistoryConversation(historyId))

        val state = viewModel.uiState.value
        assertEquals(emptyList(), state.historyConversations)
        assertEquals(emptyList(), state.messages)
        assertEquals(emptyList(), state.productCards)
        assertFalse(state.isSending)
    }

    private class FakeChatRepository : ChatRepository {
        val events = MutableSharedFlow<ChatStreamEvent>()
        var streamCalls = 0
        val conversationIds = mutableListOf<String>()
        val histories = mutableListOf<List<ChatMessageUi>>()

        override fun streamChat(
            message: String,
            conversationId: String,
            history: List<ChatMessageUi>,
        ): Flow<ChatStreamEvent> {
            streamCalls += 1
            conversationIds += conversationId
            histories += history
            return events
        }
    }

    private fun productDto(): ChatProductCardDto =
        ChatProductCardDto(
            id = "product_001",
            name = "通勤蓝牙耳机",
            brand = "示例品牌",
            category = "数码电子",
            priceCents = 19900,
            priceRangeCents = PriceRangeCentsDto(min = 19900, max = 19900),
            currency = "CNY",
            tags = listOf("通勤"),
            available = true,
        )
}
