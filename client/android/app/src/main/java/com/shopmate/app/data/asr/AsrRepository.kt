package com.shopmate.app.data.asr

import java.io.File
import kotlinx.coroutines.CancellationException

interface AsrRepository {
    suspend fun transcribeVoice(audioFile: File, mimeType: String): Result<String>
}

class DefaultAsrRepository(
    private val asrApiClient: AsrApiClient,
) : AsrRepository {
    override suspend fun transcribeVoice(audioFile: File, mimeType: String): Result<String> =
        try {
            val response = asrApiClient.transcribe(audioFile, mimeType)

            if (!response.success) {
                throw AsrRecognitionException(
                    response.error?.message?.takeIf { message -> message.isNotBlank() }
                        ?: "语音识别失败，请再试一次。",
                )
            }

            val transcript = response.data?.transcript?.trim().orEmpty()
            if (transcript.isBlank()) {
                throw AsrRecognitionException("没有识别到语音，请再试一次。")
            }

            Result.success(transcript)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            Result.failure(error)
        }
}

class AsrRecognitionException(message: String) : Exception(message)
