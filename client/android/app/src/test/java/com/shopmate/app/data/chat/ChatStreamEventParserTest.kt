package com.shopmate.app.data.chat

import kotlin.test.assertEquals
import kotlin.test.assertIs
import org.junit.Test

class ChatStreamEventParserTest {
    @Test
    fun parsesMessageDelta() {
        val event = parseChatStreamEvent(
            "message_delta",
            """{"text":"hello","index":1,"ignored":true}""",
        )

        val delta = assertIs<ChatStreamEvent.MessageDelta>(event)
        assertEquals("hello", delta.text)
        assertEquals(1, delta.index)
    }

    @Test
    fun parsesProductCards() {
        val event = parseChatStreamEvent(
            "product_cards",
            """
                {
                  "items": [
                    {
                      "id": "product_001",
                      "name": "通勤蓝牙耳机 A",
                      "brand": "示例品牌",
                      "category": "数码电子",
                      "subCategory": "耳机",
                      "priceCents": 19900,
                      "priceRangeCents": { "min": 17900, "max": 21900 },
                      "currency": "CNY",
                      "imagePath": "/images/product_001.png",
                      "ratingAvg": 4.6,
                      "tags": ["通勤", "蓝牙"],
                      "available": true
                    }
                  ]
                }
            """.trimIndent(),
        )

        val productCards = assertIs<ChatStreamEvent.ProductCards>(event)
        assertEquals("product_001", productCards.items.single().id)
        assertEquals(listOf("通勤", "蓝牙"), productCards.items.single().tags)
    }

    @Test
    fun parsesDone() {
        val event = parseChatStreamEvent(
            "done",
            """
                {
                  "recommendedProductIds": ["product_001"],
                  "fallbackUsed": false,
                  "retrieval": {
                    "candidateCount": 3,
                    "returnedProductIds": ["product_001"]
                  }
                }
            """.trimIndent(),
        )

        val done = assertIs<ChatStreamEvent.Done>(event)
        assertEquals(listOf("product_001"), done.recommendedProductIds)
        assertEquals(false, done.fallbackUsed)
        assertEquals(3, done.retrieval.candidateCount)
    }

    @Test
    fun parsesError() {
        val event = parseChatStreamEvent(
            "error",
            """{"code":"CHAT_STREAM_ERROR","message":"Chat stream failed.","retryable":true}""",
        )

        val error = assertIs<ChatStreamEvent.Error>(event)
        assertEquals("CHAT_STREAM_ERROR", error.code)
        assertEquals(true, error.retryable)
    }

    @Test
    fun returnsUnknownForUnknownEventName() {
        val event = parseChatStreamEvent("tool_result", """{"ok":true}""")

        val unknown = assertIs<ChatStreamEvent.Unknown>(event)
        assertEquals("tool_result", unknown.eventName)
    }

    @Test
    fun malformedJsonReturnsParseErrorEvent() {
        val event = parseChatStreamEvent("message_delta", """{"text":1}""")

        val error = assertIs<ChatStreamEvent.Error>(event)
        assertEquals("ANDROID_STREAM_PARSE_ERROR", error.code)
    }
}
