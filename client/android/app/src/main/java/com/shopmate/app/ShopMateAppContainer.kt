package com.shopmate.app

import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.chat.ChatStreamClient
import com.shopmate.app.data.chat.DefaultChatRepository
import com.shopmate.app.data.chat.OkHttpChatStreamClient
import com.shopmate.app.data.products.DefaultProductRepository
import com.shopmate.app.data.products.OkHttpProductApiClient
import com.shopmate.app.data.products.ProductApiClient
import com.shopmate.app.data.products.ProductRepository
import com.shopmate.app.ui.chat.ChatViewModelFactory
import com.shopmate.app.ui.product.ProductDetailViewModelFactory

class ShopMateAppContainer {
    val chatStreamClient: ChatStreamClient by lazy {
        OkHttpChatStreamClient()
    }

    val chatRepository: ChatRepository by lazy {
        DefaultChatRepository(chatStreamClient)
    }

    val productApiClient: ProductApiClient by lazy {
        OkHttpProductApiClient()
    }

    val productRepository: ProductRepository by lazy {
        DefaultProductRepository(productApiClient)
    }

    fun chatViewModelFactory(): ChatViewModelFactory =
        ChatViewModelFactory(chatRepository)

    fun productDetailViewModelFactory(productId: String): ProductDetailViewModelFactory =
        ProductDetailViewModelFactory(productId, productRepository)
}
