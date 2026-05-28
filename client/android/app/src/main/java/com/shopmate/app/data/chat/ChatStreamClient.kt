package com.shopmate.app.data.chat

import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateHttpClient
import com.shopmate.app.data.network.ShopMateJson
import com.shopmate.app.data.network.ShopMateNetworkError
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

interface ChatStreamClient {
    fun streamChat(request: ChatStreamRequestDto): Flow<ChatStreamEvent>
}

class OkHttpChatStreamClient(
    apiConfig: ShopMateApiConfig = ShopMateApiConfig.default(),
    private val okHttpClient: OkHttpClient = ShopMateHttpClient.create(),
    private val json: Json = ShopMateJson.instance,
) : ChatStreamClient {
    private val streamUrl = apiConfig.resolve(CHAT_STREAM_PATH)
    private val eventSourceFactory = EventSources.createFactory(okHttpClient)

    override fun streamChat(request: ChatStreamRequestDto): Flow<ChatStreamEvent> = callbackFlow {
        val requestBodyJson = try {
            json.encodeToString(
                request.copy(history = request.history.takeLast(MAX_HISTORY_MESSAGES)),
            )
        } catch (error: SerializationException) {
            close(ShopMateNetworkError.RequestSerializationFailed(error))
            return@callbackFlow
        }

        val httpRequest = Request.Builder()
            .url(streamUrl)
            .post(requestBodyJson.toRequestBody(JSON_MEDIA_TYPE))
            .header("Content-Type", JSON_CONTENT_TYPE)
            .header("Accept", SSE_ACCEPT)
            .build()

        var terminalEventReceived = false
        val listener = object : EventSourceListener() {
            override fun onEvent(
                eventSource: EventSource,
                id: String?,
                type: String?,
                data: String,
            ) {
                val event = parseChatStreamEvent(type, data, json)
                trySend(event)

                if (event is ChatStreamEvent.Done || event is ChatStreamEvent.Error) {
                    terminalEventReceived = true
                    eventSource.cancel()
                    close()
                }
            }

            override fun onClosed(eventSource: EventSource) {
                close()
            }

            override fun onFailure(
                eventSource: EventSource,
                t: Throwable?,
                response: Response?,
            ) {
                if (terminalEventReceived) {
                    close()
                    return
                }

                val error = if (response != null && !response.isSuccessful) {
                    ShopMateNetworkError.HttpNonSuccess(response.code)
                } else {
                    ShopMateNetworkError.StreamConnectionFailed(t)
                }

                trySend(
                    ChatStreamEvent.Error(
                        code = "CHAT_STREAM_CONNECTION_FAILED",
                        message = "导购暂时无法回复，请稍后再试",
                        retryable = true,
                    ),
                )
                close(error)
            }
        }

        val eventSource = eventSourceFactory.newEventSource(httpRequest, listener)
        awaitClose {
            eventSource.cancel()
        }
    }

    companion object {
        private const val CHAT_STREAM_PATH = "api/chat/stream"
        private const val JSON_CONTENT_TYPE = "application/json"
        private const val SSE_ACCEPT = "text/event-stream"
        private const val MAX_HISTORY_MESSAGES = 4
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}
