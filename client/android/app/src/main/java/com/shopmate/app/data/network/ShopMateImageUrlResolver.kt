package com.shopmate.app.data.network

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

class ShopMateImageUrlResolver(
    private val apiConfig: ShopMateApiConfig,
) {
    fun resolve(imagePathOrUrl: String?): String? {
        val value = imagePathOrUrl?.trim().orEmpty()
        if (value.isEmpty()) {
            return null
        }

        val parsedUrl = value.toHttpUrlOrNull()
        if (parsedUrl?.scheme in setOf("http", "https")) {
            return value
        }

        if (value.contains("\\") || value.contains('\u0000')) {
            return null
        }

        val publicImagePath = when {
            value.startsWith("/images/products/") -> value.trimStart('/')
            value.startsWith("images/products/") -> value
            value.startsWith("/") -> value.trimStart('/')
            else -> "images/products/${value.trimStart('/')}"
        }

        return try {
            apiConfig.resolve(publicImagePath).toString()
        } catch (error: ShopMateNetworkError.InvalidBaseUrl) {
            null
        } catch (error: IllegalArgumentException) {
            null
        }
    }
}
