package com.shopmate.app.data.network

import kotlin.test.assertEquals
import kotlin.test.assertNull
import org.junit.Test

class ShopMateImageUrlResolverTest {
    private val resolver = ShopMateImageUrlResolver(
        ShopMateApiConfig("https://api.example.test/base/"),
    )

    @Test
    fun keepsAbsoluteHttpUrls() {
        assertEquals(
            "https://cdn.example.test/product.png",
            resolver.resolve(" https://cdn.example.test/product.png "),
        )
        assertEquals(
            "http://cdn.example.test/product.png",
            resolver.resolve("http://cdn.example.test/product.png"),
        )
    }

    @Test
    fun resolvesPublicImagePathsAgainstApiBaseUrl() {
        assertEquals(
            "https://api.example.test/base/images/products/beauty/images/product.png",
            resolver.resolve("/images/products/beauty/images/product.png"),
        )
        assertEquals(
            "https://api.example.test/base/images/products/beauty/images/product.png",
            resolver.resolve("images/products/beauty/images/product.png"),
        )
    }

    @Test
    fun resolvesRawCatalogImagePathsUnderPublicProductPrefix() {
        assertEquals(
            "https://api.example.test/base/images/products/beauty/images/product.png",
            resolver.resolve("beauty/images/product.png"),
        )
    }

    @Test
    fun returnsNullForBlankOrInvalidPaths() {
        assertNull(resolver.resolve(null))
        assertNull(resolver.resolve(" "))
        assertNull(resolver.resolve("beauty\\images\\product.png"))
    }

    @Test
    fun returnsNullWhenBaseUrlIsInvalid() {
        val invalidResolver = ShopMateImageUrlResolver(ShopMateApiConfig("localhost:3000"))

        assertNull(invalidResolver.resolve("/images/products/beauty/images/product.png"))
    }
}
