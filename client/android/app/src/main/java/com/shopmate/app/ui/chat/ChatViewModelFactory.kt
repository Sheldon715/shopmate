package com.shopmate.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.shopmate.app.data.chat.ChatRepository
import com.shopmate.app.data.image.ImageSearchRepository
import com.shopmate.app.data.network.ShopMateImageUrlResolver

class ChatViewModelFactory(
    private val chatRepository: ChatRepository,
    private val imageSearchRepository: ImageSearchRepository? = null,
    private val imageUrlResolver: ShopMateImageUrlResolver? = null,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ChatViewModel::class.java)) {
            return ChatViewModel(chatRepository, imageSearchRepository, imageUrlResolver) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
