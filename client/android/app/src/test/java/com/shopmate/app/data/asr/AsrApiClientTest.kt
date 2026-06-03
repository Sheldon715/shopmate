package com.shopmate.app.data.asr

import com.shopmate.app.data.network.ShopMateApiConfig
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test

class AsrApiClientTest {
    private lateinit var server: MockWebServer
    private lateinit var audioFile: File

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        audioFile = File.createTempFile("voice-test-", ".m4a").apply {
            writeBytes("audio-bytes".toByteArray())
        }
    }

    @After
    fun tearDown() {
        audioFile.delete()
        server.shutdown()
    }

    @Test
    fun transcribePostsMultipartAudioAndParsesTranscript() {
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
                            "transcript": "推荐通勤耳机",
                            "language": "zh-CN",
                            "provider": "llm-audio",
                            "model": "audio-model"
                          }
                        }
                        """.trimIndent(),
                    ),
            )
            val client = OkHttpAsrApiClient(
                apiConfig = ShopMateApiConfig(server.url("/").toString()),
            )

            val response = client.transcribe(audioFile, "audio/mp4")

            assertTrue(response.success)
            assertEquals("推荐通勤耳机", response.data?.transcript)
            val recordedRequest = server.takeRequest()
            assertEquals("POST", recordedRequest.method)
            assertEquals("/api/asr/transcribe", recordedRequest.path)
            assertTrue(
                assertNotNull(recordedRequest.getHeader("Content-Type"))
                    .startsWith("multipart/form-data"),
            )
            val body = recordedRequest.body.readUtf8()
            assertTrue(body.contains("""name="audio""""))
            assertTrue(body.contains("audio-bytes"))
        }
    }

    @Test
    fun transcribeParsesErrorApiResponse() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(400)
                    .addHeader("Content-Type", "application/json")
                    .setBody(
                        """
                        {
                          "success": false,
                          "error": {
                            "code": "ASR_TRANSCRIPT_EMPTY",
                            "message": "没有识别到语音，请再试一次。"
                          }
                        }
                        """.trimIndent(),
                    ),
            )
            val client = OkHttpAsrApiClient(
                apiConfig = ShopMateApiConfig(server.url("/").toString()),
            )

            val response = client.transcribe(audioFile, "audio/mp4")

            assertEquals(false, response.success)
            assertEquals("ASR_TRANSCRIPT_EMPTY", response.error?.code)
            assertEquals("没有识别到语音，请再试一次。", response.error?.message)
        }
    }
}
