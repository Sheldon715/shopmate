package com.shopmate.app.ui.product

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shopmate.app.data.products.ProductDetailError
import com.shopmate.app.data.products.ProductRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class ProductDetailViewModel(
    initialProductId: String,
    private val productRepository: ProductRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        ProductDetailUiState(
            productId = initialProductId,
            isLoading = initialProductId.isNotBlank(),
        ),
    )
    val uiState: StateFlow<ProductDetailUiState> = _uiState.asStateFlow()

    private var loadJob: Job? = null

    init {
        load(initialProductId)
    }

    fun load(productId: String) {
        val normalizedProductId = productId.trim()
        loadJob?.cancel()

        if (normalizedProductId.isEmpty()) {
            _uiState.value = ProductDetailUiState(
                productId = productId,
                errorMessage = ProductDetailError.InvalidProductId.toDisplayMessage(),
                canRetry = false,
            )
            return
        }

        _uiState.value = ProductDetailUiState(
            productId = normalizedProductId,
            isLoading = true,
        )

        loadJob = viewModelScope.launch {
            val result = productRepository.getProductDetail(normalizedProductId)
            _uiState.update { state ->
                result.fold(
                    onSuccess = { product ->
                        state.copy(
                            product = product,
                            isLoading = false,
                            errorMessage = null,
                            canRetry = false,
                        )
                    },
                    onFailure = { error ->
                        state.copy(
                            product = null,
                            isLoading = false,
                            errorMessage = error.toDisplayMessage(),
                            canRetry = error !is ProductDetailError.InvalidProductId &&
                                error !is ProductDetailError.NotFound,
                        )
                    },
                )
            }
        }
    }

    fun retry() {
        val productId = _uiState.value.productId
        if (_uiState.value.isLoading) {
            return
        }
        load(productId)
    }
}

private fun Throwable.toDisplayMessage(): String =
    when (this) {
        ProductDetailError.InvalidProductId,
        ProductDetailError.NotFound -> "商品不存在或已下架。"

        is ProductDetailError.NetworkFailure -> "无法加载商品详情，请确认后端正在运行。"
        ProductDetailError.ParseFailure -> "商品详情数据格式异常。"
        else -> "暂时无法加载商品详情。"
    }
