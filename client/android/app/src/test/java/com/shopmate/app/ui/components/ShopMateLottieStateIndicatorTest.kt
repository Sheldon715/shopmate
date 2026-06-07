package com.shopmate.app.ui.components

import com.shopmate.app.R
import com.shopmate.app.ui.chat.ChatImageAttachmentStatus
import kotlin.test.assertEquals
import kotlin.test.assertNull
import org.junit.Test

class ShopMateLottieStateIndicatorTest {
    @Test
    fun mapsStatesToRawResources() {
        assertEquals(R.raw.shopmate_ai_thinking, ShopMateLottieState.AiThinking.rawResId())
        assertEquals(
            R.raw.shopmate_voice_wave_listening,
            ShopMateLottieState.VoiceListening.rawResId(),
        )
        assertEquals(
            R.raw.shopmate_voice_wave_transcribing,
            ShopMateLottieState.VoiceTranscribing.rawResId(),
        )
        assertEquals(
            R.raw.shopmate_image_interpreting,
            ShopMateLottieState.ImageInterpreting.rawResId(),
        )
    }

    @Test
    fun imageBusyStatesUseImageInterpretingIndicatorOnly() {
        assertNull(ChatImageAttachmentStatus.Selected.lottieStateOrNull())
        assertNull(ChatImageAttachmentStatus.Uploading.lottieStateOrNull())
        assertEquals(
            ShopMateLottieState.ImageInterpreting,
            ChatImageAttachmentStatus.Interpreting.lottieStateOrNull(),
        )
        assertEquals(
            ShopMateLottieState.ImageInterpreting,
            ChatImageAttachmentStatus.Searching.lottieStateOrNull(),
        )
        assertNull(ChatImageAttachmentStatus.Failed.lottieStateOrNull())
    }
}
