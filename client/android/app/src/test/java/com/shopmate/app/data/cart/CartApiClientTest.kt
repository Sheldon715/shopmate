package com.shopmate.app.data.cart

import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateNetworkError
import kotlinx.coroutines.runBlocking
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
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
        val client = cartApiClient()

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
        val client = cartApiClient()

        client.addCartItem("product_001", 2)

        val recordedRequest = server.takeRequest()
        assertEquals("POST", recordedRequest.method)
        assertEquals("/api/cart/items", recordedRequest.path)
        assertEquals(
            """{"productId":"product_001","quantity":2}""",
            recordedRequest.body.readUtf8(),
        )
    }

    @Test
    fun updateCartItemPatchesQuantityAndSelected() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .addHeader("Content-Type", "application/json")
                .setBody(successBody),
        )
        val client = cartApiClient()

        client.updateCartItem("cart item 1", quantity = 3, selected = false)

        val recordedRequest = server.takeRequest()
        assertEquals("PATCH", recordedRequest.method)
        assertEquals("/api/cart/items/cart%20item%201", recordedRequest.path)
        assertEquals(
            """{"quantity":3,"selected":false}""",
            recordedRequest.body.readUtf8(),
        )
    }

    @Test
    fun deleteCartItemRequestsItemPath() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .addHeader("Content-Type", "application/json")
                .setBody(successBody),
        )
        val client = cartApiClient()

        client.deleteCartItem("cart-item-1")

        val recordedRequest = server.takeRequest()
        assertEquals("DELETE", recordedRequest.method)
        assertEquals("/api/cart/items/cart-item-1", recordedRequest.path)
    }

    @Test
    fun selectAllPostsSelectedState() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .addHeader("Content-Type", "application/json")
                .setBody(successBody),
        )
        val client = cartApiClient()

        client.selectAll(false)

        val recordedRequest = server.takeRequest()
        assertEquals("POST", recordedRequest.method)
        assertEquals("/api/cart/select-all", recordedRequest.path)
        assertEquals("""{"selected":false}""", recordedRequest.body.readUtf8())
    }

    @Test
    fun nonSuccessApiResponseReturnsParsedErrorBody() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(404)
                .addHeader("Content-Type", "application/json")
                .setBody(errorBody),
        )
        val client = cartApiClient()

        val response = client.addCartItem("missing", 1)

        assertFalse(response.success)
        assertEquals("PRODUCT_NOT_FOUND", response.error?.code)
    }

    @Test
    fun plainServerErrorThrowsHttpNonSuccess() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .addHeader("Content-Type", "text/plain")
                    .setBody("Internal Server Error"),
            )
            val client = cartApiClient()

            assertFailsWith<ShopMateNetworkError.HttpNonSuccess> {
                client.getCart()
            }
        }
    }

    @Test
    fun malformedSuccessBodyThrowsParseFailure() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "application/json")
                    .setBody("""{"success":true,"data":"""),
            )
            val client = cartApiClient()

            assertFailsWith<ShopMateNetworkError.CartResponseParseFailed> {
                client.getCart()
            }
        }
    }

    private fun cartApiClient(): OkHttpCartApiClient =
        OkHttpCartApiClient(
            apiConfig = ShopMateApiConfig(server.url("/").toString()),
        )

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
                "tags": ["通勤", "蓝牙"],
                "imagePath": "/images/products/digital/images/product_001.png"
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

    private val errorBody = """
        {
          "success": false,
          "error": {
            "code": "PRODUCT_NOT_FOUND",
            "message": "商品不存在"
          }
        }
    """.trimIndent()
}
