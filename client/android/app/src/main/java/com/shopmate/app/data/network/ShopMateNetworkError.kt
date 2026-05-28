package com.shopmate.app.data.network

sealed class ShopMateNetworkError(message: String, cause: Throwable? = null) :
    Exception(message, cause) {
    class InvalidBaseUrl(baseUrl: String) :
        ShopMateNetworkError("Invalid ShopMate API base URL: $baseUrl")

    class RequestSerializationFailed(cause: Throwable) :
        ShopMateNetworkError("Failed to serialize chat stream request.", cause)

    class ResponseParseFailed(eventName: String, cause: Throwable) :
        ShopMateNetworkError("Failed to parse chat stream event: $eventName", cause)

    class StreamConnectionFailed(cause: Throwable? = null) :
        ShopMateNetworkError("Chat stream connection failed.", cause)

    class HttpNonSuccess(val statusCode: Int) :
        ShopMateNetworkError("Chat stream request failed with HTTP $statusCode.")

    class StreamCancelled(cause: Throwable? = null) :
        ShopMateNetworkError("Chat stream was cancelled.", cause)
}
