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
    fun parsesRealProductCardsPayloadFromBackend() {
        val event = parseChatStreamEvent(
            "product_cards",
            """
                {
                  "items": [
                    {
                      "id": "p_food_024",
                      "name": "元气森林 苏打气泡水 ×12 0糖0脂0卡",
                      "brand": "元气森林",
                      "category": "食品饮料",
                      "subCategory": "碳酸饮料",
                      "priceCents": 5200,
                      "priceRangeCents": { "min": 4800, "max": 10000 },
                      "currency": "CNY",
                      "imagePath": "food/images/p_food_024_main.jpg",
                      "ratingAvg": 4,
                      "tags": ["食品饮料", "碳酸饮料", "主图"],
                      "available": true
                    }
                  ]
                }
            """.trimIndent(),
        )

        val productCards = assertIs<ChatStreamEvent.ProductCards>(event)
        assertEquals("p_food_024", productCards.items.single().id)
        assertEquals(4.0, productCards.items.single().ratingAvg)
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
    fun parsesDoneCartAction() {
        val event = parseChatStreamEvent(
            "done",
            """
                {
                  "recommendedProductIds": ["product_001"],
                  "fallbackUsed": false,
                  "retrieval": {
                    "candidateCount": 1,
                    "returnedProductIds": ["product_001"]
                  },
                  "cartAction": {
                    "type": "add",
                    "status": "success",
                    "productId": "product_001",
                    "productName": "通勤蓝牙耳机 A",
                    "quantity": 1,
                    "message": "已加入购物车"
                  }
                }
            """.trimIndent(),
        )

        val done = assertIs<ChatStreamEvent.Done>(event)
        assertEquals("add", done.cartAction?.type)
        assertEquals("success", done.cartAction?.status)
        assertEquals("product_001", done.cartAction?.productId)
        assertEquals("已加入购物车", done.cartAction?.message)
    }

    @Test
    fun parsesDoneCartManagementActionWithoutMessage() {
        val event = parseChatStreamEvent(
            "done",
            """
                {
                  "recommendedProductIds": [],
                  "fallbackUsed": false,
                  "retrieval": {
                    "candidateCount": 2,
                    "returnedProductIds": ["product_001", "product_002"]
                  },
                  "cartAction": {
                    "type": "remove",
                    "status": "success",
                    "itemId": "item_002",
                    "productId": "product_002",
                    "productName": "通勤蓝牙耳机 B",
                    "cartSummary": {
                      "totalCount": 1,
                      "selectedCount": 1,
                      "selectedTotalCents": 19900,
                      "currency": "CNY"
                    }
                  }
                }
            """.trimIndent(),
        )

        val done = assertIs<ChatStreamEvent.Done>(event)
        assertEquals("remove", done.cartAction?.type)
        assertEquals("success", done.cartAction?.status)
        assertEquals("item_002", done.cartAction?.itemId)
        assertEquals(null, done.cartAction?.message)
        assertEquals(19900, done.cartAction?.cartSummary?.selectedTotalCents)
    }

    @Test
    fun parsesClarificationDone() {
        val event = parseChatStreamEvent(
            "done",
            """
                {
                  "recommendedProductIds": [],
                  "fallbackUsed": true,
                  "fallbackReason": "NEEDS_CLARIFICATION",
                  "clarification": {
                    "missingSlots": ["budget", "priority"]
                  },
                  "retrieval": {
                    "candidateCount": 0,
                    "returnedProductIds": []
                  }
                }
            """.trimIndent(),
        )

        val done = assertIs<ChatStreamEvent.Done>(event)
        assertEquals("NEEDS_CLARIFICATION", done.fallbackReason)
        assertEquals(listOf("budget", "priority"), done.clarification?.missingSlots)
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
