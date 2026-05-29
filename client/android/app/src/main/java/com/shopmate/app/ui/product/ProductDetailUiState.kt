package com.shopmate.app.ui.product

import com.shopmate.app.ui.model.ProductDetailUi

data class ProductDetailUiState(
    val productId: String,
    val product: ProductDetailUi? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val canRetry: Boolean = false,
)
