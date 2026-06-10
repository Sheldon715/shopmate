package com.shopmate.app.data.chat

import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.ui.chat.ChatCheckoutDraftCardUi
import com.shopmate.app.ui.chat.ChatCheckoutDraftStatusUi
import com.shopmate.app.ui.checkout.CheckoutAddressUi
import com.shopmate.app.ui.checkout.CheckoutSavedAddressUi
import com.shopmate.app.ui.checkout.CheckoutDeliveryMethodUi
import com.shopmate.app.ui.checkout.CheckoutDraftUi
import com.shopmate.app.ui.checkout.CheckoutItemUi
import com.shopmate.app.ui.checkout.CheckoutPaymentMethodUi
import com.shopmate.app.ui.checkout.CheckoutSummaryUi
import com.shopmate.app.ui.checkout.CHECKOUT_DEMO_REGION
import com.shopmate.app.ui.checkout.toCheckoutPriceText

fun ChatCheckoutActionDto.toCheckoutDraftCardUi(
    conversationId: String,
    previous: ChatCheckoutDraftCardUi? = null,
    imageUrlResolver: ShopMateImageUrlResolver? = null,
): ChatCheckoutDraftCardUi? {
    val nextStatus = status.toCheckoutDraftStatusUi()
    val nextDraft = draft?.toCheckoutDraftUi(conversationId, imageUrlResolver)
        ?: previous?.draft?.takeIf { currentDraft ->
            draftId == null || currentDraft.id == draftId
        }?.withActionFallback(this)
        ?: toFallbackCheckoutDraftUi(conversationId)
        ?: return null

    return ChatCheckoutDraftCardUi(
        draft = nextDraft,
        status = nextStatus,
        changedFields = changedFields,
        orderNumber = orderNumber
            ?: order?.orderNumber
            ?: previous?.orderNumber,
    )
}

private fun String.toCheckoutDraftStatusUi(): ChatCheckoutDraftStatusUi =
    when (this) {
        "draft_created", "needs_confirmation" -> ChatCheckoutDraftStatusUi.Pending
        "address_updated", "draft_updated" -> ChatCheckoutDraftStatusUi.Updated
        "cancelled" -> ChatCheckoutDraftStatusUi.Cancelled
        "expired" -> ChatCheckoutDraftStatusUi.Expired
        "order_created" -> ChatCheckoutDraftStatusUi.Submitted
        "failed", "empty_cart" -> ChatCheckoutDraftStatusUi.Failed
        else -> ChatCheckoutDraftStatusUi.Failed
    }

private fun ChatCheckoutDraftDto.toCheckoutDraftUi(
    conversationId: String,
    imageUrlResolver: ShopMateImageUrlResolver?,
): CheckoutDraftUi {
    val deliveryMethods = deliveryOptions
        .map { option -> option.toCheckoutDeliveryMethodUi() }
        .withSelectedDelivery(selectedDeliveryMethod)
    val paymentMethods = paymentOptions
        .map { option -> option.toCheckoutPaymentMethodUi() }
        .withSelectedPayment(selectedPaymentMethod)

    return CheckoutDraftUi(
        id = id,
        conversationId = conversationId,
        items = items.map { item -> item.toCheckoutItemUi(imageUrlResolver) },
        summary = summary.toCheckoutSummaryUi(),
        address = address.toCheckoutAddressUi(),
        savedAddresses = savedAddresses.toCheckoutSavedAddressUiList(address),
        deliveryOptions = deliveryMethods,
        paymentOptions = paymentMethods,
        expiresAt = expiresAt,
        selectedDeliveryMethodType = selectedDeliveryMethod?.type
            ?: deliveryMethods.firstOrNull()?.type,
        selectedPaymentMethodType = selectedPaymentMethod?.type
            ?: paymentMethods.firstOrNull()?.type,
    )
}

private fun ChatCheckoutActionDto.toFallbackCheckoutDraftUi(
    conversationId: String,
): CheckoutDraftUi? {
    val id = draftId?.trim()?.takeIf { value -> value.isNotBlank() } ?: return null
    val total = totalCents?.takeIf { value -> value >= 0 } ?: 0
    val selected = selectedCount?.takeIf { value -> value >= 0 } ?: 0

    return CheckoutDraftUi(
        id = id,
        conversationId = conversationId,
        items = emptyList(),
        summary = CheckoutSummaryUi(
            itemCount = selected,
            selectedCount = selected,
            subtotalText = total.toCheckoutPriceText(),
            subtotalCents = total,
            shippingFeeText = 0.toCheckoutPriceText(),
            shippingFeeCents = 0,
            totalText = total.toCheckoutPriceText(),
            totalCents = total,
        ),
        address = address?.toCheckoutAddressUi() ?: CheckoutAddressUi(
            label = "收货信息",
            recipient = "待补充",
            phoneMasked = "",
            fullAddress = "待确认",
        ),
        deliveryOptions = emptyList(),
        paymentOptions = emptyList(),
        expiresAt = "",
    )
}

