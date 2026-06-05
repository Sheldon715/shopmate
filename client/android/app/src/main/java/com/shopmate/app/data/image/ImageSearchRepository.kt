package com.shopmate.app.data.image

import kotlinx.coroutines.CancellationException

data class ImageSearchAttachmentInput(
    val uriString: String,
    val mimeType: String? = null,
    val sizeBytes: Long? = null,
)

interface ImageSearchImageProcessor {
    suspend fun prepare(image: ImageSearchAttachmentInput): PreparedImageUpload
}

interface ImageSearchRepository {
    suspend fun interpret(
        image: ImageSearchAttachmentInput,
        message: String?,
        conversationId: String?,
    ): Result<ImageSearchInterpretResult>
}

class DefaultImageSearchRepository(
    private val imageProcessor: ImageSearchImageProcessor,
    private val imageSearchApiClient: ImageSearchApiClient,
) : ImageSearchRepository {
    override suspend fun interpret(
        image: ImageSearchAttachmentInput,
        message: String?,
        conversationId: String?,
    ): Result<ImageSearchInterpretResult> =
        try {
            val preparedImage = imageProcessor.prepare(image)
            val response = imageSearchApiClient.interpret(
                image = preparedImage,
                message = message,
                conversationId = conversationId,
            )

            if (!response.success) {
                val error = response.error
                throw ImageSearchException(
                    code = error?.code,
                    displayMessage = imageSearchErrorMessage(
                        code = error?.code,
                        fallbackMessage = error?.message,
                    ),
                    retryable = error?.code.isRetryableImageSearchError(),
                )
            }

            val data = response.data ?: throw ImageSearchException(
                code = "IMAGE_INVALID_OUTPUT",
                displayMessage = "图片识别结果格式异常，请再试一次。",
                retryable = true,
            )

            Result.success(data.toDomain())
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            Result.failure(error)
        }
}

class ImageSearchException(
    val code: String?,
    val displayMessage: String,
    val retryable: Boolean = true,
) : Exception(displayMessage)

private fun String?.isRetryableImageSearchError(): Boolean =
    this == null ||
        this in setOf(
            "IMAGE_CONFIG_MISSING",
            "IMAGE_PROVIDER_UNAVAILABLE",
            "IMAGE_TIMEOUT",
            "IMAGE_REQUEST_FAILED",
            "IMAGE_INVALID_OUTPUT",
        )
