package com.shopmate.app.data.chat

import com.shopmate.app.data.network.ShopMateJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

fun parseChatStreamEvent(
    eventName: String?,
    data: String,
    json: Json = ShopMateJson.instance,
): ChatStreamEvent {
    val normalizedEventName = eventName.orEmpty()
    return try {
        when (normalizedEventName) {
            "message_delta" -> {
                val payload = json.decodeFromString<MessageDeltaPayloadDto>(data)
                ChatStreamEvent.MessageDelta(
                    text = payload.text,
                    index = payload.index,
                )
            }

            "product_cards" -> {
                val payload = json.decodeFromString<ProductCardsPayloadDto>(data)
                ChatStreamEvent.ProductCards(items = payload.items)
            }

            "done" -> {
                val payload = json.decodeFromString<DonePayloadDto>(data)
                ChatStreamEvent.Done(
                    recommendedProductIds = payload.recommendedProductIds,
                    fallbackUsed = payload.fallbackUsed,
                    fallbackReason = payload.fallbackReason,
                    retrieval = payload.retrieval,
                )
            }

            "error" -> {
                val payload = json.decodeFromString<ErrorPayloadDto>(data)
                ChatStreamEvent.Error(
                    code = payload.code,
                    message = payload.message,
                    retryable = payload.retryable,
                )
            }

            else -> ChatStreamEvent.Unknown(
                eventName = normalizedEventName,
                rawData = data,
            )
        }
    } catch (_: IllegalArgumentException) {
        parseErrorEvent()
    } catch (_: SerializationException) {
        parseErrorEvent()
    }
}

private fun parseErrorEvent(): ChatStreamEvent.Error = ChatStreamEvent.Error(
    code = "ANDROID_STREAM_PARSE_ERROR",
    message = "回复数据格式异常，请稍后再试",
    retryable = true,
)

@Serializable
private data class MessageDeltaPayloadDto(
    val text: String,
    val index: Int,
)

@Serializable
private data class ProductCardsPayloadDto(
    val items: List<ChatProductCardDto> = emptyList(),
)

@Serializable
private data class DonePayloadDto(
    val recommendedProductIds: List<String> = emptyList(),
    val fallbackUsed: Boolean,
    val fallbackReason: String? = null,
    val retrieval: ChatRetrievalDto,
)

@Serializable
private data class ErrorPayloadDto(
    val code: String,
    val message: String,
    val retryable: Boolean,
)
