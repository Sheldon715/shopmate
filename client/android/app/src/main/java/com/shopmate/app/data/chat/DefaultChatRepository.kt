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
        filters: ChatStreamFiltersDto?,
        imageSearch: ChatImageSearchMetadataDto?,
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
                filters = filters?.normalizedOrNull(),
                imageSearch = imageSearch?.normalizedOrNull(),
            ),
        )

    companion object {
        private const val USER_ROLE = "user"
        private const val ASSISTANT_ROLE = "assistant"
        private const val MAX_HISTORY_MESSAGES = 4
    }
}

private fun ChatStreamFiltersDto.normalizedOrNull(): ChatStreamFiltersDto? {
    val normalizedTagsAny = tagsAny.normalizedStringListOrNull()
    val normalizedAvoidTerms = avoidTerms.normalizedStringListOrNull()
    val normalized = copy(
        category = category.normalizedStringOrNull(),
        subCategory = subCategory.normalizedStringOrNull(),
        brand = brand.normalizedStringOrNull(),
        tagsAny = normalizedTagsAny,
        avoidTerms = normalizedAvoidTerms,
    )

    return if (
        normalized.category == null &&
        normalized.subCategory == null &&
        normalized.brand == null &&
        normalized.minPriceCents == null &&
        normalized.maxPriceCents == null &&
        normalized.availableOnly == null &&
        normalized.tagsAny == null &&
        normalized.avoidTerms == null
    ) {
        null
    } else {
        normalized
    }
}

private fun ChatImageSearchMetadataDto.normalizedOrNull(): ChatImageSearchMetadataDto? {
    val normalizedMode = mode.trim()
    val normalizedConfidence = confidence.trim()
    val normalizedVisualQuery = visualQuery.normalizedStringOrNull() ?: return null

    return copy(
        mode = normalizedMode,
        confidence = normalizedConfidence,
        visualQuery = normalizedVisualQuery,
        detectedCategory = detectedCategory.normalizedStringOrNull(),
    )
}

private fun String?.normalizedStringOrNull(): String? =
    this?.trim()?.takeIf(String::isNotBlank)

private fun List<String>?.normalizedStringListOrNull(): List<String>? =
    this
        ?.map(String::trim)
        ?.filter(String::isNotBlank)
        ?.distinct()
        ?.takeIf { items -> items.isNotEmpty() }
