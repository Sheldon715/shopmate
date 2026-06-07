package com.shopmate.app.ui.cart

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopmate.app.R
import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.components.ShopMateCircleIconButton
import com.shopmate.app.ui.components.ShopMateElevatedSurface
import com.shopmate.app.ui.components.ShopMateFigmaFrameWidth
import com.shopmate.app.ui.components.ShopMateProductImage
import com.shopmate.app.ui.components.ShopMateStatusMessage
import com.shopmate.app.ui.components.scaledDp
import com.shopmate.app.ui.model.CartItemUi
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateLightGreen
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.ShopMateTheme
import com.shopmate.app.ui.theme.shopMateScreenBackground

@Composable
fun CartScreen(
    state: CartUiState,
    onBackClick: () -> Unit,
    onCheckoutClick: () -> Unit,
    onRetry: () -> Unit,
    onToggleSelected: (CartItemUi) -> Unit,
    onQuantityChange: (CartItemUi, Int) -> Unit,
    onDelete: (CartItemUi) -> Unit,
    onToggleAll: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cartLines = state.items.map { item ->
        CartLineState(
            item = item,
            quantity = item.quantity.coerceAtLeast(1),
            selected = item.selected,
            inFlight = state.operationInFlightItemId == item.id
        )
    }
    val selectedCount = state.summary.selectedCount
    val allSelected = cartLines.isNotEmpty() && cartLines.all { line -> line.selected }
    val showInlineError = state.errorMessage != null && cartLines.isNotEmpty()

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .shopMateScreenBackground()
    ) {
        val scale = maxWidth.value / ShopMateFigmaFrameWidth
        val textScale = scale.coerceIn(0.88f, 1.08f)

        fun Float.s(): Dp = scaledDp(scale)

        val footerHeight = 58f.s()
        val footerBottom = 18f.s()
        val footerTop = maxHeight - footerHeight - footerBottom
        val listTop = if (showInlineError) 294f.s() else 244f.s()
        val listBottomGap = 18f.s()
        val listHeight = (footerTop - listTop - listBottomGap).coerceAtLeast(242.dp)
        val itemHeight = 151.927f.s()
        val itemSpacing = 14f.s()
        val listShadowPadding = 8f.s()
        val listViewportWidth = 368.667f.s()
        val listViewportHeight = listHeight + listShadowPadding * 2
        val itemContentHeight = if (cartLines.isEmpty()) {
            listViewportHeight
        } else {
            itemHeight * cartLines.size + itemSpacing * (cartLines.size - 1) + listShadowPadding * 2
        }

        CartHeader(
            selectedCount = selectedCount,
            totalLines = cartLines.size,
            scale = scale,
            textScale = textScale,
            onBackClick = onBackClick
        )

        CartFeatureCard(
            scale = scale,
            textScale = textScale,
            modifier = Modifier
                .offset(x = 18f.s(), y = 144f.s())
                .size(width = 352.667f.s(), height = 82f.s())
        )

        if (showInlineError) {
            CartInlineErrorCard(
                message = state.errorMessage.orEmpty(),
                scale = scale,
                onRetry = onRetry,
                modifier = Modifier
                    .offset(x = 18f.s(), y = 235f.s())
                    .size(width = 352.667f.s(), height = 44f.s())
            )
        }

        Box(
            modifier = Modifier
                .offset(x = 10f.s(), y = listTop - listShadowPadding)
                .size(width = listViewportWidth, height = listViewportHeight)
                .verticalScroll(rememberScrollState())
        ) {
            if (state.isLoading && cartLines.isEmpty()) {
                CartLoadingState(
                    scale = scale,
                    modifier = Modifier
                        .offset(x = listShadowPadding, y = listShadowPadding)
                        .size(width = 352.667f.s(), height = listHeight)
                )
            } else if (state.errorMessage != null && cartLines.isEmpty()) {
                CartErrorState(
                    message = state.errorMessage,
                    canRetry = state.canRetry,
                    scale = scale,
                    onRetry = onRetry,
                    onBackClick = onBackClick,
                    modifier = Modifier
                        .offset(x = listShadowPadding, y = listShadowPadding)
                        .size(width = 352.667f.s(), height = listHeight)
                )
            } else if (cartLines.isEmpty()) {
                EmptyCartState(
                    scale = scale,
                    onBackClick = onBackClick,
                    modifier = Modifier
                        .offset(x = listShadowPadding, y = listShadowPadding)
                        .size(width = 352.667f.s(), height = listHeight)
                )
            } else {
                Box(
                    modifier = Modifier.size(
                        width = listViewportWidth,
                        height = itemContentHeight
                    )
                ) {
                    cartLines.forEachIndexed { index, line ->
                        CartItemCard(
                            line = line,
                            scale = scale,
                            textScale = textScale,
                            onSelectedChange = {
                                onToggleSelected(line.item)
                            },
                            onDecrease = {
                                onQuantityChange(line.item, (line.quantity - 1).coerceAtLeast(1))
                            },
                            onIncrease = {
                                onQuantityChange(line.item, (line.quantity + 1).coerceAtMost(MAX_CART_QUANTITY))
                            },
                            onDelete = {
                                onDelete(line.item)
                            },
                            modifier = Modifier
                                .offset(
                                    x = listShadowPadding,
                                    y = listShadowPadding + (itemHeight + itemSpacing) * index
                                )
                                .size(width = 352.667f.s(), height = itemHeight)
                        )
                    }
                }
            }
        }

        CartFooter(
            allSelected = allSelected,
            selectedCount = selectedCount,
            totalText = state.summary.selectedTotalText,
            scale = scale,
            enabled = cartLines.isNotEmpty() && !state.isSelectAllInFlight,
            checkoutEnabled = selectedCount > 0 &&
                !state.isCheckoutDraftLoading,
            checkoutLoading = state.isCheckoutDraftLoading,
            onCheckoutClick = onCheckoutClick,
            onToggleAll = {
                onToggleAll(!allSelected)
            },
            modifier = Modifier
                .offset(x = 12f.s(), y = footerTop)
                .navigationBarsPadding()
                .size(width = 364.667f.s(), height = footerHeight)
        )
    }
}

