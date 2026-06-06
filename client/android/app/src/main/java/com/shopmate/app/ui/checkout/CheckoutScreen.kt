package com.shopmate.app.ui.checkout

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R
import com.shopmate.app.ui.components.ShopMateCircleIconButton
import com.shopmate.app.ui.components.ShopMateProductImage
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateLightGreen
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateSurfaceSoft
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.ShopMateTheme
import com.shopmate.app.ui.theme.shopMateScreenBackground

@Composable
fun CheckoutScreen(
    state: CheckoutUiState,
    onBackClick: () -> Unit,
    onRecipientChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onAddressChange: (String) -> Unit,
    onAddressEditClick: () -> Unit,
    onAddressBookClick: () -> Unit,
    onAddressPanelBack: () -> Unit,
    onAddressAddClick: () -> Unit,
    onSavedAddressClick: (String) -> Unit,
    onSavedAddressEditClick: (String) -> Unit,
    onAddressFormRecipientChange: (String) -> Unit,
    onAddressFormPhoneChange: (String) -> Unit,
    onAddressFormFullAddressChange: (String) -> Unit,
    onAddressFormRegionChange: (String) -> Unit,
    onAddressTagClick: (String) -> Unit,
    onAddressSaveClick: () -> Unit,
    onDeliveryMethodClick: (String) -> Unit,
    onPaymentMethodClick: (String) -> Unit,
    onSubmitClick: () -> Unit,
    onReturnToCart: () -> Unit,
    onReturnToChat: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .shopMateScreenBackground()
    ) {
        val orderResult = state.orderResult
        if (orderResult != null) {
            CheckoutSuccessContent(
                result = orderResult,
                onReturnToCart = onReturnToCart,
                onReturnToChat = onReturnToChat,
                modifier = Modifier.fillMaxSize()
            )
            return@Box
        }

        when (state.addressMode) {
            CheckoutAddressModeUi.Edit -> {
                CheckoutAddressEditScreen(
                    state = state,
                    onBackClick = onAddressPanelBack,
                    onRecipientChange = onAddressFormRecipientChange,
                    onPhoneChange = onAddressFormPhoneChange,
                    onFullAddressChange = onAddressFormFullAddressChange,
                    onRegionChange = onAddressFormRegionChange,
                    onTagClick = onAddressTagClick,
                    onSaveClick = onAddressSaveClick,
                    modifier = Modifier.fillMaxSize(),
                )
                return@Box
            }

            CheckoutAddressModeUi.Book -> {
                CheckoutAddressBookScreen(
                    state = state,
                    onBackClick = onAddressPanelBack,
                    onAddClick = onAddressAddClick,
                    onAddressClick = onSavedAddressClick,
                    onAddressEditClick = onSavedAddressEditClick,
                    modifier = Modifier.fillMaxSize(),
                )
                return@Box
            }

            CheckoutAddressModeUi.Summary -> Unit
        }

        val draft = state.draft
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = 18.dp, top = 38.dp, end = 18.dp, bottom = 122.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            CheckoutHeader(
                submitting = state.isSubmitting,
                onBackClick = onBackClick,
            )

            if (draft == null) {
                CheckoutInlineMessage(
                    title = "订单信息不可用",
                    message = "请返回购物车重新结算。"
                )
            } else {
                CheckoutAddressCard(
                    shipping = state.editableShipping,
                    selectedAddress = state.selectedAddress,
                    phoneFallback = draft.address.phoneMasked,
                    errors = state.fieldErrors,
                    onEditClick = onAddressEditClick,
                    onBookClick = onAddressBookClick,
                )

                CheckoutItemsSection(items = draft.items)

                DeliverySection(
                    options = draft.deliveryOptions,
                    selectedType = state.selectedDeliveryMethodType,
                    errorMessage = state.fieldErrors.deliveryMethod,
                    onOptionClick = onDeliveryMethodClick,
                )

                PaymentSection(
                    options = draft.paymentOptions,
                    selectedType = state.selectedPaymentMethodType,
                    errorMessage = state.fieldErrors.paymentMethod,
                    onOptionClick = onPaymentMethodClick,
                )

                AmountSection(
                    summary = draft.summary,
                    selectedDelivery = state.selectedDeliveryMethod,
                    totalText = state.estimatedTotalText,
                )

                if (state.errorMessage != null) {
                    CheckoutInlineMessage(
                        title = "提交失败",
                        message = state.errorMessage,
                    )
                }
            }
        }

        CheckoutSubmitBar(
            totalText = state.estimatedTotalText,
            selectedCount = draft?.summary?.selectedCount ?: 0,
            submitting = state.isSubmitting,
            enabled = draft != null && !state.isSubmitting,
            onSubmitClick = onSubmitClick,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .imePadding()
                .navigationBarsPadding()
        )
    }
}

