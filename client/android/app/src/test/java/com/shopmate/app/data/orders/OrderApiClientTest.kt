package com.shopmate.app.data.orders

import com.shopmate.app.data.network.ShopMateApiConfig
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test

class OrderApiClientTest {
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
    fun createMockCheckoutParsesExpandedDraft() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .addHeader("Content-Type", "application/json")
                .setBody(draftResponseBody),
        )
        val client = orderApiClient()

        val response = client.createMockCheckout("cart-button-checkout")

        assertTrue(response.success)
        assertEquals("draft-1", response.data?.draft?.id)
        assertEquals("cart-item-1", response.data?.draft?.items?.single()?.cartItemId)
        assertEquals("standard", response.data?.draft?.deliveryOptions?.first()?.type)
        assertEquals("wechat", response.data?.draft?.paymentOptions?.first()?.type)

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/orders/mock-checkout", request.path)
    }

    @Test
    fun createProductCheckoutPostsProductId() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .addHeader("Content-Type", "application/json")
                .setBody(draftResponseBody),
        )
        val client = orderApiClient()

        val response = client.createProductCheckout(
            conversationId = "cart-button-checkout",
            productId = "product_001",
        )

        assertTrue(response.success)
        assertEquals("draft-1", response.data?.draft?.id)

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/orders/mock-checkout/product", request.path)
        assertEquals(
            """{"conversationId":"cart-button-checkout","productId":"product_001"}""",
            request.body.readUtf8(),
        )
    }

    @Test
    fun confirmMockCheckoutPostsEditedSnapshot() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .addHeader("Content-Type", "application/json")
                .setBody(confirmResponseBody),
        )
        val client = orderApiClient()

        val response = client.confirmMockCheckout(
            MockCheckoutConfirmRequestDto(
                conversationId = "cart-button-checkout",
                draftId = "draft-1",
                shipping = MockCheckoutShippingInputDto(
                    recipient = "张三",
                    phone = "13800000000",
                    fullAddress = "ShopMate 演示公寓",
                ),
                deliveryMethodType = "express",
                paymentMethodType = "alipay",
            )
        )

        assertTrue(response.success)
        assertEquals("order-1", response.data?.order?.id)
        assertEquals("express", response.data?.order?.deliveryMethod?.type)
        assertEquals("alipay", response.data?.order?.paymentMethod?.type)

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/orders/mock-checkout/confirm", request.path)
        assertEquals(
            """{"conversationId":"cart-button-checkout","draftId":"draft-1","shipping":{"recipient":"张三","phone":"13800000000","fullAddress":"ShopMate 演示公寓"},"deliveryMethodType":"express","paymentMethodType":"alipay"}""",
            request.body.readUtf8(),
        )
    }

    private fun orderApiClient(): OkHttpOrderApiClient =
        OkHttpOrderApiClient(
            apiConfig = ShopMateApiConfig(server.url("/").toString()),
        )

    private val draftResponseBody = """
        {
          "success": true,
          "data": {
            "draft": {
              "id": "draft-1",
              "conversationId": "cart-button-checkout",
              "address": {
                "label": "默认地址",
                "recipient": "ShopMate 用户",
                "phoneMasked": "138****0000",
                "fullAddress": "ShopMate 收货点"
              },
              "summary": {
                "itemCount": 1,
                "selectedCount": 2,
                "subtotalCents": 39800,
                "shippingFeeCents": 0,
                "totalCents": 39800,
                "currency": "CNY"
              },
              "items": [
                {
                  "cartItemId": "cart-item-1",
                  "productId": "product_001",
                  "productName": "通勤蓝牙耳机",
                  "brand": "示例品牌",
                  "category": "数码电子",
                  "unitPriceCents": 19900,
                  "quantity": 2,
                  "subtotalCents": 39800,
                  "imagePath": "/images/product_001.png"
                }
              ],
              "deliveryOptions": [
                {
                  "type": "standard",
                  "label": "标准配送",
                  "feeCents": 0,
                  "etaText": "预计 2-4 天送达"
                }
              ],
              "paymentOptions": [
                {
                  "type": "wechat",
                  "label": "微信支付"
                }
              ],
              "expiresAt": "2026-06-06T00:15:00.000Z"
            },
            "checkoutAction": {
              "type": "start_checkout",
              "status": "draft_created",
              "draftId": "draft-1"
            }
          }
        }
    """.trimIndent()

    private val confirmResponseBody = """
        {
          "success": true,
          "data": {
            "order": {
              "id": "order-1",
              "orderNumber": "MOCK-20260606000000-TEST",
              "status": "mock_created",
              "currency": "CNY",
              "subtotalCents": 19900,
              "shippingFeeCents": 1200,
              "totalCents": 21100,
              "shippingAddress": {
                "label": "订单收货信息",
                "recipient": "张三",
                "phoneMasked": "138****0000",
                "fullAddress": "ShopMate 演示公寓"
              },
              "deliveryMethod": {
                "type": "express",
                "label": "加急配送",
                "feeCents": 1200
              },
              "paymentMethod": {
                "type": "alipay",
                "label": "支付宝",
                "status": "not_charged"
              },
              "source": "cart_button",
              "createdAt": "2026-06-06T00:00:01.000Z",
              "items": []
            },
            "checkoutAction": {
              "type": "confirm_checkout",
              "status": "order_created",
              "draftId": "draft-1",
              "orderId": "order-1",
              "cartRefreshRequired": true
            }
          }
        }
    """.trimIndent()
}
