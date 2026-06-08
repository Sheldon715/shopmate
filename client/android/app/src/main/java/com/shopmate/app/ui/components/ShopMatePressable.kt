package com.shopmate.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Indication
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import com.shopmate.app.ui.theme.ShopMateMotion

fun Modifier.shopMatePressedScale(
    enabled: Boolean,
    interactionSource: MutableInteractionSource,
    pressedScale: Float = ShopMateMotion.PressedScale,
): Modifier = composed {
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (enabled && isPressed) pressedScale else 1f,
        animationSpec = tween(
            durationMillis = ShopMateMotion.FastMillis,
            easing = ShopMateMotion.StandardEasing,
        ),
        label = "shopmate-pressed-scale",
    )

    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

fun Modifier.shopMatePressable(
    enabled: Boolean = true,
    role: Role? = Role.Button,
    pressedScale: Float = ShopMateMotion.PressedScale,
    indication: Indication? = null,
    onClick: () -> Unit,
): Modifier = composed {
    val interactionSource = remember { MutableInteractionSource() }
    val resolvedIndication = indication ?: LocalIndication.current

    shopMatePressedScale(
        enabled = enabled,
        interactionSource = interactionSource,
        pressedScale = pressedScale,
    ).clickable(
        enabled = enabled,
        interactionSource = interactionSource,
        indication = resolvedIndication,
        role = role,
        onClick = onClick,
    )
}

@Composable
fun ShopMateEnterMotion(
    modifier: Modifier = Modifier,
    delayMillis: Int = 0,
    slideOffset: Dp = ShopMateMotion.EntranceOffset,
    content: @Composable () -> Unit,
) {
    var visible by remember { mutableStateOf(false) }
    val offsetPx = with(LocalDensity.current) { slideOffset.roundToPx() }
    val enterTransition = fadeIn(
        animationSpec = tween(
            durationMillis = ShopMateMotion.MediumMillis,
            delayMillis = delayMillis,
            easing = ShopMateMotion.StandardEasing,
        ),
    ) + slideInVertically(
        animationSpec = tween(
            durationMillis = ShopMateMotion.MediumMillis,
            delayMillis = delayMillis,
            easing = ShopMateMotion.StandardEasing,
        ),
        initialOffsetY = { offsetPx },
    )
    val exitTransition = fadeOut(
        animationSpec = tween(
            durationMillis = ShopMateMotion.FastMillis,
            easing = ShopMateMotion.StandardEasing,
        ),
    )

    LaunchedEffect(Unit) {
        visible = true
    }

    AnimatedVisibility(
        visible = visible,
        enter = enterTransition,
        exit = exitTransition,
        modifier = modifier,
    ) {
        content()
    }
}
