package com.shopmate.app.ui.theme

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
    drawBehind {
        drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(ShopMateSurface, ShopMateSurfaceSoft)
            )
        )
        drawCircle(
            brush = Brush.radialGradient(
                colorStops = arrayOf(
                    0f to Color(0xFF7FDCC1).copy(alpha = 0.26f),
                    0.36f to Color(0xFF7FDCC1).copy(alpha = 0.18f),
                    0.72f to Color(0xFF7FDCC1).copy(alpha = 0.07f),
                    1f to Color.Transparent
                ),
                center = Offset(
                    x = size.width * (299.27f / 388.667f),
                    y = size.height * 0.15f
                ),
                radius = size.maxDimension * 0.38f
            )
        )
    }
