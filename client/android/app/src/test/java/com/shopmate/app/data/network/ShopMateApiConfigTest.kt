package com.shopmate.app.data.network

import com.shopmate.app.BuildConfig
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.junit.Test

class ShopMateApiConfigTest {
    @Test
    fun defaultConfigResolvesChatStreamPath() {
        val url = ShopMateApiConfig().resolve("api/chat/stream")

        val expectedUrl = BuildConfig.SHOPMATE_API_BASE_URL.trimEnd('/') + "/api/chat/stream"
        assertEquals(expectedUrl, url.toString())
    }

    @Test
    fun resolveNormalizesTrailingAndLeadingSlashes() {
        val config = ShopMateApiConfig("http://10.0.2.2:3000/")

        val url = config.resolve("/api/chat/stream")

        assertEquals("http://10.0.2.2:3000/api/chat/stream", url.toString())
    }

    @Test
    fun resolveRejectsInvalidBaseUrl() {
        assertFailsWith<ShopMateNetworkError.InvalidBaseUrl> {
            ShopMateApiConfig("localhost:3000").resolve("api/chat/stream")
        }
    }

    @Test
    fun resolveRejectsNonHttpScheme() {
        assertFailsWith<ShopMateNetworkError.InvalidBaseUrl> {
            ShopMateApiConfig("ftp://shopmate.example.test/").resolve("api/chat/stream")
        }
    }
}
