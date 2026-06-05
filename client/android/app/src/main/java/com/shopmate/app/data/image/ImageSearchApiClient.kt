package com.shopmate.app.data.image

import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateHttpClient
import com.shopmate.app.data.network.ShopMateJson
import com.shopmate.app.data.network.ShopMateNetworkError
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

data class PreparedImageUpload(
    val bytes: ByteArray,
    val mimeType: String = IMAGE_UPLOAD_MIME_TYPE,
    val fileName: String = IMAGE_UPLOAD_FILE_NAME,
)

interface ImageSearchApiClient {
    suspend fun interpret(
        image: PreparedImageUpload,
        message: String?,
        conversationId: String?,
    ): ImageSearchApiResponseDto<ImageSearchInterpretResultDto>
}

class OkHttpImageSearchApiClient(
    apiConfig: ShopMateApiConfig = ShopMateApiConfig.default(),
    private val okHttpClient: OkHttpClient = ShopMateHttpClient.createJsonApiClient(),
    private val json: Json = ShopMateJson.instance,
) : ImageSearchApiClient {
    private val interpretUrl = apiConfig.resolve(IMAGE_SEARCH_INTERPRET_PATH)

    override suspend fun interpret(
        image: PreparedImageUpload,
        message: String?,
        conversationId: String?,
    ): ImageSearchApiResponseDto<ImageSearchInterpretResultDto> =
        withContext(Dispatchers.IO) {
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                    IMAGE_UPLOAD_FIELD_NAME,
                    image.fileName,
                    image.bytes.toRequestBody(image.mimeType.toMediaType()),
                )
                .apply {
                    message?.trim()?.takeIf { value -> value.isNotBlank() }?.let { value ->
                        addFormDataPart(IMAGE_UPLOAD_MESSAGE_FIELD_NAME, value)
                    }
                    conversationId?.trim()?.takeIf { value -> value.isNotBlank() }?.let { value ->
                        addFormDataPart(IMAGE_UPLOAD_CONVERSATION_FIELD_NAME, value)
                    }
                }
                .build()
            val request = Request.Builder()
                .url(interpretUrl)
                .post(requestBody)
                .header("Accept", JSON_ACCEPT)
                .build()
            val response = try {
                okHttpClient.newCall(request).execute()
            } catch (error: IOException) {
                throw ShopMateNetworkError.ImageSearchConnectionFailed(error)
            }

            response.use { httpResponse ->
                val body = httpResponse.body?.string().orEmpty()
                if (httpResponse.isSuccessful) {
                    return@withContext parseImageSearchResponse(body)
                }

                val parsedError = parseImageSearchResponseOrNull(body)
                if (parsedError != null && !parsedError.success) {
                    return@withContext parsedError
                }

                throw ShopMateNetworkError.HttpNonSuccess(httpResponse.code)
            }
        }

    private fun parseImageSearchResponse(
        body: String,
    ): ImageSearchApiResponseDto<ImageSearchInterpretResultDto> =
        try {
            json.decodeFromString(imageSearchResponseSerializer, body)
        } catch (error: SerializationException) {
            throw ShopMateNetworkError.ImageSearchResponseParseFailed(error)
        } catch (error: IllegalArgumentException) {
            throw ShopMateNetworkError.ImageSearchResponseParseFailed(error)
        }

    private fun parseImageSearchResponseOrNull(
        body: String,
    ): ImageSearchApiResponseDto<ImageSearchInterpretResultDto>? =
        try {
            parseImageSearchResponse(body)
        } catch (error: ShopMateNetworkError.ImageSearchResponseParseFailed) {
            null
        }

    private companion object {
        private const val IMAGE_SEARCH_INTERPRET_PATH = "api/image-search/interpret"
        private const val JSON_ACCEPT = "application/json"
        private val imageSearchResponseSerializer:
            KSerializer<ImageSearchApiResponseDto<ImageSearchInterpretResultDto>> =
            ImageSearchApiResponseDto.serializer(ImageSearchInterpretResultDto.serializer())
    }
}
