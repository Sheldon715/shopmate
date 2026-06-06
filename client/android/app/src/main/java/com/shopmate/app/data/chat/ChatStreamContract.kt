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

@Serializable
data class ChatClarificationDto(
    val missingSlots: List<String> = emptyList(),
)

@Serializable
data class ChatCartActionDto(
    val type: String,
    val status: String,
    val itemId: String? = null,
    val productId: String? = null,
    val productName: String? = null,
    val quantity: Int? = null,
    val selected: Boolean? = null,
    val cartSummary: ChatCartSummaryDto? = null,
    val message: String? = null,
)

@Serializable
data class ChatCartSummaryDto(
    val totalCount: Int = 0,
    val selectedCount: Int = 0,
    val selectedTotalCents: Int = 0,
    val currency: String = "CNY",
)

@Serializable
data class ChatCheckoutActionDto(
    val type: String,
    val status: String,
    val draftId: String? = null,
    val orderId: String? = null,
    val orderNumber: String? = null,
    val selectedCount: Int? = null,
    val totalCents: Int? = null,
    val address: ChatCheckoutAddressDto? = null,
    val cartRefreshRequired: Boolean? = null,
)

@Serializable
data class ChatCheckoutAddressDto(
    val label: String,
    val recipient: String,
    val phoneMasked: String,
    val fullAddress: String,
)

@Serializable
data class ChatComparisonResultDto(
    val id: String,
    val title: String,
    val query: String,
    val productIds: List<String> = emptyList(),
    val dimensions: List<ChatComparisonDimensionDto> = emptyList(),
    val recommendedProductId: String? = null,
    val conclusion: String,
    val highlights: List<ChatComparisonHighlightDto> = emptyList(),
)

@Serializable
data class ChatComparisonDimensionDto(
    val id: String,
    val label: String,
    val cells: List<ChatComparisonCellDto> = emptyList(),
)

@Serializable
data class ChatComparisonCellDto(
    val productId: String,
    val value: String,
    val highlight: Boolean = false,
)

@Serializable
data class ChatComparisonHighlightDto(
    val productId: String,
    val label: String,
    val text: String,
)

sealed interface ChatStreamEvent {
    data class MessageDelta(val text: String, val index: Int) : ChatStreamEvent

    data class ProductCards(val items: List<ChatProductCardDto>) : ChatStreamEvent

    data class ComparisonResult(val result: ChatComparisonResultDto) : ChatStreamEvent

    data class Done(
        val recommendedProductIds: List<String>,
        val fallbackUsed: Boolean,
        val fallbackReason: String?,
        val clarification: ChatClarificationDto? = null,
        val retrieval: ChatRetrievalDto,
        val cartAction: ChatCartActionDto? = null,
        val checkoutAction: ChatCheckoutActionDto? = null,
    ) : ChatStreamEvent

    data class Error(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : ChatStreamEvent

    data class Unknown(val eventName: String, val rawData: String) : ChatStreamEvent
}
