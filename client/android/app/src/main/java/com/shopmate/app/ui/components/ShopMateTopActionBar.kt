package com.shopmate.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
    buttonBackgroundColor: Color = Color.White,
    controlScale: Float = ShopMateReadableControlScale,
) {
    fun Float.s(): Dp = (this * scale).dp
    val controlSize = 38f * controlScale
    val iconSize = 16f * controlScale
    val controlOffset = (controlSize - 38f) / 2f

    if (!showCenterBuddy) {
        Row(
            modifier = modifier,
            verticalAlignment = Alignment.CenterVertically
        ) {
            ShopMateCircleIconButton(
                icon = leftIcon,
                contentDescription = leftContentDescription,
                onClick = onLeftClick,
                modifier = Modifier.size(controlSize.s()),
                iconSize = iconSize.s(),
                backgroundColor = buttonBackgroundColor,
                showPressIndication = false,
            )
            Spacer(modifier = Modifier.weight(1f))
            ShopMateCircleIconButton(
                icon = rightIcon,
                contentDescription = rightContentDescription,
                onClick = onRightClick,
                modifier = Modifier.size(controlSize.s()),
                iconSize = iconSize.s(),
                backgroundColor = buttonBackgroundColor,
                showPressIndication = false,
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
                .offset(x = (14f - controlOffset).s(), y = (3f - controlOffset).s())
                .size(controlSize.s()),
            iconSize = iconSize.s(),
            backgroundColor = buttonBackgroundColor,
            showPressIndication = false,
        )

        ShopMateBuddyMotion(
            state = centerBuddyMotionState,
            fallbackRes = R.drawable.sidebar_shopmate_buddy,
            contentDescription = "Shopmate Buddy",
            modifier = Modifier
                .offset(x = (175.33f - controlOffset).s(), y = (3f - controlOffset).s())
                .size(controlSize.s()),
        )

        ShopMateCircleIconButton(
            icon = rightIcon,
            contentDescription = rightContentDescription,
            onClick = onRightClick,
            modifier = Modifier
                .offset(x = (332.67f - controlOffset).s(), y = (3f - controlOffset).s())
                .size(controlSize.s()),
            iconSize = iconSize.s(),
            backgroundColor = buttonBackgroundColor,
            showPressIndication = false,
        )
    }
}