@Composable
private fun CheckoutHeader(
    submitting: Boolean,
    onBackClick: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ShopMateCircleIconButton(
            icon = R.drawable.ic_back,
            contentDescription = "返回购物车",
            onClick = onBackClick,
            enabled = !submitting,
            modifier = Modifier.size(38.dp),
            iconSize = 18.dp,
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(
                text = "确认订单",
                color = ShopMateTextPrimary,
                fontSize = 28.sp,
                lineHeight = 32.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
            )
            Text(
                text = "核对收货、配送和支付方式",
                color = Color(0xFF7C8792),
                fontSize = 13.sp,
                lineHeight = 18.sp,
                letterSpacing = 0.sp,
            )
        }
    }
}

@Composable
private fun CheckoutAddressCard(
    shipping: CheckoutShippingInputUi,
    selectedAddress: CheckoutSavedAddressUi?,
    phoneFallback: String,
    errors: CheckoutFieldErrorsUi,
    onEditClick: () -> Unit,
    onBookClick: () -> Unit,
) {
    val displayPhone = selectedAddress?.phone?.takeIf { value -> value.isNotBlank() }
        ?: shipping.phone.takeIf { value -> value.isNotBlank() }
        ?: selectedAddress?.phoneMasked?.takeIf { value -> value.isNotBlank() }
        ?: phoneFallback
    val tag = selectedAddress?.tag?.takeIf { value -> value.isNotBlank() }
    val hasAddressError = errors.recipient != null || errors.phone != null || errors.fullAddress != null

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color.White.copy(alpha = 0.96f))
            .border(0.667.dp, Color(0xFFEEF2F1), RoundedCornerShape(20.dp))
            .padding(horizontal = 14.dp, vertical = 15.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (tag != null) {
                        AddressTagChip(text = tag, selected = true)
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text(
                        text = shipping.fullAddress.ifBlank { "请选择收货地址" },
                        color = ShopMateTextPrimary,
                        fontSize = 18.sp,
                        lineHeight = 24.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        letterSpacing = 0.sp,
                    )
                }
                Text(
                    text = listOf(shipping.recipient, displayPhone)
                        .filter { value -> value.isNotBlank() }
                        .joinToString("  "),
                    color = Color(0xFF68737E),
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    letterSpacing = 0.sp,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            AddressIconActionButton(
                iconRes = R.drawable.ic_checkout_edit,
                contentDescription = "编辑地址",
                onClick = onEditClick,
                backgroundColor = ShopMateGreen.copy(alpha = 0.12f),
                iconTint = ShopMateGreen,
            )
            Spacer(modifier = Modifier.width(6.dp))
            AddressIconActionButton(
                iconRes = R.drawable.ic_checkout_chevron_right,
                contentDescription = "查看地址簿",
                onClick = onBookClick,
            )
        }
        if (hasAddressError) {
            Text(
                text = errors.phone ?: errors.recipient ?: errors.fullAddress.orEmpty(),
                color = Color(0xFFB04D2D),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
            )
        }
    }
}

