package com.shopmate.app.data.chat

import kotlinx.serialization.Serializable

@Serializable
data class ChatStreamRequestDto(
    val conversationId: String? = null,
    val message: String,
    val history: List<ChatHistoryMessageDto> = emptyList(),
    val recentProductIds: List<String> = emptyList(),
    val filters: ChatStreamFiltersDto? = null,
    val imageSearch: ChatImageSearchMetadataDto? = null,
    val topK: Int? = null,
    val maxRecommendedProducts: Int? = null,
)

@Serializable
data class ChatHistoryMessageDto(
    val role: String,
    val content: String,
)

@Serializable
data class ChatStreamFiltersDto(
    val category: String? = null,
    val subCategory: String? = null,
    val brand: String? = null,
    val minPriceCents: Int? = null,
    val maxPriceCents: Int? = null,
    val availableOnly: Boolean? = null,
    val tagsAny: List<String>? = null,
    val avoidTerms: List<String>? = null,
)

@Serializable
data class ChatImageSearchMetadataDto(
    val mode: String,
    val confidence: String,
    val visualQuery: String,
    val detectedCategory: String? = null,
)
