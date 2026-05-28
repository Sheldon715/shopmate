package com.shopmate.app

import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.chat.ChatStreamClient
import com.shopmate.app.data.chat.DefaultChatRepository
import com.shopmate.app.data.chat.OkHttpChatStreamClient
import com.shopmate.app.ui.chat.ChatViewModelFactory

class ShopMateAppContainer {
    val chatStreamClient: ChatStreamClient by lazy {
        OkHttpChatStreamClient()
    }

    val chatRepository: ChatRepository by lazy {
        DefaultChatRepository(chatStreamClient)
    }

    fun chatViewModelFactory(): ChatViewModelFactory =
        ChatViewModelFactory(chatRepository)
}