@Composable
private fun CheckoutAddressEditScreen(
    state: CheckoutUiState,
    onBackClick: () -> Unit,
    onRecipientChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onFullAddressChange: (String) -> Unit,
    onRegionChange: (String) -> Unit,
    onTagClick: (String) -> Unit,
    onSaveClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .shopMateScreenBackground()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = 18.dp, top = 38.dp, end = 18.dp, bottom = 104.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            AddressSubPageHeader(
                title = if (state.editingAddressId == null) "新增地址" else "编辑地址",
                trailingText = null,
                onBackClick = onBackClick,
            )
            AddressSearchRow()
            AddressFormSection(
                form = state.addressForm,
                errors = state.fieldErrors,
                onRegionChange = onRegionChange,
                onFullAddressChange = onFullAddressChange,
                onRecipientChange = onRecipientChange,
                onPhoneChange = onPhoneChange,
            )
            AddressTagSection(
                selectedTag = state.addressForm.tag,
                onTagClick = onTagClick,
            )
        }
        CheckoutActionButton(
            text = "保存地址",
            primary = true,
            onClick = onSaveClick,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 18.dp, vertical = 18.dp)
                .navigationBarsPadding(),
        )
    }
}

@Composable
private fun CheckoutAddressBookScreen(
    state: CheckoutUiState,
    onBackClick: () -> Unit,
    onAddClick: () -> Unit,
    onAddressClick: (String) -> Unit,
    onAddressEditClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .shopMateScreenBackground()
            .verticalScroll(rememberScrollState())
            .padding(start = 18.dp, top = 38.dp, end = 18.dp, bottom = 28.dp)
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        AddressSubPageHeader(
            title = "收货地址",
            trailingText = "新增地址",
            onBackClick = onBackClick,
            onTrailingClick = onAddClick,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(Color.White.copy(alpha = 0.94f))
                .border(0.667.dp, Color(0xFFEEF2F1), RoundedCornerShape(18.dp))
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "⌕",
                color = ShopMateTextPrimary,
                fontSize = 24.sp,
                lineHeight = 26.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = "搜索姓名、手机号或地址",
                color = Color(0xFF8B949D),
                fontSize = 14.sp,
                lineHeight = 20.sp,
                letterSpacing = 0.sp,
            )
            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = "管理",
                color = ShopMateTextPrimary,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
            )
        }
        state.savedAddresses.forEach { address ->
            SavedAddressCard(
                address = address,
                selected = address.id == state.selectedAddressId,
                onClick = { onAddressClick(address.id) },
                onEditClick = { onAddressEditClick(address.id) },
            )
        }
    }
}

@Composable
private fun AddressFormSection(
    form: CheckoutAddressFormUi,
    errors: CheckoutFieldErrorsUi,
    onRegionChange: (String) -> Unit,
    onFullAddressChange: (String) -> Unit,
    onRecipientChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
) {
    CheckoutSection(title = "收货信息") {
        AddressInputField(
            label = "* 所在区域",
            value = form.region,
            onValueChange = onRegionChange,
            placeholder = CHECKOUT_DEMO_REGION,
        )
        AddressInputField(
            label = "* 详细地址与门牌号",
            value = form.fullAddress,
            onValueChange = onFullAddressChange,
            placeholder = "例如 ShopMate 收货点 1 栋 201",
            errorMessage = errors.fullAddress,
            singleLine = false,
            minHeight = 82.dp,
        )
        AddressInputField(
            label = "* 收货人名字",
            value = form.recipient,
            onValueChange = onRecipientChange,
            placeholder = "请输入收货人",
            errorMessage = errors.recipient,
        )
        AddressInputField(
            label = "* 手机号",
            value = form.phone,
            onValueChange = onPhoneChange,
            placeholder = "请输入手机号",
            errorMessage = errors.phone,
            prefix = "+86",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        )
    }
}

