package com.shopmate.app.ui.chat

import com.shopmate.app.data.chat.ChatCartActionDto
import com.shopmate.app.data.chat.ChatComparisonCellDto
import com.shopmate.app.data.chat.ChatComparisonDimensionDto
import com.shopmate.app.data.chat.ChatComparisonHighlightDto
import com.shopmate.app.data.chat.ChatComparisonResultDto
import com.shopmate.app.data.chat.ChatProductCardDto
import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.chat.ChatClarificationDto
import com.shopmate.app.data.chat.ChatImageSearchMetadataDto
import com.shopmate.app.data.chat.ChatRetrievalDto
import com.shopmate.app.data.chat.ChatStreamFiltersDto
import com.shopmate.app.data.chat.ChatStreamEvent
import com.shopmate.app.data.chat.PriceRangeCentsDto
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.runCurrent
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
    fun waitingStateUsesLocalStreamingBubbleForDifferentMessageIntents() = runTest {
        val messages = listOf(
            "推荐适合油皮的护肤品",
            "对比一下前两个",
            "把第一个加入购物车",
            "这两个哪个更适合我",
        )

        messages.forEach { message ->
            val repository = FakeChatRepository()
            val viewModel = ChatViewModel(repository)

            viewModel.onComposerTextChange(message)
            viewModel.sendMessage()
            advanceUntilIdle()

            val state = viewModel.uiState.value
            assertTrue(state.isSending)
            assertEquals(message, state.messages[0].text)
            assertEquals("", state.messages[1].text)
            assertTrue(state.messages[1].isStreaming)
        }
    }

    @Test
    fun sendImageSearchResultUsesInternalChatMessageButShowsOriginalUserText() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)
        val filters = ChatStreamFiltersDto(category = "数码电子")
        val imageSearch = ChatImageSearchMetadataDto(
            mode = "vlm_first",
            confidence = "medium",
            visualQuery = "黑色真无线蓝牙耳机",
            detectedCategory = "数码电子",
        )

        viewModel.sendImageSearchResult(
            userVisibleText = "用这张图找便宜一点的耳机",
            chatMessage = " 图片找货：黑色真无线蓝牙耳机，找类似但便宜一点 ",
            filters = filters,
            imageSearch = imageSearch,
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("用这张图找便宜一点的耳机", state.messages[0].text)
        assertEquals("", state.messages[1].text)
        assertEquals("图片找货：黑色真无线蓝牙耳机，找类似但便宜一点", repository.messages.single())
        assertEquals(filters, repository.filtersCalls.single())
        assertEquals(imageSearch, repository.imageSearchCalls.single())
    }

    @Test
    fun sendImageSearchResultWithoutChatMessageDoesNotCallChatStream() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.sendImageSearchResult(
            userVisibleText = "用这张图找货",
            chatMessage = null,
        )
        advanceUntilIdle()

        assertEquals(0, repository.streamCalls)
        assertEquals(emptyList(), viewModel.uiState.value.messages)
        assertEquals(
            "图片识别结果还不够明确，请换一张更清晰的商品图或补充文字。",
            viewModel.uiState.value.errorMessage,
        )
    }

    @Test
    fun restoredImageSearchHistoryRetryKeepsInternalRequestMetadata() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)
        val filters = ChatStreamFiltersDto(category = "数码电子")
        val imageSearch = ChatImageSearchMetadataDto(
            mode = "vlm_first",
            confidence = "medium",
            visualQuery = "黑色真无线蓝牙耳机",
            detectedCategory = "数码电子",
        )
        val internalMessage = "图片找货：黑色真无线蓝牙耳机，找类似但便宜一点"
        val visibleMessage = "用这张图找便宜一点的耳机"

        viewModel.sendImageSearchResult(
            userVisibleText = visibleMessage,
            chatMessage = internalMessage,
            filters = filters,
            imageSearch = imageSearch,
        )
        advanceUntilIdle()

        viewModel.startNewChat()
        val historyId = viewModel.uiState.value.historyConversations.single().id

        assertTrue(viewModel.openHistoryConversation(historyId))
        viewModel.retryLastMessage()
        advanceUntilIdle()

        assertEquals(listOf(internalMessage, internalMessage), repository.messages)
        assertEquals(listOf<ChatStreamFiltersDto?>(filters, filters), repository.filtersCalls)
        assertEquals(
            listOf<ChatImageSearchMetadataDto?>(imageSearch, imageSearch),
            repository.imageSearchCalls,
        )
        assertEquals(visibleMessage, viewModel.uiState.value.messages.first().text)
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
        assertEquals(state.messages.last().id, state.productCardsAnchorMessageId)
        assertEquals(null, state.errorMessage)
    }

    @Test
    fun firstMessageDeltaShowsOnlyFirstCodePointsImmediatelyThenRevealsGradually() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)
        val longAnswer = "一二三四五六七八九十，继续推荐适合通勤的耳机。"

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(ChatStreamEvent.MessageDelta(longAnswer, 0))

        assertEquals("一二三四", viewModel.uiState.value.messages.last().text)

        advanceTimeBy(120)
        runCurrent()

        val partiallyRevealedText = viewModel.uiState.value.messages.last().text
        assertTrue(partiallyRevealedText.length > "一二三四".length)
        assertTrue(partiallyRevealedText.length < longAnswer.length)

        advanceUntilIdle()

        assertEquals(longAnswer, viewModel.uiState.value.messages.last().text)
    }

    @Test
    fun productCardsFlushPendingAssistantTextBeforeAnchoringCards() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)
        val answer = "好的，我会先完整说明这款商品，再展示商品卡。"

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(ChatStreamEvent.MessageDelta(answer, 0))
        assertEquals("好的，我", viewModel.uiState.value.messages.last().text)

        repository.events.emit(ChatStreamEvent.ProductCards(listOf(productDto())))

        val state = viewModel.uiState.value
        assertEquals(answer, state.messages.last().text)
        assertEquals(state.messages.last().id, state.productCardsAnchorMessageId)
        assertEquals("product_001", state.productCards.single().id)
    }

    @Test
    fun doneFlushesPendingAssistantTextAndMarksAssistantComplete() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)
        val answer = "这是完整的最终回答，done 到达时不能留下半截文字。"

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(ChatStreamEvent.MessageDelta(answer, 0))
        assertEquals("这是完整", viewModel.uiState.value.messages.last().text)

        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 0),
            ),
        )

        val state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertFalse(state.messages.last().isStreaming)
        assertEquals(answer, state.messages.last().text)
    }

    @Test
    fun errorEventFlushesPendingAssistantTextBeforeShowingRetry() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)
        val answer = "已经收到的真实回答片段，即使后续错误也不能丢失。"

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(ChatStreamEvent.MessageDelta(answer, 0))
        assertEquals("已经收到", viewModel.uiState.value.messages.last().text)

        repository.events.emit(
            ChatStreamEvent.Error(
                code = "CHAT_STREAM_CONNECTION_FAILED",
                message = "failed",
                retryable = true,
            ),
        )

        val state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertTrue(state.canRetry)
        assertEquals(answer, state.messages.last().text)
    }

    @Test
    fun startNewChatCancelsOldRevealerBeforeNextConversation() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("第一轮")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(ChatStreamEvent.MessageDelta("旧回答会很长很长，不应该继续吐到新气泡。", 0))
        assertEquals("旧回答会", viewModel.uiState.value.messages.last().text)

        viewModel.startNewChat()
        viewModel.onComposerTextChange("第二轮")
        viewModel.sendMessage()
        advanceUntilIdle()
        advanceTimeBy(1000)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(2, state.messages.size)
        assertEquals("第二轮", state.messages.first().text)
        assertEquals("", state.messages.last().text)
    }

    @Test
    fun typewriterKeepsEmojiCodePointIntact() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)
        val answer = "耳机🙂很好用，续航也稳定。"

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(ChatStreamEvent.MessageDelta(answer, 0))

        val visibleText = viewModel.uiState.value.messages.last().text
        assertEquals("耳机🙂很", visibleText)
        assertFalse(visibleText.contains("\uFFFD"))

        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 0),
            ),
        )

        assertEquals(answer, viewModel.uiState.value.messages.last().text)
    }

    @Test
    fun comparisonResultCreatesActionAndLookupState() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("帮我对比这两款")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(ChatStreamEvent.MessageDelta("我做了对比。", 0))
        repository.events.emit(
            ChatStreamEvent.ProductCards(
                listOf(
                    productDto(),
                    productDto(id = "product_002", name = "降噪蓝牙耳机"),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.ComparisonResult(
                ChatComparisonResultDto(
                    id = "comparison-demo-1",
                    title = "耳机对比",
                    query = "帮我对比这两款",
                    productIds = listOf("product_001", "product_002"),
                    dimensions = listOf(
                        ChatComparisonDimensionDto(
                            id = "commute",
                            label = "通勤",
                            cells = listOf(
                                ChatComparisonCellDto(
                                    productId = "product_001",
                                    value = "更轻便。",
                                    highlight = true,
                                ),
                                ChatComparisonCellDto(
                                    productId = "product_002",
                                    value = "降噪更强。",
                                ),
                            ),
                        ),
                    ),
                    recommendedProductId = "product_001",
                    conclusion = "日常通勤优先看第一款。",
                    highlights = listOf(
                        ChatComparisonHighlightDto(
                            productId = "product_001",
                            label = "通勤",
                            text = "更轻便。",
                        ),
                    ),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_001", "product_002"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 2),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("comparison-demo-1", state.comparisonActions.single().comparisonId)
        assertEquals("耳机对比", state.comparisonActions.single().title)
        assertEquals("comparison-demo-1", state.comparisonResults.single().id)
        assertEquals("我做了对比。", state.comparisonResults.single().assistantText)
        assertEquals("product_001", state.comparisonResults.single().recommendedProductId)
        assertEquals("comparison-demo-1", viewModel.findComparison("comparison-demo-1")?.id)
    }

    @Test
    fun comparisonPresetDeltaKeepsAssistantStreamingUntilDone() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("对比一下前两个")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(
            ChatStreamEvent.MessageDelta(
                text = "我先帮你核对这两款商品的关键信息。",
                index = 0,
            ),
        )
        advanceUntilIdle()

        var state = viewModel.uiState.value
        assertTrue(state.isSending)
        assertTrue(state.messages.last().isStreaming)
        assertEquals("我先帮你核对这两款商品的关键信息。", state.messages.last().text)

        repository.events.emit(
            ChatStreamEvent.ProductCards(
                listOf(
                    productDto(id = "product_001", name = "通勤耳机"),
                    productDto(id = "product_002", name = "降噪耳机"),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.ComparisonResult(
                ChatComparisonResultDto(
                    id = "comparison-preset-streaming",
                    title = "耳机对比",
                    query = "对比一下前两个",
                    productIds = listOf("product_001", "product_002"),
                    dimensions = listOf(
                        ChatComparisonDimensionDto(
                            id = "commute",
                            label = "通勤",
                            cells = listOf(
                                ChatComparisonCellDto(
                                    productId = "product_001",
                                    value = "更轻便。",
                                ),
                                ChatComparisonCellDto(
                                    productId = "product_002",
                                    value = "降噪更强。",
                                ),
                            ),
                        ),
                    ),
                    recommendedProductId = null,
                    conclusion = "按通勤轻便和降噪需求选择。",
                    highlights = emptyList(),
                ),
            ),
        )
        advanceUntilIdle()

        state = viewModel.uiState.value
        assertTrue(state.isSending)
        assertTrue(state.messages.last().isStreaming)
        assertEquals("comparison-preset-streaming", state.comparisonActions.single().comparisonId)

        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_001", "product_002"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 2),
            ),
        )
        advanceUntilIdle()

        state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertFalse(state.messages.last().isStreaming)
    }

    @Test
    fun comparisonResultWithThreeProductsIsIgnored() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("帮我对比这三款")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(ChatStreamEvent.MessageDelta("我做了对比。", 0))
        repository.events.emit(
            ChatStreamEvent.ProductCards(
                listOf(
                    productDto(),
                    productDto(id = "product_002", name = "降噪蓝牙耳机"),
                    productDto(id = "product_003", name = "运动蓝牙耳机"),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.ComparisonResult(
                ChatComparisonResultDto(
                    id = "comparison-demo-3",
                    title = "三款耳机对比",
                    query = "帮我对比这三款",
                    productIds = listOf("product_001", "product_002", "product_003"),
                    dimensions = listOf(
                        ChatComparisonDimensionDto(
                            id = "commute",
                            label = "通勤",
                            cells = listOf(
                                ChatComparisonCellDto(
                                    productId = "product_001",
                                    value = "更轻便。",
                                ),
                                ChatComparisonCellDto(
                                    productId = "product_002",
                                    value = "降噪更强。",
                                ),
                                ChatComparisonCellDto(
                                    productId = "product_003",
                                    value = "运动更稳。",
                                ),
                            ),
                        ),
                    ),
                    recommendedProductId = "product_001",
                    conclusion = "不应打开三款对比。",
                    highlights = emptyList(),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_001", "product_002", "product_003"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 3),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.comparisonActions.isEmpty())
        assertTrue(state.comparisonResults.isEmpty())
    }

    @Test
    fun comparisonResultWithMissingProductIdsIsIgnored() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("帮我对比这两款")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(ChatStreamEvent.MessageDelta("我做了对比。", 0))
        repository.events.emit(
            ChatStreamEvent.ProductCards(
                listOf(
                    productDto(id = "product_001", name = "通勤耳机"),
                    productDto(id = "product_002", name = "降噪耳机"),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.ComparisonResult(
                ChatComparisonResultDto(
                    id = "comparison-missing-products",
                    title = "耳机对比",
                    query = "帮我对比这两款",
                    productIds = emptyList(),
                    dimensions = listOf(
                        ChatComparisonDimensionDto(
                            id = "commute",
                            label = "通勤",
                            cells = listOf(
                                ChatComparisonCellDto(
                                    productId = "product_001",
                                    value = "更轻便。",
                                ),
                                ChatComparisonCellDto(
                                    productId = "product_002",
                                    value = "降噪更强。",
                                ),
                            ),
                        ),
                    ),
                    recommendedProductId = null,
                    conclusion = "不应靠当前商品卡兜底打开对比。",
                    highlights = emptyList(),
                ),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.comparisonActions.isEmpty())
        assertTrue(state.comparisonResults.isEmpty())
    }

    @Test
    fun comparisonFollowUpKeepsExistingProductCardsAtOriginalAnchorAndSendsVisibleProductIds() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐三款OPPO手机")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(
            ChatStreamEvent.ProductCards(
                listOf(
                    productDto(id = "product_001", name = "OPPO 手机 1"),
                    productDto(id = "product_002", name = "OPPO 手机 2"),
                    productDto(id = "product_003", name = "OPPO 手机 3"),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_001", "product_002", "product_003"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 3),
            ),
        )
        advanceUntilIdle()
        val originalCardAnchorMessageId = viewModel.uiState.value.productCardsAnchorMessageId
        assertEquals(
            listOf("product_001", "product_002", "product_003"),
            viewModel.uiState.value.productCards.map { product -> product.id },
        )

        viewModel.onComposerTextChange("对比一下第二个和第三个")
        viewModel.sendMessage()
        advanceUntilIdle()
        val comparisonAssistantId = viewModel.uiState.value.messages.last().id
        assertEquals(emptyList(), repository.recentProductIdCalls.first())
        assertEquals(
            listOf("product_001", "product_002", "product_003"),
            repository.recentProductIdCalls[1],
        )

        repository.events.emit(ChatStreamEvent.MessageDelta("我做了对比。", 0))
        repository.events.emit(
            ChatStreamEvent.ProductCards(
                listOf(
                    productDto(id = "product_002", name = "OPPO 手机 2"),
                    productDto(id = "product_003", name = "OPPO 手机 3"),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.ComparisonResult(
                ChatComparisonResultDto(
                    id = "comparison-phone-1",
                    title = "OPPO 手机对比",
                    query = "对比一下第二个和第三个",
                    productIds = listOf("product_002", "product_003"),
                    dimensions = listOf(
                        ChatComparisonDimensionDto(
                            id = "price",
                            label = "价格",
                            cells = listOf(
                                ChatComparisonCellDto(
                                    productId = "product_002",
                                    value = "价格更低。",
                                    highlight = true,
                                ),
                                ChatComparisonCellDto(
                                    productId = "product_003",
                                    value = "定位更旗舰。",
                                ),
                            ),
                        ),
                    ),
                    recommendedProductId = null,
                    conclusion = "预算敏感选第一款，追求旗舰体验选第二款。",
                    highlights = emptyList(),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_002", "product_003"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 2),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(originalCardAnchorMessageId, state.productCardsAnchorMessageId)
        assertNotEquals(comparisonAssistantId, state.productCardsAnchorMessageId)
        assertEquals(comparisonAssistantId, state.comparisonActions.single().anchorMessageId)
        assertEquals("comparison-phone-1", state.comparisonResults.single().id)
        assertEquals(
            listOf("product_002", "product_003"),
            state.comparisonResults.single().products.map { product -> product.id },
        )
    }

    @Test
    fun comparisonResultUsesPreservedCardsWhenStreamProductCardsAreEmpty() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐适合油皮的护肤品")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(
            ChatStreamEvent.ProductCards(
                listOf(
                    productDto(id = "product_001", name = "持妆粉底液"),
                    productDto(id = "product_002", name = "淡纹紧致精华"),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_001", "product_002"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 2),
            ),
        )
        advanceUntilIdle()
        val originalCardAnchorMessageId = viewModel.uiState.value.productCardsAnchorMessageId

        viewModel.onComposerTextChange("对比一下第一和第二个")
        viewModel.sendMessage()
        advanceUntilIdle()
        val comparisonAssistantId = viewModel.uiState.value.messages.last().id

        repository.events.emit(ChatStreamEvent.MessageDelta("你可以查看详情页了解二者核心差异。", 0))
        repository.events.emit(ChatStreamEvent.ProductCards(emptyList()))
        repository.events.emit(
            ChatStreamEvent.ComparisonResult(
                ChatComparisonResultDto(
                    id = "comparison-skincare-1",
                    title = "油皮护肤对比",
                    query = "对比一下第一和第二个",
                    productIds = listOf("product_001", "product_002"),
                    dimensions = listOf(
                        ChatComparisonDimensionDto(
                            id = "usage",
                            label = "使用场景",
                            cells = listOf(
                                ChatComparisonCellDto(
                                    productId = "product_001",
                                    value = "更适合作为底妆持妆选择。",
                                ),
                                ChatComparisonCellDto(
                                    productId = "product_002",
                                    value = "更偏向护肤淡纹和紧致。",
                                    highlight = true,
                                ),
                            ),
                        ),
                    ),
                    recommendedProductId = "product_002",
                    conclusion = "想控油持妆选第一款，想护肤淡纹选第二款。",
                    highlights = emptyList(),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_001", "product_002"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 2),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(originalCardAnchorMessageId, state.productCardsAnchorMessageId)
        assertEquals(listOf("product_001", "product_002"), state.productCards.map { product -> product.id })
        assertEquals(comparisonAssistantId, state.comparisonActions.single().anchorMessageId)
        assertEquals("comparison-skincare-1", state.comparisonResults.single().id)
        assertEquals("product_002", state.comparisonResults.single().recommendedProductId)
    }

    @Test
    fun ordinalComparisonResultUsesPreStreamCardsWhenCurrentStreamCardsAreEmpty() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐适合油皮的护肤品")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(
            ChatStreamEvent.ProductCards(
                listOf(
                    productDto(id = "product_001", name = "控油粉底液"),
                    productDto(id = "product_002", name = "淡纹紧致精华"),
                    productDto(id = "product_003", name = "抗老面霜"),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_001", "product_002", "product_003"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 3),
            ),
        )
        advanceUntilIdle()
        val originalCardAnchorMessageId = viewModel.uiState.value.productCardsAnchorMessageId

        viewModel.onComposerTextChange("对比一下第二个和第三个")
        viewModel.sendMessage()
        advanceUntilIdle()
        val comparisonAssistantId = viewModel.uiState.value.messages.last().id

        repository.events.emit(ChatStreamEvent.MessageDelta("可以查看详情页了解这两款的差异。", 0))
        repository.events.emit(ChatStreamEvent.ProductCards(emptyList()))
        repository.events.emit(
            ChatStreamEvent.ComparisonResult(
                ChatComparisonResultDto(
                    id = "comparison-skincare-ordinal",
                    title = "油皮护肤对比",
                    query = "对比一下第二个和第三个",
                    productIds = listOf("product_002", "product_003"),
                    dimensions = listOf(
                        ChatComparisonDimensionDto(
                            id = "usage",
                            label = "使用场景",
                            cells = listOf(
                                ChatComparisonCellDto(
                                    productId = "product_002",
                                    value = "更偏向淡纹和紧致护理。",
                                ),
                                ChatComparisonCellDto(
                                    productId = "product_003",
                                    value = "更适合作为抗老面霜使用。",
                                    highlight = true,
                                ),
                            ),
                        ),
                    ),
                    recommendedProductId = "product_003",
                    conclusion = "想重点抗老选第三个，想淡纹紧致选第二个。",
                    highlights = emptyList(),
                ),
            ),
        )
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_002", "product_003"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 2),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(originalCardAnchorMessageId, state.productCardsAnchorMessageId)
        assertEquals(
            listOf("product_001", "product_002", "product_003"),
            state.productCards.map { product -> product.id },
        )
        assertEquals(comparisonAssistantId, state.comparisonActions.single().anchorMessageId)
        assertEquals("comparison-skincare-ordinal", state.comparisonResults.single().id)
        assertEquals(
            listOf("product_002", "product_003"),
            state.comparisonResults.single().products.map { product -> product.id },
        )
    }

    @Test
    fun addCartCommandKeepsExistingProductCardsWhileStreaming() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()
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

        viewModel.onComposerTextChange("把这个加到购物车")
        viewModel.sendMessage()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.isSending)
        assertEquals("product_001", state.productCards.single().id)
        val originalCardAnchorMessageId = state.productCardsAnchorMessageId
        assertEquals(false, state.messages.last().id == originalCardAnchorMessageId)
        assertEquals("把这个加到购物车", state.messages.dropLast(1).last().text)

        repository.events.emit(ChatStreamEvent.ProductCards(listOf(productDto())))
        advanceUntilIdle()

        assertEquals(originalCardAnchorMessageId, viewModel.uiState.value.productCardsAnchorMessageId)
    }

    @Test
    fun existingProductCardAnchorDoesNotMoveWhenSendingLaterMessages() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
        viewModel.sendMessage()
        advanceUntilIdle()
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
        val originalCardAnchorMessageId = viewModel.uiState.value.productCardsAnchorMessageId

        viewModel.onComposerTextChange("把第一个加进购物车")
        viewModel.sendMessage()
        advanceUntilIdle()
        repository.events.emit(ChatStreamEvent.MessageDelta("已加入购物车。", 0))
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

        viewModel.onComposerTextChange("第一个也是")
        viewModel.sendMessage()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(originalCardAnchorMessageId, state.productCardsAnchorMessageId)
        assertEquals("第一个也是", state.messages.dropLast(1).last().text)
        assertEquals(false, state.messages.last().id == originalCardAnchorMessageId)
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
    fun noCandidatesDoneKeepsAssistantTextEditableComposerAndNoRetry() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("200 元以内的蓝牙耳机")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(
            ChatStreamEvent.MessageDelta(
                text = "这个预算下我在库里还没找到合适的蓝牙耳机。你可以放宽预算，或告诉我更看重续航、降噪还是轻便，我再继续筛。",
                index = 0,
            ),
        )
        repository.events.emit(ChatStreamEvent.ProductCards(emptyList()))
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = true,
                fallbackReason = "NO_CANDIDATES",
                retrieval = ChatRetrievalDto(candidateCount = 0),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertEquals(
            "这个预算下我在库里还没找到合适的蓝牙耳机。你可以放宽预算，或告诉我更看重续航、降噪还是轻便，我再继续筛。",
            state.messages.last().text,
        )
        assertFalse(state.messages.last().isStreaming)
        assertEquals(emptyList(), state.productCards)
        assertEquals(null, state.errorMessage)
        assertFalse(state.canRetry)

        viewModel.onComposerTextChange("那 500 以内呢")
        assertEquals("那 500 以内呢", viewModel.uiState.value.composerText)

        viewModel.sendMessage()
        advanceUntilIdle()

        assertEquals(2, repository.conversationIds.size)
        assertEquals(repository.conversationIds.first(), repository.conversationIds.last())
    }

    @Test
    fun successfulCartActionEmitsRefreshCartSideEffectWithoutChatError() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("把第二个加进去")
        viewModel.sendMessage()
        advanceUntilIdle()

        val sideEffect = backgroundScope.async {
            viewModel.sideEffects.first()
        }
        repository.events.emit(
            ChatStreamEvent.MessageDelta(
                text = "已把这款商品加入购物车，你可以点右上角购物车查看。",
                index = 0,
            ),
        )
        repository.events.emit(ChatStreamEvent.ProductCards(listOf(productDto())))
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_001"),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 1),
                cartAction = ChatCartActionDto(
                    type = "add",
                    status = "success",
                    productId = "product_001",
                    productName = "通勤蓝牙耳机",
                    quantity = 1,
                    message = "已加入购物车",
                ),
            ),
        )
        advanceUntilIdle()

        assertIs<ChatSideEffect.RefreshCart>(sideEffect.await())
        val state = viewModel.uiState.value
        assertFalse(state.isSending)
        assertEquals(null, state.errorMessage)
        assertEquals("已把这款商品加入购物车，你可以点右上角购物车查看。", state.messages.last().text)
        assertEquals("product_001", state.productCards.single().id)
    }

    @Test
    fun nonSuccessCartActionDoesNotEmitRefreshOrChatError() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("把这个加到购物车")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(
            ChatStreamEvent.MessageDelta(
                text = "我看到有多款推荐，你想加第几个？可以说“加第二个”。",
                index = 0,
            ),
        )
        repository.events.emit(ChatStreamEvent.ProductCards(listOf(productDto())))
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = listOf("product_001"),
                fallbackUsed = true,
                fallbackReason = "CART_TARGET_AMBIGUOUS",
                retrieval = ChatRetrievalDto(candidateCount = 1),
                cartAction = ChatCartActionDto(
                    type = "add",
                    status = "needs_target",
                    quantity = 1,
                    message = "需要确认要加入购物车的商品",
                ),
            ),
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(null, state.errorMessage)
        assertFalse(state.canRetry)
        assertEquals("product_001", state.productCards.single().id)
        assertEquals("我看到有多款推荐，你想加第几个？可以说“加第二个”。", state.messages.last().text)
        assertEquals(0, viewModel.sideEffects.replayCache.size)
    }

    @Test
    fun successfulCartManagementMutationEmitsRefreshCartSideEffect() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("删除第二个商品")
        viewModel.sendMessage()
        advanceUntilIdle()

        val sideEffect = backgroundScope.async {
            viewModel.sideEffects.first()
        }
        repository.events.emit(
            ChatStreamEvent.MessageDelta(
                text = "已经删除第二个商品。",
                index = 0,
            ),
        )
        repository.events.emit(ChatStreamEvent.ProductCards(emptyList()))
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 2),
                cartAction = ChatCartActionDto(
                    type = "remove",
                    status = "success",
                    itemId = "item_002",
                    productId = "product_002",
                    productName = "通勤蓝牙耳机",
                ),
            ),
        )
        advanceUntilIdle()

        assertIs<ChatSideEffect.RefreshCart>(sideEffect.await())
        assertEquals(null, viewModel.uiState.value.errorMessage)
    }

    @Test
    fun inspectCartActionDoesNotEmitRefreshCartSideEffect() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("购物车里有什么")
        viewModel.sendMessage()
        advanceUntilIdle()

        repository.events.emit(
            ChatStreamEvent.MessageDelta(
                text = "你购物车里有 2 件商品。",
                index = 0,
            ),
        )
        repository.events.emit(ChatStreamEvent.ProductCards(emptyList()))
        repository.events.emit(
            ChatStreamEvent.Done(
                recommendedProductIds = emptyList(),
                fallbackUsed = false,
                fallbackReason = null,
                retrieval = ChatRetrievalDto(candidateCount = 2),
                cartAction = ChatCartActionDto(
                    type = "inspect",
                    status = "success",
                    message = null,
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals(null, viewModel.uiState.value.errorMessage)
        assertEquals(0, viewModel.sideEffects.replayCache.size)
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
                    recentProductIds: List<String>,
                    filters: ChatStreamFiltersDto?,
                    imageSearch: ChatImageSearchMetadataDto?,
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
                    recentProductIds: List<String>,
                    filters: ChatStreamFiltersDto?,
                    imageSearch: ChatImageSearchMetadataDto?,
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

    @Test
    fun voicePermissionDeniedDoesNotSendMessage() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onVoicePermissionDenied()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(0, repository.streamCalls)
        assertEquals(emptyList(), state.messages)
        assertIs<VoiceInputUiState.PermissionDenied>(state.voiceInput)
    }

    @Test
    fun voiceStartShowsPendingUserBubble() = runTest {
        val viewModel = ChatViewModel(FakeChatRepository())

        viewModel.onVoiceStartRequested()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<VoiceInputUiState.Listening>(state.voiceInput)
        assertEquals(1, state.messages.size)
        assertEquals("正在识别...", state.messages.single().text)
        assertTrue(state.messages.single().fromUser)
        assertTrue(state.messages.single().isVoiceTranscribing)
    }

    @Test
    fun voiceTranscribingShowsPendingUserBubble() = runTest {
        val viewModel = ChatViewModel(FakeChatRepository())

        viewModel.onVoiceListening()
        viewModel.onVoiceTranscribing()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<VoiceInputUiState.Transcribing>(state.voiceInput)
        assertEquals(1, state.messages.size)
        assertEquals("正在识别...", state.messages.single().text)
        assertTrue(state.messages.single().fromUser)
        assertTrue(state.messages.single().isVoiceTranscribing)
    }

    @Test
    fun cancelVoiceInputClearsPendingBubbleAndReturnsIdle() = runTest {
        val viewModel = ChatViewModel(FakeChatRepository())

        viewModel.onVoiceTranscribing()
        viewModel.cancelVoiceInput()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(VoiceInputUiState.Idle, state.voiceInput)
        assertEquals(emptyList(), state.messages)
    }

    @Test
    fun voiceTranscriptReadyReplacesPendingBubbleAndStartsStream() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onVoiceTranscribing()
        val pendingId = viewModel.uiState.value.messages.single().id
        viewModel.onVoiceTranscriptReady("推荐一款适合通勤的蓝牙耳机")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, repository.streamCalls)
        assertEquals("推荐一款适合通勤的蓝牙耳机", state.messages[0].text)
        assertEquals(pendingId, state.messages[0].id)
        assertFalse(state.messages[0].isVoiceTranscribing)
        assertTrue(state.messages[0].fromUser)
        assertTrue(state.messages[1].isStreaming)
        assertEquals(VoiceInputUiState.Idle, state.voiceInput)
    }

    @Test
    fun voiceTranscriptUsesCurrentConversationAndHistory() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("推荐耳机")
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

        viewModel.onVoiceTranscribing()
        viewModel.onVoiceTranscriptReady("要更便宜一点")
        advanceUntilIdle()

        assertEquals(listOf(originalConversationId, originalConversationId), repository.conversationIds)
        assertEquals(2, repository.histories.last().size)
        assertEquals("要更便宜一点", viewModel.uiState.value.messages.dropLast(1).last().text)
    }

    @Test
    fun voiceFailureDoesNotClearComposerOrRequestChatStream() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onComposerTextChange("原来手打的内容")
        viewModel.onVoiceTranscribing()
        viewModel.onVoiceInputError("没有识别到语音，请再试一次。")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("原来手打的内容", state.composerText)
        assertEquals(0, repository.streamCalls)
        assertEquals(emptyList(), state.messages)
        assertEquals(VoiceInputUiState.Idle, state.voiceInput)
        assertEquals("没有识别到语音，请再试一次。", state.errorMessage)
    }

    @Test
    fun emptyCloudAsrTranscriptDoesNotRequestChatStream() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onVoiceTranscribing()
        viewModel.onVoiceTranscriptReady("   ")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(0, repository.streamCalls)
        assertEquals(emptyList(), state.messages)
        assertEquals(VoiceInputUiState.Idle, state.voiceInput)
        assertEquals("没有识别到语音，请再试一次。", state.errorMessage)
    }

    @Test
    fun voicePartialResultDoesNotRequestChatStream() = runTest {
        val repository = FakeChatRepository()
        val viewModel = ChatViewModel(repository)

        viewModel.onVoiceTranscribing()
        viewModel.onVoicePartialResult("推荐耳机")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(0, repository.streamCalls)
        assertEquals(1, state.messages.size)
        assertTrue(state.messages.single().isVoiceTranscribing)
    }

    @Test
    fun startNewChatClearsVoiceInputState() = runTest {
        val viewModel = ChatViewModel(FakeChatRepository())

        viewModel.onVoiceTranscribing()
        viewModel.startNewChat()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(VoiceInputUiState.Idle, state.voiceInput)
        assertEquals(emptyList(), state.messages)
    }

    private class FakeChatRepository : ChatRepository {
        val events = MutableSharedFlow<ChatStreamEvent>()
        var streamCalls = 0
        val messages = mutableListOf<String>()
        val conversationIds = mutableListOf<String>()
        val histories = mutableListOf<List<ChatMessageUi>>()
        val recentProductIdCalls = mutableListOf<List<String>>()
        val filtersCalls = mutableListOf<ChatStreamFiltersDto?>()
        val imageSearchCalls = mutableListOf<ChatImageSearchMetadataDto?>()

        override fun streamChat(
            message: String,
            conversationId: String,
            history: List<ChatMessageUi>,
            recentProductIds: List<String>,
            filters: ChatStreamFiltersDto?,
            imageSearch: ChatImageSearchMetadataDto?,
        ): Flow<ChatStreamEvent> {
            streamCalls += 1
            messages += message
            conversationIds += conversationId
            histories += history
            recentProductIdCalls += recentProductIds
            filtersCalls += filters
            imageSearchCalls += imageSearch
            return events
        }
    }

    private fun productDto(
        id: String = "product_001",
        name: String = "通勤蓝牙耳机",
    ): ChatProductCardDto =
        ChatProductCardDto(
            id = id,
            name = name,
            brand = "示例品牌",
            category = "数码电子",
            priceCents = 19900,
            priceRangeCents = PriceRangeCentsDto(min = 19900, max = 19900),
            currency = "CNY",
            tags = listOf("通勤"),
            available = true,
        )
}
