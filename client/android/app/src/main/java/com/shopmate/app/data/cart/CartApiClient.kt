package com.shopmate.app.data.cart

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

interface CartApiClient {
    suspend fun getCart(): CartApiResponseDto<CartDto>
    suspend fun addCartItem(productId: String, quantity: Int): CartApiResponseDto<CartDto>
    suspend fun updateCartItem(
        itemId: String,
        quantity: Int? = null,
        selected: Boolean? = null,
    ): CartApiResponseDto<CartDto>

    suspend fun deleteCartItem(itemId: String): CartApiResponseDto<CartDto>
    suspend fun selectAll(selected: Boolean): CartApiResponseDto<CartDto>
}

class OkHttpCartApiClient(
    apiConfig: ShopMateApiConfig = ShopMateApiConfig.default(),
    private val okHttpClient: OkHttpClient = ShopMateHttpClient.createJsonApiClient(),
    private val json: Json = ShopMateJson.instance,
) : CartApiClient {
    private val cartBaseUrl = apiConfig.resolve(CART_PATH)

    override suspend fun getCart(): CartApiResponseDto<CartDto> =
        executeCartRequest(
            Request.Builder()
                .url(cartBaseUrl)
                .get()
                .header("Accept", JSON_MEDIA_TYPE_VALUE)
                .build(),
        )

    override suspend fun addCartItem(
        productId: String,
        quantity: Int,
    ): CartApiResponseDto<CartDto> {
        val body = json.encodeToString(
            AddCartItemRequestDto(productId = productId, quantity = quantity),
        )
        return executeCartRequest(
            Request.Builder()
                .url(cartBaseUrl.newBuilder().addPathSegment("items").build())
                .post(body.toJsonRequestBody())
                .header("Accept", JSON_MEDIA_TYPE_VALUE)
                .build(),
        )
    }

    override suspend fun updateCartItem(
        itemId: String,
        quantity: Int?,
        selected: Boolean?,
    ): CartApiResponseDto<CartDto> {
        val body = json.encodeToString(
            PatchCartItemRequestDto(quantity = quantity, selected = selected),
        )
        return executeCartRequest(
            Request.Builder()
                .url(
                    cartBaseUrl.newBuilder()
                        .addPathSegment("items")
                        .addPathSegment(itemId)
                        .build(),
                )
                .patch(body.toJsonRequestBody())
                .header("Accept", JSON_MEDIA_TYPE_VALUE)
                .build(),
        )
    }

    override suspend fun deleteCartItem(itemId: String): CartApiResponseDto<CartDto> =
        executeCartRequest(
            Request.Builder()
                .url(
                    cartBaseUrl.newBuilder()
                        .addPathSegment("items")
                        .addPathSegment(itemId)
                        .build(),
                )
                .delete()
                .header("Accept", JSON_MEDIA_TYPE_VALUE)
                .build(),
        )

    override suspend fun selectAll(selected: Boolean): CartApiResponseDto<CartDto> {
        val body = json.encodeToString(SelectAllCartItemsRequestDto(selected = selected))
        return executeCartRequest(
            Request.Builder()
                .url(cartBaseUrl.newBuilder().addPathSegment("select-all").build())
                .post(body.toJsonRequestBody())
                .header("Accept", JSON_MEDIA_TYPE_VALUE)
                .build(),
        )
    }

    private suspend fun executeCartRequest(request: Request): CartApiResponseDto<CartDto> =
        withContext(Dispatchers.IO) {
            val response = try {
                okHttpClient.newCall(request).execute()
            } catch (error: IOException) {
                throw ShopMateNetworkError.CartConnectionFailed(error)
            }

            response.use { httpResponse ->
                val body = httpResponse.body?.string().orEmpty()
                if (httpResponse.isSuccessful) {
                    return@withContext parseCartResponse(body)
                }

                val parsedError = parseCartResponseOrNull(body)
                if (parsedError != null && !parsedError.success) {
                    return@withContext parsedError
                }

                throw ShopMateNetworkError.HttpNonSuccess(httpResponse.code)
            }
        }

    private fun parseCartResponse(body: String): CartApiResponseDto<CartDto> =
        try {
            json.decodeFromString(cartResponseSerializer, body)
        } catch (error: SerializationException) {
            throw ShopMateNetworkError.CartResponseParseFailed(error)
        } catch (error: IllegalArgumentException) {
            throw ShopMateNetworkError.CartResponseParseFailed(error)
        }

    private fun parseCartResponseOrNull(body: String): CartApiResponseDto<CartDto>? =
        try {
            parseCartResponse(body)
        } catch (error: ShopMateNetworkError.CartResponseParseFailed) {
            null
        }

    private companion object {
        private const val CART_PATH = "api/cart"
        private const val JSON_MEDIA_TYPE_VALUE = "application/json"
        private val jsonMediaType = JSON_MEDIA_TYPE_VALUE.toMediaType()
        private val cartResponseSerializer: KSerializer<CartApiResponseDto<CartDto>> =
            CartApiResponseDto.serializer(CartDto.serializer())

        private fun String.toJsonRequestBody() = toRequestBody(jsonMediaType)
    }
}