@Composable
private fun AddressInputField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    errorMessage: String? = null,
    prefix: String? = null,
    singleLine: Boolean = true,
    minHeight: Dp = 58.dp,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
) {
    val borderColor = if (errorMessage == null) Color(0xFFE8EFED) else Color(0xFFFFB79E)

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = label,
            color = Color(0xFF6C7782),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            modifier = Modifier.padding(start = 2.dp),
        )
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            keyboardOptions = keyboardOptions,
            textStyle = TextStyle(
                color = ShopMateTextPrimary,
                fontSize = 16.sp,
                lineHeight = 21.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.sp,
            ),
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { innerTextField ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(minHeight)
                        .clip(RoundedCornerShape(18.dp))
                        .background(ShopMateSurfaceSoft)
                        .border(0.667.dp, borderColor, RoundedCornerShape(18.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = if (singleLine) Alignment.CenterVertically else Alignment.Top,
                ) {
                    if (prefix != null) {
                        Text(
                            text = prefix,
                            color = ShopMateGreen,
                            fontSize = 15.sp,
                            lineHeight = 20.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.sp,
                            modifier = Modifier.padding(end = 10.dp),
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        if (value.isBlank()) {
                            Text(
                                text = placeholder,
                                color = Color(0xFF9AA5AE),
                                fontSize = 15.sp,
                                lineHeight = 20.sp,
                                letterSpacing = 0.sp,
                            )
                        }
                        innerTextField()
                    }
                }
            },
        )
        if (errorMessage != null) {
            Text(
                text = errorMessage,
                color = Color(0xFFB04D2D),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                modifier = Modifier.padding(start = 2.dp),
            )
        }
    }
}

@Composable
private fun AddressTagSection(
    selectedTag: String,
    onTagClick: (String) -> Unit,
) {
    CheckoutSection(title = "地址标签") {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AddressTags.forEach { tag ->
                AddressTagChip(
                    text = tag,
                    selected = tag == selectedTag,
                    onClick = { onTagClick(tag) },
                )
            }
        }
        if (selectedTag == "自定义") {
            Text(
                text = "可在保存后作为自定义地址使用",
                color = Color(0xFF7C8792),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.sp,
            )
        }
    }
}

@Composable
private fun SavedAddressCard(
    address: CheckoutSavedAddressUi,
    selected: Boolean,
    onClick: () -> Unit,
    onEditClick: () -> Unit,
) {
    val borderColor = if (selected) ShopMateGreen.copy(alpha = 0.72f) else Color(0xFFEEF2F1)
    val showTag = address.tag.isNotBlank() && !(address.isDefault && address.tag == "默认")

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color.White.copy(alpha = 0.96f))
            .border(0.667.dp, borderColor, RoundedCornerShape(20.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (showTag) {
                AddressTagChip(text = address.tag, selected = selected)
            }
            if (address.isDefault) {
                if (showTag) {
                    Spacer(modifier = Modifier.width(8.dp))
                }
                AddressTagChip(text = "默认", selected = false)
            }
            Spacer(modifier = Modifier.weight(1f))
            AddressIconActionButton(
                iconRes = R.drawable.ic_checkout_edit,
                contentDescription = "编辑地址",
                onClick = onEditClick,
                backgroundColor = ShopMateGreen.copy(alpha = 0.12f),
                iconTint = ShopMateGreen,
            )
        }
        Text(
            text = address.fullAddress,
            color = ShopMateTextPrimary,
            fontSize = 17.sp,
            lineHeight = 23.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )
        Text(
            text = "${address.recipient}  ${address.phone.ifBlank { address.phoneMasked }}",
            color = Color(0xFF68737E),
            fontSize = 13.sp,
            lineHeight = 18.sp,
            letterSpacing = 0.sp,
        )
        Text(
            text = if (selected) "当前使用" else "点击使用这个地址",
            color = if (selected) ShopMateGreen else Color(0xFF7C8792),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )
    }
}

