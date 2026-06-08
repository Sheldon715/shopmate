package com.shopmate.app.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private val ShopMateSkeletonBase = Color(0xFFE8F1ED)

@Composable
fun ShopMateSkeletonBlock(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 14.dp,
    color: Color = ShopMateSkeletonBase,
) {
    val transition = rememberInfiniteTransition(label = "shopmate-skeleton")
    val alpha by transition.animateFloat(
        initialValue = 0.58f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 920, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "shopmate-skeleton-alpha",
    )

    androidx.compose.foundation.layout.Box(
        modifier = modifier
            .clip(RoundedCornerShape(cornerRadius))
            .background(color.copy(alpha = alpha)),
    )
}

@Composable
fun ShopMateSkeletonTextLine(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 999.dp,
) {
    ShopMateSkeletonBlock(
        modifier = modifier,
        cornerRadius = cornerRadius,
        color = Color(0xFFDDEAE5),
    )
}