@Composable
private fun CartHeader(
    selectedCount: Int,
    totalLines: Int,
    scale: Float,
    textScale: Float,
    onBackClick: () -> Unit
) {
    fun Float.s(): Dp = scaledDp(scale)

    ShopMateCircleIconButton(
        icon = R.drawable.ic_back,
        contentDescription = "返回上一页",
        onClick = onBackClick,
        modifier = Modifier
            .offset(x = 18f.s(), y = 46f.s())
            .size(36f.s()),
        iconSize = 18f.s()
    )

    Text(
        text = "购物车",
        color = ShopMateTextPrimary,
        fontSize = (32f * textScale).sp,
        lineHeight = (36.72f * textScale).sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.sp,
        maxLines = 1,
        modifier = Modifier
            .offset(x = 62f.s(), y = 53f.s())
            .width(138f.s())
    )

    Text(
        text = if (totalLines == 0) {
            "精选好物，省心购买"
        } else {
            "已选 $selectedCount 件 · 共 $totalLines 件商品"
        },
        color = Color(0xFF8C95A0),
        fontSize = (13f * textScale).sp,
        lineHeight = (18f * textScale).sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.sp,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .offset(x = 62f.s(), y = 92f.s())
            .width(160f.s())
    )

    Image(
        painter = painterResource(id = R.drawable.cart_shopmate_buddy),
        contentDescription = "Shopmate Buddy",
        modifier = Modifier
            .offset(x = 218f.s(), y = 38f.s())
            .size(width = 118f.s(), height = 118.427f.s()),
        contentScale = ContentScale.Fit
    )
}

