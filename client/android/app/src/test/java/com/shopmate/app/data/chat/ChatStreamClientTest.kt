package com.shopmate.app.data.chat

import com.shopmate.app.data.network.ShopMateApiConfig
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.withTimeout
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test

class ChatStreamClientTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun streamChatPostsJsonAndEmitsSseEvents() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "text/event-stream")
                    .setBody(successStreamBody),
            )
            val client = OkHttpChatStreamClient(
                apiConfig = ShopMateApiConfig(server.url("/").toString()),
            )

            val events = withTimeout(5_000) {
                client.streamChat(
                    ChatStreamRequestDto(
                        conversationId = "local-chat-session-1",
                        message = "推荐耳机",
                        history = listOf(
                            ChatHistoryMessageDto("user", "oldest"),
                            ChatHistoryMessageDto("assistant", "one"),
                            ChatHistoryMessageDto("user", "two"),
                            ChatHistoryMessageDto("assistant", "three"),
                            ChatHistoryMessageDto("user", "four"),
                        ),
                    ),
                ).toList()
            }

            assertIs<ChatStreamEvent.MessageDelta>(events[0])
            assertIs<ChatStreamEvent.ProductCards>(events[1])
            assertIs<ChatStreamEvent.Done>(events[2])

            val recordedRequest = server.takeRequest()
            assertEquals("POST", recordedRequest.method)
            assertEquals("/api/chat/stream", recordedRequest.path)
            assertEquals("text/event-stream", recordedRequest.getHeader("Accept"))
            assertTrue(
                assertNotNull(recordedRequest.getHeader("Content-Type"))
                    .startsWith("application/json"),
            )

            val body = recordedRequest.body.readUtf8()
            assertTrue(body.contains(""""conversationId":"local-chat-session-1""""))
            assertTrue(body.contains(""""message":"推荐耳机""""))
            assertTrue(body.contains(""""content":"four""""))
            assertTrue(!body.contains(""""content":"oldest""""))
            assertTrue(!body.contains(""""filters""""))
            assertTrue(!body.contains(""""imageSearch""""))
        }
    }

    @Test
    fun streamChatPostsFiltersAndImageSearchMetadata() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "text/event-stream")
                    .setBody(successStreamBody),
            )
            val client = OkHttpChatStreamClient(
                apiConfig = ShopMateApiConfig(server.url("/").toString()),
            )

            withTimeout(5_000) {
                client.streamChat(
                    ChatStreamRequestDto(
                        message = "图片找货：黑色真无线蓝牙耳机",
                        filters = ChatStreamFiltersDto(category = "数码电子"),
                        imageSearch = ChatImageSearchMetadataDto(
                            mode = "vlm_first",
                            confidence = "medium",
                            visualQuery = "黑色真无线蓝牙耳机",
                            detectedCategory = "数码电子",
                        ),
                    ),
                ).toList()
            }

            val body = server.takeRequest().body.readUtf8()
            assertTrue(body.contains(""""filters":{"category":"数码电子"}"""))
            assertTrue(body.contains(""""imageSearch":{"mode":"vlm_first""""))
            assertTrue(body.contains(""""confidence":"medium""""))
            assertTrue(body.contains(""""visualQuery":"黑色真无线蓝牙耳机""""))
            assertTrue(body.contains(""""detectedCategory":"数码电子""""))
        }
    }

    @Test
    fun streamChatEmitsErrorEventFromSse() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "text/event-stream")
                    .setBody(errorStreamBody),
            )
            val client = OkHttpChatStreamClient(
                apiConfig = ShopMateApiConfig(server.url("/").toString()),
            )

            val events = withTimeout(5_000) {
                client.streamChat(ChatStreamRequestDto(message = "hello")).toList()
            }

            val error = assertIs<ChatStreamEvent.Error>(events.single())
            assertEquals("CHAT_STREAM_ERROR", error.code)
        }
    }

    @Test
    fun streamChatCanBeCancelledByCollector() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "text/event-stream")
                    .setBody(successStreamBody),
            )
            val client = OkHttpChatStreamClient(
                apiConfig = ShopMateApiConfig(server.url("/").toString()),
            )

            val events = withTimeout(5_000) {
                client.streamChat(ChatStreamRequestDto(message = "hello"))
                    .take(1)
                    .toList()
            }

            assertIs<ChatStreamEvent.MessageDelta>(events.single())
        }
    }

    private val successStreamBody = """
        event: message_delta
        data: {"text":"hello","index":0}

        event: product_cards
        data: {"items":[{"id":"product_001","name":"通勤蓝牙耳机 A","brand":"示例品牌","category":"数码电子","subCategory":"耳机","priceCents":19900,"priceRangeCents":{"min":17900,"max":21900},"currency":"CNY","imagePath":"/images/product_001.png","ratingAvg":4.6,"tags":["通勤","蓝牙"],"available":true}]}

        event: done
        data: {"recommendedProductIds":["product_001"],"fallbackUsed":false,"retrieval":{"candidateCount":3,"returnedProductIds":["product_001"]}}

    """.trimIndent() + "\n\n"

    private val errorStreamBody = """
        event: error
        data: {"code":"CHAT_STREAM_ERROR","message":"Chat stream failed.","retryable":true}

    """.trimIndent() + "\n\n"
}
