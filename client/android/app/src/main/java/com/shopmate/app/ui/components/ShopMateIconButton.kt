package com.shopmate.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import com.shopmate.app.ui.theme.ShopMateRoundedIconButtonShape
import com.shopmate.app.ui.theme.ShopMateSurfaceSoft

@Composable
fun ShopMateRoundedIconButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    backgroundColor: Color = ShopMateSurfaceSoft,
    content: @Composable () -> Unit
) {
    Box(
        modifier = modifier
            .clip(ShopMateRoundedIconButtonShape)
            .background(backgroundColor)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        content()
    }
}
