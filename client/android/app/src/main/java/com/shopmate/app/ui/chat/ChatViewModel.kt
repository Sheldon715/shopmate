package com.shopmate.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.chat.ChatStreamEvent
import com.shopmate.app.data.chat.toProductCardUiList
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class ChatViewModel(
    private val chatRepository: ChatRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private var streamJob: Job? = null
    private var lastSentMessage: String? = null
    private var messageSequence = 0

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

    private fun startStream(
        message: String,
        history: List<ChatMessageUi>,
        clearComposer: Boolean,
    ) {
        streamJob?.cancel()
        lastSentMessage = message

        val userMessage = ChatMessageUi(
            id = nextMessageId(USER_MESSAGE_PREFIX),
            text = message,
            fromUser = true,
        )
        val assistantMessage = ChatMessageUi(
            id = nextMessageId(ASSISTANT_MESSAGE_PREFIX),
            text = "",
            fromUser = false,
            isStreaming = true,
        )

        _uiState.update { state ->
            state.copy(
                messages = history + userMessage + assistantMessage,
                productCards = emptyList(),
                composerText = if (clearComposer) "" else state.composerText,
                isSending = true,
                errorMessage = null,
                canRetry = false,
            )
        }

        streamJob = viewModelScope.launch {
            chatRepository.streamChat(message, history)
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
                    state.copy(productCards = event.items.toProductCardUiList())
                }
            }

            is ChatStreamEvent.Done -> {
                _uiState.update { state ->
                    state.copy(
                        messages = state.messages.markAssistantDone(),
                        isSending = false,
                        errorMessage = if (state.productCards.isEmpty() && event.fallbackUsed) {
                            "当前商品库暂时没有完全匹配的商品，可以调整需求再试试。"
                        } else {
                            null
                        },
                        canRetry = false,
                    )
                }
            }

            is ChatStreamEvent.Error -> {
                _uiState.update { state ->
                    state.copy(
                        messages = state.messages.markAssistantDone(),
                        isSending = false,
                        errorMessage = event.toDisplayMessage(),
                        canRetry = event.retryable,
                    )
                }
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
            )
        }
    }

    private fun applyFailure(error: Throwable) {
        _uiState.update { state ->
            state.copy(
                messages = state.messages.markAssistantDone(),
                isSending = false,
                errorMessage = error.toDisplayMessage(),
                canRetry = true,
            )
        }
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
                )
            }
        }
    }

    private fun nextMessageId(prefix: String): String {
        messageSequence += 1
        return "$prefix-$messageSequence"
    }

    companion object {
        private const val USER_MESSAGE_PREFIX = "user"
        private const val ASSISTANT_MESSAGE_PREFIX = "assistant"
    }
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
