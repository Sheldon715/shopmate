package com.shopmate.app.ui.components

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

const val ShopMateFigmaFrameWidth = 388.667f
const val ShopMateFigmaFrameHeight = 842.667f
const val ShopMateReadableControlScale = 1.1f

fun Float.scaledDp(scale: Float): Dp = (this * scale).dp
