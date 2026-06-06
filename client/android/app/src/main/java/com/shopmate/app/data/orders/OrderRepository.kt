package com.shopmate.app.data.orders

import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.data.network.ShopMateNetworkError
import com.shopmate.app.ui.checkout.CheckoutAddressUi
import com.shopmate.app.ui.checkout.CheckoutDeliveryMethodUi
import com.shopmate.app.ui.checkout.CheckoutDraftUi
import com.shopmate.app.ui.checkout.CheckoutItemUi
import com.shopmate.app.ui.checkout.CheckoutOrderResultUi
import com.shopmate.app.ui.checkout.CheckoutPaymentMethodUi
import com.shopmate.app.ui.checkout.CheckoutShippingInputUi
import com.shopmate.app.ui.checkout.CheckoutSummaryUi
import com.shopmate.app.ui.checkout.toCheckoutPriceText
import kotlinx.coroutines.CancellationException

interface OrderRepository {
    suspend fun createMockCheckout(): Result<CheckoutDraftUi>
    suspend fun confirmMockCheckout(
        conversationId: String,
        draftId: String,
        shipping: CheckoutShippingInputUi,
        deliveryMethodType: String,
        paymentMethodType: String,
    ): Result<CheckoutOrderResultUi>
    suspend fun cancelMockCheckout(): Result<Unit>
}

class DefaultOrderRepository(
    private val orderApiClient: OrderApiClient,
    private val imageUrlResolver: ShopMateImageUrlResolver? = null,
) : OrderRepository {
    override suspend fun createMockCheckout(): Result<CheckoutDraftUi> =
        requestOrder(
            block = { orderApiClient.createMockCheckout(CART_BUTTON_CONVERSATION_ID) },
            mapData = { response -> response.draft.toCheckoutDraftUi(imageUrlResolver) },
        )

    override suspend fun confirmMockCheckout(
        conversationId: String,
        draftId: String,
        shipping: CheckoutShippingInputUi,
        deliveryMethodType: String,
        paymentMethodType: String,
    ): Result<CheckoutOrderResultUi> =
        requestOrder(
            block = {
                orderApiClient.confirmMockCheckout(
                    MockCheckoutConfirmRequestDto(
                        conversationId = conversationId.ifBlank { CART_BUTTON_CONVERSATION_ID },
                        draftId = draftId,
                        shipping = shipping.toConfirmShippingDto(),
                        deliveryMethodType = deliveryMethodType,
                        paymentMethodType = paymentMethodType,
                    )
                )
            },
            mapData = { response -> response.order.toCheckoutResultUi() },
        )

    override suspend fun cancelMockCheckout(): Result<Unit> =
        requestOrder(
            block = { orderApiClient.cancelMockCheckout(CART_BUTTON_CONVERSATION_ID) },
            mapData = { Unit },
        )

    private suspend fun <T, R> requestOrder(
        block: suspend () -> OrderApiResponseDto<T>,
        mapData: (T) -> R,
    ): Result<R> =
        try {
            val response = block()
            when {
                response.success && response.data != null ->
                    Result.success(mapData(response.data))

                response.error?.code == CHECKOUT_EMPTY_CART_CODE ->
                    Result.failure(OrderOperationError.EmptyCart)

                response.error?.code == CHECKOUT_EXPIRED_CODE ->
                    Result.failure(OrderOperationError.Expired)

                response.error?.code == CHECKOUT_CART_CHANGED_CODE ->
                    Result.failure(OrderOperationError.CartChanged)

                response.error?.code == CHECKOUT_PRODUCT_UNAVAILABLE_CODE ->
                    Result.failure(OrderOperationError.ProductUnavailable)

                response.error?.code == INVALID_CHECKOUT_REQUEST_CODE ->
                    Result.failure(OrderOperationError.InvalidRequest)

                response.success -> Result.failure(OrderOperationError.ParseFailure)
                else -> Result.failure(OrderOperationError.Unknown)
            }
        } catch (error: ShopMateNetworkError.OrderResponseParseFailed) {
            Result.failure(OrderOperationError.ParseFailure)
        } catch (error: ShopMateNetworkError.HttpNonSuccess) {
            Result.failure(OrderOperationError.NetworkFailure(error))
        } catch (error: ShopMateNetworkError.OrderConnectionFailed) {
            Result.failure(OrderOperationError.NetworkFailure(error))
        } catch (error: ShopMateNetworkError.InvalidBaseUrl) {
            Result.failure(OrderOperationError.NetworkFailure(error))
        } catch (error: CancellationException) {
            throw error
        } catch (error: RuntimeException) {
            Result.failure(OrderOperationError.Unknown)
        }

    private companion object {
        private const val CART_BUTTON_CONVERSATION_ID = "cart-button-checkout"
        private const val CHECKOUT_EMPTY_CART_CODE = "CHECKOUT_EMPTY_CART"
        private const val CHECKOUT_EXPIRED_CODE = "CHECKOUT_EXPIRED"
        private const val CHECKOUT_CART_CHANGED_CODE = "CHECKOUT_CART_CHANGED"
        private const val CHECKOUT_PRODUCT_UNAVAILABLE_CODE = "CHECKOUT_PRODUCT_UNAVAILABLE"
        private const val INVALID_CHECKOUT_REQUEST_CODE = "INVALID_CHECKOUT_REQUEST"
    }
}

