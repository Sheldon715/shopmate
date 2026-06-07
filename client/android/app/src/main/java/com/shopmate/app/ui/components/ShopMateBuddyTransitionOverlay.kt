package com.shopmate.app.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.zIndex
import com.shopmate.app.R
import kotlinx.coroutines.delay
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState

data class ShopMateBuddyTransitionRequest(
    val id: Long,
)

class ShopMateBuddyTransitionController {
    private var nextId = 0L
    private var activeRequest: ShopMateBuddyTransitionRequest? = null

    fun trigger(): ShopMateBuddyTransitionRequest {
        val request = ShopMateBuddyTransitionRequest(id = ++nextId)
        activeRequest = request
        return request
    }

    fun cancel() {
        activeRequest = null
    }

    fun consume(request: ShopMateBuddyTransitionRequest?) {
        if (request != null && activeRequest == request) {
            activeRequest = null
        }
    }

    fun isActive(request: ShopMateBuddyTransitionRequest?): Boolean =
        request != null && activeRequest == request
}

@Composable
fun ShopMateBuddyTransitionOverlay(
    request: ShopMateBuddyTransitionRequest?,
    onFinished: (ShopMateBuddyTransitionRequest) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (request == null || LocalInspectionMode.current) {
        return
    }

    BoxWithConstraints(
        modifier = modifier.zIndex(4f),
    ) {
        val scale = maxWidth.value / ShopMateFigmaFrameWidth

        fun Float.s(): Dp = scaledDp(scale)

        val targetX = 175.33f.s()
        val targetY = 39f.s()
        val targetSize = 38f.s()
        val startX = 68.333f.s()
        val startY = 198.18f.s()
        val startSize = 252f.s()

        var started by remember(request.id) { mutableStateOf(false) }
        val animatedX by animateDpAsState(
            targetValue = if (started) targetX else startX,
            animationSpec = tween(
                durationMillis = BuddyTransitionDurationMs,
                easing = FastOutSlowInEasing,
            ),
            label = "buddyTransitionX",
        )
        val animatedY by animateDpAsState(
            targetValue = if (started) targetY else startY,
            animationSpec = tween(
                durationMillis = BuddyTransitionDurationMs,
                easing = FastOutSlowInEasing,
            ),
            label = "buddyTransitionY",
        )
        val animatedSize by animateDpAsState(
            targetValue = if (started) targetSize else startSize,
            animationSpec = tween(
                durationMillis = BuddyTransitionDurationMs,
                easing = FastOutSlowInEasing,
            ),
            label = "buddyTransitionSize",
        )
        val animatedAlpha by animateFloatAsState(
            targetValue = if (started) 0f else 1f,
            animationSpec = tween(
                durationMillis = BuddyTransitionDurationMs,
                delayMillis = 120,
                easing = LinearEasing,
            ),
            label = "buddyTransitionAlpha",
        )

        LaunchedEffect(request.id) {
            started = true
            delay(BuddyTransitionDurationMs.toLong())
            onFinished(request)
        }

        ShopMateBuddyMotion(
            state = ShopMateBuddyMotionState.Arrival,
            fallbackRes = R.drawable.home_chat_buddy,
            contentDescription = null,
            modifier = Modifier
                .offset(
                    x = animatedX,
                    y = animatedY,
                )
                .size(animatedSize)
                .alpha(animatedAlpha),
        )
    }
}

private const val BuddyTransitionDurationMs = 620
