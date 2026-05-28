package com.shopmate.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@Composable
fun ChatMessageBubble(
    text: String,
    fromUser: Boolean,
    textScale: Float,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .shadow(
                elevation = 8.dp,
                shape = RoundedCornerShape(16.dp),
                clip = false
            )
            .background(
                brush = if (fromUser) {
                    Brush.linearGradient(
                        colors = listOf(Color(0xFFCEF5E5), Color(0xFFB5EFD9))
                    )
                } else {
                    Brush.linearGradient(listOf(Color.White, Color.White))
                },
                shape = RoundedCornerShape(16.dp)
            )
            .border(
                width = if (fromUser) 0.dp else 0.667.dp,
                color = if (fromUser) Color.Transparent else Color(0xFFF0F3F3),
                shape = RoundedCornerShape(16.dp)
            )
    ) {
        Box(
            contentAlignment = if (fromUser) Alignment.Center else Alignment.TopStart,
            modifier = Modifier
                .padding(
                    horizontal = if (fromUser) 14.dp else 12.dp,
                    vertical = 10.dp,
                )
        ) {
            Text(
                text = text,
                color = if (fromUser) Color(0xFF275747) else Color(0xFF53606B),
                fontSize = (12f * textScale).sp,
                lineHeight = (18.6f * textScale).sp,
                letterSpacing = 0.sp,
                overflow = TextOverflow.Clip,
            )
        }
    }
}

@Composable
fun ChatTypingIndicatorBubble(
    textScale: Float,
    modifier: Modifier = Modifier,
) {
    var activeDot by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(280)
            activeDot = (activeDot + 1) % 3
        }
    }

    Box(
        modifier = modifier
            .shadow(
                elevation = 8.dp,
                shape = RoundedCornerShape(16.dp),
                clip = false,
            )
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(
                width = 0.667.dp,
                color = Color(0xFFF0F3F3),
                shape = RoundedCornerShape(16.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(3) { index ->
                Box(
                    modifier = Modifier
                        .size(if (index == activeDot) 6.dp else 5.dp)
                        .background(
                            color = if (index == activeDot) {
                                Color(0xFF46D79C)
                            } else {
                                Color(0xFFB9C7C2)
                            },
                            shape = RoundedCornerShape(50),
                        ),
                )
            }
        }
    }
}
