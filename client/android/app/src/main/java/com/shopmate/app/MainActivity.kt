package com.shopmate.app

import android.Manifest
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.content.pm.PackageManager
import android.view.View
import android.view.WindowInsets
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shopmate.app.data.mock.MockShopMateData
import com.shopmate.app.ui.cart.CartScreen
import com.shopmate.app.ui.cart.CartViewModel
import com.shopmate.app.ui.chat.ChatRecommendationScreen
import com.shopmate.app.ui.chat.ChatSideEffect
import com.shopmate.app.ui.chat.ChatViewModel
import com.shopmate.app.ui.chat.VoiceInputUiState
import com.shopmate.app.ui.comparison.ProductComparisonScreen
import com.shopmate.app.ui.home.HomeChatEntryScreen
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.onboarding.OnboardingScreen
import com.shopmate.app.ui.product.ProductDetailScreen
import com.shopmate.app.ui.product.ProductDetailViewModel
import com.shopmate.app.ui.theme.ShopMateTheme
import com.shopmate.app.ui.voice.AndroidSpeechVoiceInputController

class MainActivity : ComponentActivity() {
    private val appContainer by lazy { ShopMateAppContainer() }

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
                val chatViewModel: ChatViewModel = viewModel(
                    factory = appContainer.chatViewModelFactory()
                )
                val chatUiState by chatViewModel.uiState.collectAsState()
                val cartViewModel: CartViewModel = viewModel(
                    factory = appContainer.cartViewModelFactory()
                )
                val cartUiState by cartViewModel.uiState.collectAsState()
                val voiceController = remember(chatViewModel) {
                    AndroidSpeechVoiceInputController(
                        context = this@MainActivity,
                        listener = object : AndroidSpeechVoiceInputController.Listener {
                            override fun onListening() {
                                chatViewModel.onVoiceListening()
                                currentScreen = ShopMateScreen.ChatRecommendation
                            }

                            override fun onTranscribing() {
                                chatViewModel.onVoiceTranscribing()
                                currentScreen = ShopMateScreen.ChatRecommendation
                            }

                            override fun onTranscriptReady(transcript: String) {
                                chatViewModel.onVoiceTranscriptReady(transcript)
                                currentScreen = ShopMateScreen.ChatRecommendation
                            }

                            override fun onError(message: String) {
                                chatViewModel.onVoiceInputError(message)
                            }
                        },
                    )
                }
                DisposableEffect(voiceController) {
                    onDispose {
                        voiceController.destroy()
                    }
                }
                fun beginVoiceRecognition() {
                    chatViewModel.onVoiceStartRequested()
                    voiceController.startListening()
                }
                val voicePermissionLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.RequestPermission(),
                ) { granted ->
                    if (granted) {
                        beginVoiceRecognition()
                    } else {
                        chatViewModel.onVoicePermissionDenied()
                    }
                }
                val startVoiceInput: () -> Unit = {
                    val state = chatViewModel.uiState.value
                    val canStartVoice = !state.isSending &&
                        state.voiceInput !is VoiceInputUiState.Listening &&
                        state.voiceInput !is VoiceInputUiState.Transcribing

                    if (canStartVoice &&
                        checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                        PackageManager.PERMISSION_GRANTED
                    ) {
                        beginVoiceRecognition()
                    } else if (canStartVoice) {
                        voicePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
                val finishVoiceInput: () -> Unit = {
                    when (chatViewModel.uiState.value.voiceInput) {
                        VoiceInputUiState.Listening -> voiceController.stopListening()
                        VoiceInputUiState.Transcribing -> Unit
                        else -> Unit
                    }
                }
                val cancelVoiceInput: () -> Unit = {
                    voiceController.cancel()
                    chatViewModel.cancelVoiceInput()
                }
                LaunchedEffect(chatViewModel) {
                    chatViewModel.sideEffects.collect { effect ->
                        when (effect) {
                            is ChatSideEffect.RefreshCart -> cartViewModel.refresh()
                        }
                    }
                }
                cartUiState.operationMessage?.let { message ->
                    LaunchedEffect(message.id) {
                        Toast.makeText(
                            this@MainActivity,
                            message.text,
                            Toast.LENGTH_SHORT
                        ).show()
                        cartViewModel.consumeOperationMessage(message.id)
                    }
                }
                val historyConversations =
                    chatUiState.historyConversations + MockShopMateData.historyConversations
                val editableHistoryIds = chatViewModel.editableHistoryConversationIds()
                val renameHistory: (String, String) -> Unit = { conversationId, title ->
                    chatViewModel.renameHistoryConversation(conversationId, title)
                }
                val deleteHistory: (String) -> Unit = { conversationId ->
                    cancelVoiceInput()
                    chatViewModel.deleteHistoryConversation(conversationId)
                    if (!chatViewModel.hasActiveConversation() &&
                        currentScreen == ShopMateScreen.ChatRecommendation
                    ) {
                        currentScreen = ShopMateScreen.HomeChatEntry
                    }
                }
                val startNewChat: () -> Unit = {
                    cancelVoiceInput()
                    chatViewModel.startNewChat()
                    currentScreen = ShopMateScreen.HomeChatEntry
                }
                val sendHomeChatMessage: () -> Unit = {
                    val currentChatState = chatViewModel.uiState.value
                    if (currentChatState.composerText.isNotBlank() && !currentChatState.isSending) {
                        chatViewModel.sendMessage()
                        currentScreen = ShopMateScreen.ChatRecommendation
                    }
                }
                val openCart: () -> Unit = {
                    currentScreen = ShopMateScreen.Cart(previousScreen = currentScreen)
                }
                val addProductToCart: (String) -> Unit = { productId ->
                    cartViewModel.addProduct(productId)
                }
                val showCheckoutPending: () -> Unit = {
                    Toast.makeText(
                        this@MainActivity,
                        "模拟结算流程还未接入",
                        Toast.LENGTH_SHORT
                    ).show()
                }
                val openHistoryConversation: (HistoryConversationUi) -> Unit = { conversation ->
                    cancelVoiceInput()
                    if (chatViewModel.openHistoryConversation(conversation.id)) {
                        currentScreen = ShopMateScreen.ChatRecommendation
                    } else {
                        currentScreen = when (conversation.id) {
                            "history-commute-earbuds" -> ShopMateScreen.ChatRecommendation
                            "history-sunscreen-compare" -> ShopMateScreen.ChatRecommendation
                            else -> currentScreen
                        }
                    }
                }

                when (currentScreen) {
                    ShopMateScreen.Onboarding -> OnboardingScreen(
                        onStartShopping = {
                            currentScreen = ShopMateScreen.HomeChatEntry
                        }
                    )

                    ShopMateScreen.HomeChatEntry -> HomeChatEntryScreen(
                        composerText = chatUiState.composerText,
                        isSending = chatUiState.isSending,
                        historyConversations = historyConversations,
                        voiceInputState = chatUiState.voiceInput,
                        onComposerTextChange = chatViewModel::onComposerTextChange,
                        onSend = sendHomeChatMessage,
                        onVoicePressStart = startVoiceInput,
                        onVoicePressEnd = finishVoiceInput,
                        onVoiceCancel = cancelVoiceInput,
                        onCartClick = openCart,
                        onNewChatClick = startNewChat,
                        onHistoryClick = openHistoryConversation,
                        editableConversationIds = editableHistoryIds,
                        onRenameHistory = renameHistory,
                        onDeleteHistory = deleteHistory
                    )

                    ShopMateScreen.ChatRecommendation -> ChatRecommendationScreen(
                        state = chatUiState,
                        onComposerTextChange = chatViewModel::onComposerTextChange,
                        onSend = chatViewModel::sendMessage,
                        onVoicePressStart = startVoiceInput,
                        onVoicePressEnd = finishVoiceInput,
                        onVoiceCancel = cancelVoiceInput,
                        onRetry = chatViewModel::retryLastMessage,
                        onNewChatClick = startNewChat,
                        onCartClick = openCart,
                        onProductClick = { productId ->
                            currentScreen = ShopMateScreen.ProductDetail(
                                productId = productId,
                                previousScreen = ShopMateScreen.ChatRecommendation,
                            )
                        },
                        onAddCartClick = addProductToCart,
                        onComparisonClick = { comparisonId ->
                            currentScreen = ShopMateScreen.ProductComparison(comparisonId)
                        },
                        onHistoryClick = openHistoryConversation,
                        historyConversations = historyConversations,
                        editableConversationIds = editableHistoryIds,
                        onRenameHistory = renameHistory,
                        onDeleteHistory = deleteHistory
                    )

                    is ShopMateScreen.ProductComparison -> {
                        val comparisonId =
                            (currentScreen as ShopMateScreen.ProductComparison).comparisonId
                        val comparison = comparisonId?.let(chatViewModel::findComparison)

                        if (comparison == null) {
                            LaunchedEffect(comparisonId) {
                                currentScreen = ShopMateScreen.ChatRecommendation
                            }
                        } else {
                            ProductComparisonScreen(
                                comparison = comparison,
                                onBackClick = {
                                    currentScreen = ShopMateScreen.ChatRecommendation
                                },
                                onCartClick = openCart,
                                onAddCartClick = addProductToCart,
                                onProductClick = { productId ->
                                    currentScreen = ShopMateScreen.ProductDetail(
                                        productId = productId,
                                        previousScreen = currentScreen,
                                    )
                                }
                            )
                        }
                    }

                    is ShopMateScreen.ProductDetail -> {
                        val productDetailScreen = currentScreen as ShopMateScreen.ProductDetail
                        val productId = productDetailScreen.productId
                        val productDetailViewModel: ProductDetailViewModel = viewModel(
                            key = "product-detail-$productId",
                            factory = appContainer.productDetailViewModelFactory(productId)
                        )
                        val productDetailState by productDetailViewModel.uiState.collectAsState()

                        ProductDetailScreen(
                            state = productDetailState,
                            onBackClick = {
                                currentScreen = restoreProductDetailPrevious(
                                    productDetailScreen.previousScreen
                                )
                            },
                            onCartClick = openCart,
                            onRetry = productDetailViewModel::retry,
                            onAddCartClick = {
                                addProductToCart(productId)
                            },
                            onBuyNowClick = {
                                addProductToCart(productId)
                            }
                        )
                    }

                    is ShopMateScreen.Cart -> CartScreen(
                        state = cartUiState,
                        onBackClick = {
                            currentScreen = restoreCartPrevious(
                                (currentScreen as ShopMateScreen.Cart).previousScreen
                            )
                        },
                        onCheckoutClick = showCheckoutPending,
                        onRetry = cartViewModel::retry,
                        onToggleSelected = { item ->
                            cartViewModel.updateSelected(item.id, !item.selected)
                        },
                        onQuantityChange = { item, quantity ->
                            cartViewModel.updateQuantity(item.id, quantity)
                        },
                        onDelete = { item ->
                            cartViewModel.removeItem(item.id)
                        },
                        onToggleAll = cartViewModel::selectAll
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
    data class ProductComparison(val comparisonId: String? = null) : ShopMateScreen()
    data class ProductDetail(
        val productId: String,
        val previousScreen: ShopMateScreen = ChatRecommendation,
    ) : ShopMateScreen()
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

private fun restoreProductDetailPrevious(previousScreen: ShopMateScreen): ShopMateScreen =
    when (previousScreen) {
        ShopMateScreen.Onboarding -> ShopMateScreen.HomeChatEntry
        is ShopMateScreen.Cart -> ShopMateScreen.ChatRecommendation
        is ShopMateScreen.ProductDetail -> ShopMateScreen.ChatRecommendation
        else -> previousScreen
    }

private fun ShopMateScreen.toRouteParts(): List<String> =
    when (this) {
        ShopMateScreen.Onboarding -> listOf("onboarding")
        ShopMateScreen.HomeChatEntry -> listOf("home")
        ShopMateScreen.ChatRecommendation -> listOf("chat-recommendation")
        is ShopMateScreen.ProductComparison -> listOf("comparison", comparisonId.orEmpty())
        is ShopMateScreen.ProductDetail -> listOf("product-detail", productId) +
            previousScreen.toRouteParts().take(2)
        is ShopMateScreen.Cart -> listOf("cart") + previousScreen.toRouteParts().take(2)
    }

private fun restoreScreenFromRouteParts(parts: List<String>): ShopMateScreen =
    when (parts.firstOrNull()) {
        "home" -> ShopMateScreen.HomeChatEntry
        "chat-recommendation" -> ShopMateScreen.ChatRecommendation
        "comparison" -> ShopMateScreen.ProductComparison(
            comparisonId = parts.getOrNull(1)?.takeIf { value -> value.isNotBlank() },
        )
        "product-detail" -> ShopMateScreen.ProductDetail(
            productId = parts.getOrNull(1).orEmpty(),
            previousScreen = restoreScreenFromRouteParts(parts.drop(2))
                .let(::restoreProductDetailPrevious),
        )
        "cart" -> ShopMateScreen.Cart(
            previousScreen = restoreScreenFromRouteParts(parts.drop(1))
                .let(::restoreCartPrevious)
        )
        else -> ShopMateScreen.Onboarding
    }
