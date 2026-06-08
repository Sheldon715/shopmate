package com.shopmate.app

import kotlin.test.assertEquals
import org.junit.Test

class ShopMateScreenRouteTest {
    @Test
    fun cartPreviousNeverRestoresOnboardingOrNestedCheckout() {
        assertEquals(ShopMateScreen.HomeChatEntry, restoreCartPrevious(ShopMateScreen.Onboarding))
        assertEquals(
            ShopMateScreen.HomeChatEntry,
            restoreCartPrevious(ShopMateScreen.Cart(previousScreen = ShopMateScreen.Onboarding)),
        )
        assertEquals(
            ShopMateScreen.HomeChatEntry,
            restoreCartPrevious(
                ShopMateScreen.Checkout(
                    previousScreen = ShopMateScreen.Cart(previousScreen = ShopMateScreen.HomeChatEntry),
                    draftId = "draft-1",
                ),
            ),
        )
        assertEquals(
            ShopMateScreen.ChatRecommendation,
            restoreCartPrevious(ShopMateScreen.ChatRecommendation),
        )
    }

    @Test
    fun productDetailPreviousKeepsCartButNormalizesInvalidStacks() {
        val cartPrevious = ShopMateScreen.Cart(previousScreen = ShopMateScreen.ChatRecommendation)

        assertEquals(
            ShopMateScreen.HomeChatEntry,
            restoreProductDetailPrevious(ShopMateScreen.Onboarding),
        )
        assertEquals(cartPrevious, restoreProductDetailPrevious(cartPrevious))
        assertEquals(
            ShopMateScreen.ChatRecommendation,
            restoreProductDetailPrevious(
                ShopMateScreen.Checkout(
                    previousScreen = cartPrevious,
                    draftId = "draft-1",
                ),
            ),
        )
        assertEquals(
            ShopMateScreen.ChatRecommendation,
            restoreProductDetailPrevious(
                ShopMateScreen.ProductDetail(
                    productId = "product_001",
                    previousScreen = ShopMateScreen.HomeChatEntry,
                ),
            ),
        )
    }

    @Test
    fun routeRestoreKeepsMainDemoBackTargetsStable() {
        val detailFromCart = ShopMateScreen.ProductDetail(
            productId = "product_001",
            previousScreen = ShopMateScreen.Cart(previousScreen = ShopMateScreen.ChatRecommendation),
        )
        val checkoutFromDetail = ShopMateScreen.Checkout(
            previousScreen = detailFromCart,
            draftId = "draft-1",
        )

        val restored = restoreScreenFromRouteParts(checkoutFromDetail.toRouteParts())

        assertEquals(
            ShopMateScreen.Checkout(
                previousScreen = ShopMateScreen.ProductDetail(
                    productId = "product_001",
                    previousScreen = ShopMateScreen.Cart(
                        previousScreen = ShopMateScreen.ChatRecommendation,
                    ),
                ),
                draftId = "draft-1",
            ),
            restored,
        )
    }

    @Test
    fun blankOrUnknownRoutePartsRestoreToSafeEntryScreens() {
        assertEquals(ShopMateScreen.Onboarding, restoreScreenFromRouteParts(emptyList()))
        assertEquals(ShopMateScreen.Onboarding, restoreScreenFromRouteParts(listOf("missing")))
        assertEquals(
            ShopMateScreen.ProductComparison(comparisonId = null),
            restoreScreenFromRouteParts(listOf("comparison", "")),
        )
    }
}
