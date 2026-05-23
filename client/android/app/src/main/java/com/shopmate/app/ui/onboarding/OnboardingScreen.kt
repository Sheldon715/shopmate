package com.shopmate.app.ui.onboarding

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R

private const val FIGMA_WIDTH = 388.667f
private const val FIGMA_HEIGHT = 842.667f

@Composable
fun OnboardingScreen(
    onStartShopping: () -> Unit = {}
) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color.White, Color(0xFFFBFDFC))
                )
            )
            .drawBehind {
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            Color(0x52B8F1DB),
                            Color(0x295C796E),
                            Color.Transparent
                        ),
                        center = Offset(size.width / 2f, size.height * 0.24f),
                        radius = size.minDimension * 0.34f
                    )
                )
            }
    ) {
        val widthScale = maxWidth.value / FIGMA_WIDTH
        val heightScale = maxHeight.value / FIGMA_HEIGHT
        val textScale = minOf(widthScale, heightScale).coerceIn(0.88f, 1.08f)

        fun Float.w(): Dp = (this * widthScale).dp
        fun Float.h(): Dp = (this * heightScale).dp

        Box(
            modifier = Modifier
                .offset(x = 321.65f.w(), y = 273.98f.h())
                .size(24.042f.w()),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .size(width = 18f.w(), height = 16f.w())
                    .graphicsLayer(rotationZ = -45f)
                    .background(
                        color = Color(0x9EBFF2DC),
                        shape = RoundedCornerShape(2.824f.w())
                    )
            )
        }

        Image(
            painter = painterResource(id = R.drawable.mascot_assistant),
            contentDescription = null,
            modifier = Modifier
                .offset(x = 69.33f.w(), y = 130f.h())
                .size(width = 250f.w(), height = 294.448f.h()),
            contentScale = ContentScale.Fit
        )

        Text(
            text = "你好， 我是你的",
            color = Color(0xFF172331),
            fontSize = (30f * textScale).sp,
            lineHeight = (40.8f * textScale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 54f.w(), y = 448f.h())
                .width(293f.w())
        )

        Text(
            text = "AI 导购助手",
            color = Color(0xFF31C88C),
            fontSize = (37f * textScale).sp,
            lineHeight = (50.32f * textScale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 54f.w(), y = 488.8f.h())
                .width(293f.w())
        )

        Text(
            text = "告诉我你想买什么，我来帮你筛选和对比",
            color = Color(0xFF767F8A),
            fontSize = (15f * textScale).sp,
            lineHeight = (23.25f * textScale).sp,
            fontWeight = FontWeight.Normal,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 54f.w(), y = 562.5f.h())
                .width(293f.w())
        )

        StartShoppingButton(
            onClick = onStartShopping,
            modifier = Modifier
                .offset(x = 52f.w(), y = 716.67f.h())
                .size(width = 284.667f.w(), height = 68f.h()),
            textScale = textScale
        )

        Row(
            modifier = Modifier
                .offset(x = 46f.w(), y = 808.67f.h())
                .width(296.667f.w())
                .height(16f.h()),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            ValuePoint(
                icon = R.drawable.ic_value_need,
                label = "懂你所需",
                width = 98.885f.w(),
                textScale = textScale
            )
            ValuePoint(
                icon = R.drawable.ic_value_filter,
                label = "帮你筛选",
                width = 98.885f.w(),
                textScale = textScale
            )
            ValuePoint(
                icon = R.drawable.ic_value_pick,
                label = "陪你挑选",
                width = 98.885f.w(),
                textScale = textScale
            )
        }
    }
}

@Composable
private fun StartShoppingButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    textScale: Float
) {
    Box(
        modifier = modifier
            .shadow(
                elevation = 18.dp,
                shape = RoundedCornerShape(999.dp),
                clip = false
            )
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(Color(0xFF70DCAE), Color(0xFF31C88C))
                ),
                shape = RoundedCornerShape(999.dp)
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Text(
                text = "开始购物",
                color = Color.White,
                fontSize = (20f * textScale).sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                letterSpacing = 0.sp
            )
            Spacer(modifier = Modifier.width(8.dp))
            Image(
                painter = painterResource(id = R.drawable.ic_cta_arrow),
                contentDescription = null,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
private fun ValuePoint(
    icon: Int,
    label: String,
    width: Dp,
    textScale: Float
) {
    Row(
        modifier = Modifier.width(width),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Image(
            painter = painterResource(id = icon),
            contentDescription = null,
            modifier = Modifier.size(12.dp)
        )
        Spacer(modifier = Modifier.width(5.dp))
        Text(
            text = label,
            color = Color(0xFF7C8791),
            fontSize = (12f * textScale).sp,
            lineHeight = (16f * textScale).sp,
            fontWeight = FontWeight.Normal,
            letterSpacing = 0.sp
        )
    }
}

@Preview(
    name = "Figma target - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true
)
@Composable
private fun OnboardingScreenTargetPreview() {
    OnboardingScreen()
}

@Preview(
    name = "Compact Android - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true
)
@Composable
private fun OnboardingScreenCompactPreview() {
    OnboardingScreen()
}
