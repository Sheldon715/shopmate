package com.shopmate.app.ui.product

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.shopmate.app.data.products.ProductRepository

class ProductDetailViewModelFactory(
    private val productId: String,
    private val productRepository: ProductRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ProductDetailViewModel::class.java)) {
            return ProductDetailViewModel(productId, productRepository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
