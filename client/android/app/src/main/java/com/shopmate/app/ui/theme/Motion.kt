package com.shopmate.app.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.ui.unit.dp

object ShopMateMotion {
    const val FastMillis = 120
    const val MediumMillis = 220
    const val SlowMillis = 320
    const val PressedScale = 0.97f
    const val SubtlePressedScale = 0.985f

    val StandardEasing: Easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
    val EntranceOffset = 10.dp
}