@Composable
private fun AddressSubPageHeader(
    title: String,
    trailingText: String?,
    onBackClick: () -> Unit,
    onTrailingClick: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ShopMateCircleIconButton(
            icon = R.drawable.ic_back,
            contentDescription = "返回",
            onClick = onBackClick,
            modifier = Modifier.size(38.dp),
            iconSize = 18.dp,
        )
        Spacer(modifier = Modifier.width(14.dp))
        Text(
            text = title,
            color = ShopMateTextPrimary,
            fontSize = 28.sp,
            lineHeight = 32.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            modifier = Modifier.weight(1f),
        )
        if (trailingText != null && onTrailingClick != null) {
            Text(
                text = trailingText,
                color = ShopMateGreen,
                fontSize = 16.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(role = Role.Button, onClick = onTrailingClick)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
            )
        }
    }
}

@Composable
private fun AddressSearchRow() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color.White.copy(alpha = 0.96f))
            .border(0.667.dp, Color(0xFFEEF2F1), RoundedCornerShape(20.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "⌕",
            color = ShopMateTextPrimary,
            fontSize = 27.sp,
            lineHeight = 28.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = "搜索地址，更快填写",
            color = Color(0xFF8B949D),
            fontSize = 15.sp,
            lineHeight = 20.sp,
            letterSpacing = 0.sp,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = "智能粘贴",
            color = ShopMateGreen,
            fontSize = 13.sp,
            lineHeight = 18.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )
    }
}

@Composable
private fun AddressTagChip(
    text: String,
    selected: Boolean,
    onClick: (() -> Unit)? = null,
) {
    val backgroundColor = if (selected) {
        ShopMateGreen.copy(alpha = 0.13f)
    } else {
        Color(0xFFF2F5F4)
    }
    val textColor = if (selected) ShopMateGreen else Color(0xFF59646E)
    val clickableModifier = if (onClick != null) {
        Modifier.clickable(role = Role.Button, onClick = onClick)
    } else {
        Modifier
    }

    Text(
        text = text,
        color = textColor,
        fontSize = 12.sp,
        lineHeight = 15.sp,
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        letterSpacing = 0.sp,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(backgroundColor)
            .then(clickableModifier)
            .padding(horizontal = 11.dp, vertical = 6.dp),
    )
}

@Composable
private fun AddressIconActionButton(
    iconRes: Int,
    contentDescription: String,
    onClick: () -> Unit,
    backgroundColor: Color = Color(0xFFF2F6F4),
    iconTint: Color = Color(0xFF65717C),
) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(backgroundColor)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(id = iconRes),
            contentDescription = contentDescription,
            tint = iconTint,
            modifier = Modifier.size(19.dp),
        )
    }
}


@Composable
private fun CheckoutItemsSection(items: List<CheckoutItemUi>) {
    CheckoutSection(title = "商品清单") {
        if (items.isEmpty()) {
            Text(
                text = "当前没有可结算商品",
                color = Color(0xFF7C8792),
                fontSize = 13.sp,
                lineHeight = 18.sp,
                letterSpacing = 0.sp,
            )
        }
        items.forEach { item ->
            CheckoutItemRow(item = item)
        }
    }
}

