package com.shopmate.app.data.asr

import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateHttpClient
import com.shopmate.app.data.network.ShopMateJson
import com.shopmate.app.data.network.ShopMateNetworkError
import java.io.File
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.MultipartBody
import okhttp3.OkHttpClient

interface AsrApiClient {
    suspend fun transcribe(audioFile: File, mimeType: String): AsrApiResponseDto<AsrTranscriptDto>
}

class OkHttpAsrApiClient(
    apiConfig: ShopMateApiConfig = ShopMateApiConfig.default(),
    private val okHttpClient: OkHttpClient = ShopMateHttpClient.createJsonApiClient(),
    private val json: Json = ShopMateJson.instance,
) : AsrApiClient {
    private val transcribeUrl = apiConfig.resolve(ASR_TRANSCRIBE_PATH)

    override suspend fun transcribe(
        audioFile: File,
        mimeType: String,
    ): AsrApiResponseDto<AsrTranscriptDto> =
        withContext(Dispatchers.IO) {
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                    AUDIO_FIELD_NAME,
                    audioFile.name,
                    audioFile.asRequestBody(mimeType.toMediaType()),
                )
                .build()
            val request = Request.Builder()
                .url(transcribeUrl)
                .post(requestBody)
                .header("Accept", JSON_ACCEPT)
                .build()
            val response = try {
                okHttpClient.newCall(request).execute()
            } catch (error: IOException) {
                throw ShopMateNetworkError.AsrConnectionFailed(error)
            }

            response.use { httpResponse ->
                val body = httpResponse.body?.string().orEmpty()
                if (httpResponse.isSuccessful) {
                    return@withContext parseAsrResponse(body)
                }

                val parsedError = parseAsrResponseOrNull(body)
                if (parsedError != null && !parsedError.success) {
                    return@withContext parsedError
                }

                throw ShopMateNetworkError.HttpNonSuccess(httpResponse.code)
            }
        }

    private fun parseAsrResponse(body: String): AsrApiResponseDto<AsrTranscriptDto> =
        try {
            json.decodeFromString(asrResponseSerializer, body)
        } catch (error: SerializationException) {
            throw ShopMateNetworkError.AsrResponseParseFailed(error)
        } catch (error: IllegalArgumentException) {
            throw ShopMateNetworkError.AsrResponseParseFailed(error)
        }

    private fun parseAsrResponseOrNull(body: String): AsrApiResponseDto<AsrTranscriptDto>? =
        try {
            parseAsrResponse(body)
        } catch (error: ShopMateNetworkError.AsrResponseParseFailed) {
            null
        }

    private companion object {
        private const val ASR_TRANSCRIBE_PATH = "api/asr/transcribe"
        private const val AUDIO_FIELD_NAME = "audio"
        private const val JSON_ACCEPT = "application/json"
        private val asrResponseSerializer: KSerializer<AsrApiResponseDto<AsrTranscriptDto>> =
            AsrApiResponseDto.serializer(AsrTranscriptDto.serializer())
    }
}

@Serializable
data class AsrApiResponseDto<T>(
    val success: Boolean,
    val data: T? = null,
    val error: AsrApiErrorDto? = null,
)

@Serializable
data class AsrApiErrorDto(
    val code: String,
    val message: String,
)

@Serializable
data class AsrTranscriptDto(
    val transcript: String,
    val language: String? = null,
    val provider: String? = null,
    val model: String? = null,
)
