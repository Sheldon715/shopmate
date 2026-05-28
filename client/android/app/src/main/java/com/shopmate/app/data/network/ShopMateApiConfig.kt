package com.shopmate.app.data.network

import com.shopmate.app.BuildConfig
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

data class ShopMateApiConfig(
    val baseUrl: String = BuildConfig.SHOPMATE_API_BASE_URL,
) {
    fun resolve(path: String): HttpUrl {
        val cleanBaseUrl = baseUrl.trim()
        val parsedBaseUrl = cleanBaseUrl.toHttpUrlOrNull()
        if (
            cleanBaseUrl.isEmpty() ||
            parsedBaseUrl == null ||
            parsedBaseUrl.scheme !in setOf("http", "https")
        ) {
            throw ShopMateNetworkError.InvalidBaseUrl(baseUrl)
        }

        val cleanBase = cleanBaseUrl.trimEnd('/')
        val cleanPath = path.trim().trimStart('/')
        val resolvedUrl = "$cleanBase/$cleanPath".toHttpUrlOrNull()
        return resolvedUrl ?: throw ShopMateNetworkError.InvalidBaseUrl(baseUrl)
    }

    companion object {
        fun default(): ShopMateApiConfig = ShopMateApiConfig()
    }
}
