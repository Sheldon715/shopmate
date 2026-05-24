package com.shopmate.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import com.shopmate.app.ui.theme.ShopMateRoundedIconButtonShape
import com.shopmate.app.ui.theme.ShopMateSurfaceSoft

@Composable
fun ShopMateRoundedIconButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    backgroundColor: Color = ShopMateSurfaceSoft,
    shape: Shape = ShopMateRoundedIconButtonShape,
    elevation: androidx.compose.ui.unit.Dp = androidx.compose.ui.unit.Dp.Unspecified,
    enabled: Boolean = true,
    content: @Composable () -> Unit
) {
    val shadowModifier = if (elevation != androidx.compose.ui.unit.Dp.Unspecified) {
        Modifier.shadow(elevation = elevation, shape = shape, clip = false)
    } else {
        Modifier
    }

    Box(
        modifier = modifier
            .then(shadowModifier)
            .clip(shape)
            .background(backgroundColor, shape)
            .alpha(if (enabled) 1f else 0.55f)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        content()
    }
}
