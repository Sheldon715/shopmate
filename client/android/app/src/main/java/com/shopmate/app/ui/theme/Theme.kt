package com.shopmate.app.ui.theme

import androidx.compose.foundation.background
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

private val ShopMateColorScheme = lightColorScheme(
    primary = ShopMateGreen,
    onPrimary = Color.White,
    secondary = ShopMateLightGreen,
    background = ShopMateSurface,
    onBackground = ShopMateTextPrimary,
    surface = ShopMateSurface,
    onSurface = ShopMateTextPrimary,
    surfaceVariant = ShopMateSurfaceSoft,
    onSurfaceVariant = ShopMateTextSecondary
)

private val ShopMateShapes = Shapes(
    medium = ShopMateRoundedIconButtonShape,
    large = ShopMateRoundedCardShape,
    extraLarge = ShopMatePillShape
)

@Composable
fun ShopMateTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ShopMateColorScheme,
        shapes = ShopMateShapes,
        content = content
    )
}

fun Modifier.shopMateScreenBackground(): Modifier =
    background(
        Brush.verticalGradient(
            colors = listOf(ShopMateSurface, ShopMateSurfaceSoft)
        )
    ).drawBehind {
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    ShopMateMintGlow.copy(alpha = 0.32f),
                    Color(0xFF5C796E).copy(alpha = 0.16f),
                    Color.Transparent
                ),
                center = Offset(size.width / 2f, size.height * 0.24f),
                radius = size.minDimension * 0.34f
            )
        )
    }
