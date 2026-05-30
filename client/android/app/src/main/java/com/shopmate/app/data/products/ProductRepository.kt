package com.shopmate.app.data.products

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
                    Result.success(response.data.toProductDetailUi(imageUrlResolver))

                response.error?.code == PRODUCT_NOT_FOUND_CODE ->
                    Result.failure(ProductDetailError.NotFound)

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
        } catch (error: RuntimeException) {
            Result.failure(ProductDetailError.Unknown)
        }
    }

    companion object {
        private const val PRODUCT_NOT_FOUND_CODE = "PRODUCT_NOT_FOUND"
    }
}

sealed class ProductDetailError(message: String, cause: Throwable? = null) :
    Exception(message, cause) {
    object InvalidProductId : ProductDetailError("Product id is empty.")
    object NotFound : ProductDetailError("Product was not found.")
    object ParseFailure : ProductDetailError("Product detail payload could not be parsed.")
    class NetworkFailure(cause: Throwable) :
        ProductDetailError("Product detail request failed.", cause)

    object Unknown : ProductDetailError("Product detail could not be loaded.")
}
