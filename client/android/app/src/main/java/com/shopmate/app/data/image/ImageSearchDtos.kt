package com.shopmate.app.data.image

import com.shopmate.app.data.chat.ChatImageSearchMetadataDto
import com.shopmate.app.data.chat.ChatStreamFiltersDto
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ImageSearchApiResponseDto<T>(
    val success: Boolean,
    val data: T? = null,
    val error: ImageSearchApiErrorDto? = null,
)

@Serializable
data class ImageSearchApiErrorDto(
    val code: String,
    val message: String,
)

@Serializable
data class ImageSearchInterpretResultDto(
    val visualIntent: VisualIntentDto,
    val chatMessage: String? = null,
    val filters: ImageSearchFiltersDto? = null,
    val imageSearchMode: String,
)

@Serializable
data class VisualIntentDto(
    @SerialName("is_product_search")
    val isProductSearch: Boolean,
    @SerialName("detected_category")
    val detectedCategory: String? = null,
    @SerialName("detected_brand_text")
    val detectedBrandText: String? = null,
    @SerialName("visual_attributes")
    val visualAttributes: List<String> = emptyList(),
    val colors: List<String> = emptyList(),
    val materials: List<String> = emptyList(),
    @SerialName("use_case")
    val useCase: String? = null,
    val constraints: List<String> = emptyList(),
    @SerialName("search_query")
    val searchQuery: String,
    val confidence: String,
    @SerialName("clarification_question")
    val clarificationQuestion: String? = null,
)

@Serializable
data class ImageSearchFiltersDto(
    val category: String? = null,
)

data class ImageSearchInterpretResult(
    val visualIntent: VisualIntentDto,
    val chatMessage: String?,
    val filters: ChatStreamFiltersDto?,
    val imageSearchMetadata: ChatImageSearchMetadataDto?,
)

fun ImageSearchInterpretResultDto.toDomain(): ImageSearchInterpretResult =
    ImageSearchInterpretResult(
        visualIntent = visualIntent,
        chatMessage = chatMessage?.trim()?.takeIf { value -> value.isNotBlank() },
        filters = filters?.category
            ?.trim()
            ?.takeIf { category -> category.isNotBlank() }
            ?.let { category -> ChatStreamFiltersDto(category = category) },
        imageSearchMetadata = visualIntent.searchQuery
            .trim()
            .takeIf { query -> query.isNotBlank() }
            ?.let { query ->
                ChatImageSearchMetadataDto(
                    mode = imageSearchMode.trim().ifBlank { "vlm_first" },
                    confidence = visualIntent.confidence.trim().ifBlank { "low" },
                    visualQuery = query,
                    detectedCategory = visualIntent.detectedCategory
                        ?.trim()
                        ?.takeIf { category -> category.isNotBlank() },
                )
            },
    )
