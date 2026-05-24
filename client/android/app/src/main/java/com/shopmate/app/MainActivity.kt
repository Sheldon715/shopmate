package com.shopmate.app

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.shopmate.app.ui.chat.ChatRecommendationScreen
import com.shopmate.app.ui.home.HomeChatEntryScreen
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.onboarding.OnboardingScreen
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
                var currentScreen by remember { mutableStateOf(ShopMateScreen.Onboarding) }
                val openHistoryConversation: (HistoryConversationUi) -> Unit = { conversation ->
                    if (conversation.id == "history-commute-earbuds") {
                        currentScreen = ShopMateScreen.ChatRecommendation
                    }
                }

                when (currentScreen) {
                    ShopMateScreen.Onboarding -> OnboardingScreen(
                        onStartShopping = {
                            currentScreen = ShopMateScreen.HomeChatEntry
                        }
                    )

                    ShopMateScreen.HomeChatEntry -> HomeChatEntryScreen(
                        onNewChatClick = {
                            currentScreen = ShopMateScreen.HomeChatEntry
                        },
                        onHistoryClick = openHistoryConversation
                    )

                    ShopMateScreen.ChatRecommendation -> ChatRecommendationScreen(
                        onNewChatClick = {
                            currentScreen = ShopMateScreen.HomeChatEntry
                        },
                        onCartClick = {},
                        onHistoryClick = openHistoryConversation
                    )
                }
            }
        }
    }
}

private enum class ShopMateScreen {
    Onboarding,
    HomeChatEntry,
    ChatRecommendation
}
