package com.shopmate.app.ui.components

import android.animation.ValueAnimator
import android.os.Build
import androidx.annotation.RawRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.LottieConstants
import com.airbnb.lottie.compose.animateLottieCompositionAsState
import com.airbnb.lottie.compose.rememberLottieComposition
import com.shopmate.app.R
import com.shopmate.app.ui.chat.ChatImageAttachmentStatus
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateLightGreen

enum class ShopMateLottieState {
    AiThinking,
    VoiceListening,
    VoiceTranscribing,
    ImageInterpreting,
}

@Composable
fun ShopMateLottieStateIndicator(
    state: ShopMateLottieState,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    lottieEnabled: Boolean = shouldRenderStateLottie(),
) {
    val semanticModifier = if (contentDescription == null) {
        Modifier
    } else {
        Modifier.semantics {
            this.contentDescription = contentDescription
        }
    }

    Box(
        modifier = modifier.then(semanticModifier),
        contentAlignment = Alignment.Center,
    ) {
        if (lottieEnabled) {
            val composition by rememberLottieComposition(
                LottieCompositionSpec.RawRes(state.rawResId()),
            )
            if (composition != null) {
                val progress by animateLottieCompositionAsState(
                    composition = composition,
                    iterations = LottieConstants.IterateForever,
                    isPlaying = true,
                )

                LottieAnimation(
                    composition = composition,
                    progress = { progress },
                    modifier = Modifier.fillMaxSize(),
                )
                return@Box
            }
        }

        ShopMateStateFallback(state = state)
    }
}

@RawRes
internal fun ShopMateLottieState.rawResId(): Int =
    when (this) {
        ShopMateLottieState.AiThinking -> R.raw.shopmate_ai_thinking
        ShopMateLottieState.VoiceListening -> R.raw.shopmate_voice_wave_listening
        ShopMateLottieState.VoiceTranscribing -> R.raw.shopmate_voice_wave_transcribing
        ShopMateLottieState.ImageInterpreting -> R.raw.shopmate_image_interpreting
    }

internal fun ChatImageAttachmentStatus.lottieStateOrNull(): ShopMateLottieState? =
    when (this) {
        ChatImageAttachmentStatus.Interpreting,
        ChatImageAttachmentStatus.Searching,
        -> ShopMateLottieState.ImageInterpreting
        ChatImageAttachmentStatus.Selected,
        ChatImageAttachmentStatus.Uploading,
        ChatImageAttachmentStatus.Failed,
        -> null
    }

@Composable
private fun ShopMateStateFallback(state: ShopMateLottieState) {
    when (state) {
        ShopMateLottieState.AiThinking -> FallbackDots(
            dotCount = 3,
            color = ShopMateGreen,
        )

        ShopMateLottieState.VoiceListening -> FallbackVoiceWave(
            heights = listOf(14, 22, 18, 26, 16, 22, 12),
            color = ShopMateGreen,
        )

        ShopMateLottieState.VoiceTranscribing -> FallbackVoiceWave(
            heights = listOf(10, 16, 22, 16, 10),
            color = ShopMateLightGreen,
        )

        ShopMateLottieState.ImageInterpreting -> FallbackImageInterpreting()
    }
}

@Composable
private fun FallbackDots(
    dotCount: Int,
    color: Color,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(dotCount) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(RoundedCornerShape(50))
                    .background(color.copy(alpha = 0.86f)),
            )
        }
    }
}

@Composable
private fun FallbackVoiceWave(
    heights: List<Int>,
    color: Color,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        heights.forEach { height ->
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(height.dp)
                    .clip(RoundedCornerShape(50))
                    .background(color.copy(alpha = 0.9f)),
            )
        }
    }
}

@Composable
private fun FallbackImageInterpreting() {
    Box(
        modifier = Modifier
            .size(22.dp)
            .clip(RoundedCornerShape(7.dp))
            .border(1.dp, ShopMateGreen.copy(alpha = 0.62f), RoundedCornerShape(7.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .width(13.dp)
                .height(2.dp)
                .clip(RoundedCornerShape(50))
                .background(ShopMateLightGreen.copy(alpha = 0.9f)),
        )
    }
}

@Composable
private fun shouldRenderStateLottie(): Boolean =
    !LocalInspectionMode.current && systemAnimatorsEnabled()

private fun systemAnimatorsEnabled(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ValueAnimator.areAnimatorsEnabled()