@Composable
private fun CheckoutItemRow(item: CheckoutItemUi) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ShopMateSurfaceSoft)
            .border(0.667.dp, Color(0xFFE8EFED), RoundedCornerShape(16.dp))
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(70.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Color.White),
            contentAlignment = Alignment.Center,
        ) {
            ShopMateProductImage(
                imageUrl = item.imageUrl,
                placeholderRes = R.drawable.product_zero_air,
                contentDescription = item.productName,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }
        Spacer(modifier = Modifier.width(10.dp))
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = item.productName,
                color = ShopMateTextPrimary,
                fontSize = 14.sp,
                lineHeight = 19.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                letterSpacing = 0.sp,
            )
            Text(
                text = listOf(item.brand, item.category)
                    .filter { value -> value.isNotBlank() }
                    .joinToString(" · "),
                color = Color(0xFF7C8792),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                letterSpacing = 0.sp,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = item.unitPriceText,
                    color = ShopMateGreen,
                    fontSize = 14.sp,
                    lineHeight = 18.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                )
                Text(
                    text = "x${item.quantity}  小计 ${item.subtotalText}",
                    color = ShopMateTextPrimary,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                )
            }
        }
    }
}

@Composable
private fun DeliverySection(
    options: List<CheckoutDeliveryMethodUi>,
    selectedType: String?,
    errorMessage: String?,
    onOptionClick: (String) -> Unit,
) {
    CheckoutSection(title = "配送方式") {
        options.forEach { option ->
            SelectableOptionRow(
                title = option.label,
                subtitle = option.etaText,
                trailing = if (option.feeCents == 0) "免运费" else option.feeText,
                selected = option.type == selectedType,
                onClick = { onOptionClick(option.type) },
            )
        }
        ErrorText(errorMessage)
    }
}

@Composable
private fun PaymentSection(
    options: List<CheckoutPaymentMethodUi>,
    selectedType: String?,
    errorMessage: String?,
    onOptionClick: (String) -> Unit,
) {
    CheckoutSection(title = "支付方式") {
        options.forEach { option ->
            SelectableOptionRow(
                title = option.label,
                subtitle = "提交后不会发起真实扣款",
                trailing = "未扣款",
                selected = option.type == selectedType,
                onClick = { onOptionClick(option.type) },
            )
        }
        ErrorText(errorMessage)
    }
}

@Composable
private fun AmountSection(
    summary: CheckoutSummaryUi,
    selectedDelivery: CheckoutDeliveryMethodUi?,
    totalText: String,
) {
    CheckoutSection(title = "金额明细") {
        AmountLine(label = "商品金额", value = summary.subtotalText)
        AmountLine(
            label = "配送费",
            value = selectedDelivery?.feeText ?: summary.shippingFeeText,
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Color(0xFFE8EFED))
        )
        AmountLine(label = "应付金额", value = totalText, emphasized = true)
    }
}

@Composable
private fun SelectableOptionRow(
    title: String,
    subtitle: String,
    trailing: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val borderColor = if (selected) ShopMateGreen.copy(alpha = 0.75f) else Color(0xFFE8EFED)
    val backgroundColor = if (selected) ShopMateGreen.copy(alpha = 0.08f) else ShopMateSurfaceSoft

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(backgroundColor)
            .border(0.667.dp, borderColor, RoundedCornerShape(16.dp))
            .clickable(role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = title,
                color = ShopMateTextPrimary,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                letterSpacing = 0.sp,
            )
            Text(
                text = subtitle,
                color = Color(0xFF7C8792),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                letterSpacing = 0.sp,
            )
        }
        Text(
            text = trailing,
            color = if (selected) ShopMateGreen else Color(0xFF65717C),
            fontSize = 13.sp,
            lineHeight = 18.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            letterSpacing = 0.sp,
        )
    }
}

@Composable
private fun AmountLine(
    label: String,
    value: String,
    emphasized: Boolean = false,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            color = if (emphasized) ShopMateTextPrimary else Color(0xFF68737E),
            fontSize = if (emphasized) 15.sp else 13.sp,
            lineHeight = 20.sp,
            fontWeight = if (emphasized) FontWeight.Bold else FontWeight.Normal,
            letterSpacing = 0.sp,
        )
        Text(
            text = value,
            color = if (emphasized) ShopMateGreen else ShopMateTextPrimary,
            fontSize = if (emphasized) 20.sp else 14.sp,
            lineHeight = 22.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )
    }
}

