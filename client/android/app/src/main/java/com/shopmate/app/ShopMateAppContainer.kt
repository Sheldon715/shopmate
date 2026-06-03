package com.shopmate.app

import com.shopmate.app.data.asr.AsrApiClient
import com.shopmate.app.data.asr.AsrRepository
import com.shopmate.app.data.asr.DefaultAsrRepository
import com.shopmate.app.data.asr.OkHttpAsrApiClient
import com.shopmate.app.data.cart.CartApiClient
import com.shopmate.app.data.cart.CartRepository
import com.shopmate.app.data.cart.DefaultCartRepository
import com.shopmate.app.data.cart.OkHttpCartApiClient
import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.chat.ChatStreamClient
import com.shopmate.app.data.chat.DefaultChatRepository
import com.shopmate.app.data.chat.OkHttpChatStreamClient
import com.shopmate.app.data.network.ShopMateApiConfig
import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.data.products.DefaultProductRepository
import com.shopmate.app.data.products.OkHttpProductApiClient
import com.shopmate.app.data.products.ProductApiClient
import com.shopmate.app.data.products.ProductRepository
import com.shopmate.app.ui.cart.CartViewModelFactory
import com.shopmate.app.ui.chat.ChatViewModelFactory
import com.shopmate.app.ui.product.ProductDetailViewModelFactory

class ShopMateAppContainer {
    val apiConfig: ShopMateApiConfig by lazy {
        ShopMateApiConfig.default()
    }

    val imageUrlResolver: ShopMateImageUrlResolver by lazy {
        ShopMateImageUrlResolver(apiConfig)
    }

    val chatStreamClient: ChatStreamClient by lazy {
        OkHttpChatStreamClient(apiConfig = apiConfig)
    }

    val chatRepository: ChatRepository by lazy {
        DefaultChatRepository(chatStreamClient)
    }

    val asrApiClient: AsrApiClient by lazy {
        OkHttpAsrApiClient(apiConfig = apiConfig)
    }

    val asrRepository: AsrRepository by lazy {
        DefaultAsrRepository(asrApiClient)
    }

    val productApiClient: ProductApiClient by lazy {
        OkHttpProductApiClient(apiConfig = apiConfig)
    }

    val productRepository: ProductRepository by lazy {
        DefaultProductRepository(productApiClient, imageUrlResolver)
    }

    val cartApiClient: CartApiClient by lazy {
        OkHttpCartApiClient(apiConfig = apiConfig)
    }

    val cartRepository: CartRepository by lazy {
        DefaultCartRepository(cartApiClient, imageUrlResolver)
    }

    fun chatViewModelFactory(): ChatViewModelFactory =
        ChatViewModelFactory(chatRepository, imageUrlResolver)

    fun productDetailViewModelFactory(productId: String): ProductDetailViewModelFactory =
        ProductDetailViewModelFactory(productId, productRepository)

    fun cartViewModelFactory(): CartViewModelFactory =
        CartViewModelFactory(cartRepository)
}
