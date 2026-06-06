package com.shopmate.app.data.orders

import com.shopmate.app.data.network.ShopMateNetworkError
import com.shopmate.app.ui.cart.CartCheckoutAddressUi
import com.shopmate.app.ui.cart.CartCheckoutDraftUi
import com.shopmate.app.ui.cart.CartCheckoutResultUi
import kotlinx.coroutines.CancellationException

interface OrderRepository {
    suspend fun createMockCheckout(): Result<CartCheckoutDraftUi>
    suspend fun confirmMockCheckout(): Result<CartCheckoutResultUi>
    suspend fun cancelMockCheckout(): Result<Unit>
}

class DefaultOrderRepository(
    private val orderApiClient: OrderApiClient,
) : OrderRepository {
    override suspend fun createMockCheckout(): Result<CartCheckoutDraftUi> =
        requestOrder(
            block = { orderApiClient.createMockCheckout(CART_BUTTON_CONVERSATION_ID) },
            mapData = { response -> response.draft.toCheckoutDraftUi() },
        )

    override suspend fun confirmMockCheckout(): Result<CartCheckoutResultUi> =
        requestOrder(
            block = { orderApiClient.confirmMockCheckout(CART_BUTTON_CONVERSATION_ID) },
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

private fun MockCheckoutDraftDto.toCheckoutDraftUi(): CartCheckoutDraftUi =
    CartCheckoutDraftUi(
        id = id,
        selectedCount = summary.selectedCount,
        totalText = summary.totalCents.toPriceText(),
        totalCents = summary.totalCents,
        address = address.toCheckoutAddressUi(),
    )

private fun MockCheckoutAddressDto.toCheckoutAddressUi(): CartCheckoutAddressUi =
    CartCheckoutAddressUi(
        label = label,
        recipient = recipient,
        phoneMasked = phoneMasked,
        fullAddress = fullAddress,
    )

private fun OrderDto.toCheckoutResultUi(): CartCheckoutResultUi =
    CartCheckoutResultUi(
        orderId = id,
        orderNumber = orderNumber,
        totalText = totalCents.toPriceText(),
        totalCents = totalCents,
    )

private fun Int.toPriceText(): String {
    val whole = this / 100
    val cents = this % 100

    return if (cents == 0) {
        "¥$whole"
    } else {
        "¥$whole.${cents.toString().padStart(2, '0')}"
    }
}
