package com.shopmate.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun ShopMateCircleIconButton(
    icon: Int,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    iconSize: Dp,
    backgroundColor: Color = Color.White.copy(alpha = 0.78f),
    elevation: Dp = 8.dp,
    enabled: Boolean = true
) {
    ShopMateRoundedIconButton(
        onClick = onClick,
        backgroundColor = backgroundColor,
        shape = CircleShape,
        elevation = elevation,
        enabled = enabled,
        modifier = modifier
    ) {
        Image(
            painter = painterResource(id = icon),
            contentDescription = contentDescription,
            modifier = Modifier.size(iconSize)
        )
    }
}
