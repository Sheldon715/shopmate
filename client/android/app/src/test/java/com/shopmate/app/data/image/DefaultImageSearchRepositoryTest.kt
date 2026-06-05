package com.shopmate.app.data.image

import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlinx.coroutines.runBlocking
import org.junit.Test

class DefaultImageSearchRepositoryTest {
    @Test
    fun interpretPreparesImageAndMapsResultToChatContracts() {
        runBlocking {
            val processor = FakeImageProcessor()
            val client = FakeImageSearchApiClient(
                response = ImageSearchApiResponseDto(
                    success = true,
                    data = imageSearchResultDto(),
                ),
            )
            val repository = DefaultImageSearchRepository(processor, client)

            val result = repository.interpret(
                image = ImageSearchAttachmentInput(
                    uriString = "content://image/1",
                    mimeType = "image/jpeg",
                    sizeBytes = 1024,
                ),
                message = "找便宜一点",
                conversationId = "local-chat-session-1",
            )

            val data = result.getOrThrow()
            assertEquals("content://image/1", processor.images.single().uriString)
            assertEquals("找便宜一点", client.messages.single())
            assertEquals("local-chat-session-1", client.conversationIds.single())
            assertEquals("图片找货：黑色真无线蓝牙耳机", data.chatMessage)
            assertEquals("数码电子", data.filters?.category)
            assertEquals("vlm_first", data.imageSearchMetadata?.mode)
            assertEquals("medium", data.imageSearchMetadata?.confidence)
            assertEquals("黑色真无线蓝牙耳机", data.imageSearchMetadata?.visualQuery)
        }
    }

    @Test
    fun interpretMapsApiErrorToStableException() {
        runBlocking {
            val repository = DefaultImageSearchRepository(
                imageProcessor = FakeImageProcessor(),
                imageSearchApiClient = FakeImageSearchApiClient(
                    response = ImageSearchApiResponseDto(
                        success = false,
                        error = ImageSearchApiErrorDto(
                            code = "IMAGE_CONFIG_MISSING",
                            message = "raw provider setup message",
                        ),
                    ),
                ),
            )

            val result = repository.interpret(
                image = ImageSearchAttachmentInput(uriString = "content://image/1"),
                message = null,
                conversationId = null,
            )

            val error = assertIs<ImageSearchException>(result.exceptionOrNull())
            assertEquals("IMAGE_CONFIG_MISSING", error.code)
            assertEquals("当前后端未配置图片识别模型，请稍后再试。", error.displayMessage)
        }
    }

    private class FakeImageProcessor : ImageSearchImageProcessor {
        val images = mutableListOf<ImageSearchAttachmentInput>()

        override suspend fun prepare(image: ImageSearchAttachmentInput): PreparedImageUpload {
            images += image
            return PreparedImageUpload("prepared-image".toByteArray())
        }
    }

    private class FakeImageSearchApiClient(
        private val response: ImageSearchApiResponseDto<ImageSearchInterpretResultDto>,
    ) : ImageSearchApiClient {
        val messages = mutableListOf<String?>()
        val conversationIds = mutableListOf<String?>()

        override suspend fun interpret(
            image: PreparedImageUpload,
            message: String?,
            conversationId: String?,
        ): ImageSearchApiResponseDto<ImageSearchInterpretResultDto> {
            messages += message
            conversationIds += conversationId
            return response
        }
    }
}

private fun imageSearchResultDto(
    chatMessage: String? = "图片找货：黑色真无线蓝牙耳机",
    confidence: String = "medium",
    searchQuery: String = "黑色真无线蓝牙耳机",
    clarificationQuestion: String? = null,
): ImageSearchInterpretResultDto =
    ImageSearchInterpretResultDto(
        visualIntent = VisualIntentDto(
            isProductSearch = true,
            detectedCategory = "数码电子",
            detectedBrandText = null,
            visualAttributes = listOf("真无线"),
            colors = listOf("黑色"),
            materials = emptyList(),
            useCase = "通勤",
            constraints = emptyList(),
            searchQuery = searchQuery,
            confidence = confidence,
            clarificationQuestion = clarificationQuestion,
        ),
        chatMessage = chatMessage,
        filters = ImageSearchFiltersDto(category = "数码电子"),
        imageSearchMode = "vlm_first",
    )
