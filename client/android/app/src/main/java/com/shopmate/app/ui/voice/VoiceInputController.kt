package com.shopmate.app.ui.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

interface VoiceInputController {
    fun startListening()
    fun stopListening()
    fun cancel()
    fun destroy()
}

class AndroidSpeechVoiceInputController(
    context: Context,
    private val listener: Listener,
) : VoiceInputController {
    interface Listener {
        fun onListening()
        fun onTranscribing()
        fun onTranscriptReady(transcript: String)
        fun onError(message: String)
    }

    private val appContext = context.applicationContext
    private var speechRecognizer: SpeechRecognizer? = null
    private var cancelled = false

    override fun startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(appContext)) {
            listener.onError("当前设备暂不支持语音识别。")
            return
        }

        cancelled = false
        val recognizer = speechRecognizer ?: SpeechRecognizer.createSpeechRecognizer(appContext)
            .also { recognizer ->
                recognizer.setRecognitionListener(createRecognitionListener())
                speechRecognizer = recognizer
            }

        listener.onListening()
        runCatching {
            recognizer.startListening(createRecognizerIntent())
        }.onFailure { error ->
            listener.onError(error.toVoiceInputMessage())
        }
    }

    override fun stopListening() {
        cancelled = false
        listener.onTranscribing()
        runCatching {
            speechRecognizer?.stopListening()
        }.onFailure { error ->
            listener.onError(error.toVoiceInputMessage())
        }
    }

    override fun cancel() {
        cancelled = true
        speechRecognizer?.cancel()
    }

    override fun destroy() {
        cancelled = true
        speechRecognizer?.destroy()
        speechRecognizer = null
    }

    private fun createRecognizerIntent(): Intent =
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
            )
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_PROMPT, "说出你的购物需求")
        }

    private fun createRecognitionListener(): RecognitionListener =
        object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                if (!cancelled) {
                    listener.onListening()
                }
            }

            override fun onBeginningOfSpeech() = Unit

            override fun onRmsChanged(rmsdB: Float) = Unit

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() {
                if (!cancelled) {
                    listener.onTranscribing()
                }
            }

            override fun onError(error: Int) {
                if (!cancelled) {
                    listener.onError(error.toVoiceInputMessage())
                }
            }

            override fun onResults(results: Bundle?) {
                if (cancelled) {
                    return
                }

                val transcript = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()

                if (transcript.isBlank()) {
                    listener.onError("没有识别到语音，请再试一次。")
                } else {
                    listener.onTranscriptReady(transcript)
                }
            }

            override fun onPartialResults(partialResults: Bundle?) = Unit

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        }
}

private fun Int.toVoiceInputMessage(): String =
    when (this) {
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "需要开启麦克风权限才能语音输入。"
        SpeechRecognizer.ERROR_NO_MATCH,
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT
        -> "没有识别到语音，请再试一次。"

        SpeechRecognizer.ERROR_AUDIO -> "录音失败，请检查麦克风后再试。"
        SpeechRecognizer.ERROR_NETWORK,
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
        SpeechRecognizer.ERROR_SERVER
        -> "语音识别服务连接失败，请稍后重试。"

        SpeechRecognizer.ERROR_CLIENT,
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY
        -> "语音识别暂时不可用，请稍后重试。"

        else -> "语音识别失败，请再试一次。"
    }

private fun Throwable.toVoiceInputMessage(): String =
    when (this) {
        is SecurityException -> "需要开启麦克风权限才能语音输入。"
        else -> "语音识别暂时不可用，请稍后重试。"
    }
