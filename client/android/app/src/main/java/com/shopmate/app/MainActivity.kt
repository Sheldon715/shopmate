package com.shopmate.app

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.shopmate.app.ui.cart.CartScreen
import com.shopmate.app.ui.chat.ChatRecommendationScreen
import com.shopmate.app.ui.comparison.ProductComparisonScreen
import com.shopmate.app.ui.home.HomeChatEntryScreen
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.onboarding.OnboardingScreen
import com.shopmate.app.ui.product.ProductDetailScreen
import com.shopmate.app.ui.theme.ShopMateTheme

class MainActivity : ComponentActivity() {
    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.WHITE
        window.navigationBarColor = Color.WHITE
        var systemUiFlags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            systemUiFlags = systemUiFlags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }

        window.decorView.systemUiVisibility = systemUiFlags
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
            }
        }

        setContent {
            ShopMateTheme {
                var currentScreen by rememberSaveable(stateSaver = ShopMateScreenSaver) {
                    mutableStateOf<ShopMateScreen>(ShopMateScreen.Onboarding)
                }
                val openCart: () -> Unit = {
                    currentScreen = ShopMateScreen.Cart(previousScreen = currentScreen)
                }
                val openCartPreview: () -> Unit = {
                    Toast.makeText(
                        this@MainActivity,
                        "购物车接口尚未接入，先打开购物车预览",
                        Toast.LENGTH_SHORT
                    ).show()
                    openCart()
                }
                val showCheckoutPending: () -> Unit = {
                    Toast.makeText(
                        this@MainActivity,
                        "模拟结算流程还未接入",
                        Toast.LENGTH_SHORT
                    ).show()
                }
                val openHistoryConversation: (HistoryConversationUi) -> Unit = { conversation ->
                    currentScreen = when (conversation.id) {
                        "history-commute-earbuds" -> ShopMateScreen.ChatRecommendation
                        "history-sunscreen-compare" -> ShopMateScreen.ProductComparison
                        else -> currentScreen
                    }
                }

                when (currentScreen) {
                    ShopMateScreen.Onboarding -> OnboardingScreen(
                        onStartShopping = {
                            currentScreen = ShopMateScreen.HomeChatEntry
                        }
                    )

                    ShopMateScreen.HomeChatEntry -> HomeChatEntryScreen(
                        onCartClick = openCart,
                        onNewChatClick = {
                            currentScreen = ShopMateScreen.HomeChatEntry
                        },
                        onHistoryClick = openHistoryConversation
                    )

                    ShopMateScreen.ChatRecommendation -> ChatRecommendationScreen(
                        onNewChatClick = {
                            currentScreen = ShopMateScreen.HomeChatEntry
                        },
                        onCartClick = openCart,
                        onProductClick = { productId ->
                            currentScreen = ShopMateScreen.ProductDetail(productId)
                        },
                        onHistoryClick = openHistoryConversation
                    )

                    ShopMateScreen.ProductComparison -> ProductComparisonScreen(
                        onNewChatClick = {
                            currentScreen = ShopMateScreen.HomeChatEntry
                        },
                        onCartClick = openCart,
                        onProductClick = { productId ->
                            currentScreen = ShopMateScreen.ProductDetail(productId)
                        },
                        onHistoryClick = openHistoryConversation
                    )

                    is ShopMateScreen.ProductDetail -> ProductDetailScreen(
                        productId = (currentScreen as ShopMateScreen.ProductDetail).productId,
                        onBackClick = {
                            currentScreen = ShopMateScreen.ChatRecommendation
                        },
                        onCartClick = openCart,
                        onAddCartClick = openCartPreview,
                        onBuyNowClick = openCartPreview
                    )

                    is ShopMateScreen.Cart -> CartScreen(
                        onBackClick = {
                            currentScreen = restoreCartPrevious(
                                (currentScreen as ShopMateScreen.Cart).previousScreen
                            )
                        },
                        onCheckoutClick = showCheckoutPending
                    )
                }
            }
        }
    }
}

private sealed class ShopMateScreen {
    object Onboarding : ShopMateScreen()
    object HomeChatEntry : ShopMateScreen()
    object ChatRecommendation : ShopMateScreen()
    object ProductComparison : ShopMateScreen()
    data class ProductDetail(val productId: String) : ShopMateScreen()
    data class Cart(val previousScreen: ShopMateScreen) : ShopMateScreen()
}

private val ShopMateScreenSaver: Saver<ShopMateScreen, List<String>> = Saver(
    save = { screen -> screen.toRouteParts() },
    restore = { parts -> restoreScreenFromRouteParts(parts) }
)

private fun restoreCartPrevious(previousScreen: ShopMateScreen): ShopMateScreen =
    when (previousScreen) {
        ShopMateScreen.Onboarding -> ShopMateScreen.HomeChatEntry
        is ShopMateScreen.Cart -> ShopMateScreen.HomeChatEntry
        else -> previousScreen
    }

private fun ShopMateScreen.toRouteParts(): List<String> =
    when (this) {
        ShopMateScreen.Onboarding -> listOf("onboarding")
        ShopMateScreen.HomeChatEntry -> listOf("home")
        ShopMateScreen.ChatRecommendation -> listOf("chat-recommendation")
        ShopMateScreen.ProductComparison -> listOf("comparison")
        is ShopMateScreen.ProductDetail -> listOf("product-detail", productId)
        is ShopMateScreen.Cart -> listOf("cart") + previousScreen.toRouteParts().take(2)
    }

private fun restoreScreenFromRouteParts(parts: List<String>): ShopMateScreen =
    when (parts.firstOrNull()) {
        "home" -> ShopMateScreen.HomeChatEntry
        "chat-recommendation" -> ShopMateScreen.ChatRecommendation
        "comparison" -> ShopMateScreen.ProductComparison
        "product-detail" -> ShopMateScreen.ProductDetail(parts.getOrNull(1).orEmpty())
        "cart" -> ShopMateScreen.Cart(
            previousScreen = restoreScreenFromRouteParts(parts.drop(1))
                .let(::restoreCartPrevious)
        )
        else -> ShopMateScreen.Onboarding
    }