@Composable
private fun CartFeatureCard(
    scale: Float,
    textScale: Float,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)

    Box(
        modifier = modifier
            .shadow(
                elevation = 10f.s(),
                shape = RoundedCornerShape(20f.s()),
                clip = false
            )
            .clip(RoundedCornerShape(20f.s()))
            .background(
                Brush.linearGradient(
                    colors = listOf(Color(0xFFE8FAF3), Color.White),
                    start = Offset.Zero,
                    end = Offset(352f.s().value, 82f.s().value)
                )
            )
            .drawBehind {
                drawCircle(
                    color = ShopMateGreen.copy(alpha = 0.09f),
                    center = Offset(size.width * 0.82f, size.height * 0.18f),
                    radius = size.minDimension * 0.38f
                )
            }
    ) {
        Box(
            modifier = Modifier
                .offset(x = 16f.s(), y = 23f.s())
                .size(36f.s())
                .shadow(
                    elevation = 7f.s(),
                    shape = RoundedCornerShape(18f.s()),
                    clip = false
                )
                .clip(RoundedCornerShape(18f.s()))
                .background(Brush.linearGradient(listOf(ShopMateLightGreen, ShopMateGreen))),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_cart_check),
                contentDescription = null,
                modifier = Modifier.size(19f.s())
            )
        }

        Text(
            text = buildAnnotatedString {
                append("抖选选 ")
                withStyle(SpanStyle(color = ShopMateGreen)) {
                    append("/ Shopmate 为你精选好物")
                }
            },
            color = ShopMateTextPrimary,
            fontSize = (15f * textScale).sp,
            lineHeight = (20.25f * textScale).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .offset(x = 68f.s(), y = 20f.s())
                .width(235f.s())
        )

        Text(
            text = "智能推荐 · 放心选择 · 轻松下单",
            color = Color(0xFF88939D),
            fontSize = (13f * textScale).sp,
            lineHeight = (15.6f * textScale).sp,
            letterSpacing = 0.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .offset(x = 68f.s(), y = 47f.s())
                .width(238f.s())
        )

        Text(
            text = ">",
            color = Color(0xFF25303B),
            fontSize = (18f * textScale).sp,
            lineHeight = (18f * textScale).sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 318.667f.s(), y = 31f.s())
                .size(16f.s())
        )
    }
}

@Composable
private fun CartItemCard(
    line: CartLineState,
    scale: Float,
    textScale: Float,
    onSelectedChange: () -> Unit,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)

    val subtotalText = line.item.subtotalText
    val isEnabled = line.item.available && !line.inFlight

    ShopMateElevatedSurface(
        modifier = modifier,
        shape = RoundedCornerShape(20f.s()),
        elevation = 4f.s(),
        backgroundColor = Color.White.copy(alpha = 0.96f),
        borderColor = Color(0xFFF0F3F2)
    ) {
        SelectableCheckButton(
            selected = line.selected,
            enabled = isEnabled,
            onClick = onSelectedChange,
            modifier = Modifier
                .offset(x = 14f.s(), y = 58.29f.s())
                .size(34f.s())
        )

        Box(
            modifier = Modifier
                .offset(x = 66f.s(), y = 27.29f.s())
                .size(96f.s())
                .clip(RoundedCornerShape(18f.s()))
                .background(Color(0xFFF8F8F8)),
            contentAlignment = Alignment.Center
        ) {
            ShopMateProductImage(
                imageUrl = line.item.product.imageUrl,
                placeholderRes = line.item.product.imageRes,
                contentDescription = line.item.product.name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        }

        Text(
            text = line.item.product.name,
            color = Color(0xFF25303B),
            fontSize = (13f * textScale).sp,
            lineHeight = (18.2f * textScale).sp,
            fontWeight = FontWeight.Bold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 174f.s(), y = 16f.s())
                .size(width = 128f.s(), height = 38f.s())
        )

        ShopMateCircleIconButton(
            icon = R.drawable.ic_cart_delete,
            contentDescription = "删除 ${line.item.product.name}",
            onClick = onDelete,
            enabled = isEnabled,
            modifier = Modifier
                .offset(x = 307.33f.s(), y = 14f.s())
                .size(30f.s()),
            iconSize = 18f.s(),
            backgroundColor = Color.Transparent,
            elevation = 0.dp
        )

        Text(
            text = cartVariantText(line.item),
            color = Color(0xFF8E98A2),
            fontSize = (12f * textScale).sp,
            lineHeight = (16f * textScale).sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 174f.s(), y = 56.4f.s())
                .width(163f.s())
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(6f.s()),
            modifier = Modifier.offset(x = 174f.s(), y = 79.4f.s())
        ) {
            line.item.product.tags.take(2).forEach { tag ->
                CartTag(
                    text = tag,
                    scale = scale,
                    textScale = textScale
                )
            }
        }

        Text(
            text = subtotalText,
            color = ShopMateTextPrimary,
            fontSize = (16f * textScale).sp,
            lineHeight = (20.667f * textScale).sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            letterSpacing = 0.sp,
            modifier = Modifier
                .offset(x = 174f.s(), y = 111f.s())
                .width(62f.s())
        )

        QuantityStepper(
            quantity = line.quantity,
            enabled = isEnabled,
            onDecrease = onDecrease,
            onIncrease = onIncrease,
            scale = scale,
            modifier = Modifier
                .offset(x = 239f.s(), y = 107.59f.s())
                .size(width = 95.333f.s(), height = 28f.s())
        )
    }
}

