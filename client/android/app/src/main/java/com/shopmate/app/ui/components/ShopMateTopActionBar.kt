package com.shopmate.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.shopmate.app.R

@Composable
fun ShopMateTopActionBar(
    scale: Float,
    leftIcon: Int,
    leftContentDescription: String,
    onLeftClick: () -> Unit,
    rightIcon: Int,
    rightContentDescription: String,
    onRightClick: () -> Unit,
    modifier: Modifier = Modifier,
    showCenterBuddy: Boolean = true,
    centerBuddyMotionState: ShopMateBuddyMotionState = ShopMateBuddyMotionState.Idle,
    buttonBackgroundColor: Color = Color.White.copy(alpha = 0.78f)
) {
    fun Float.s(): Dp = (this * scale).dp

    if (!showCenterBuddy) {
        Row(
            modifier = modifier,
            verticalAlignment = Alignment.CenterVertically
        ) {
            ShopMateCircleIconButton(
                icon = leftIcon,
                contentDescription = leftContentDescription,
                onClick = onLeftClick,
                modifier = Modifier.size(38f.s()),
                iconSize = 16f.s(),
                backgroundColor = buttonBackgroundColor
            )
            Spacer(modifier = Modifier.weight(1f))
            ShopMateCircleIconButton(
                icon = rightIcon,
                contentDescription = rightContentDescription,
                onClick = onRightClick,
                modifier = Modifier.size(38f.s()),
                iconSize = 16f.s(),
                backgroundColor = buttonBackgroundColor
            )
        }
        return
    }

    Box(modifier = modifier) {
        ShopMateCircleIconButton(
            icon = leftIcon,
            contentDescription = leftContentDescription,
            onClick = onLeftClick,
            modifier = Modifier
                .offset(x = 14f.s(), y = 3f.s())
                .size(38f.s()),
            iconSize = 16f.s(),
            backgroundColor = buttonBackgroundColor
        )

        ShopMateBuddyMotion(
            state = centerBuddyMotionState,
            fallbackRes = R.drawable.sidebar_shopmate_buddy,
            contentDescription = "Shopmate Buddy",
            modifier = Modifier
                .offset(x = 175.33f.s(), y = 3f.s())
                .size(38f.s())
                .shadow(
                    elevation = 8f.s(),
                    shape = CircleShape,
                    clip = false
                ),
        )

        ShopMateCircleIconButton(
            icon = rightIcon,
            contentDescription = rightContentDescription,
            onClick = onRightClick,
            modifier = Modifier
                .offset(x = 332.67f.s(), y = 3f.s())
                .size(38f.s()),
            iconSize = 16f.s(),
            backgroundColor = buttonBackgroundColor
        )
    }
}
