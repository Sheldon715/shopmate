package com.shopmate.app.ui.sidebar

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
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
    editableConversationIds: Set<String> = emptySet(),
    onRenameHistory: (String, String) -> Unit = { _, _ -> },
    onDeleteHistory: (String) -> Unit = {},
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
            editableConversationIds = editableConversationIds,
            onRenameHistory = onRenameHistory,
            onDeleteHistory = onDeleteHistory,
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
    editableConversationIds: Set<String>,
    onRenameHistory: (String, String) -> Unit,
    onDeleteHistory: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val drawerShape = RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp)
    var menuConversationId by rememberSaveable { mutableStateOf<String?>(null) }
    var editingConversationId by rememberSaveable { mutableStateOf<String?>(null) }
    var editingTitle by rememberSaveable { mutableStateOf("") }

    fun startInlineRename(conversation: HistoryConversationUi) {
        menuConversationId = null
        editingConversationId = conversation.id
        editingTitle = conversation.title
    }

    fun finishInlineRename() {
        val conversationId = editingConversationId ?: return
        val normalizedTitle = editingTitle.trim()
        if (normalizedTitle.isNotBlank()) {
            onRenameHistory(conversationId, normalizedTitle)
        }
        editingConversationId = null
        editingTitle = ""
    }

    fun cancelInlineRename() {
        editingConversationId = null
        editingTitle = ""
    }

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

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
        ) {
            conversations.forEach { conversation ->
                val isEditable = conversation.id in editableConversationIds
                val isEditing = editingConversationId == conversation.id
                Box {
                    HistoryConversationRow(
                        conversation = conversation,
                        editable = isEditable,
                        isEditing = isEditing,
                        editingTitle = if (isEditing) editingTitle else conversation.title,
                        onEditingTitleChange = { value ->
                            editingTitle = value.take(MAX_RENAME_TITLE_LENGTH)
                        },
                        onFinishEditing = ::finishInlineRename,
                        onCancelEditing = ::cancelInlineRename,
                        onClick = {
                            menuConversationId = null
                            if (!isEditing) {
                                onHistoryClick(conversation)
                            }
                        },
                        onLongClick = {
                            if (isEditable) {
                                cancelInlineRename()
                                menuConversationId = conversation.id
                            }
                        }
                    )

                    if (menuConversationId == conversation.id) {
                        val density = LocalDensity.current
                        Popup(
                            alignment = Alignment.TopStart,
                            offset = with(density) {
                                IntOffset(x = 116.dp.roundToPx(), y = (-22).dp.roundToPx())
                            },
                            onDismissRequest = {
                                menuConversationId = null
                            },
                            properties = PopupProperties(focusable = true)
                        ) {
                            HistoryActionMenu(
                                onRenameClick = {
                                    startInlineRename(conversation)
                                },
                                onDeleteClick = {
                                    menuConversationId = null
                                    onDeleteHistory(conversation.id)
                                }
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(18.dp))

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
                    start = Offset(0f, size.height - strokeWidth / 2f),
                    end = Offset(size.width, size.height - strokeWidth / 2f),
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
    editable: Boolean,
    isEditing: Boolean,
    editingTitle: String,
    onEditingTitleChange: (String) -> Unit,
    onFinishEditing: () -> Unit,
    onCancelEditing: () -> Unit,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    val focusRequester = remember { FocusRequester() }
    var hasFocused by remember(isEditing) { mutableStateOf(false) }

    LaunchedEffect(isEditing) {
        if (isEditing) {
            focusRequester.requestFocus()
        }
    }

    val clickModifier = if (isEditing) {
        Modifier
    } else {
        Modifier.combinedClickable(
            interactionSource = interactionSource,
            indication = null,
            role = Role.Button,
            onClick = onClick,
            onLongClick = if (editable) onLongClick else null
        )
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(13.dp))
            .then(clickModifier)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (isEditing) {
            BasicTextField(
                value = editingTitle,
                onValueChange = { value ->
                    onEditingTitleChange(value.take(MAX_RENAME_TITLE_LENGTH))
                },
                singleLine = true,
                textStyle = TextStyle(
                    color = Color(0xFF293441),
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    letterSpacing = 0.sp
                ),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(
                    onDone = {
                        onFinishEditing()
                    }
                ),
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(focusRequester)
                    .onFocusChanged { focusState ->
                        if (focusState.isFocused) {
                            hasFocused = true
                        } else if (hasFocused) {
                            if (editingTitle.isBlank()) {
                                onCancelEditing()
                            } else {
                                onFinishEditing()
                            }
                        }
                    }
            )
        } else {
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
        }
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

@Composable
private fun HistoryActionMenu(
    onRenameClick: () -> Unit,
    onDeleteClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .width(158.dp)
            .height(88.dp)
            .shadow(
                elevation = 16.dp,
                shape = RoundedCornerShape(16.dp),
                clip = false
            )
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .padding(vertical = 2.dp)
    ) {
        HistoryActionMenuRow(
            label = "重命名",
            onClick = onRenameClick
        )
        HistoryActionMenuRow(
            label = "删除",
            onClick = onDeleteClick,
            color = Color(0xFFE66A4B)
        )
    }
}

@Composable
private fun HistoryActionMenuRow(
    label: String,
    onClick: () -> Unit,
    color: Color = Color(0xFF293441),
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(42.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Text(
            text = label,
            color = color,
            fontSize = 14.sp,
            lineHeight = 18.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1
        )
    }
}

private const val MAX_RENAME_TITLE_LENGTH = 24

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