@Composable
private fun SelectableCheckButton(
    selected: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .shadow(
                elevation = if (selected) 8.dp else 0.dp,
                shape = CircleShape,
                clip = false
            )
            .clip(CircleShape)
            .background(
                color = if (selected) Color(0xFF49D79C) else Color.White,
                shape = CircleShape
            )
            .border(
                width = 1.dp,
                color = if (selected) ShopMateGreen.copy(alpha = 0.22f) else Color(0xFFDDE6E3),
                shape = CircleShape
            )
            .clickable(enabled = enabled, role = Role.Checkbox, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        if (selected) {
            Image(
                painter = painterResource(id = R.drawable.ic_cart_check),
                contentDescription = null,
                modifier = Modifier.size(19.dp)
            )
        }
    }
}

@Composable
private fun CartTag(
    text: String,
    scale: Float,
    textScale: Float,
    modifier: Modifier = Modifier
) {
    Text(
        text = text,
        color = ShopMateGreen,
        fontSize = (11f * textScale).sp,
        lineHeight = (13.2f * textScale).sp,
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        letterSpacing = 0.sp,
        modifier = modifier
            .clip(ShopMatePillShape)
            .background(Color(0xFFE8F9F2))
            .padding(
                horizontal = 8f.scaledDp(scale),
                vertical = 3f.scaledDp(scale)
            )
    )
}

@Composable
private fun QuantityStepper(
    quantity: Int,
    enabled: Boolean,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    scale: Float,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)

    Box(
        modifier = modifier
            .clip(ShopMatePillShape)
            .background(Color.White)
            .border(0.667.dp, Color(0xFFE8EDEC), ShopMatePillShape)
    ) {
        StepperButton(
            icon = R.drawable.ic_cart_minus,
            contentDescription = "减少数量",
            enabled = enabled && quantity > 1,
            onClick = onDecrease,
            modifier = Modifier
                .offset(x = 0.dp, y = 0.dp)
                .size(width = 30f.s(), height = 26.667f.s())
                .background(Color(0xFFFBFCFC))
        )

        Box(
            modifier = Modifier
                .offset(x = 30f.s(), y = 0.dp)
                .size(width = 34f.s(), height = 26.667f.s())
                .background(Color.White)
                .border(
                    width = 0.667.dp,
                    color = Color(0xFFEDF1F1),
                    shape = RoundedCornerShape(0.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = quantity.toString(),
                color = Color(0xFF1D2B39),
                fontSize = (13f * scale).sp,
                lineHeight = (17f * scale).sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                letterSpacing = 0.sp
            )
        }

        StepperButton(
            icon = R.drawable.ic_cart_plus,
            contentDescription = "增加数量",
            enabled = enabled && quantity < MAX_CART_QUANTITY,
            onClick = onIncrease,
            modifier = Modifier
                .offset(x = 64f.s(), y = 0.dp)
                .size(width = 30f.s(), height = 26.667f.s())
                .background(Color.White)
        )
    }
}

@Composable
private fun StepperButton(
    icon: Int,
    contentDescription: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clickable(
                enabled = enabled,
                role = Role.Button,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = icon),
            contentDescription = contentDescription,
            modifier = Modifier.size(16.dp)
        )
    }
}

