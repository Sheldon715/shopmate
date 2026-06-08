package com.shopmate.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R
import com.shopmate.app.ui.theme.ShopMateGreen

@Composable
fun ShopMateOperationBanner(
    text: String,
    modifier: Modifier = Modifier,
) {
    val isError = text.contains("失败") ||
        text.contains("无法") ||
        text.contains("异常") ||
        text.contains("不可") ||
        text.contains("错误")
    val accentColor = if (isError) Color(0xFFB45B39) else ShopMateGreen
    val backgroundColors = if (isError) {
        listOf(Color(0xFFFFF7F1), Color(0xFFFFEFE5))
    } else {
        listOf(Color.White, Color(0xFFEAFBF4))
    }

    Row(
        modifier = modifier
            .shadow(
                elevation = 14.dp,
                shape = RoundedCornerShape(18.dp),
                clip = false,
            )
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(backgroundColors))
            .border(
                width = 0.667.dp,
                color = accentColor.copy(alpha = 0.2f),
                shape = RoundedCornerShape(18.dp),
            )
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(id = R.drawable.sidebar_shopmate_buddy),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(28.dp),
        )
        Text(
            text = text,
            color = Color(0xFF2C3540),
            fontSize = 14.sp,
            lineHeight = 18.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 9.dp),
        )
    }
}
