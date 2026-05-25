package com.shopmate.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateLightGreen
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateSurfaceSoft

@Composable
fun ChatComposer(
    value: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    onVoiceClick: () -> Unit,
    onImageClick: () -> Unit,
    modifier: Modifier = Modifier,
    shadowElevation: Dp = 10.dp,
    sendEnabled: Boolean = value.isNotBlank()
) {
    val shadowModifier = if (shadowElevation > 0.dp) {
        Modifier.shadow(
            elevation = shadowElevation,
            shape = ShopMatePillShape,
            clip = false
        )
    } else {
        Modifier
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(52.dp)
            .then(shadowModifier)
            .background(
                color = Color.White,
                shape = ShopMatePillShape
            )
            .border(
                width = 1.dp,
                color = Color(0xFFEDF2F1),
                shape = ShopMatePillShape
            )
            .padding(start = 16.dp, top = 8.dp, end = 9.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(
                color = Color(0xFF53606B),
                fontSize = 12.sp,
                lineHeight = 18.sp,
                letterSpacing = 0.sp
            ),
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 2.dp),
            decorationBox = { innerTextField ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) {
                        Text(
                            text = "问问 Shopmate...",
                            color = Color(0xFFA3ADB6),
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                            letterSpacing = 0.sp
                        )
                    }
                    innerTextField()
                }
            }
        )

        Spacer(modifier = Modifier.width(7.dp))

        ComposerIconButton(
            icon = R.drawable.ic_mic,
            contentDescription = "语音输入",
            backgroundColor = Color(0xFFE9FBF3),
            onClick = onVoiceClick
        )

        Spacer(modifier = Modifier.width(7.dp))

        ComposerIconButton(
            icon = R.drawable.ic_image,
            contentDescription = "添加图片",
            backgroundColor = Color.White.copy(alpha = 0.78f),
            onClick = onImageClick
        )

        Spacer(modifier = Modifier.width(7.dp))

        SendButton(
            enabled = sendEnabled,
            onClick = onSend
        )
    }
}

@Composable
private fun ComposerIconButton(
    icon: Int,
    contentDescription: String,
    backgroundColor: Color,
    onClick: () -> Unit
) {
    ShopMateRoundedIconButton(
        onClick = onClick,
        backgroundColor = backgroundColor,
        modifier = Modifier.size(34.dp)
    ) {
        Image(
            painter = painterResource(id = icon),
            contentDescription = contentDescription,
            modifier = Modifier.size(16.dp)
        )
    }
}

@Composable
private fun SendButton(
    enabled: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(ShopMatePillShape)
            .background(
                brush = if (enabled) {
                    Brush.linearGradient(
                        colors = listOf(ShopMateLightGreen, ShopMateGreen)
                    )
                } else {
                    Brush.linearGradient(
                        colors = listOf(Color(0xFFE7ECEA), Color(0xFFD8E0DD))
                    )
                }
            )
            .clickable(
                enabled = enabled,
                role = Role.Button,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_send),
            contentDescription = "发送",
            modifier = Modifier.size(16.dp),
            alpha = if (enabled) 1f else 0.5f
        )
    }
}

@Preview(
    name = "Chat composer - disabled send",
    widthDp = 360,
    showBackground = true,
    backgroundColor = 0xFFFBFDFC
)
@Composable
private fun ChatComposerDisabledSendPreview() {
    ChatComposer(
        value = "",
        onValueChange = {},
        onSend = {},
        onVoiceClick = {},
        onImageClick = {},
        modifier = Modifier
            .padding(horizontal = 18.dp)
            .background(ShopMateSurfaceSoft)
    )
}

@Preview(
    name = "Chat composer - empty",
    widthDp = 389,
    showBackground = true,
    backgroundColor = 0xFFFBFDFC
)
@Composable
private fun ChatComposerEmptyPreview() {
    ChatComposer(
        value = "",
        onValueChange = {},
        onSend = {},
        onVoiceClick = {},
        onImageClick = {},
        modifier = Modifier
            .padding(horizontal = 18.dp)
            .background(ShopMateSurfaceSoft)
    )
}

@Preview(
    name = "Chat composer - typed",
    widthDp = 389,
    showBackground = true,
    backgroundColor = 0xFFFBFDFC
)
@Composable
private fun ChatComposerTypedPreview() {
    ChatComposer(
        value = "推荐适合通勤的蓝牙耳机",
        onValueChange = {},
        onSend = {},
        onVoiceClick = {},
        onImageClick = {},
        modifier = Modifier
            .padding(horizontal = 18.dp)
            .background(ShopMateSurfaceSoft)
    )
}
