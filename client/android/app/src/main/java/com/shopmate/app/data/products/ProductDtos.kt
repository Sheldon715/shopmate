package com.shopmate.app.data.products

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class ApiResponseDto<T>(
    val success: Boolean,
    val data: T? = null,
    val error: ApiErrorDto? = null,
)

@Serializable
data class ApiErrorDto(
    val code: String,
    val message: String,
)

@Serializable
data class ProductDetailDto(
    val id: String,
    val name: String,
    val brand: String? = null,
    val category: String? = null,
    val subCategory: String? = null,
    val priceCents: Int = 0,
    val priceRangeCents: PriceRangeCentsDto? = null,
    val currency: String = "CNY",
    val imagePath: String? = null,
    val ratingAvg: Double? = null,
    val tags: List<String> = emptyList(),
    val available: Boolean = false,
    val recommendationReason: String? = null,
    val marketingDescription: String? = null,
    val skus: List<ProductSkuDto> = emptyList(),
    val attributes: Map<String, List<String>> = emptyMap(),
    val pros: List<String> = emptyList(),
    val cons: List<String> = emptyList(),
    val recommendWhen: List<String> = emptyList(),
    val avoidWhen: List<String> = emptyList(),
    val reviewSummary: JsonElement? = null,
    val officialFaq: JsonElement? = null,
    val contentBlocks: JsonElement? = null,
)

@Serializable
data class ProductSkuDto(
    val id: String? = null,
    val skuId: String? = null,
    val name: String? = null,
    val optionName: String? = null,
    val priceCents: Int? = null,
    val available: Boolean? = null,
    val attributes: Map<String, String> = emptyMap(),
)

@Serializable
data class PriceRangeCentsDto(
    val min: Int,
    val max: Int,
)
