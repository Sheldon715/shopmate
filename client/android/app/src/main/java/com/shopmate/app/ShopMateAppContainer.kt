package com.shopmate.app

import com.shopmate.app.data.cart.CartApiClient
import com.shopmate.app.data.cart.CartRepository
import com.shopmate.app.data.cart.DefaultCartRepository
import com.shopmate.app.data.cart.OkHttpCartApiClient
import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.chat.ChatStreamClient
import com.shopmate.app.data.chat.DefaultChatRepository
import com.shopmate.app.data.chat.OkHttpChatStreamClient
import com.shopmate.app.data.products.DefaultProductRepository
import com.shopmate.app.data.products.OkHttpProductApiClient
import com.shopmate.app.data.products.ProductApiClient
import com.shopmate.app.data.products.ProductRepository
import com.shopmate.app.ui.cart.CartViewModelFactory
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

    val cartApiClient: CartApiClient by lazy {
        OkHttpCartApiClient()
    }

    val cartRepository: CartRepository by lazy {
        DefaultCartRepository(cartApiClient)
    }

    fun chatViewModelFactory(): ChatViewModelFactory =
        ChatViewModelFactory(chatRepository)

    fun productDetailViewModelFactory(productId: String): ProductDetailViewModelFactory =
        ProductDetailViewModelFactory(productId, productRepository)

    fun cartViewModelFactory(): CartViewModelFactory =
        CartViewModelFactory(cartRepository)
}
