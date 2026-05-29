package com.shopmate.app.data.products

import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateHttpClient
import com.shopmate.app.data.network.ShopMateJson
import com.shopmate.app.data.network.ShopMateNetworkError
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request

interface ProductApiClient {
    suspend fun getProductDetail(productId: String): ApiResponseDto<ProductDetailDto>
}

class OkHttpProductApiClient(
    apiConfig: ShopMateApiConfig = ShopMateApiConfig.default(),
    private val okHttpClient: OkHttpClient = ShopMateHttpClient.createJsonApiClient(),
    private val json: Json = ShopMateJson.instance,
) : ProductApiClient {
    private val productsBaseUrl = apiConfig.resolve(PRODUCTS_PATH)

    override suspend fun getProductDetail(productId: String): ApiResponseDto<ProductDetailDto> =
        withContext(Dispatchers.IO) {
            val url = productsBaseUrl.newBuilder()
                .addPathSegment(productId)
                .build()
            val request = Request.Builder()
                .url(url)
                .get()
                .header("Accept", JSON_ACCEPT)
                .build()

            val response = try {
                okHttpClient.newCall(request).execute()
            } catch (error: IOException) {
                throw ShopMateNetworkError.ProductConnectionFailed(error)
            }

            response.use { httpResponse ->
                val body = httpResponse.body?.string().orEmpty()
                if (httpResponse.isSuccessful) {
                    return@withContext parseProductResponse(body)
                }

                val parsedError = parseProductResponseOrNull(body)
                if (parsedError != null && !parsedError.success) {
                    return@withContext parsedError
                }

                throw ShopMateNetworkError.HttpNonSuccess(httpResponse.code)
            }
        }

    private fun parseProductResponse(body: String): ApiResponseDto<ProductDetailDto> =
        try {
            json.decodeFromString(
                ApiResponseDto.serializer(ProductDetailDto.serializer()),
                body,
            )
        } catch (error: SerializationException) {
            throw ShopMateNetworkError.ProductResponseParseFailed(error)
        } catch (error: IllegalArgumentException) {
            throw ShopMateNetworkError.ProductResponseParseFailed(error)
        }

    private fun parseProductResponseOrNull(body: String): ApiResponseDto<ProductDetailDto>? =
        try {
            parseProductResponse(body)
        } catch (error: ShopMateNetworkError.ProductResponseParseFailed) {
            null
        }

    companion object {
        private const val PRODUCTS_PATH = "api/products"
        private const val JSON_ACCEPT = "application/json"
    }
}
