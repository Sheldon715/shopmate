package com.shopmate.app.ui.chat

import com.shopmate.app.data.chat.ChatProductCardDto
import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.chat.ChatRetrievalDto
import com.shopmate.app.data.chat.ChatStreamEvent
import com.shopmate.app.data.chat.PriceRangeCentsDto
import kotlin.test.assertEquals
import kotlin.test.assertFalse
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

    private class FakeChatRepository : ChatRepository {
        val events = MutableSharedFlow<ChatStreamEvent>()
        var streamCalls = 0

        override fun streamChat(
            message: String,
            history: List<ChatMessageUi>,
        ): Flow<ChatStreamEvent> {
            streamCalls += 1
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