@Composable
private fun CheckoutSubmitBar(
    totalText: String,
    selectedCount: Int,
    submitting: Boolean,
    enabled: Boolean,
    onSubmitClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .shadow(16.dp, RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp), clip = false)
            .background(Color.White.copy(alpha = 0.98f))
            .padding(start = 18.dp, top = 14.dp, end = 18.dp, bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "应付金额",
                color = Color(0xFF6D7882),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.sp,
            )
            Text(
                text = totalText,
                color = ShopMateTextPrimary,
                fontSize = 23.sp,
                lineHeight = 25.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                letterSpacing = 0.sp,
            )
        }
        Box(
            modifier = Modifier
                .width(150.dp)
                .height(46.dp)
                .clip(ShopMatePillShape)
                .background(
                    if (enabled) {
                        Brush.linearGradient(listOf(ShopMateLightGreen, ShopMateGreen))
                    } else {
                        Brush.linearGradient(listOf(Color(0xFFD9E9E3), Color(0xFFD0E4DB)))
                    }
                )
                .clickable(enabled = enabled, role = Role.Button, onClick = onSubmitClick),
            contentAlignment = Alignment.Center,
        ) {
            if (submitting) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(22.dp),
                )
            } else {
                Text(
                    text = "提交订单 ($selectedCount)",
                    color = Color.White.copy(alpha = if (enabled) 1f else 0.72f),
                    fontSize = 14.sp,
                    lineHeight = 18.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    letterSpacing = 0.sp,
                )
            }
        }
    }
}

@Composable
private fun CheckoutSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color.White.copy(alpha = 0.96f))
            .border(0.667.dp, Color(0xFFEEF2F1), RoundedCornerShape(20.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = title,
            color = ShopMateTextPrimary,
            fontSize = 17.sp,
            lineHeight = 22.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )
        content()
    }
}

@Composable
private fun CheckoutInlineMessage(
    title: String,
    message: String,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Color(0xFFFFF6F1))
            .border(0.667.dp, Color(0xFFFFD7C7), RoundedCornerShape(18.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = title,
            color = Color(0xFFB04D2D),
            fontSize = 14.sp,
            lineHeight = 18.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )
        Text(
            text = message,
            color = Color(0xFF8A5E4F),
            fontSize = 13.sp,
            lineHeight = 18.sp,
            letterSpacing = 0.sp,
        )
    }
}

@Composable
private fun ErrorText(message: String?) {
    if (message == null) {
        return
    }

    Text(
        text = message,
        color = Color(0xFFB04D2D),
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.sp,
    )
}

@Composable
private fun CheckoutSuccessContent(
    result: CheckoutOrderResultUi,
    onReturnToCart: () -> Unit,
    onReturnToChat: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .padding(horizontal = 24.dp)
            .navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(74.dp)
                .clip(RoundedCornerShape(37.dp))
                .background(ShopMateGreen.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "✓",
                color = ShopMateGreen,
                fontSize = 36.sp,
                lineHeight = 38.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
            )
        }
        Spacer(modifier = Modifier.height(18.dp))
        Text(
            text = "订单已提交",
            color = ShopMateTextPrimary,
            fontSize = 26.sp,
            lineHeight = 32.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )
        Text(
            text = "订单号 ${result.displayOrderNumber}",
            color = Color(0xFF6E7984),
            fontSize = 14.sp,
            lineHeight = 20.sp,
            textAlign = TextAlign.Center,
            letterSpacing = 0.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            text = "应付 ${result.totalText}",
            color = ShopMateGreen,
            fontSize = 20.sp,
            lineHeight = 24.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            modifier = Modifier.padding(top = 10.dp),
        )
        Spacer(modifier = Modifier.height(28.dp))
        CheckoutActionButton(
            text = "返回购物车",
            primary = true,
            onClick = onReturnToCart,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(10.dp))
        CheckoutActionButton(
            text = "回到聊天",
            primary = false,
            onClick = onReturnToChat,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun CheckoutActionButton(
    text: String,
    primary: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val background = if (primary) {
        Brush.linearGradient(listOf(ShopMateLightGreen, ShopMateGreen))
    } else {
        Brush.linearGradient(listOf(Color(0xFFF0F6F4), Color(0xFFEAF4F0)))
    }
    Box(
        modifier = modifier
            .height(48.dp)
            .clip(ShopMatePillShape)
            .background(background)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = if (primary) Color.White else ShopMateGreen,
            fontSize = 15.sp,
            lineHeight = 19.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        )
    }
}

