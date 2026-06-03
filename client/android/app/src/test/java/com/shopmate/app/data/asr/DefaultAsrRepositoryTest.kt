package com.shopmate.app.data.asr

import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import org.junit.Test

class DefaultAsrRepositoryTest {
    @Test
    fun transcribeVoiceReturnsTrimmedTranscript() {
        runBlocking {
            val repository = DefaultAsrRepository(
                FakeAsrApiClient(
                    AsrApiResponseDto(
                        success = true,
                        data = AsrTranscriptDto(transcript = "  推荐通勤耳机  "),
                    ),
                ),
            )

            val result = repository.transcribeVoice(File("voice.m4a"), "audio/mp4")

            assertEquals("推荐通勤耳机", result.getOrThrow())
        }
    }

    @Test
    fun transcribeVoiceFailsOnEmptyTranscript() {
        runBlocking {
            val repository = DefaultAsrRepository(
                FakeAsrApiClient(
                    AsrApiResponseDto(
                        success = true,
                        data = AsrTranscriptDto(transcript = " "),
                    ),
                ),
            )

            val result = repository.transcribeVoice(File("voice.m4a"), "audio/mp4")

            assertTrue(result.isFailure)
            assertEquals("没有识别到语音，请再试一次。", result.exceptionOrNull()?.message)
        }
    }

    @Test
    fun transcribeVoiceMapsApiErrorMessage() {
        runBlocking {
            val repository = DefaultAsrRepository(
                FakeAsrApiClient(
                    AsrApiResponseDto(
                        success = false,
                        error = AsrApiErrorDto(
                            code = "ASR_TIMEOUT",
                            message = "语音识别超时，请稍后重试。",
                        ),
                    ),
                ),
            )

            val result = repository.transcribeVoice(File("voice.m4a"), "audio/mp4")

            assertTrue(result.isFailure)
            assertEquals("语音识别超时，请稍后重试。", result.exceptionOrNull()?.message)
        }
    }

    private class FakeAsrApiClient(
        private val response: AsrApiResponseDto<AsrTranscriptDto>,
    ) : AsrApiClient {
        override suspend fun transcribe(
            audioFile: File,
            mimeType: String,
        ): AsrApiResponseDto<AsrTranscriptDto> = response
    }
}