@Composable
private fun CartFooter(
    allSelected: Boolean,
    selectedCount: Int,
    totalText: String,
    scale: Float,
    enabled: Boolean,
    checkoutEnabled: Boolean,
    checkoutLoading: Boolean,
    onCheckoutClick: () -> Unit,
    onToggleAll: () -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)
    val checkoutBrush = if (checkoutEnabled) {
        Brush.linearGradient(listOf(ShopMateLightGreen, ShopMateGreen))
    } else {
        Brush.linearGradient(listOf(Color(0xFFDDECE7), Color(0xFFD2E7DE)))
    }

    Box(
        modifier = modifier
            .shadow(
                elevation = 14f.s(),
                shape = RoundedCornerShape(22f.s()),
                clip = false
            )
            .clip(RoundedCornerShape(22f.s()))
            .background(Color.White.copy(alpha = 0.94f))
            .border(0.667.dp, Color(0xFFEEF2F1), RoundedCornerShape(22f.s()))
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    start = 10f.s(),
                    top = 8f.s(),
                    end = 11f.s(),
                    bottom = 8f.s()
                ),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier
                    .size(width = 72f.s(), height = 42f.s())
                    .clickable(enabled = enabled, role = Role.Checkbox, onClick = onToggleAll),
                verticalAlignment = Alignment.CenterVertically
            ) {
                SelectableCheckButton(
                    selected = allSelected,
                    enabled = enabled,
                    onClick = onToggleAll,
                    modifier = Modifier.size(28f.s())
                )
                Spacer(modifier = Modifier.width(7f.s()))
                Text(
                    text = "全选",
                    color = Color(0xFF4C5965),
                    fontSize = (12f * scale).sp,
                    lineHeight = (16f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    letterSpacing = 0.sp
                )
            }

            Spacer(modifier = Modifier.width(8f.s()))

            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "合计：",
                    color = Color(0xFF3F4A56),
                    fontSize = (12f * scale).sp,
                    lineHeight = (16f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    letterSpacing = 0.sp
                )

                Text(
                    text = totalText,
                    color = ShopMateTextPrimary,
                    fontSize = (21f * scale).sp,
                    lineHeight = (24f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    letterSpacing = 0.sp
                )
            }

            Spacer(modifier = Modifier.width(8f.s()))

            Box(
                modifier = Modifier
                    .size(width = 128f.s(), height = 42f.s())
                    .shadow(
                        elevation = 12f.s(),
                        shape = ShopMatePillShape,
                        clip = false
                    )
                    .clip(ShopMatePillShape)
                    .background(checkoutBrush)
                    .clickable(enabled = checkoutEnabled, role = Role.Button, onClick = onCheckoutClick),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (checkoutLoading) "准备中..." else "去结算 ($selectedCount)",
                    color = Color.White.copy(alpha = if (checkoutEnabled) 1f else 0.72f),
                    fontSize = (14f * scale).sp,
                    lineHeight = (18f * scale).sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    letterSpacing = 0.sp
                )
            }
        }
    }
}

