package com.shopmate.app.data.products

import android.util.Log
import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.data.network.ShopMateNetworkError
import com.shopmate.app.ui.model.ProductDetailUi

interface ProductRepository {
    suspend fun getProductDetail(productId: String): Result<ProductDetailUi>
}

class DefaultProductRepository(
    private val productApiClient: ProductApiClient,
    private val imageUrlResolver: ShopMateImageUrlResolver? = null,
) : ProductRepository {
    override suspend fun getProductDetail(productId: String): Result<ProductDetailUi> {
        val normalizedProductId = productId.trim()
        if (normalizedProductId.isEmpty()) {
            return Result.failure(ProductDetailError.InvalidProductId)
        }

        return try {
            val response = productApiClient.getProductDetail(normalizedProductId)
            when {
                response.success && response.data != null ->
                    runCatching {
                        Log.d(
                            PRODUCT_DETAIL_LOG_TAG,
                            buildDetailPayloadSummary(
                                productId = normalizedProductId,
                                detail = response.data,
                            ),
                        )
                        response.data.toProductDetailUi(imageUrlResolver)
                    }.fold(
                        onSuccess = { product -> Result.success(product) },
                        onFailure = { error ->
                            if (error is IllegalStateException) {
                                Log.e(
                                    PRODUCT_DETAIL_LOG_TAG,
                                    "AI detail validation failed for $normalizedProductId",
                                    error,
                                )
                                Result.failure(ProductDetailError.ParseFailure)
                            } else {
                                throw error
                            }
                        },
                    )

                response.error?.code == PRODUCT_NOT_FOUND_CODE ->
                    Result.failure(ProductDetailError.NotFound)

                response.error?.code == PRODUCT_DETAIL_COPY_GENERATION_FAILED_CODE ->
                    Result.failure(ProductDetailError.ParseFailure)

                response.success ->
                    Result.failure(ProductDetailError.ParseFailure)

                else -> Result.failure(ProductDetailError.Unknown)
            }
        } catch (error: ShopMateNetworkError.ProductResponseParseFailed) {
            Result.failure(ProductDetailError.ParseFailure)
        } catch (error: ShopMateNetworkError.HttpNonSuccess) {
            Result.failure(ProductDetailError.NetworkFailure(error))
        } catch (error: ShopMateNetworkError.ProductConnectionFailed) {
            Result.failure(ProductDetailError.NetworkFailure(error))
        } catch (error: ShopMateNetworkError.InvalidBaseUrl) {
            Result.failure(ProductDetailError.NetworkFailure(error))
        } catch (error: IllegalStateException) {
            Result.failure(ProductDetailError.ParseFailure)
        } catch (error: RuntimeException) {
            Result.failure(ProductDetailError.Unknown)
        }
    }

    companion object {
        private const val PRODUCT_NOT_FOUND_CODE = "PRODUCT_NOT_FOUND"
        private const val PRODUCT_DETAIL_COPY_GENERATION_FAILED_CODE =
            "PRODUCT_DETAIL_COPY_GENERATION_FAILED"
        private const val PRODUCT_DETAIL_LOG_TAG = "ShopMateProductDetail"
    }
}

private fun buildDetailPayloadSummary(
    productId: String,
    detail: ProductDetailDto,
): String =
    "payload for $productId: " +
        "reason=${detail.recommendationReason?.take(40)}; " +
        "highlights=${detail.recommendationHighlights.size}; " +
        "displayName=${detail.displayName}; " +
        "displayTags=${detail.displayTags.size}; " +
        "displaySpecs=${detail.displaySpecs.joinToString { spec -> "${spec.label}:${spec.value}" }}; " +
        "suitability=${detail.suitabilityText?.take(60)}"

sealed class ProductDetailError(message: String, cause: Throwable? = null) :
    Exception(message, cause) {
    object InvalidProductId : ProductDetailError("Product id is empty.")
    object NotFound : ProductDetailError("Product was not found.")
    object ParseFailure : ProductDetailError("Product detail payload could not be parsed.")
    class NetworkFailure(cause: Throwable) :
        ProductDetailError("Product detail request failed.", cause)

    object Unknown : ProductDetailError("Product detail could not be loaded.")
}
