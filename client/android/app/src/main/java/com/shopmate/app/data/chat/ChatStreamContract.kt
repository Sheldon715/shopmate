package com.shopmate.app.data.chat

import kotlinx.serialization.Serializable

@Serializable
data class ChatProductCardDto(
    val id: String,
    val name: String,
    val brand: String,
    val category: String,
    val subCategory: String? = null,
    val priceCents: Int,
    val priceRangeCents: PriceRangeCentsDto,
    val currency: String,
    val imagePath: String? = null,
    val ratingAvg: Double? = null,
    val tags: List<String> = emptyList(),
    val available: Boolean,
)

@Serializable
data class PriceRangeCentsDto(
    val min: Int,
    val max: Int,
)

@Serializable
data class ChatRetrievalDto(
    val candidateCount: Int,
    val returnedProductIds: List<String> = emptyList(),
)

sealed interface ChatStreamEvent {
    data class MessageDelta(val text: String, val index: Int) : ChatStreamEvent

    data class ProductCards(val items: List<ChatProductCardDto>) : ChatStreamEvent

    data class Done(
        val recommendedProductIds: List<String>,
        val fallbackUsed: Boolean,
        val fallbackReason: String?,
        val retrieval: ChatRetrievalDto,
    ) : ChatStreamEvent

    data class Error(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : ChatStreamEvent

    data class Unknown(val eventName: String, val rawData: String) : ChatStreamEvent
}
