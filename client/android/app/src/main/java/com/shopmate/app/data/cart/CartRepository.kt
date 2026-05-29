package com.shopmate.app.data.cart

import com.shopmate.app.data.network.ShopMateNetworkError
import com.shopmate.app.ui.cart.CartContentUi

interface CartRepository {
    suspend fun getCart(): Result<CartContentUi>
    suspend fun addProduct(productId: String, quantity: Int = 1): Result<CartContentUi>
    suspend fun updateQuantity(itemId: String, quantity: Int): Result<CartContentUi>
    suspend fun updateSelected(itemId: String, selected: Boolean): Result<CartContentUi>
    suspend fun removeItem(itemId: String): Result<CartContentUi>
    suspend fun selectAll(selected: Boolean): Result<CartContentUi>
}

class DefaultCartRepository(
    private val cartApiClient: CartApiClient,
) : CartRepository {
    override suspend fun getCart(): Result<CartContentUi> =
        requestCart { cartApiClient.getCart() }

    override suspend fun addProduct(
        productId: String,
        quantity: Int,
    ): Result<CartContentUi> {
        val normalizedProductId = productId.trim()
        if (normalizedProductId.isEmpty()) {
            return Result.failure(CartOperationError.InvalidProductId)
        }

        return requestCart {
            cartApiClient.addCartItem(
                productId = normalizedProductId,
                quantity = quantity.coerceIn(MIN_CART_QUANTITY, MAX_CART_QUANTITY),
            )
        }
    }

    override suspend fun updateQuantity(
        itemId: String,
        quantity: Int,
    ): Result<CartContentUi> {
        val normalizedItemId = itemId.trim()
        if (normalizedItemId.isEmpty()) {
            return Result.failure(CartOperationError.InvalidCartItemId)
        }

        return requestCart {
            cartApiClient.updateCartItem(
                itemId = normalizedItemId,
                quantity = quantity.coerceIn(MIN_CART_QUANTITY, MAX_CART_QUANTITY),
            )
        }
    }

    override suspend fun updateSelected(
        itemId: String,
        selected: Boolean,
    ): Result<CartContentUi> {
        val normalizedItemId = itemId.trim()
        if (normalizedItemId.isEmpty()) {
            return Result.failure(CartOperationError.InvalidCartItemId)
        }

        return requestCart {
            cartApiClient.updateCartItem(
                itemId = normalizedItemId,
                selected = selected,
            )
        }
    }

    override suspend fun removeItem(itemId: String): Result<CartContentUi> {
        val normalizedItemId = itemId.trim()
        if (normalizedItemId.isEmpty()) {
            return Result.failure(CartOperationError.InvalidCartItemId)
        }

        return requestCart { cartApiClient.deleteCartItem(normalizedItemId) }
    }

    override suspend fun selectAll(selected: Boolean): Result<CartContentUi> =
        requestCart { cartApiClient.selectAll(selected) }

    private suspend fun requestCart(
        block: suspend () -> CartApiResponseDto<CartDto>,
    ): Result<CartContentUi> =
        try {
            val response = block()
            when {
                response.success && response.data != null ->
                    Result.success(response.data.toCartContentUi())

                response.error?.code == PRODUCT_NOT_FOUND_CODE ->
                    Result.failure(CartOperationError.ProductNotFound)

                response.error?.code == PRODUCT_UNAVAILABLE_CODE ->
                    Result.failure(CartOperationError.ProductUnavailable)

                response.error?.code == CART_ITEM_NOT_FOUND_CODE ->
                    Result.failure(CartOperationError.CartItemNotFound)

                response.error?.code == INVALID_CART_REQUEST_CODE ->
                    Result.failure(CartOperationError.InvalidRequest)

                response.success -> Result.failure(CartOperationError.ParseFailure)
                else -> Result.failure(CartOperationError.Unknown)
            }
        } catch (error: ShopMateNetworkError.CartResponseParseFailed) {
            Result.failure(CartOperationError.ParseFailure)
        } catch (error: ShopMateNetworkError.HttpNonSuccess) {
            Result.failure(CartOperationError.NetworkFailure(error))
        } catch (error: ShopMateNetworkError.CartConnectionFailed) {
            Result.failure(CartOperationError.NetworkFailure(error))
        } catch (error: ShopMateNetworkError.InvalidBaseUrl) {
            Result.failure(CartOperationError.NetworkFailure(error))
        } catch (error: RuntimeException) {
            Result.failure(CartOperationError.Unknown)
        }

    private companion object {
        private const val MIN_CART_QUANTITY = 1
        private const val MAX_CART_QUANTITY = 99
        private const val PRODUCT_NOT_FOUND_CODE = "PRODUCT_NOT_FOUND"
        private const val PRODUCT_UNAVAILABLE_CODE = "PRODUCT_UNAVAILABLE"
        private const val CART_ITEM_NOT_FOUND_CODE = "CART_ITEM_NOT_FOUND"
        private const val INVALID_CART_REQUEST_CODE = "INVALID_CART_REQUEST"
    }
}

sealed class CartOperationError(message: String, cause: Throwable? = null) :
    Exception(message, cause) {
    object InvalidProductId : CartOperationError("Product id is empty.")
    object InvalidCartItemId : CartOperationError("Cart item id is empty.")
    object InvalidRequest : CartOperationError("Cart request was invalid.")
    object ProductNotFound : CartOperationError("Product was not found.")
    object ProductUnavailable : CartOperationError("Product is unavailable.")
    object CartItemNotFound : CartOperationError("Cart item was not found.")
    object ParseFailure : CartOperationError("Cart payload could not be parsed.")
    class NetworkFailure(cause: Throwable) : CartOperationError("Cart request failed.", cause)
    object Unknown : CartOperationError("Cart could not be updated.")
}