private fun CheckoutDraftUi.withActionFallback(
    action: ChatCheckoutActionDto,
): CheckoutDraftUi =
    copy(
        summary = if (action.totalCents != null || action.selectedCount != null) {
            summary.copy(
                itemCount = action.selectedCount ?: summary.itemCount,
                selectedCount = action.selectedCount ?: summary.selectedCount,
                totalText = (action.totalCents ?: summary.totalCents).toCheckoutPriceText(),
                totalCents = action.totalCents ?: summary.totalCents,
            )
        } else {
            summary
        },
        address = action.address?.toCheckoutAddressUi() ?: address,
    )

private fun ChatCheckoutSummaryDto.toCheckoutSummaryUi(): CheckoutSummaryUi =
    CheckoutSummaryUi(
        itemCount = itemCount,
        selectedCount = selectedCount,
        subtotalText = subtotalCents.toCheckoutPriceText(),
        subtotalCents = subtotalCents,
        shippingFeeText = shippingFeeCents.toCheckoutPriceText(),
        shippingFeeCents = shippingFeeCents,
        totalText = totalCents.toCheckoutPriceText(),
        totalCents = totalCents,
        currency = currency,
    )

private fun ChatCheckoutAddressDto.toCheckoutAddressUi(): CheckoutAddressUi =
    CheckoutAddressUi(
        label = label,
        recipient = recipient,
        phoneMasked = phoneMasked,
        fullAddress = fullAddress,
    )

private fun List<ChatCheckoutAddressDto>.toCheckoutSavedAddressUiList(
    currentAddress: ChatCheckoutAddressDto,
): List<CheckoutSavedAddressUi> =
    if (isEmpty()) {
        emptyList()
    } else {
        mapIndexed { index, address ->
            address.toCheckoutSavedAddressUi(
                fallbackId = "chat-saved-address-${index + 1}",
                isFallbackDefault = matchesCheckoutAddress(currentAddress, address),
            )
        }.distinctBy { address -> address.id }
    }

private fun ChatCheckoutAddressDto.toCheckoutSavedAddressUi(
    fallbackId: String,
    isFallbackDefault: Boolean,
): CheckoutSavedAddressUi =
    CheckoutSavedAddressUi(
        id = id?.trim()?.takeIf { value -> value.isNotBlank() } ?: fallbackId,
        recipient = recipient,
        phone = "",
        phoneMasked = phoneMasked,
        fullAddress = fullAddress,
        region = region?.trim()?.takeIf { value -> value.isNotBlank() }
            ?: CHECKOUT_DEMO_REGION,
        tag = tag?.trim()?.takeIf { value -> value.isNotBlank() }
            ?: label.ifBlank { "保存地址" },
        isDefault = isDefault ?: isFallbackDefault,
    )

private fun matchesCheckoutAddress(
    current: ChatCheckoutAddressDto,
    candidate: ChatCheckoutAddressDto,
): Boolean =
    current.id != null && current.id == candidate.id
        || current.fullAddress == candidate.fullAddress

private fun ChatCheckoutDraftItemDto.toCheckoutItemUi(
    imageUrlResolver: ShopMateImageUrlResolver?,
): CheckoutItemUi =
    CheckoutItemUi(
        cartItemId = cartItemId,
        productId = productId,
        productName = productName,
        brand = brand,
        category = category,
        unitPriceText = unitPriceCents.toCheckoutPriceText(),
        unitPriceCents = unitPriceCents,
        quantity = quantity,
        subtotalText = subtotalCents.toCheckoutPriceText(),
        subtotalCents = subtotalCents,
        imageUrl = imageUrlResolver?.resolve(imagePath),
    )

private fun ChatCheckoutDeliveryMethodDto.toCheckoutDeliveryMethodUi(): CheckoutDeliveryMethodUi =
    CheckoutDeliveryMethodUi(
        type = type,
        label = label,
        feeText = feeCents.toCheckoutPriceText(),
        feeCents = feeCents,
        etaText = etaText.orEmpty(),
    )

private fun ChatCheckoutPaymentMethodDto.toCheckoutPaymentMethodUi(): CheckoutPaymentMethodUi =
    CheckoutPaymentMethodUi(
        type = type,
        label = label,
    )

private fun List<CheckoutDeliveryMethodUi>.withSelectedDelivery(
    selected: ChatCheckoutDeliveryMethodDto?,
): List<CheckoutDeliveryMethodUi> {
    if (selected == null || any { option -> option.type == selected.type }) {
        return this
    }

    return listOf(selected.toCheckoutDeliveryMethodUi()) + this
}

private fun List<CheckoutPaymentMethodUi>.withSelectedPayment(
    selected: ChatCheckoutPaymentMethodDto?,
): List<CheckoutPaymentMethodUi> {
    if (selected == null || any { option -> option.type == selected.type }) {
        return this
    }

    return listOf(selected.toCheckoutPaymentMethodUi()) + this
}
