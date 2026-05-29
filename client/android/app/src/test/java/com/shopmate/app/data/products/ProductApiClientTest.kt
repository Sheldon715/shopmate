package com.shopmate.app.data.products

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

class ProductApiClientTest {
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
    fun getProductDetailRequestsEncodedPathAndParsesSuccessResponse() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .addHeader("Content-Type", "application/json")
                .setBody(successBody),
        )
        val client = OkHttpProductApiClient(
            apiConfig = ShopMateApiConfig(server.url("/").toString()),
        )

        val response = client.getProductDetail("product 001")

        assertTrue(response.success)
        assertEquals("product_001", response.data?.id)
        assertEquals("通勤蓝牙耳机 A", response.data?.name)
        val recordedRequest = server.takeRequest()
        assertEquals("GET", recordedRequest.method)
        assertEquals("/api/products/product%20001", recordedRequest.path)
        assertEquals("application/json", recordedRequest.getHeader("Accept"))
    }

    @Test
    fun getProductDetailReturnsParsedErrorBodyForNotFound() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(404)
                .addHeader("Content-Type", "application/json")
                .setBody(errorBody),
        )
        val client = OkHttpProductApiClient(
            apiConfig = ShopMateApiConfig(server.url("/").toString()),
        )

        val response = client.getProductDetail("missing")

        assertFalse(response.success)
        assertEquals("PRODUCT_NOT_FOUND", response.error?.code)
    }

    @Test
    fun getProductDetailThrowsParseFailureForMalformedSuccessBody() {
        runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .addHeader("Content-Type", "application/json")
                .setBody("""{"success":true,"data":"""),
        )
        val client = OkHttpProductApiClient(
            apiConfig = ShopMateApiConfig(server.url("/").toString()),
        )

        assertFailsWith<ShopMateNetworkError.ProductResponseParseFailed> {
            client.getProductDetail("product_001")
        }
        }
    }

    private val successBody = """
        {
          "success": true,
          "data": {
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
            "available": true,
            "marketingDescription": "适合通勤和日常使用。",
            "skus": [],
            "attributes": { "续航": ["20h"] },
            "pros": ["续航稳定"],
            "cons": ["暂不支持主动降噪"],
            "recommendWhen": ["通勤"],
            "avoidWhen": ["需要强降噪"],
            "reviewSummary": {},
            "officialFaq": {},
            "contentBlocks": {}
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
