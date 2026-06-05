package com.shopmate.app.data.image

import com.shopmate.app.data.network.ShopMateApiConfig
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test

class ImageSearchApiClientTest {
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
    fun interpretPostsMultipartImageAndParsesResult() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "application/json")
                    .setBody(
                        """
                        {
                          "success": true,
                          "data": {
                            "visualIntent": {
                              "is_product_search": true,
                              "detected_category": "数码电子",
                              "detected_brand_text": null,
                              "visual_attributes": ["黑色", "入耳式"],
                              "colors": ["黑色"],
                              "materials": [],
                              "use_case": "通勤",
                              "constraints": [],
                              "search_query": "黑色真无线蓝牙耳机",
                              "confidence": "medium",
                              "clarification_question": null
                            },
                            "chatMessage": "图片找货：黑色真无线蓝牙耳机",
                            "filters": { "category": "数码电子" },
                            "imageSearchMode": "vlm_first"
                          }
                        }
                        """.trimIndent(),
                    ),
            )
            val client = OkHttpImageSearchApiClient(
                apiConfig = ShopMateApiConfig(server.url("/").toString()),
            )

            val response = client.interpret(
                image = PreparedImageUpload("fake-image-bytes".toByteArray()),
                message = "找便宜一点",
                conversationId = "local-chat-session-1",
            )

            assertTrue(response.success)
            assertEquals("图片找货：黑色真无线蓝牙耳机", response.data?.chatMessage)
            assertEquals("数码电子", response.data?.filters?.category)
            val recordedRequest = server.takeRequest()
            assertEquals("POST", recordedRequest.method)
            assertEquals("/api/image-search/interpret", recordedRequest.path)
            assertTrue(
                assertNotNull(recordedRequest.getHeader("Content-Type"))
                    .startsWith("multipart/form-data"),
            )
            val body = recordedRequest.body.readUtf8()
            assertTrue(body.contains("""name="image"; filename="shopmate-image-search.jpg""""))
            assertTrue(body.contains("""Content-Type: image/jpeg"""))
            assertTrue(body.contains("fake-image-bytes"))
            assertTrue(body.contains("""name="message""""))
            assertTrue(body.contains("找便宜一点"))
            assertTrue(body.contains("""name="conversationId""""))
            assertTrue(body.contains("local-chat-session-1"))
        }
    }

    @Test
    fun interpretParsesErrorApiResponse() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(413)
                    .addHeader("Content-Type", "application/json")
                    .setBody(
                        """
                        {
                          "success": false,
                          "error": {
                            "code": "IMAGE_TOO_LARGE",
                            "message": "图片文件过大，请压缩后再试。"
                          }
                        }
                        """.trimIndent(),
                    ),
            )
            val client = OkHttpImageSearchApiClient(
                apiConfig = ShopMateApiConfig(server.url("/").toString()),
            )

            val response = client.interpret(
                image = PreparedImageUpload("fake-image-bytes".toByteArray()),
                message = null,
                conversationId = null,
            )

            assertEquals(false, response.success)
            assertEquals("IMAGE_TOO_LARGE", response.error?.code)
            assertEquals("图片文件过大，请压缩后再试。", response.error?.message)
        }
    }
}
