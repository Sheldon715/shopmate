package com.shopmate.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import com.shopmate.app.R
import kotlin.math.roundToInt

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

fun Modifier.shopMateScreenBackground(): Modifier = composed {
    val background = ImageBitmap.imageResource(id = R.drawable.shopmate_screen_background_mist)

    drawBehind {
        drawImage(
            image = background,
            srcOffset = IntOffset.Zero,
            srcSize = IntSize(background.width, background.height),
            dstOffset = IntOffset.Zero,
            dstSize = IntSize(
                width = size.width.roundToInt(),
                height = size.height.roundToInt()
            )
        )
    }
}

fun Modifier.shopMateOnboardingBackground(): Modifier =
    drawBehind {
        drawRect(
            brush = Brush.verticalGradient(
                colorStops = arrayOf(
                    0f to Color(0xFFF7FEFB),
                    0.44f to Color(0xFFF2FBF7),
                    1f to Color(0xFFFBFDFC)
                )
            )
        )
        drawCircle(
            brush = Brush.radialGradient(
                colorStops = arrayOf(
                    0f to Color(0xFF78E8BE).copy(alpha = 0.34f),
                    0.42f to Color(0xFF78E8BE).copy(alpha = 0.18f),
                    0.76f to Color(0xFF78E8BE).copy(alpha = 0.06f),
                    1f to Color.Transparent
                ),
                center = Offset(
                    x = size.width * 0.5f,
                    y = size.height * 0.5f
                ),
                radius = size.maxDimension * 0.46f
            )
        )
        drawRect(color = Color.White.copy(alpha = 0.28f))
    }
