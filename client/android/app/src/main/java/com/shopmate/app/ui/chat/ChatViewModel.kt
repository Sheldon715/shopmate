package com.shopmate.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shopmate.app.data.chat.ChatCartActionDto
import com.shopmate.app.data.chat.ChatCheckoutActionDto
import com.shopmate.app.data.chat.ChatImageSearchMetadataDto
import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.chat.ChatStreamFiltersDto
import com.shopmate.app.data.chat.ChatStreamEvent
import com.shopmate.app.data.chat.toComparisonUi
import com.shopmate.app.data.chat.toCheckoutDraftCardUi
import com.shopmate.app.data.chat.toProductCardUiList
import com.shopmate.app.data.image.ImageSearchAttachmentInput
import com.shopmate.app.data.image.ImageSearchException
import com.shopmate.app.data.image.ImageSearchInterpretResult
import com.shopmate.app.data.image.ImageSearchRepository
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
    private val imageSearchRepository: ImageSearchRepository? = null,
    private val imageUrlResolver: ShopMateImageUrlResolver? = null,
    private val typewriterTickerFactory: () -> TypewriterTicker = { CoroutineTypewriterTicker() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()
    private val _sideEffects = MutableSharedFlow<ChatSideEffect>()
    val sideEffects: SharedFlow<ChatSideEffect> = _sideEffects.asSharedFlow()

    private var streamJob: Job? = null
    private var imageSearchJob: Job? = null
    private var lastStreamRequest: ChatStreamStartInput? = null
    private var messageSequence = 0
    private var sessionSequence = 0
    private var currentSessionId: String? = null
    private var preservingProductCardsForCurrentStream = false
    private var preservingExistingProductCardsForCurrentStream = false
    private var isComparisonGenerationStream = false
    private var latestStreamProductCards: List<ProductCardUi> = emptyList()
    private var preStreamProductCards: List<ProductCardUi> = emptyList()
    private var voicePendingMessageId: String? = null
    private var imageSearchPendingUserMessageId: String? = null
    private var assistantTextRevealer: AssistantTextRevealer? = null
    private var lastCheckoutActionKey: String? = null
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
        if (state.selectedImage != null) {
            sendSelectedImageMessage()
            return
        }

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

    fun selectImage(
        uriString: String,
        mimeType: String? = null,
        sizeBytes: Long? = null,
    ) {
        val normalizedUri = uriString.trim()
        if (normalizedUri.isBlank() || _uiState.value.isSending) {
            return
        }

        imageSearchPendingUserMessageId = null
        _uiState.update { state ->
            state.copy(
                selectedImage = ChatImageAttachmentUi(
                    uriString = normalizedUri,
                    mimeType = mimeType?.trim()?.takeIf { value -> value.isNotBlank() },
                    sizeBytes = sizeBytes?.takeIf { value -> value > 0 },
                ),
                errorMessage = null,
                canRetry = false,
                voiceInput = VoiceInputUiState.Idle,
            )
        }
    }

    fun clearSelectedImage() {
        imageSearchPendingUserMessageId = null
        _uiState.update { state ->
            state.copy(
                selectedImage = null,
                errorMessage = null,
                canRetry = false,
            )
        }
    }

    fun retryImageSearch() {
        sendSelectedImageMessage()
    }

    private fun sendSelectedImageMessage() {
        val state = _uiState.value
        val attachment = state.selectedImage ?: return
        if (state.isSending) {
            return
        }

        val repository = imageSearchRepository
        if (repository == null) {
            applyImageInterpretFailure(
                userMessageId = imageSearchPendingUserMessageId,
                error = ImageSearchException(
                    code = "IMAGE_SEARCH_PROVIDER_DISABLED",
                    displayMessage = "当前图片找货入口未初始化，请稍后再试。",
                    retryable = false,
                ),
            )
            return
        }

        val userText = state.composerText.trim()
        val visibleMessage = userText.ifBlank { IMAGE_SEARCH_DEFAULT_USER_MESSAGE }
        val conversationId = currentSessionId ?: nextSessionId().also { id ->
            currentSessionId = id
        }
        val userMessageId = imageSearchPendingUserMessageId
            ?: nextMessageId(USER_MESSAGE_PREFIX).also { id ->
                imageSearchPendingUserMessageId = id
            }
        val interpretingAttachment = attachment.copy(
            status = ChatImageAttachmentStatus.Interpreting,
            errorMessage = null,
        )
        val userMessage = ChatMessageUi(
            id = userMessageId,
            text = visibleMessage,
            fromUser = true,
            imageAttachment = interpretingAttachment,
        )

        _uiState.update { currentState ->
            val messagesWithoutPending = currentState.messages
                .filterNot { message -> message.id == userMessageId }
            val (sessionId, historyConversations) = ensureCurrentSessionHistory(
                state = currentState,
                sessionId = conversationId,
                userMessage = userMessage,
            )
            val nextMessages = messagesWithoutPending + userMessage
            sessionSnapshots[sessionId] = ChatSessionSnapshot(
                messages = nextMessages,
                productCards = currentState.productCards,
                productCardsAnchorMessageId = currentState.productCardsAnchorMessageId,
                comparisonResults = currentState.comparisonResults,
                comparisonActions = currentState.comparisonActions,
                activeCheckoutDraft = currentState.activeCheckoutDraft,
                lastStreamRequest = null,
            )

            currentState.copy(
                messages = nextMessages,
                historyConversations = historyConversations,
                selectedImage = interpretingAttachment,
                isSending = true,
                errorMessage = null,
                canRetry = false,
                voiceInput = VoiceInputUiState.Idle,
            )
        }

        imageSearchJob = viewModelScope.launch {
            val result = repository.interpret(
                image = ImageSearchAttachmentInput(
                    uriString = attachment.uriString,
                    mimeType = attachment.mimeType,
                    sizeBytes = attachment.sizeBytes,
                ),
                message = userText,
                conversationId = conversationId,
            )

            result.fold(
                onSuccess = { interpretResult ->
                    applyImageInterpretSuccess(
                        userMessageId = userMessageId,
                        userVisibleMessage = visibleMessage,
                        conversationId = conversationId,
                        interpretResult = interpretResult,
                    )
                },
                onFailure = { error ->
                    applyImageInterpretFailure(userMessageId, error)
                },
            )
        }
    }

    private fun applyImageInterpretSuccess(
        userMessageId: String,
        userVisibleMessage: String,
        conversationId: String,
        interpretResult: ImageSearchInterpretResult,
    ) {
        imageSearchJob = null
        val internalMessage = interpretResult.chatMessage?.trim().orEmpty()
        if (internalMessage.isBlank()) {
            val message = interpretResult.visualIntent.clarificationQuestion
                ?.trim()
                ?.takeIf { value -> value.isNotBlank() }
                ?: IMAGE_SEARCH_NEEDS_CLEARER_INPUT_TEXT
            updateImageMessageAttachment(
                userMessageId = userMessageId,
                status = ChatImageAttachmentStatus.Failed,
                errorMessage = message,
                excludeFromChatHistory = true,
            )
            _uiState.update { state ->
                state.copy(
                    selectedImage = state.selectedImage?.copy(
                        status = ChatImageAttachmentStatus.Failed,
                        errorMessage = message,
                    ),
                    isSending = false,
                    errorMessage = message,
                    canRetry = false,
                )
            }
            return
        }

        val searchingAttachment = _uiState.value.selectedImage?.copy(
            status = ChatImageAttachmentStatus.Searching,
            errorMessage = null,
        )
        updateImageMessageAttachment(
            userMessageId = userMessageId,
            status = ChatImageAttachmentStatus.Searching,
            errorMessage = null,
            excludeFromChatHistory = false,
        )
        val history = _uiState.value.messages.takeWhile { message -> message.id != userMessageId }

        imageSearchPendingUserMessageId = null
        startStream(
            message = internalMessage,
            history = history,
            clearComposer = true,
            userMessageId = userMessageId,
            userVisibleMessage = userVisibleMessage,
            filters = interpretResult.filters,
            imageSearch = interpretResult.imageSearchMetadata,
            userImageAttachment = searchingAttachment,
            clearSelectedImage = true,
            conversationIdOverride = conversationId,
        )
    }

    private fun applyImageInterpretFailure(
        userMessageId: String?,
        error: Throwable,
    ) {
        imageSearchJob = null
        val imageError = error as? ImageSearchException
        val displayMessage = imageError?.displayMessage
            ?: "图片找货失败，请检查网络后再试。"
        if (userMessageId != null) {
            updateImageMessageAttachment(
                userMessageId = userMessageId,
                status = ChatImageAttachmentStatus.Failed,
                errorMessage = displayMessage,
                excludeFromChatHistory = true,
            )
        }
        _uiState.update { state ->
            state.copy(
                selectedImage = state.selectedImage?.copy(
                    status = ChatImageAttachmentStatus.Failed,
                    errorMessage = displayMessage,
                ),
                isSending = false,
                errorMessage = displayMessage,
                canRetry = imageError?.retryable ?: true,
            )
        }
    }

    private fun updateImageMessageAttachment(
        userMessageId: String,
        status: ChatImageAttachmentStatus,
        errorMessage: String?,
        excludeFromChatHistory: Boolean? = null,
    ) {
        _uiState.update { state ->
            state.copy(
                messages = state.messages.map { message ->
                    if (message.id == userMessageId) {
                        message.copy(
                            imageAttachment = message.imageAttachment?.copy(
                                status = status,
                                errorMessage = errorMessage,
                            ),
                            excludeFromChatHistory = excludeFromChatHistory
                                ?: message.excludeFromChatHistory,
                        )
                    } else {
                        message
                    }
                },
            )
        }
    }

    fun sendImageSearchResult(
        userVisibleText: String,
        chatMessage: String?,
        filters: ChatStreamFiltersDto? = null,
        imageSearch: ChatImageSearchMetadataDto? = null,
    ) {
        val state = _uiState.value
        val internalMessage = chatMessage?.trim().orEmpty()
        if (state.isSending) {
            return
        }
        if (internalMessage.isBlank()) {
            _uiState.update { currentState ->
                currentState.copy(
                    errorMessage = IMAGE_SEARCH_NEEDS_CLEARER_INPUT_TEXT,
                    canRetry = false,
                )
            }
            return
        }

        startStream(
            message = internalMessage,
            history = state.messages,
            clearComposer = false,
            userVisibleMessage = userVisibleText.trim()
                .ifBlank { IMAGE_SEARCH_DEFAULT_USER_MESSAGE },
            filters = filters,
            imageSearch = imageSearch,
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

    fun onVoiceInputError(message: String) {
        removePendingVoiceMessage(
            nextVoiceState = VoiceInputUiState.Idle,
            errorMessage = message.trim().ifBlank { "语音识别失败，请再试一次。" },
        )
    }

    fun cancelVoiceInput() {
        removePendingVoiceMessage(nextVoiceState = VoiceInputUiState.Idle)
    }

    fun retryLastMessage() {
        if (_uiState.value.selectedImage?.status == ChatImageAttachmentStatus.Failed) {
            retryImageSearch()
            return
        }

        val request = lastStreamRequest ?: return
        val state = _uiState.value
        if (state.isSending) {
            return
        }

        val history = state.messages
            .dropLastWhile { chatMessage -> !chatMessage.fromUser }
            .dropLastWhile { chatMessage ->
                chatMessage.fromUser && chatMessage.text == request.userVisibleMessage
            }

        startStream(
            message = request.internalMessage,
            history = history,
            clearComposer = false,
            userVisibleMessage = request.userVisibleMessage,
            filters = request.filters,
            imageSearch = request.imageSearch,
            userImageAttachment = request.userImageAttachment,
        )
    }

    fun startMockCheckoutFromCart(): Boolean {
        val state = _uiState.value
        if (state.isSending) {
            return false
        }

        startStream(
            message = MOCK_CHECKOUT_START_MESSAGE,
            history = state.messages,
            clearComposer = true,
        )
        return true
    }

    fun confirmActiveCheckout(): Boolean {
        val state = _uiState.value
        if (
            state.isSending ||
            state.activeCheckoutDraft?.canOpenCheckoutDraft() != true
        ) {
            return false
        }

        markActiveCheckoutUpdating()
        startStream(
            message = CHECKOUT_CONFIRM_MESSAGE,
            history = state.messages,
            clearComposer = false,
        )
        return true
    }

    fun cancelActiveCheckout(): Boolean {
        val state = _uiState.value
        if (
            state.isSending ||
            state.activeCheckoutDraft?.canOpenCheckoutDraft() != true
        ) {
            return false
        }

        markActiveCheckoutUpdating()
        startStream(
            message = CHECKOUT_CANCEL_MESSAGE,
            history = state.messages,
            clearComposer = false,
        )
        return true
    }

    fun openActiveCheckoutDraft(draftId: String): Boolean {
        val normalizedDraftId = draftId.trim()
        val activeDraft = _uiState.value.activeCheckoutDraft
        if (
            normalizedDraftId.isBlank() ||
            activeDraft?.draft?.id != normalizedDraftId ||
            !activeDraft.canOpenCheckoutDraft()
        ) {
            return false
        }

        viewModelScope.launch {
            _sideEffects.emit(ChatSideEffect.OpenCheckoutDraft(normalizedDraftId))
        }
        return true
    }

    fun markCheckoutDraftSubmittedFromCheckout(
        draftId: String,
        orderNumber: String?,
    ): Boolean {
        val normalizedDraftId = draftId.trim()
        if (normalizedDraftId.isBlank()) {
            return false
        }

        var updated = false
        _uiState.update { state ->
            val activeDraft = state.activeCheckoutDraft
            if (activeDraft?.draft?.id != normalizedDraftId) {
                return@update state
            }

            updated = true
            state.copy(
                activeCheckoutDraft = null,
            ).also(::saveCurrentSession)
        }

        return updated
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
        cancelActiveStreamState()
        imageSearchJob?.cancel()
        imageSearchJob = null
        voicePendingMessageId = null
        imageSearchPendingUserMessageId = null
        lastStreamRequest = null
        currentSessionId = null
        _uiState.value = ChatUiState(historyConversations = historyConversations)
    }

    fun hasActiveConversation(): Boolean {
        val state = _uiState.value
        return state.hasActiveConversation()
    }

    fun openHistoryConversation(conversationId: String): Boolean {
        val snapshot = sessionSnapshots[conversationId] ?: return false

        cancelActiveStreamState()
        imageSearchJob?.cancel()
        imageSearchJob = null
        imageSearchPendingUserMessageId = null
        currentSessionId = conversationId
        lastStreamRequest = snapshot.lastStreamRequest
            ?: snapshot.messages.lastOrNull { message -> message.fromUser }?.text
                ?.let { message ->
                    ChatStreamStartInput(
                        internalMessage = message,
                        userVisibleMessage = message,
                    )
                }

        _uiState.update { state ->
            state.copy(
                messages = snapshot.messages,
                productCards = snapshot.productCards,
                productCardsAnchorMessageId = snapshot.productCardsAnchorMessageId,
                comparisonResults = snapshot.comparisonResults,
                comparisonActions = snapshot.comparisonActions,
                isComparisonGenerating = false,
                activeCheckoutDraft = snapshot.activeCheckoutDraft,
                composerText = "",
                isSending = false,
                errorMessage = null,
                canRetry = false,
                voiceInput = VoiceInputUiState.Idle,
                selectedImage = null,
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
            cancelActiveStreamState()
            imageSearchJob?.cancel()
            imageSearchJob = null
            voicePendingMessageId = null
            imageSearchPendingUserMessageId = null
            currentSessionId = null
            lastStreamRequest = null
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

    fun findComparison(comparisonId: String) =
        _uiState.value.comparisonResults.firstOrNull { comparison ->
            comparison.id == comparisonId
        } ?: sessionSnapshots.values
            .asSequence()
            .flatMap { snapshot -> snapshot.comparisonResults.asSequence() }
            .firstOrNull { comparison -> comparison.id == comparisonId }

    private fun ChatUiState.hasActiveConversation(): Boolean =
        messages.any { message -> !message.isVoiceTranscribing } ||
            productCards.isNotEmpty() ||
            comparisonActions.isNotEmpty() ||
            activeCheckoutDraft != null ||
            isSending

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
            comparisonResults = state.comparisonResults,
            comparisonActions = state.comparisonActions,
            activeCheckoutDraft = state.activeCheckoutDraft,
            lastStreamRequest = lastStreamRequest,
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
        val comparisonResults: List<com.shopmate.app.ui.model.ComparisonUi>,
        val comparisonActions: List<ChatComparisonActionUi>,
        val activeCheckoutDraft: ChatCheckoutDraftCardUi?,
        val lastStreamRequest: ChatStreamStartInput? = null,
    )

    private data class ChatStreamStartInput(
        val internalMessage: String,
        val userVisibleMessage: String,
        val filters: ChatStreamFiltersDto? = null,
        val imageSearch: ChatImageSearchMetadataDto? = null,
        val userImageAttachment: ChatImageAttachmentUi? = null,
    )

    private fun startStream(
        message: String,
        history: List<ChatMessageUi>,
        clearComposer: Boolean,
        userMessageId: String? = null,
        userVisibleMessage: String = message,
        filters: ChatStreamFiltersDto? = null,
        imageSearch: ChatImageSearchMetadataDto? = null,
        userImageAttachment: ChatImageAttachmentUi? = null,
        clearSelectedImage: Boolean = false,
        conversationIdOverride: String? = null,
    ) {
        cancelActiveStreamState()
        val internalMessage = message.trim()
        val visibleMessage = userVisibleMessage.trim().ifBlank { internalMessage }
        if (internalMessage.isBlank()) {
            return
        }
        val streamRequest = ChatStreamStartInput(
            internalMessage = internalMessage,
            userVisibleMessage = visibleMessage,
            filters = filters,
            imageSearch = imageSearch,
            userImageAttachment = userImageAttachment,
        )
        lastStreamRequest = streamRequest
        preservingProductCardsForCurrentStream = false
        preservingExistingProductCardsForCurrentStream = false
        isComparisonGenerationStream = false
        latestStreamProductCards = emptyList()
        preStreamProductCards = _uiState.value.productCards
        lastCheckoutActionKey = null
        val recentProductIds = preStreamProductCards.map { product -> product.id }
        voicePendingMessageId = null
        val conversationId = conversationIdOverride ?: currentSessionId ?: nextSessionId().also { id ->
            currentSessionId = id
        }
        currentSessionId = conversationId

        val userMessage = ChatMessageUi(
            id = userMessageId ?: nextMessageId(USER_MESSAGE_PREFIX),
            text = visibleMessage,
            fromUser = true,
            imageAttachment = userImageAttachment,
        )
        val assistantMessage = ChatMessageUi(
            id = nextMessageId(ASSISTANT_MESSAGE_PREFIX),
            text = "",
            fromUser = false,
            isStreaming = true,
        )
        assistantTextRevealer = AssistantTextRevealer(
            scope = viewModelScope,
            ticker = typewriterTickerFactory(),
            onVisibleTextChanged = ::updateStreamingAssistantText,
        )
        val shouldKeepProductCards = shouldKeepProductCardsForMessage(visibleMessage)
        val isComparisonStream = isComparisonFollowUpMessage(visibleMessage)
        preservingProductCardsForCurrentStream = shouldKeepProductCards
        preservingExistingProductCardsForCurrentStream = isComparisonStream
        isComparisonGenerationStream = isComparisonStream

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
                comparisonResults = state.comparisonResults,
                comparisonActions = state.comparisonActions,
                activeCheckoutDraft = state.activeCheckoutDraft,
                lastStreamRequest = streamRequest,
            )

            state.copy(
                messages = history + userMessage + assistantMessage,
                productCards = nextProductCards,
                productCardsAnchorMessageId = state.productCardsAnchorMessageId,
                comparisonResults = state.comparisonResults,
                comparisonActions = state.comparisonActions,
                isComparisonGenerating = false,
                historyConversations = historyConversations,
                composerText = if (clearComposer) "" else state.composerText,
                isSending = true,
                errorMessage = null,
                canRetry = false,
                voiceInput = VoiceInputUiState.Idle,
                selectedImage = if (clearSelectedImage) null else state.selectedImage,
            )
        }

        streamJob = viewModelScope.launch {
            val chatHistory = history.filterNot { chatMessage ->
                chatMessage.excludeFromChatHistory
            }
            chatRepository.streamChat(
                message = internalMessage,
                conversationId = conversationId,
                history = chatHistory,
                recentProductIds = recentProductIds,
                filters = filters,
                imageSearch = imageSearch,
            )
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
            is ChatStreamEvent.MessageDelta -> {
                enqueueAssistantDelta(event.text)
                markComparisonGeneratingIfNeeded()
            }
            is ChatStreamEvent.ProductCards -> {
                flushAssistantText()
                val incomingProductCards = event.items.toProductCardUiList(imageUrlResolver)
                latestStreamProductCards = incomingProductCards
                _uiState.update { state ->
                    val lastAssistantId = state.messages.lastOrNull { message ->
                        !message.fromUser
                    }?.id
                    val nextProductCards =
                        if (preservingExistingProductCardsForCurrentStream && state.productCards.isNotEmpty()) {
                            state.productCards
                        } else if (preservingProductCardsForCurrentStream && incomingProductCards.isEmpty()) {
                            state.productCards
                        } else {
                            incomingProductCards
                        }
                    state.copy(
                        productCards = nextProductCards,
                        productCardsAnchorMessageId = if (preservingProductCardsForCurrentStream) {
                            state.productCardsAnchorMessageId
                        } else {
                            lastAssistantId
                        },
                    )
                        .also(::saveCurrentSession)
                }
            }

            is ChatStreamEvent.ComparisonResult -> {
                flushAssistantText()
                isComparisonGenerationStream = false
                _uiState.update { state ->
                    val assistantMessage = state.messages.lastOrNull { message ->
                        !message.fromUser
                    }
                    val comparison = event.result.toComparisonUi(
                        products = state.comparisonProductCandidates(),
                        assistantText = assistantMessage?.text.orEmpty(),
                    ) ?: return@update state.copy(isComparisonGenerating = false)
                    val action = ChatComparisonActionUi(
                        comparisonId = comparison.id,
                        title = comparison.title,
                        summaryText = comparison.summaryText,
                        anchorMessageId = assistantMessage?.id.orEmpty(),
                    )

                    state.copy(
                        comparisonResults = state.comparisonResults.upsertComparison(comparison),
                        comparisonActions = state.comparisonActions.upsertComparisonAction(action),
                        isComparisonGenerating = false,
                    ).also(::saveCurrentSession)
                }
            }

            is ChatStreamEvent.CheckoutAction -> {
                applyCheckoutAction(event.action)
            }

            is ChatStreamEvent.Done -> {
                flushAssistantText()
                emitCartActionSideEffect(event.cartAction)
                val checkoutActionHandled = applyCheckoutAction(event.checkoutAction)
                _uiState.update { state ->
                    state.copy(
                        messages = state.messages.markAssistantDone(),
                        isComparisonGenerating = false,
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
                if (!checkoutActionHandled) {
                    emitCheckoutActionSideEffect(event.checkoutAction)
                }
                clearCompletedStreamState()
            }

            is ChatStreamEvent.Error -> {
                flushAssistantText()
                _uiState.update { state ->
                    state.copy(
                        messages = state.messages.markAssistantDone(),
                        isComparisonGenerating = false,
                        isSending = false,
                        errorMessage = event.toDisplayMessage(),
                        canRetry = event.retryable,
                    ).also(::saveCurrentSession)
                }
                clearCompletedStreamState()
            }

            is ChatStreamEvent.Unknown -> Unit
        }
    }

    private fun enqueueAssistantDelta(text: String) {
        assistantTextRevealer?.enqueue(text)
    }

    private fun markComparisonGeneratingIfNeeded() {
        if (!isComparisonGenerationStream) {
            return
        }

        _uiState.update { state ->
            if (state.isComparisonGenerating) {
                state
            } else {
                state.copy(isComparisonGenerating = true)
            }
        }
    }

    private fun updateStreamingAssistantText(text: String) {
        _uiState.update { state ->
            state.copy(
                messages = state.messages.replaceLastAssistant { assistant ->
                    assistant.copy(text = text)
                },
            )
        }
    }

    private fun flushAssistantText() {
        if (assistantTextRevealer?.flush() == true) {
            saveCurrentSession(_uiState.value)
        }
    }

    private fun ChatUiState.comparisonProductCandidates(): List<ProductCardUi> =
        (latestStreamProductCards + productCards + preStreamProductCards + comparisonResults.flatMap { comparison ->
            comparison.products
        }).dedupeProductCardsById()

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

    private fun emitCheckoutActionSideEffect(checkoutAction: ChatCheckoutActionDto?) {
        if (
            checkoutAction == null ||
            checkoutAction.status != CHECKOUT_ORDER_CREATED_STATUS ||
            checkoutAction.cartRefreshRequired != true
        ) {
            return
        }

        viewModelScope.launch {
            val orderNumber = checkoutAction.orderNumber ?: checkoutAction.order?.orderNumber
            val totalCents = checkoutAction.totalCents ?: checkoutAction.order?.totalCents
            _sideEffects.emit(ChatSideEffect.RefreshCart(orderNumber))
            _sideEffects.emit(
                ChatSideEffect.ShowMockOrderResult(
                    orderNumber = orderNumber,
                    totalCents = totalCents,
                ),
            )
        }
    }

    private fun applyCheckoutAction(checkoutAction: ChatCheckoutActionDto?): Boolean {
        if (checkoutAction == null) {
            return false
        }

        val actionKey = checkoutAction.dedupeKey()
        val isDuplicate = actionKey == lastCheckoutActionKey
        if (!isDuplicate) {
            lastCheckoutActionKey = actionKey
            _uiState.update { state ->
                val nextCheckoutDraft = if (checkoutAction.status == CHECKOUT_ORDER_CREATED_STATUS) {
                    null
                } else {
                    checkoutAction.toCheckoutDraftCardUi(
                        conversationId = currentSessionId.orEmpty(),
                        previous = state.activeCheckoutDraft,
                        imageUrlResolver = imageUrlResolver,
                    ) ?: state.activeCheckoutDraft
                }

                state.copy(activeCheckoutDraft = nextCheckoutDraft)
                    .also(::saveCurrentSession)
            }
            emitCheckoutActionSideEffect(checkoutAction)
        }

        return true
    }

    private fun markActiveCheckoutUpdating() {
        _uiState.update { state ->
            state.copy(
                activeCheckoutDraft = state.activeCheckoutDraft?.copy(
                    status = ChatCheckoutDraftStatusUi.Updating,
                ),
            )
        }
    }

    private fun ChatCheckoutDraftCardUi.canOpenCheckoutDraft(): Boolean =
        status == ChatCheckoutDraftStatusUi.Pending ||
            status == ChatCheckoutDraftStatusUi.Updated

    private fun applyFailure(error: Throwable) {
        flushAssistantText()
        _uiState.update { state ->
            state.copy(
                messages = state.messages.markAssistantDone(),
                isComparisonGenerating = false,
                isSending = false,
                errorMessage = error.toDisplayMessage(),
                canRetry = true,
            ).also(::saveCurrentSession)
        }
        clearCompletedStreamState()
    }

    private fun applyIncompleteStreamCompletion() {
        flushAssistantText()
        _uiState.update { state ->
            if (!state.isSending) {
                state
            } else {
                state.copy(
                    messages = state.messages.markAssistantDone(),
                    isComparisonGenerating = false,
                    isSending = false,
                    errorMessage = "导购连接已结束，请重试。",
                    canRetry = true,
                ).also(::saveCurrentSession)
            }
        }
        clearCompletedStreamState()
    }

    private fun cancelActiveStreamState() {
        streamJob?.cancel()
        streamJob = null
        assistantTextRevealer?.cancel()
        assistantTextRevealer = null
        clearStreamProductState()
    }

    private fun clearCompletedStreamState() {
        assistantTextRevealer?.cancel()
        assistantTextRevealer = null
        clearStreamProductState()
    }

    private fun clearStreamProductState() {
        preservingProductCardsForCurrentStream = false
        preservingExistingProductCardsForCurrentStream = false
        isComparisonGenerationStream = false
        latestStreamProductCards = emptyList()
        preStreamProductCards = emptyList()
    }

    private fun nextMessageId(prefix: String): String {
        messageSequence += 1
        return "$prefix-$messageSequence"
    }

    private fun removePendingVoiceMessage(
        nextVoiceState: VoiceInputUiState,
        errorMessage: String? = null,
    ) {
        val pendingId = voicePendingMessageId
        voicePendingMessageId = null
        _uiState.update { state ->
            state.copy(
                messages = state.messages.removeVoicePendingMessage(pendingId),
                voiceInput = nextVoiceState,
                errorMessage = errorMessage,
                canRetry = false,
            )
        }
    }

    companion object {
        private const val USER_MESSAGE_PREFIX = "user"
        private const val ASSISTANT_MESSAGE_PREFIX = "assistant"
        private const val MAX_HISTORY_TITLE_LENGTH = 24
        private const val VOICE_TRANSCRIBING_TEXT = "正在识别..."
        private const val IMAGE_SEARCH_DEFAULT_USER_MESSAGE = "用图片找相似商品"
        private const val IMAGE_SEARCH_NEEDS_CLEARER_INPUT_TEXT =
            "图片识别结果还不够明确，请换一张更清晰的商品图或补充文字。"
        private const val MOCK_CHECKOUT_START_MESSAGE = "帮我结算购物车"
        private const val CHECKOUT_CONFIRM_MESSAGE = "确认下单"
        private const val CHECKOUT_CANCEL_MESSAGE = "取消下单"
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

private fun List<com.shopmate.app.ui.model.ComparisonUi>.upsertComparison(
    comparison: com.shopmate.app.ui.model.ComparisonUi,
): List<com.shopmate.app.ui.model.ComparisonUi> =
    listOf(comparison) + filterNot { item -> item.id == comparison.id }

private fun List<ChatComparisonActionUi>.upsertComparisonAction(
    action: ChatComparisonActionUi,
): List<ChatComparisonActionUi> =
    listOf(action) + filterNot { item -> item.comparisonId == action.comparisonId }

private fun List<ProductCardUi>.dedupeProductCardsById(): List<ProductCardUi> {
    val seen = mutableSetOf<String>()

    return filter { product ->
        product.id.isNotBlank() && seen.add(product.id)
    }
}

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

private fun ChatCheckoutActionDto.dedupeKey(): String =
    listOf(
        draftId.orKeyPart(),
        orderId.orKeyPart(),
        status,
        order?.orderNumber.orKeyPart(),
        (totalCents ?: order?.totalCents)?.toString().orKeyPart(),
        type,
    ).joinToString("|")

private fun String?.orKeyPart(): String =
    this?.trim()?.takeIf { value -> value.isNotBlank() } ?: "_"

private fun ChatStreamEvent.Done.shouldShowNoMatchError(
    productCards: List<ProductCardUi>,
    messages: List<ChatMessageUi>,
): Boolean =
    productCards.isEmpty() &&
        fallbackUsed &&
        fallbackReason !in CLARIFICATION_FALLBACK_REASONS &&
        messages.lastOrNull { message -> !message.fromUser }?.text.isNullOrBlank()

private fun shouldKeepProductCardsForMessage(message: String): Boolean {
    val normalized = message.replace(Regex("\\s+"), "")
    val hasAddIntent = listOf("加", "加入", "放", "我要").any(normalized::contains)
    val hasCartContext = listOf("购物车", "车里", "进去", "加进去").any(normalized::contains)
    val hasTargetHint = Regex("第?\\d{1,2}|第?[一二两三四五六七八九十]|这个|这款|那款").containsMatchIn(normalized)
    val isAlsoOrdinalFollowUp = hasTargetHint && Regex("也|也是|一起|同样|也要").containsMatchIn(normalized)

    return isComparisonFollowUpMessage(message) ||
        isAlsoOrdinalFollowUp ||
        hasAddIntent && (hasCartContext || hasTargetHint)
}

private fun isComparisonFollowUpMessage(message: String): Boolean {
    val normalized = message.replace(Regex("\\s+"), "")
    val ordinalPairPattern = Regex(
        "第?[一二两三四五六七八九十0-9]{1,3}(个|款)?(和|跟|与|及|、|,|，|和第|跟第|与第|及第)" +
            "第?[一二两三四五六七八九十0-9]{1,3}(个|款)?",
    )
    val recentPairReferencePattern = Regex(
        "((前|前面|上面|刚才|刚刚|刚推荐|刚才推荐|刚刚推荐)(的|那|这)?" +
            "[两二2](个|款|件|种|台|支|瓶)?|(这|那)[俩两二2](个|款|件|种|台|支|瓶)?)",
    )
    val hasComparisonCue = listOf("对比", "比较", "哪个更", "哪款更", "怎么选", "差异", "区别")
        .any(normalized::contains)
    val hasRecentComparisonTarget = listOf(
        "这两款",
        "这两个",
        "这几款",
        "第一款",
        "第二款",
        "第一个",
        "第二个",
        "第三款",
        "第三个",
        "1和2",
        "2和3",
        "一和二",
        "二和三",
    ).any(normalized::contains) || recentPairReferencePattern.containsMatchIn(normalized)

    return hasComparisonCue && (hasRecentComparisonTarget || ordinalPairPattern.containsMatchIn(normalized))
}

private const val NEEDS_CLARIFICATION_REASON = "NEEDS_CLARIFICATION"
private const val COMPARISON_TARGET_CLARIFICATION_REASON = "COMPARISON_TARGET_CLARIFICATION"
private val CLARIFICATION_FALLBACK_REASONS = setOf(
    NEEDS_CLARIFICATION_REASON,
    COMPARISON_TARGET_CLARIFICATION_REASON,
)
private const val CART_ACTION_SUCCESS_STATUS = "success"
private const val CHECKOUT_ORDER_CREATED_STATUS = "order_created"
private val CART_REFRESH_ACTION_TYPES = setOf(
    "add",
    "remove",
    "update_quantity",
    "update_selected",
)
