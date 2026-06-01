package com.shopmate.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shopmate.app.data.chat.ChatCartActionDto
import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.chat.ChatStreamEvent
import com.shopmate.app.data.chat.toProductCardUiList
import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.ProductCardUi
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class ChatViewModel(
    private val chatRepository: ChatRepository,
    private val imageUrlResolver: ShopMateImageUrlResolver? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()
    private val _sideEffects = MutableSharedFlow<ChatSideEffect>()
    val sideEffects: SharedFlow<ChatSideEffect> = _sideEffects.asSharedFlow()

    private var streamJob: Job? = null
    private var lastSentMessage: String? = null
    private var messageSequence = 0
    private var sessionSequence = 0
    private var currentSessionId: String? = null
    private var preservingProductCardsForCurrentStream = false
    private var voicePendingMessageId: String? = null
    private val sessionSnapshots = mutableMapOf<String, ChatSessionSnapshot>()

    fun onComposerTextChange(text: String) {
        _uiState.update { state ->
            state.copy(
                composerText = text,
                errorMessage = null,
                canRetry = false,
            )
        }
    }

    fun sendMessage() {
        val state = _uiState.value
        val message = state.composerText.trim()
        if (message.isBlank() || state.isSending) {
            return
        }

        startStream(
            message = message,
            history = state.messages,
            clearComposer = true,
        )
    }

    fun onVoiceStartRequested() {
        if (_uiState.value.isSending) {
            return
        }

        voicePendingMessageId = null
        showVoicePendingMessage(nextVoiceState = VoiceInputUiState.Listening)
    }

    fun onVoiceListening() {
        if (_uiState.value.isSending) {
            return
        }

        showVoicePendingMessage(nextVoiceState = VoiceInputUiState.Listening)
    }

    fun onVoiceTranscribing() {
        if (_uiState.value.isSending) {
            return
        }

        showVoicePendingMessage(nextVoiceState = VoiceInputUiState.Transcribing)
    }

    private fun showVoicePendingMessage(nextVoiceState: VoiceInputUiState) {
        _uiState.update { state ->
            val pendingId = voicePendingMessageId ?: nextMessageId(USER_MESSAGE_PREFIX).also { id ->
                voicePendingMessageId = id
            }
            val messages = state.messages.removeVoicePendingMessage(pendingId) +
                ChatMessageUi(
                    id = pendingId,
                    text = VOICE_TRANSCRIBING_TEXT,
                    fromUser = true,
                    isVoiceTranscribing = true,
                )

            state.copy(
                messages = messages,
                voiceInput = nextVoiceState,
                errorMessage = null,
                canRetry = false,
            )
        }
    }

    fun onVoiceTranscriptReady(transcript: String) {
        val normalizedTranscript = transcript.trim()
        if (normalizedTranscript.isBlank()) {
            onVoiceInputError("没有识别到语音，请再试一次。")
            return
        }

        val state = _uiState.value
        if (state.isSending) {
            return
        }

        val pendingId = voicePendingMessageId
        val history = state.messages.removeVoicePendingMessage(pendingId)
        _uiState.update { currentState ->
            currentState.copy(
                voiceInput = VoiceInputUiState.TranscriptReady(normalizedTranscript),
            )
        }

        startStream(
            message = normalizedTranscript,
            history = history,
            clearComposer = false,
            userMessageId = pendingId,
        )
    }

    fun onVoicePartialResult(@Suppress("UNUSED_PARAMETER") text: String) = Unit

    fun onVoicePermissionDenied() {
        removePendingVoiceMessage(
            nextVoiceState = VoiceInputUiState.PermissionDenied(),
        )
    }

    fun onVoiceInputError(@Suppress("UNUSED_PARAMETER") message: String) {
        removePendingVoiceMessage(
            nextVoiceState = VoiceInputUiState.Idle,
        )
    }

    fun cancelVoiceInput() {
        removePendingVoiceMessage(nextVoiceState = VoiceInputUiState.Idle)
    }

    fun retryLastMessage() {
        val message = lastSentMessage ?: return
        val state = _uiState.value
        if (state.isSending) {
            return
        }

        val history = state.messages
            .dropLastWhile { chatMessage -> !chatMessage.fromUser }
            .dropLastWhile { chatMessage -> chatMessage.fromUser && chatMessage.text == message }

        startStream(
            message = message,
            history = history,
            clearComposer = false,
        )
    }

    fun clearError() {
        _uiState.update { state ->
            state.copy(
                errorMessage = null,
                canRetry = false,
            )
        }
    }

    fun startNewChat() {
        val state = _uiState.value
        val historyConversations = saveCurrentSession(state)
        streamJob?.cancel()
        streamJob = null
        preservingProductCardsForCurrentStream = false
        voicePendingMessageId = null
        lastSentMessage = null
        currentSessionId = null
        _uiState.value = ChatUiState(historyConversations = historyConversations)
    }

    fun hasActiveConversation(): Boolean {
        val state = _uiState.value
        return state.hasActiveConversation()
    }

    fun openHistoryConversation(conversationId: String): Boolean {
        val snapshot = sessionSnapshots[conversationId] ?: return false

        streamJob?.cancel()
        streamJob = null
        currentSessionId = conversationId
        lastSentMessage = snapshot.messages.lastOrNull { message -> message.fromUser }?.text

        _uiState.update { state ->
            state.copy(
                messages = snapshot.messages,
                productCards = snapshot.productCards,
                productCardsAnchorMessageId = snapshot.productCardsAnchorMessageId,
                composerText = "",
                isSending = false,
                errorMessage = null,
                canRetry = false,
                voiceInput = VoiceInputUiState.Idle,
            )
        }
        return true
    }

    fun renameHistoryConversation(conversationId: String, title: String): Boolean {
        val normalizedTitle = title.trim().take(MAX_HISTORY_TITLE_LENGTH)
        if (normalizedTitle.isBlank() || !sessionSnapshots.containsKey(conversationId)) {
            return false
        }

        _uiState.update { state ->
            state.copy(
                historyConversations = state.historyConversations.map { conversation ->
                    if (conversation.id == conversationId) {
                        conversation.copy(title = normalizedTitle)
                    } else {
                        conversation
                    }
                },
            )
        }
        return true
    }

    fun deleteHistoryConversation(conversationId: String): Boolean {
        if (!sessionSnapshots.containsKey(conversationId)) {
            return false
        }

        sessionSnapshots.remove(conversationId)
        val wasCurrentSession = currentSessionId == conversationId
        if (wasCurrentSession) {
            streamJob?.cancel()
            streamJob = null
            preservingProductCardsForCurrentStream = false
            voicePendingMessageId = null
            currentSessionId = null
            lastSentMessage = null
        }

        _uiState.update { state ->
            val historyConversations = state.historyConversations
                .filterNot { conversation -> conversation.id == conversationId }

            if (wasCurrentSession) {
                ChatUiState(historyConversations = historyConversations)
            } else {
                state.copy(historyConversations = historyConversations)
            }
        }
        return true
    }

    fun editableHistoryConversationIds(): Set<String> = sessionSnapshots.keys.toSet()

    private fun ChatUiState.hasActiveConversation(): Boolean =
        messages.any { message -> !message.isVoiceTranscribing } || productCards.isNotEmpty() || isSending

    private fun saveCurrentSession(state: ChatUiState): List<HistoryConversationUi> {
        if (!state.hasActiveConversation()) {
            return state.historyConversations
        }

        val sessionId = currentSessionId ?: nextSessionId()
        val snapshotMessages = state.messages
            .filterNot { message -> message.isVoiceTranscribing }
            .map { message -> message.copy(isStreaming = false, isVoiceTranscribing = false) }
        val snapshot = ChatSessionSnapshot(
            messages = snapshotMessages,
            productCards = state.productCards,
            productCardsAnchorMessageId = state.productCardsAnchorMessageId,
        )
        sessionSnapshots[sessionId] = snapshot

        val historyItem = HistoryConversationUi(
            id = sessionId,
            title = snapshot.title(),
            timeText = "刚刚",
        )

        return listOf(historyItem) +
            state.historyConversations.filterNot { conversation -> conversation.id == sessionId }
    }

    private fun ensureCurrentSessionHistory(
        state: ChatUiState,
        sessionId: String,
        userMessage: ChatMessageUi,
    ): Pair<String, List<HistoryConversationUi>> {
        val existingTitle = state.historyConversations
            .firstOrNull { conversation -> conversation.id == sessionId }
            ?.title
        val historyItem = HistoryConversationUi(
            id = sessionId,
            title = existingTitle
                ?: userMessage.text.trim().ifBlank { "新的聊天" }.take(MAX_HISTORY_TITLE_LENGTH),
            timeText = "刚刚",
        )
        val historyConversations = listOf(historyItem) +
            state.historyConversations.filterNot { conversation -> conversation.id == sessionId }

        return sessionId to historyConversations
    }

    private fun nextSessionId(): String {
        sessionSequence += 1
        return "local-chat-session-$sessionSequence"
    }

    private fun ChatSessionSnapshot.title(): String {
        val rawTitle = messages.firstOrNull { message ->
            message.fromUser && message.text.isNotBlank()
        }?.text?.trim().orEmpty()
        return if (rawTitle.isBlank()) {
            "新的聊天"
        } else {
            rawTitle.take(MAX_HISTORY_TITLE_LENGTH)
        }
    }

    private data class ChatSessionSnapshot(
        val messages: List<ChatMessageUi>,
        val productCards: List<ProductCardUi>,
        val productCardsAnchorMessageId: String?,
    )

    private fun startStream(
        message: String,
        history: List<ChatMessageUi>,
        clearComposer: Boolean,
        userMessageId: String? = null,
    ) {
        streamJob?.cancel()
        lastSentMessage = message
        preservingProductCardsForCurrentStream = false
        voicePendingMessageId = null
        val conversationId = currentSessionId ?: nextSessionId().also { id ->
            currentSessionId = id
        }

        val userMessage = ChatMessageUi(
            id = userMessageId ?: nextMessageId(USER_MESSAGE_PREFIX),
            text = message,
            fromUser = true,
        )
        val assistantMessage = ChatMessageUi(
            id = nextMessageId(ASSISTANT_MESSAGE_PREFIX),
            text = "",
            fromUser = false,
            isStreaming = true,
        )
        val shouldKeepProductCards = shouldKeepProductCardsForMessage(message)
        preservingProductCardsForCurrentStream = shouldKeepProductCards

        _uiState.update { state ->
            val (sessionId, historyConversations) = ensureCurrentSessionHistory(
                state = state,
                sessionId = conversationId,
                userMessage = userMessage,
            )
            val nextProductCards = state.productCards
            sessionSnapshots[sessionId] = ChatSessionSnapshot(
                messages = history + userMessage + assistantMessage.copy(isStreaming = false),
                productCards = nextProductCards,
                productCardsAnchorMessageId = state.productCardsAnchorMessageId,
            )

            state.copy(
                messages = history + userMessage + assistantMessage,
                productCards = nextProductCards,
                productCardsAnchorMessageId = state.productCardsAnchorMessageId,
                historyConversations = historyConversations,
                composerText = if (clearComposer) "" else state.composerText,
                isSending = true,
                errorMessage = null,
                canRetry = false,
                voiceInput = VoiceInputUiState.Idle,
            )
        }

        streamJob = viewModelScope.launch {
            chatRepository.streamChat(message, conversationId, history)
                .catch { error ->
                    applyFailure(error)
                }
                .onCompletion { cause ->
                    if (cause == null) {
                        applyIncompleteStreamCompletion()
                    }
                }
                .collect { event ->
                    applyStreamEvent(event)
                }
        }
    }

    private fun applyStreamEvent(event: ChatStreamEvent) {
        when (event) {
            is ChatStreamEvent.MessageDelta -> appendAssistantDelta(event.text)
            is ChatStreamEvent.ProductCards -> {
                _uiState.update { state ->
                    val lastAssistantId = state.messages.lastOrNull { message ->
                        !message.fromUser
                    }?.id
                    state.copy(
                        productCards = event.items.toProductCardUiList(imageUrlResolver),
                        productCardsAnchorMessageId = if (preservingProductCardsForCurrentStream) {
                            state.productCardsAnchorMessageId
                        } else {
                            lastAssistantId
                        },
                    )
                        .also(::saveCurrentSession)
                }
            }

            is ChatStreamEvent.Done -> {
                emitCartActionSideEffect(event.cartAction)
                _uiState.update { state ->
                    state.copy(
                        messages = state.messages.markAssistantDone(),
                        isSending = false,
                        errorMessage = if (event.shouldShowNoMatchError(
                                productCards = state.productCards,
                                messages = state.messages,
                            )
                        ) {
                            "当前商品库暂时没有完全匹配的商品，可以调整需求再试试。"
                        } else {
                            null
                        },
                        canRetry = false,
                    ).also(::saveCurrentSession)
                }
                preservingProductCardsForCurrentStream = false
            }

            is ChatStreamEvent.Error -> {
                _uiState.update { state ->
                    state.copy(
                        messages = state.messages.markAssistantDone(),
                        isSending = false,
                        errorMessage = event.toDisplayMessage(),
                        canRetry = event.retryable,
                    ).also(::saveCurrentSession)
                }
                preservingProductCardsForCurrentStream = false
            }

            is ChatStreamEvent.Unknown -> Unit
        }
    }

    private fun appendAssistantDelta(text: String) {
        _uiState.update { state ->
            state.copy(
                messages = state.messages.replaceLastAssistant { assistant ->
                    assistant.copy(text = assistant.text + text)
                },
            ).also(::saveCurrentSession)
        }
    }

    private fun emitCartActionSideEffect(cartAction: ChatCartActionDto?) {
        if (cartAction == null || cartAction.status != CART_ACTION_SUCCESS_STATUS) {
            return
        }

        if (cartAction.type !in CART_REFRESH_ACTION_TYPES) {
            return
        }

        viewModelScope.launch {
            _sideEffects.emit(ChatSideEffect.RefreshCart(cartAction.message))
        }
    }

    private fun applyFailure(error: Throwable) {
        _uiState.update { state ->
            state.copy(
                messages = state.messages.markAssistantDone(),
                isSending = false,
                errorMessage = error.toDisplayMessage(),
                canRetry = true,
            ).also(::saveCurrentSession)
        }
        preservingProductCardsForCurrentStream = false
    }

    private fun applyIncompleteStreamCompletion() {
        _uiState.update { state ->
            if (!state.isSending) {
                state
            } else {
                state.copy(
                    messages = state.messages.markAssistantDone(),
                    isSending = false,
                    errorMessage = "导购连接已结束，请重试。",
                    canRetry = true,
                ).also(::saveCurrentSession)
            }
        }
        preservingProductCardsForCurrentStream = false
    }

    private fun nextMessageId(prefix: String): String {
        messageSequence += 1
        return "$prefix-$messageSequence"
    }

    private fun removePendingVoiceMessage(nextVoiceState: VoiceInputUiState) {
        val pendingId = voicePendingMessageId
        voicePendingMessageId = null
        _uiState.update { state ->
            state.copy(
                messages = state.messages.removeVoicePendingMessage(pendingId),
                voiceInput = nextVoiceState,
            )
        }
    }

    companion object {
        private const val USER_MESSAGE_PREFIX = "user"
        private const val ASSISTANT_MESSAGE_PREFIX = "assistant"
        private const val MAX_HISTORY_TITLE_LENGTH = 24
        private const val VOICE_TRANSCRIBING_TEXT = "正在识别..."
    }
}

