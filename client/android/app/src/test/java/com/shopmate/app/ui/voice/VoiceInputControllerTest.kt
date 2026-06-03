package com.shopmate.app.ui.voice

import kotlin.test.assertEquals
import org.junit.Test

class VoiceInputControllerTest {
    @Test
    fun voiceRecognizerLanguageDefaultsToChinese() {
        assertEquals("zh-CN", SHOPMATE_VOICE_LANGUAGE_TAG)
    }

    @Test
    fun cloudAsrUploadUsesAndroidM4aMimeType() {
        assertEquals("audio/mp4", SHOPMATE_CLOUD_AUDIO_MIME_TYPE)
    }
}
