package com.shopmate.app.data.orders

import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateHttpClient
import com.shopmate.app.data.network.ShopMateJson
import com.shopmate.app.data.network.ShopMateNetworkError
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

interface OrderApiClient {
    suspend fun createMockCheckout(
        conversationId: String,
    ): OrderApiResponseDto<MockCheckoutDraftResponseDto>

    suspend fun confirmMockCheckout(
        conversationId: String,
    ): OrderApiResponseDto<MockCheckoutConfirmResponseDto>

    suspend fun cancelMockCheckout(
        conversationId: String,
    ): OrderApiResponseDto<MockCheckoutCancelResponseDto>
}

class OkHttpOrderApiClient(
    apiConfig: ShopMateApiConfig = ShopMateApiConfig.default(),
    private val okHttpClient: OkHttpClient = ShopMateHttpClient.createJsonApiClient(),
    private val json: Json = ShopMateJson.instance,
) : OrderApiClient {
    private val ordersBaseUrl = apiConfig.resolve(ORDERS_PATH)

    override suspend fun createMockCheckout(
        conversationId: String,
    ): OrderApiResponseDto<MockCheckoutDraftResponseDto> =
        executeOrderRequest(
            request = mockCheckoutRequestBuilder()
                .post(createMockCheckoutBody(conversationId))
                .build(),
            serializer = mockCheckoutDraftResponseSerializer,
        )

    override suspend fun confirmMockCheckout(
        conversationId: String,
    ): OrderApiResponseDto<MockCheckoutConfirmResponseDto> =
        executeOrderRequest(
            request = mockCheckoutRequestBuilder("confirm")
                .post(createMockCheckoutBody(conversationId))
                .build(),
            serializer = mockCheckoutConfirmResponseSerializer,
        )

    override suspend fun cancelMockCheckout(
        conversationId: String,
    ): OrderApiResponseDto<MockCheckoutCancelResponseDto> =
        executeOrderRequest(
            request = mockCheckoutRequestBuilder("cancel")
                .post(createMockCheckoutBody(conversationId))
                .build(),
            serializer = mockCheckoutCancelResponseSerializer,
        )

    private fun mockCheckoutRequestBuilder(
        pathSegment: String? = null,
    ): Request.Builder {
        val urlBuilder = ordersBaseUrl.newBuilder().addPathSegment("mock-checkout")
        if (pathSegment != null) {
            urlBuilder.addPathSegment(pathSegment)
        }

        return Request.Builder()
            .url(urlBuilder.build())
            .header("Accept", JSON_MEDIA_TYPE_VALUE)
    }

    private fun createMockCheckoutBody(conversationId: String) =
        json.encodeToString(MockCheckoutRequestDto(conversationId = conversationId))
            .toJsonRequestBody()

    private suspend fun <T> executeOrderRequest(
        request: Request,
        serializer: KSerializer<OrderApiResponseDto<T>>,
    ): OrderApiResponseDto<T> =
        withContext(Dispatchers.IO) {
            val response = try {
                okHttpClient.newCall(request).execute()
            } catch (error: IOException) {
                throw ShopMateNetworkError.OrderConnectionFailed(error)
            }

            response.use { httpResponse ->
                val body = httpResponse.body?.string().orEmpty()
                if (httpResponse.isSuccessful) {
                    return@withContext parseOrderResponse(body, serializer)
                }

                val parsedError = parseOrderResponseOrNull(body, serializer)
                if (parsedError != null && !parsedError.success) {
                    return@withContext parsedError
                }

                throw ShopMateNetworkError.HttpNonSuccess(httpResponse.code)
            }
        }

    private fun <T> parseOrderResponse(
        body: String,
        serializer: KSerializer<OrderApiResponseDto<T>>,
    ): OrderApiResponseDto<T> =
        try {
            json.decodeFromString(serializer, body)
        } catch (error: SerializationException) {
            throw ShopMateNetworkError.OrderResponseParseFailed(error)
        } catch (error: IllegalArgumentException) {
            throw ShopMateNetworkError.OrderResponseParseFailed(error)
        }

    private fun <T> parseOrderResponseOrNull(
        body: String,
        serializer: KSerializer<OrderApiResponseDto<T>>,
    ): OrderApiResponseDto<T>? =
        try {
            parseOrderResponse(body, serializer)
        } catch (error: ShopMateNetworkError.OrderResponseParseFailed) {
            null
        }

    private companion object {
        private const val ORDERS_PATH = "api/orders"
        private const val JSON_MEDIA_TYPE_VALUE = "application/json"
        private val jsonMediaType = JSON_MEDIA_TYPE_VALUE.toMediaType()
        private val mockCheckoutDraftResponseSerializer:
            KSerializer<OrderApiResponseDto<MockCheckoutDraftResponseDto>> =
            OrderApiResponseDto.serializer(MockCheckoutDraftResponseDto.serializer())
        private val mockCheckoutConfirmResponseSerializer:
            KSerializer<OrderApiResponseDto<MockCheckoutConfirmResponseDto>> =
            OrderApiResponseDto.serializer(MockCheckoutConfirmResponseDto.serializer())
        private val mockCheckoutCancelResponseSerializer:
            KSerializer<OrderApiResponseDto<MockCheckoutCancelResponseDto>> =
            OrderApiResponseDto.serializer(MockCheckoutCancelResponseDto.serializer())

        private fun String.toJsonRequestBody() = toRequestBody(jsonMediaType)
    }
}