private fun List<ChatMessageUi>.removeVoicePendingMessage(
    pendingId: String?,
): List<ChatMessageUi> =
    filterNot { message ->
        message.isVoiceTranscribing && (pendingId == null || message.id == pendingId)
    }

private fun List<ChatMessageUi>.replaceLastAssistant(
    transform: (ChatMessageUi) -> ChatMessageUi,
): List<ChatMessageUi> {
    val assistantIndex = indexOfLast { message -> !message.fromUser }
    if (assistantIndex == -1) {
        return this
    }
    return mapIndexed { index, message ->
        if (index == assistantIndex) transform(message) else message
    }
}

private fun List<ChatMessageUi>.markAssistantDone(): List<ChatMessageUi> =
    replaceLastAssistant { message -> message.copy(isStreaming = false) }

private fun ChatStreamEvent.Error.toDisplayMessage(): String =
    when (code) {
        "INVALID_CHAT_REQUEST" -> "消息格式不正确，请调整后再试。"
        "CHAT_STREAM_CONNECTION_FAILED" -> "无法连接导购服务，请确认后端正在运行。"
        "CHAT_STREAM_ERROR" -> "导购暂时无法回复，请稍后再试。"
        "SSE_SERIALIZATION_ERROR", "ANDROID_STREAM_PARSE_ERROR" -> "回复数据格式异常，请稍后再试。"
        else -> "导购暂时无法回复，请稍后再试。"
    }