sealed class OrderOperationError(message: String, cause: Throwable? = null) :
    Exception(message, cause) {
    object EmptyCart : OrderOperationError("No checkoutable cart item.")
    object Expired : OrderOperationError("Pending checkout expired.")
    object CartChanged : OrderOperationError("Cart changed after draft.")
    object ProductUnavailable : OrderOperationError("Product unavailable.")
    object InvalidRequest : OrderOperationError("Checkout request was invalid.")
    object ParseFailure : OrderOperationError("Order payload could not be parsed.")
    class NetworkFailure(cause: Throwable) : OrderOperationError("Order request failed.", cause)
    object Unknown : OrderOperationError("Mock order could not be created.")
}

private fun MockCheckoutDraftDto.toCheckoutDraftUi(
    imageUrlResolver: ShopMateImageUrlResolver?,
): CheckoutDraftUi =
    CheckoutDraftUi(
        id = id,
        conversationId = conversationId,
        items = items.map { item -> item.toCheckoutItemUi(imageUrlResolver) },
        summary = summary.toCheckoutSummaryUi(),
        address = address.toCheckoutAddressUi(),
        deliveryOptions = deliveryOptions.map { option -> option.toCheckoutDeliveryMethodUi() },
        paymentOptions = paymentOptions.map { option -> option.toCheckoutPaymentMethodUi() },
        expiresAt = expiresAt,
        selectedDeliveryMethodType = null,
        selectedPaymentMethodType = null,
    )

private fun MockCheckoutSummaryDto.toCheckoutSummaryUi(): CheckoutSummaryUi =
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

private fun MockCheckoutAddressDto.toCheckoutAddressUi(): CheckoutAddressUi =
    CheckoutAddressUi(
        label = label,
        recipient = recipient,
        phoneMasked = phoneMasked,
        fullAddress = fullAddress,
    )

private fun MockCheckoutItemDto.toCheckoutItemUi(
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

private fun MockCheckoutDeliveryOptionDto.toCheckoutDeliveryMethodUi(): CheckoutDeliveryMethodUi =
    CheckoutDeliveryMethodUi(
        type = type,
        label = label,
        feeText = feeCents.toCheckoutPriceText(),
        feeCents = feeCents,
        etaText = etaText,
    )

private fun MockCheckoutPaymentOptionDto.toCheckoutPaymentMethodUi(): CheckoutPaymentMethodUi =
    CheckoutPaymentMethodUi(
        type = type,
        label = label,
    )

private fun CheckoutShippingInputUi.toConfirmShippingDto(): MockCheckoutShippingInputDto =
    MockCheckoutShippingInputDto(
        recipient = recipient,
        phone = phone,
        fullAddress = fullAddress,
    )

private fun OrderDto.toCheckoutResultUi(): CheckoutOrderResultUi =
    CheckoutOrderResultUi(
        orderId = id,
        orderNumber = orderNumber,
        displayOrderNumber = orderNumber.substringAfterLast("-").takeIf { value ->
            value.isNotBlank() && value != orderNumber
        } ?: orderNumber,
        totalText = totalCents.toCheckoutPriceText(),
        totalCents = totalCents,
    )