@Composable
private fun EmptyCartState(
    scale: Float,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    fun Float.s(): Dp = scaledDp(scale)

    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier.size(width = 276f.s(), height = 196f.s())
        ) {
            Image(
                painter = painterResource(id = R.drawable.cart_shopmate_buddy),
                contentDescription = "Shopmate Buddy",
                modifier = Modifier
                    .offset(x = 103f.s(), y = 0.dp)
                    .size(70f.s()),
                contentScale = ContentScale.Fit
            )

            Text(
                text = "购物车还是空的",
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
                text = "回到推荐页继续挑选，喜欢的商品会先放在这里。",
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
                    .clickable(role = Role.Button, onClick = onBackClick),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "返回继续购物",
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

@Composable
private fun CartLoadingState(
    scale: Float,
    modifier: Modifier = Modifier
) {
    ShopMateElevatedSurface(
        modifier = modifier,
        shape = RoundedCornerShape(22f.scaledDp(scale)),
        elevation = 8f.scaledDp(scale)
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(
                color = ShopMateGreen,
                modifier = Modifier.size(36f.scaledDp(scale))
            )
        }
    }
}

@Composable
private fun CartErrorState(
    message: String,
    canRetry: Boolean,
    scale: Float,
    onRetry: () -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ShopMateStatusMessage(
        title = "暂时无法加载购物车",
        message = message,
        actionText = if (canRetry) "重试" else "返回继续购物",
        onActionClick = if (canRetry) onRetry else onBackClick,
        mascot = R.drawable.cart_shopmate_buddy,
        scale = scale,
        modifier = modifier
    )
}

@Composable
private fun CartInlineErrorCard(
    message: String,
    scale: Float,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16f.scaledDp(scale)))
            .background(Color.White.copy(alpha = 0.95f))
            .border(
                width = 0.667.dp,
                color = Color(0xFFFFD7C7),
                shape = RoundedCornerShape(16f.scaledDp(scale))
            )
            .clickable(role = Role.Button, onClick = onRetry)
            .padding(horizontal = 14f.scaledDp(scale), vertical = 9f.scaledDp(scale)),
        contentAlignment = Alignment.CenterStart
    ) {
        Text(
            text = message,
            color = Color(0xFFB04D2D),
            fontSize = (12f * scale).sp,
            lineHeight = (16f * scale).sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            letterSpacing = 0.sp
        )
    }
}

private data class CartLineState(
    val item: CartItemUi,
    val quantity: Int,
    val selected: Boolean,
    val inFlight: Boolean
)

private fun cartVariantText(item: CartItemUi): String =
    when (item.product.id) {
        "ui-hyaluronic-acid-serum" -> "30ml"
        "ui-la-roche-posay-sunscreen" -> "50ml"
        "ui-shopmate-canvas-bag" -> "薄荷绿"
        else -> item.product.tags.firstOrNull().orEmpty()
    }

private const val MAX_CART_QUANTITY = 99

@Preview(
    name = "Cart screen - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true
)
@Composable
private fun CartScreenTargetPreview() {
    ShopMateTheme {
        CartScreen(
            state = MockShopMateData.cartItems.toPreviewCartUiState(),
            onBackClick = {},
            onCheckoutClick = {},
            onRetry = {},
            onToggleSelected = {},
            onQuantityChange = { _, _ -> },
            onDelete = {},
            onToggleAll = {}
        )
    }
}

@Preview(
    name = "Cart screen empty - 389 x 843",
    widthDp = 389,
    heightDp = 843,
    showBackground = true
)
@Composable
private fun CartScreenEmptyPreview() {
    ShopMateTheme {
        CartScreen(
            state = emptyList<CartItemUi>().toPreviewCartUiState(),
            onBackClick = {},
            onCheckoutClick = {},
            onRetry = {},
            onToggleSelected = {},
            onQuantityChange = { _, _ -> },
            onDelete = {},
            onToggleAll = {}
        )
    }
}

@Preview(
    name = "Cart screen compact - 360 x 740",
    widthDp = 360,
    heightDp = 740,
    showBackground = true
)
@Composable
private fun CartScreenCompactPreview() {
    ShopMateTheme {
        CartScreen(
            state = MockShopMateData.cartItems.toPreviewCartUiState(),
            onBackClick = {},
            onCheckoutClick = {},
            onRetry = {},
            onToggleSelected = {},
            onQuantityChange = { _, _ -> },
            onDelete = {},
            onToggleAll = {}
        )
    }
}

private fun List<CartItemUi>.toPreviewCartUiState(): CartUiState {
    val selectedItems = filter { item -> item.selected }
    val totalCount = sumOf { item -> item.quantity.coerceAtLeast(1) }
    val selectedCount = selectedItems.sumOf { item -> item.quantity.coerceAtLeast(1) }
    val selectedTotal = selectedItems.sumOf { item ->
        item.subtotalText.filter { char -> char.isDigit() }.toIntOrNull() ?: 0
    }

    return CartUiState(
        items = this,
        summary = CartSummaryUi(
            totalCount = totalCount,
            selectedCount = selectedCount,
            selectedTotalCents = selectedTotal * 100,
            selectedTotalText = "¥$selectedTotal",
        )
    )
}
