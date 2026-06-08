package com.shopmate.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.ShopMateTheme

@Composable
fun ShopMateStatusMessage(
    title: String,
    message: String,
    actionText: String,
    onActionClick: () -> Unit,
    modifier: Modifier = Modifier,
    mascot: Int = R.drawable.sidebar_shopmate_buddy,
    scale: Float = 1f
) {
    fun Float.s(): Dp = (this * scale).dp

    val cardShape = RoundedCornerShape(24f.s())

    Box(
        modifier = modifier
            .shadow(
                elevation = 14f.s(),
                shape = cardShape,
                clip = false
            )
            .clip(cardShape)
            .background(Color.White.copy(alpha = 0.96f))
            .border(
                width = 0.667.dp,
                color = Color(0xFFEFF3F2).copy(alpha = 0.96f),
                shape = cardShape
            ),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier.size(width = 276f.s(), height = 196f.s())
        ) {
            Image(
                painter = painterResource(id = mascot),
                contentDescription = null,
                modifier = Modifier
                    .offset(x = 103f.s(), y = 0.dp)
                    .size(70f.s()),
                contentScale = ContentScale.Fit
            )

            Text(
                text = title,
                color = ShopMateTextPrimary,
                fontSize = (20f * scale).sp,
                lineHeight = (27f * scale).sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                maxLines = 1,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .offset(x = 0.dp, y = 82f.s())
                    .width(276f.s())
            )

            Text(
                text = message,
                color = Color(0xFF6E7781),
                fontSize = (13f * scale).sp,
                lineHeight = (20f * scale).sp,
                textAlign = TextAlign.Center,
                maxLines = 2,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .offset(x = 14f.s(), y = 116f.s())
                    .width(248f.s())
            )

            Box(
                modifier = Modifier
                    .offset(x = 56f.s(), y = 164f.s())
                    .size(width = 164f.s(), height = 38f.s())
                    .clip(ShopMatePillShape)
                    .background(Color(0xFFE9FBF3))
                    .clickable(role = Role.Button, onClick = onActionClick),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = actionText,
                    color = ShopMateGreen,
                    fontSize = (13f * scale).sp,
                    lineHeight = (17f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp
                )
            }
        }
    }
}

@Preview(
    name = "Status message",
    widthDp = 360,
    heightDp = 260,
    showBackground = true,
    backgroundColor = 0xFFFBFDFC
)
@Composable
private fun ShopMateStatusMessagePreview() {
    ShopMateTheme {
        ShopMateStatusMessage(
            title = "暂时没有找到结果",
            message = "可以换个关键词，或者减少一些筛选条件再试试。",
            actionText = "重新输入",
            onActionClick = {},
            modifier = Modifier.size(width = 320.dp, height = 230.dp)
        )
    }
}
