package com.shopmate.app.data.network

sealed class ShopMateNetworkError(message: String, cause: Throwable? = null) :
    Exception(message, cause) {
    class InvalidBaseUrl(baseUrl: String) :
        ShopMateNetworkError("Invalid ShopMate API base URL: $baseUrl")

    class RequestSerializationFailed(cause: Throwable) :
        ShopMateNetworkError("Failed to serialize chat stream request.", cause)

    class ResponseParseFailed(eventName: String, cause: Throwable) :
        ShopMateNetworkError("Failed to parse chat stream event: $eventName", cause)

    class ProductResponseParseFailed(cause: Throwable) :
        ShopMateNetworkError("Failed to parse product detail response.", cause)

    class CartResponseParseFailed(cause: Throwable) :
        ShopMateNetworkError("Failed to parse cart response.", cause)

    class AsrResponseParseFailed(cause: Throwable) :
        ShopMateNetworkError("Failed to parse ASR response.", cause)

    class StreamConnectionFailed(cause: Throwable? = null) :
        ShopMateNetworkError("Chat stream connection failed.", cause)

    class ProductConnectionFailed(cause: Throwable? = null) :
        ShopMateNetworkError("Product detail connection failed.", cause)

    class CartConnectionFailed(cause: Throwable? = null) :
        ShopMateNetworkError("Cart request failed.", cause)

    class AsrConnectionFailed(cause: Throwable? = null) :
        ShopMateNetworkError("ASR request failed.", cause)

    class HttpNonSuccess(val statusCode: Int) :
        ShopMateNetworkError("Chat stream request failed with HTTP $statusCode.")

    class StreamCancelled(cause: Throwable? = null) :
        ShopMateNetworkError("Chat stream was cancelled.", cause)
}
