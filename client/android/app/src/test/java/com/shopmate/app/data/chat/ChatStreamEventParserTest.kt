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
    fun parsesDoneWithImageSearchMetadataAsOptionalUnknownRetrievalField() {
        val event = parseChatStreamEvent(
            "done",
            """
                {
                  "recommendedProductIds": ["product_001"],
                  "fallbackUsed": false,
                  "retrieval": {
                    "candidateCount": 3,
                    "returnedProductIds": ["product_001"],
                    "imageSearch": {
                      "mode": "vlm_first",
                      "confidence": "medium",
                      "visualQuery": "黑色真无线蓝牙耳机",
                      "detectedCategory": "数码电子"
                    }
                  }
                }
            """.trimIndent(),
        )

        val done = assertIs<ChatStreamEvent.Done>(event)
        assertEquals(listOf("product_001"), done.recommendedProductIds)
        assertEquals(false, done.fallbackUsed)
        assertEquals(3, done.retrieval.candidateCount)
        assertEquals(listOf("product_001"), done.retrieval.returnedProductIds)
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
    fun parsesDoneCheckoutAction() {
        val event = parseChatStreamEvent(
            "done",
            """
                {
                  "recommendedProductIds": [],
                  "fallbackUsed": false,
                  "retrieval": {
                    "candidateCount": 1,
                    "returnedProductIds": []
                  },
                  "checkoutAction": {
                    "type": "confirm_checkout",
                    "status": "order_created",
                    "draftId": "draft_1",
                    "orderId": "order_1",
                    "orderNumber": "MOCK-20260606000000-TEST",
                    "selectedCount": 2,
                    "totalCents": 39900,
                    "address": {
                      "label": "本次模拟地址",
                      "recipient": "ShopMate Demo 用户",
                      "phoneMasked": "138****0000",
                      "fullAddress": "UNSW 学生宿舍"
                    },
                    "cartRefreshRequired": true
                  }
                }
            """.trimIndent(),
        )

        val done = assertIs<ChatStreamEvent.Done>(event)
        assertEquals("confirm_checkout", done.checkoutAction?.type)
        assertEquals("order_created", done.checkoutAction?.status)
        assertEquals("MOCK-20260606000000-TEST", done.checkoutAction?.orderNumber)
        assertEquals(39900, done.checkoutAction?.totalCents)
        assertEquals("UNSW 学生宿舍", done.checkoutAction?.address?.fullAddress)
        assertEquals(true, done.checkoutAction?.cartRefreshRequired)
    }

    @Test
    fun parsesCheckoutActionEvent() {
        val event = parseChatStreamEvent(
            "checkout_action",
            """
                {
                  "type": "start_checkout",
                  "status": "draft_created",
                  "draftId": "draft_1",
                  "selectedCount": 1,
                  "totalCents": 19900,
                  "changedFields": [],
                  "draft": {
                    "id": "draft_1",
                    "status": "pending",
                    "address": {
                      "label": "本次地址",
                      "recipient": "ShopMate Demo 用户",
                      "phoneMasked": "138****0000",
                      "fullAddress": "UNSW Village 6 栋 302"
                    },
                    "items": [],
                    "summary": {
                      "itemCount": 1,
                      "selectedCount": 1,
                      "subtotalCents": 19900,
                      "shippingFeeCents": 0,
                      "totalCents": 19900,
                      "currency": "CNY"
                    },
                    "selectedDeliveryMethod": {
                      "type": "standard",
                      "label": "标准配送",
                      "feeCents": 0
                    },
                    "selectedPaymentMethod": {
                      "type": "wechat",
                      "label": "微信支付",
                      "status": "not_charged"
                    },
                    "deliveryOptions": [],
                    "paymentOptions": [],
                    "expiresAt": "2026-06-06T00:15:00.000Z"
                  }
                }
            """.trimIndent(),
        )

        val checkoutAction = assertIs<ChatStreamEvent.CheckoutAction>(event).action
        assertEquals("start_checkout", checkoutAction.type)
        assertEquals("draft_created", checkoutAction.status)
        assertEquals("draft_1", checkoutAction.draftId)
        assertEquals(19900, checkoutAction.totalCents)
        assertEquals("UNSW Village 6 栋 302", checkoutAction.draft?.address?.fullAddress)
    }

    @Test
    fun parsesDoneCheckoutActionDraftSnapshot() {
        val event = parseChatStreamEvent(
            "done",
            """
                {
                  "recommendedProductIds": [],
                  "fallbackUsed": false,
                  "retrieval": {
                    "candidateCount": 1,
                    "returnedProductIds": []
                  },
                  "checkoutAction": {
                    "type": "update_checkout",
                    "status": "draft_updated",
                    "draftId": "draft_1",
                    "changedFields": ["shipping", "delivery"],
                    "draft": {
                      "id": "draft_1",
                      "status": "needs_confirmation",
                      "address": {
                        "label": "本次地址",
                        "recipient": "ShopMate Demo 用户",
                        "phoneMasked": "138****0000",
                        "fullAddress": "UNSW Village 6 栋 302"
                      },
                      "items": [
                        {
                          "cartItemId": "cart-item-1",
                          "productId": "product_001",
                          "productName": "通勤蓝牙耳机",
                          "brand": "示例品牌",
                          "category": "数码电子",
                          "unitPriceCents": 19900,
                          "quantity": 1,
                          "subtotalCents": 19900,
                          "imagePath": "electronics/images/product_001.jpg"
                        }
                      ],
                      "summary": {
                        "itemCount": 1,
                        "selectedCount": 1,
                        "subtotalCents": 19900,
                        "shippingFeeCents": 1200,
                        "totalCents": 21100,
                        "currency": "CNY"
                      },
                      "selectedDeliveryMethod": {
                        "type": "express",
                        "label": "加急配送",
                        "feeCents": 1200,
                        "etaText": "预计明天送达"
                      },
                      "selectedPaymentMethod": {
                        "type": "alipay",
                        "label": "支付宝",
                        "status": "available"
                      },
                      "deliveryOptions": [],
                      "paymentOptions": [],
                      "expiresAt": "2026-06-06T00:15:00.000Z"
                    },
                    "order": {
                      "id": "order_1",
                      "orderNumber": "SM-20260606-TEST",
                      "totalCents": 21100
                    },
                    "cartRefreshRequired": false
                  }
                }
            """.trimIndent(),
        )

        val checkoutAction = assertIs<ChatStreamEvent.Done>(event).checkoutAction
        assertEquals("draft_updated", checkoutAction?.status)
        assertEquals(listOf("shipping", "delivery"), checkoutAction?.changedFields)
        assertEquals("draft_1", checkoutAction?.draft?.id)
        assertEquals("UNSW Village 6 栋 302", checkoutAction?.draft?.address?.fullAddress)
        assertEquals("通勤蓝牙耳机", checkoutAction?.draft?.items?.single()?.productName)
        assertEquals(21100, checkoutAction?.draft?.summary?.totalCents)
        assertEquals("express", checkoutAction?.draft?.selectedDeliveryMethod?.type)
        assertEquals("alipay", checkoutAction?.draft?.selectedPaymentMethod?.type)
        assertEquals("SM-20260606-TEST", checkoutAction?.order?.orderNumber)
    }

    @Test
    fun parsesComparisonResult() {
        val event = parseChatStreamEvent(
            "comparison_result",
            """
                {
                  "id": "comparison-demo-1",
                  "title": "防晒霜对比",
                  "query": "帮我对比这两款",
                  "productIds": ["product_001", "product_002"],
                  "dimensions": [
                    {
                      "id": "skin_feel",
                      "label": "肤感",
                      "cells": [
                        {
                          "productId": "product_001",
                          "value": "更轻薄，适合通勤。",
                          "highlight": true
                        },
                        {
                          "productId": "product_002",
                          "value": "成膜更强，户外稳定性更好。"
                        }
                      ]
                    }
                  ],
                  "recommendedProductId": "product_001",
                  "conclusion": "日常通勤优先看第一款。",
                  "highlights": [
                    {
                      "productId": "product_001",
                      "label": "通勤肤感",
                      "text": "更轻薄。"
                    }
                  ]
                }
            """.trimIndent(),
        )

        val comparison = assertIs<ChatStreamEvent.ComparisonResult>(event).result
        assertEquals("comparison-demo-1", comparison.id)
        assertEquals(listOf("product_001", "product_002"), comparison.productIds)
        assertEquals("skin_feel", comparison.dimensions.single().id)
        assertEquals(true, comparison.dimensions.single().cells.first().highlight)
        assertEquals("product_001", comparison.recommendedProductId)
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
