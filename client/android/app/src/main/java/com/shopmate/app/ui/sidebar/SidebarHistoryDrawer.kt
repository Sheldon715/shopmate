package com.shopmate.app.ui.sidebar

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.shopmate.app.R
import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.theme.ShopMateTextPrimary

@Composable
fun SidebarHistoryDrawer(
    isOpen: Boolean,
    conversations: List<HistoryConversationUi>,
    onDismiss: () -> Unit,
    onNewChatClick: () -> Unit,
    onCartClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onHistoryClick: (HistoryConversationUi) -> Unit,
    modifier: Modifier = Modifier
) {
    if (!isOpen) {
        return
    }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .zIndex(10f)
    ) {
        val drawerWidth = if (maxWidth < 340.dp) {
            maxWidth * 0.82f
        } else {
            280.dp
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.42f))
                .clickable(role = Role.Button, onClick = onDismiss)
        )

        SidebarPanel(
            conversations = conversations,
            onNewChatClick = onNewChatClick,
            onCartClick = onCartClick,
            onSettingsClick = onSettingsClick,
            onHistoryClick = onHistoryClick,
            modifier = Modifier
                .width(drawerWidth)
                .fillMaxHeight()
        )
    }
}

@Composable
private fun SidebarPanel(
    conversations: List<HistoryConversationUi>,
    onNewChatClick: () -> Unit,
    onCartClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onHistoryClick: (HistoryConversationUi) -> Unit,
    modifier: Modifier = Modifier
) {
    val drawerShape = RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp)

    Column(
        modifier = modifier
            .shadow(
                elevation = 18.dp,
                shape = drawerShape,
                clip = false
            )
            .clip(drawerShape)
            .background(Color.White)
            .padding(start = 20.dp, top = 60.dp, end = 20.dp, bottom = 34.dp)
    ) {
        AssistantHeader()

        Spacer(modifier = Modifier.height(16.dp))

        SidebarActionRow(
            icon = R.drawable.ic_sidebar_new_chat,
            label = "新聊天",
            onClick = onNewChatClick
        )
        Spacer(modifier = Modifier.height(8.dp))
        SidebarActionRow(
            icon = R.drawable.ic_sidebar_cart,
            label = "购物车",
            onClick = onCartClick
        )

        Spacer(modifier = Modifier.height(18.dp))

        Text(
            text = "历史聊天",
            color = Color(0xFF8C95A0),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp
        )

        Spacer(modifier = Modifier.height(10.dp))

        conversations.take(5).forEach { conversation ->
            HistoryConversationRow(
                conversation = conversation,
                onClick = { onHistoryClick(conversation) }
            )
        }

        Spacer(modifier = Modifier.weight(1f))

        SidebarActionRow(
            icon = R.drawable.ic_sidebar_settings,
            label = "设置",
            onClick = onSettingsClick
        )
    }
}

@Composable
private fun AssistantHeader(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(70.667.dp)
            .drawBehind {
                val strokeWidth = 0.667.dp.toPx()
                drawLine(
                    color = Color(0xFFEDF1F2),
                    start = androidx.compose.ui.geometry.Offset(0f, size.height - strokeWidth / 2f),
                    end = androidx.compose.ui.geometry.Offset(size.width, size.height - strokeWidth / 2f),
                    strokeWidth = strokeWidth
                )
            },
        verticalAlignment = Alignment.Top
    ) {
        Image(
            painter = painterResource(id = R.drawable.sidebar_shopmate_buddy),
            contentDescription = "Shopmate Buddy",
            modifier = Modifier.size(54.dp)
        )

        Spacer(modifier = Modifier.width(16.dp))

        Column(
            modifier = Modifier.padding(top = 3.dp)
        ) {
            Text(
                text = "AI 导购助手",
                color = ShopMateTextPrimary,
                fontSize = 17.sp,
                lineHeight = 20.4.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                maxLines = 1
            )
            Spacer(modifier = Modifier.height(11.dp))
            Text(
                text = "懂你所需 · 帮你选得更好",
                color = Color(0xFF8E98A2),
                fontSize = 12.sp,
                lineHeight = 16.2.sp,
                letterSpacing = 0.sp,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun SidebarActionRow(
    icon: Int,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(13.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            painter = painterResource(id = icon),
            contentDescription = null,
            modifier = Modifier.size(15.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = label,
            color = Color(0xFF293441),
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1
        )
    }
}

@Composable
private fun HistoryConversationRow(
    conversation: HistoryConversationUi,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(13.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = conversation.title,
            color = Color(0xFF293441),
            fontSize = 15.sp,
            lineHeight = 20.sp,
            letterSpacing = 0.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = conversation.timeText,
            color = Color(0xFFA2ABB3),
            fontSize = 13.sp,
            lineHeight = 17.333.sp,
            letterSpacing = 0.sp,
            maxLines = 1
        )
    }
}

@Preview(
    name = "Sidebar history drawer",
    widthDp = 389,
    heightDp = 843,
    showBackground = true,
    backgroundColor = 0xFF1F1F1F
)
@Composable
private fun SidebarHistoryDrawerPreview() {
    SidebarHistoryDrawer(
        isOpen = true,
        conversations = MockShopMateData.historyConversations,
        onDismiss = {},
        onNewChatClick = {},
        onCartClick = {},
        onSettingsClick = {},
        onHistoryClick = {}
    )
}