private fun Throwable.toDisplayMessage(): String =
    "无法连接导购服务，请确认后端正在运行。"

private fun ChatStreamEvent.Done.shouldShowNoMatchError(
    productCards: List<ProductCardUi>,
    messages: List<ChatMessageUi>,
): Boolean =
    productCards.isEmpty() &&
        fallbackUsed &&
        fallbackReason != NEEDS_CLARIFICATION_REASON &&
        messages.lastOrNull { message -> !message.fromUser }?.text.isNullOrBlank()

private fun shouldKeepProductCardsForMessage(message: String): Boolean {
    val normalized = message.replace(Regex("\\s+"), "")
    val hasAddIntent = listOf("加", "加入", "放", "我要").any(normalized::contains)
    val hasCartContext = listOf("购物车", "车里", "进去", "加进去").any(normalized::contains)
    val hasTargetHint = Regex("第?\\d{1,2}|第?[一二两三四五六七八九十]|这个|这款|那款").containsMatchIn(normalized)
    val isAlsoOrdinalFollowUp = hasTargetHint && Regex("也|也是|一起|同样|也要").containsMatchIn(normalized)

    return isAlsoOrdinalFollowUp || hasAddIntent && (hasCartContext || hasTargetHint)
}

private const val NEEDS_CLARIFICATION_REASON = "NEEDS_CLARIFICATION"
private const val CART_ACTION_SUCCESS_STATUS = "success"
private val CART_REFRESH_ACTION_TYPES = setOf(
    "add",
    "remove",
    "update_quantity",
    "update_selected",
)
