package com.shopmate.app.ui.components

import android.animation.ValueAnimator
import android.os.Build
import androidx.annotation.DrawableRes
import androidx.annotation.RawRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.res.painterResource
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.animateLottieCompositionAsState
import com.airbnb.lottie.compose.rememberLottieComposition
import com.shopmate.app.R

enum class ShopMateBuddyMotionState {
    Idle,
    Arrival,
    Thinking,
}

@Composable
fun ShopMateBuddyMotion(
    state: ShopMateBuddyMotionState,
    modifier: Modifier = Modifier,
    @DrawableRes fallbackRes: Int = R.drawable.sidebar_shopmate_buddy,
    contentDescription: String? = null,
    fallbackContentScale: ContentScale = ContentScale.Fit,
    iterations: Int = defaultBuddyMotionIterations(state),
    lottieEnabled: Boolean = shouldRenderLottieMotion(),
) {
    Box(modifier = modifier) {
        Image(
            painter = painterResource(id = state.fallbackResId(fallbackRes)),
            contentDescription = contentDescription,
            modifier = Modifier.fillMaxSize(),
            contentScale = fallbackContentScale,
        )

        if (lottieEnabled && state.hasLottieOverlay()) {
            val composition by rememberLottieComposition(
                LottieCompositionSpec.RawRes(state.rawResId()),
            )
            val progress by animateLottieCompositionAsState(
                composition = composition,
                iterations = iterations,
                isPlaying = composition != null,
            )

            LottieAnimation(
                composition = composition,
                progress = { progress },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

fun defaultBuddyMotionIterations(state: ShopMateBuddyMotionState): Int =
    when (state) {
        ShopMateBuddyMotionState.Idle -> 1
        ShopMateBuddyMotionState.Arrival -> 1
        ShopMateBuddyMotionState.Thinking -> 1
    }

@RawRes
private fun ShopMateBuddyMotionState.rawResId(): Int =
    when (this) {
        ShopMateBuddyMotionState.Idle -> R.raw.shopmate_buddy_idle
        ShopMateBuddyMotionState.Arrival -> R.raw.shopmate_buddy_home_to_avatar
        ShopMateBuddyMotionState.Thinking -> R.raw.shopmate_buddy_thinking
    }

@DrawableRes
private fun ShopMateBuddyMotionState.fallbackResId(@DrawableRes defaultRes: Int): Int =
    when (this) {
        ShopMateBuddyMotionState.Thinking -> R.drawable.shopmate_buddy_thinking
        ShopMateBuddyMotionState.Idle,
        ShopMateBuddyMotionState.Arrival -> defaultRes
    }

private fun ShopMateBuddyMotionState.hasLottieOverlay(): Boolean =
    when (this) {
        ShopMateBuddyMotionState.Thinking -> false
        ShopMateBuddyMotionState.Idle,
        ShopMateBuddyMotionState.Arrival -> true
    }

@Composable
private fun shouldRenderLottieMotion(): Boolean =
    !LocalInspectionMode.current && systemAnimatorsEnabled()

private fun systemAnimatorsEnabled(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ValueAnimator.areAnimatorsEnabled()
