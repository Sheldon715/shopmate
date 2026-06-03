package com.shopmate.app.ui.voice

import android.content.Context
import android.content.Intent
import android.media.MediaRecorder
import android.os.Bundle
import android.os.Build
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.shopmate.app.data.asr.AsrRepository
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

internal const val SHOPMATE_VOICE_LANGUAGE_TAG = "zh-CN"
internal const val SHOPMATE_CLOUD_AUDIO_MIME_TYPE = "audio/mp4"

interface VoiceInputController {
    fun startListening()
    fun stopListening()
    fun cancel()
    fun destroy()
}

class CloudAsrVoiceInputController(
    context: Context,
    private val asrRepository: AsrRepository,
    private val coroutineScope: CoroutineScope,
    private val listener: AndroidSpeechVoiceInputController.Listener,
    private val fallbackController: VoiceInputController? = null,
) : VoiceInputController {
    private val appContext = context.applicationContext
    private var recorder: MediaRecorder? = null
    private var audioFile: File? = null
    private var transcribeJob: Job? = null
    private var cancelled = false
    private var fallbackActive = false

    override fun startListening() {
        cancelled = false
        fallbackActive = false
        cleanupRecording()
        val file = File.createTempFile("shopmate-voice-", ".m4a", appContext.cacheDir)
        val nextRecorder = createRecorder().apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioSamplingRate(16_000)
            setAudioEncodingBitRate(64_000)
            setMaxDuration(MAX_RECORDING_DURATION_MS)
            setOutputFile(file.absolutePath)
        }

        runCatching {
            nextRecorder.prepare()
            nextRecorder.start()
        }.onSuccess {
            recorder = nextRecorder
            audioFile = file
            listener.onListening()
        }.onFailure { error ->
            nextRecorder.release()
            file.delete()
            if (fallbackController != null && error !is SecurityException) {
                fallbackActive = true
                fallbackController.startListening()
            } else {
                listener.onError(error.toVoiceInputMessage())
            }
        }
    }

    override fun stopListening() {
        if (fallbackActive) {
            fallbackController?.stopListening()
            return
        }

        val file = audioFile
        val activeRecorder = recorder
        recorder = null
        audioFile = null

        if (file == null || activeRecorder == null) {
            return
        }

        runCatching {
            activeRecorder.stop()
        }.onFailure {
            file.delete()
            activeRecorder.release()
            listener.onError("录音失败，请检查麦克风后再试。")
            return
        }
        activeRecorder.release()

        if (cancelled) {
            file.delete()
            return
        }

        listener.onTranscribing()
        transcribeJob?.cancel()
        transcribeJob = coroutineScope.launch {
            try {
                val result = asrRepository.transcribeVoice(file, SHOPMATE_CLOUD_AUDIO_MIME_TYPE)

                if (cancelled) {
                    return@launch
                }

                result
                    .onSuccess(listener::onTranscriptReady)
                    .onFailure { error ->
                        listener.onError(error.toVoiceInputMessage())
                    }
            } catch (error: CancellationException) {
                throw error
            } finally {
                file.delete()
                transcribeJob = null
            }
        }
    }

    override fun cancel() {
        cancelled = true
        fallbackActive = false
        transcribeJob?.cancel()
        transcribeJob = null
        cleanupRecording()
        fallbackController?.cancel()
    }

    override fun destroy() {
        cancel()
        fallbackController?.destroy()
    }

    private fun cleanupRecording() {
        recorder?.runCatchingStopAndRelease()
        recorder = null
        audioFile?.delete()
        audioFile = null
    }

    private fun createRecorder(): MediaRecorder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(appContext)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

    companion object {
        private const val MAX_RECORDING_DURATION_MS = 30_000
    }
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
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, SHOPMATE_VOICE_LANGUAGE_TAG)
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

private fun MediaRecorder.runCatchingStopAndRelease() {
    runCatching {
        stop()
    }
    release()
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
        is com.shopmate.app.data.asr.AsrRecognitionException -> message ?: "语音识别失败，请再试一次。"
        else -> "语音识别暂时不可用，请稍后重试。"
    }
