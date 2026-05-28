package com.shopmate.app.data.chat

import kotlinx.serialization.Serializable

@Serializable
data class ChatStreamRequestDto(
    val message: String,
    val history: List<ChatHistoryMessageDto> = emptyList(),
    val filters: ChatStreamFiltersDto? = null,
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
