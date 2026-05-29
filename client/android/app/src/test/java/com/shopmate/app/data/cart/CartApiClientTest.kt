package com.shopmate.app.data.cart

import com.shopmate.app.data.network.ShopMateApiConfig
import kotlinx.coroutines.runBlocking
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test

class CartApiClientTest {
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
    fun getCartRequestsCartPathAndParsesResponse() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .addHeader("Content-Type", "application/json")
                .setBody(successBody),
        )
        val client = OkHttpCartApiClient(
            apiConfig = ShopMateApiConfig(server.url("/").toString()),
        )

        val response = client.getCart()

        assertTrue(response.success)
        assertEquals("cart-item-1", response.data?.items?.single()?.id)
        assertEquals(2, response.data?.summary?.selectedCount)
        val recordedRequest = server.takeRequest()
        assertEquals("GET", recordedRequest.method)
        assertEquals("/api/cart", recordedRequest.path)
    }

    @Test
    fun addCartItemPostsProductAndQuantity() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .addHeader("Content-Type", "application/json")
                .setBody(successBody),
        )
        val client = OkHttpCartApiClient(
            apiConfig = ShopMateApiConfig(server.url("/").toString()),
        )

        client.addCartItem("product_001", 2)

        val recordedRequest = server.takeRequest()
        assertEquals("POST", recordedRequest.method)
        assertEquals("/api/cart/items", recordedRequest.path)
        assertEquals(
            """{"productId":"product_001","quantity":2}""",
            recordedRequest.body.readUtf8(),
        )
    }

    private val successBody = """
        {
          "success": true,
          "data": {
            "items": [
              {
                "id": "cart-item-1",
                "productId": "product_001",
                "name": "通勤蓝牙耳机",
                "brand": "示例品牌",
                "category": "数码电子",
                "priceCents": 19900,
                "priceText": "¥199",
                "quantity": 2,
                "selected": true,
                "subtotalCents": 39800,
                "available": true,
                "tags": ["通勤", "蓝牙"]
              }
            ],
            "summary": {
              "totalCount": 2,
              "selectedCount": 2,
              "selectedTotalCents": 39800,
              "currency": "CNY"
            }
          }
        }
    """.trimIndent()
}