@Preview(
    name = "Checkout screen",
    widthDp = 389,
    heightDp = 843,
    showBackground = true
)
@Composable
private fun CheckoutScreenPreview() {
    ShopMateTheme {
        CheckoutScreen(
            state = CheckoutUiState(
                draft = previewDraft(),
                editableShipping = CheckoutShippingInputUi(
                    recipient = "ShopMate 用户",
                    phone = "13800000000",
                    fullAddress = "ShopMate 收货点",
                ),
                selectedDeliveryMethodType = "standard",
                selectedPaymentMethodType = "wechat",
            ),
            onBackClick = {},
            onRecipientChange = {},
            onPhoneChange = {},
            onAddressChange = {},
            onAddressEditClick = {},
            onAddressBookClick = {},
            onAddressPanelBack = {},
            onAddressAddClick = {},
            onSavedAddressClick = {},
            onSavedAddressEditClick = {},
            onAddressFormRecipientChange = {},
            onAddressFormPhoneChange = {},
            onAddressFormFullAddressChange = {},
            onAddressFormRegionChange = {},
            onAddressTagClick = {},
            onAddressSaveClick = {},
            onDeliveryMethodClick = {},
            onPaymentMethodClick = {},
            onSubmitClick = {},
            onReturnToCart = {},
            onReturnToChat = {},
        )
    }
}

private fun previewDraft(): CheckoutDraftUi =
    CheckoutDraftUi(
        id = "draft-1",
        conversationId = "cart-button-checkout",
        items = listOf(
            CheckoutItemUi(
                cartItemId = "cart-item-1",
                productId = "product-1",
                productName = "通勤蓝牙耳机",
                brand = "示例品牌",
                category = "数码电子",
                unitPriceText = "¥199",
                unitPriceCents = 19900,
                quantity = 2,
                subtotalText = "¥398",
                subtotalCents = 39800,
                imageUrl = null,
            )
        ),
        summary = CheckoutSummaryUi(
            itemCount = 1,
            selectedCount = 2,
            subtotalText = "¥398",
            subtotalCents = 39800,
            shippingFeeText = "¥0",
            shippingFeeCents = 0,
            totalText = "¥398",
            totalCents = 39800,
        ),
        address = CheckoutAddressUi(
            label = "默认地址",
            recipient = "ShopMate 用户",
            phoneMasked = "138****0000",
            fullAddress = "ShopMate 收货点",
        ),
        deliveryOptions = listOf(
            CheckoutDeliveryMethodUi(
                type = "standard",
                label = "标准配送",
                feeText = "¥0",
                feeCents = 0,
                etaText = "预计 2-4 天送达",
            ),
            CheckoutDeliveryMethodUi(
                type = "express",
                label = "加急配送",
                feeText = "¥12",
                feeCents = 1200,
                etaText = "预计明天送达",
            ),
        ),
        paymentOptions = listOf(
            CheckoutPaymentMethodUi("wechat", "微信支付"),
            CheckoutPaymentMethodUi("alipay", "支付宝"),
            CheckoutPaymentMethodUi("bank_card", "银行卡"),
        ),
        expiresAt = "2026-06-06T00:15:00.000Z",
    )

private val AddressTags = listOf("家", "公司", "学校", "父母", "朋友", "自定义")
