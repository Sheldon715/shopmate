package com.shopmate.app

import android.Manifest
import android.app.AlertDialog
import android.content.ContentResolver
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.content.pm.PackageManager
import android.view.View
import android.view.WindowInsets
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewModelScope
import com.shopmate.app.ui.cart.CartOperationMessage
import com.shopmate.app.ui.cart.CartScreen
import com.shopmate.app.ui.cart.CartViewModel
import com.shopmate.app.ui.checkout.CheckoutScreen
import com.shopmate.app.ui.checkout.CheckoutUiState
import com.shopmate.app.ui.checkout.CheckoutViewModel
import com.shopmate.app.ui.chat.ChatRecommendationScreen
import com.shopmate.app.ui.chat.ChatSideEffect
import com.shopmate.app.ui.chat.ChatViewModel
import com.shopmate.app.ui.chat.VoiceInputUiState
import com.shopmate.app.ui.components.ShopMateBuddyTransitionController
import com.shopmate.app.ui.components.ShopMateBuddyTransitionOverlay
import com.shopmate.app.ui.components.ShopMateBuddyTransitionRequest
import com.shopmate.app.ui.components.ShopMateOperationBanner
import com.shopmate.app.ui.comparison.ProductComparisonScreen
import com.shopmate.app.ui.comparison.ProductComparisonUnavailableScreen
import com.shopmate.app.ui.home.HomeChatEntryScreen
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.ProductAddCartState
import com.shopmate.app.ui.onboarding.OnboardingScreen
import com.shopmate.app.ui.product.ProductDetailScreen
import com.shopmate.app.ui.product.ProductDetailViewModel
import com.shopmate.app.ui.theme.ShopMateTheme
import com.shopmate.app.ui.voice.AndroidSpeechVoiceInputController
import com.shopmate.app.ui.voice.CloudAsrVoiceInputController
import java.io.File
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    private val appContainer by lazy { ShopMateAppContainer(applicationContext) }

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
                val buddyTransitionController = remember { ShopMateBuddyTransitionController() }
                var buddyTransitionRequest by remember {
                    mutableStateOf<ShopMateBuddyTransitionRequest?>(null)
                }
                var cartOperationBanner by remember { mutableStateOf<CartOperationMessage?>(null) }
                var homeKeyboardAvatarVisible by remember { mutableStateOf(false) }
                fun triggerHomeToChatBuddyTransition() {
                    if (currentScreen == ShopMateScreen.HomeChatEntry) {
                        buddyTransitionRequest = buddyTransitionController.trigger()
                    }
                }
                fun triggerHomeToChatBuddyTransitionIfNeeded() {
                    if (!homeKeyboardAvatarVisible) {
                        triggerHomeToChatBuddyTransition()
                    }
                }
                fun cancelBuddyTransition() {
                    buddyTransitionController.cancel()
                    buddyTransitionRequest = null
                }
                LaunchedEffect(currentScreen) {
                    if (currentScreen != ShopMateScreen.ChatRecommendation) {
                        cancelBuddyTransition()
                    }
                    if (currentScreen != ShopMateScreen.HomeChatEntry) {
                        homeKeyboardAvatarVisible = false
                    }
                }
                val voiceController = remember(chatViewModel, appContainer.asrRepository) {
                    val voiceListener = object : AndroidSpeechVoiceInputController.Listener {
                        override fun onListening() {
                            chatViewModel.onVoiceListening()
                        }

                        override fun onTranscribing() {
                            chatViewModel.onVoiceTranscribing()
                            triggerHomeToChatBuddyTransitionIfNeeded()
                            currentScreen = ShopMateScreen.ChatRecommendation
                        }

                        override fun onTranscriptReady(transcript: String) {
                            chatViewModel.onVoiceTranscriptReady(transcript)
                            triggerHomeToChatBuddyTransitionIfNeeded()
                            currentScreen = ShopMateScreen.ChatRecommendation
                        }

                        override fun onError(message: String) {
                            chatViewModel.onVoiceInputError(message)
                        }
                    }
                    val fallbackController = AndroidSpeechVoiceInputController(
                        context = this@MainActivity,
                        listener = voiceListener,
                    )
                    CloudAsrVoiceInputController(
                        context = this@MainActivity,
                        asrRepository = appContainer.asrRepository,
                        coroutineScope = chatViewModel.viewModelScope,
                        listener = voiceListener,
                        fallbackController = fallbackController,
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
                val imagePickerLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.PickVisualMedia(),
                ) { uri ->
                    uri ?: return@rememberLauncherForActivityResult
                    chatViewModel.selectImage(
                        uriString = uri.toString(),
                        mimeType = contentResolver.getType(uri),
                        sizeBytes = imageAttachmentSizeBytes(contentResolver, uri),
                    )
                }
                var pendingCameraImageUri by remember { mutableStateOf<Uri?>(null) }
                val cameraCaptureLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.TakePicture(),
                ) { captured ->
                    val uri = pendingCameraImageUri
                    pendingCameraImageUri = null

                    if (captured && uri != null) {
                        chatViewModel.selectImage(
                            uriString = uri.toString(),
                            mimeType = contentResolver.getType(uri) ?: "image/jpeg",
                            sizeBytes = imageAttachmentSizeBytes(contentResolver, uri),
                        )
                    }
                }
                val pickImageFromGallery: () -> Unit = {
                    cancelVoiceInput()
                    imagePickerLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                }
                val captureImage: () -> Unit = {
                    cancelVoiceInput()
                    val uri = runCatching { createCameraImageUri() }
                        .onFailure {
                            Toast.makeText(
                                this@MainActivity,
                                "无法启动拍照，请稍后重试",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                        .getOrNull()

                    if (uri != null) {
                        pendingCameraImageUri = uri
                        runCatching { cameraCaptureLauncher.launch(uri) }
                            .onFailure {
                                pendingCameraImageUri = null
                                Toast.makeText(
                                    this@MainActivity,
                                    "无法打开相机，请从相册选择图片",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                    }
                }
                val pickImage: () -> Unit = {
                    cancelVoiceInput()
                    showImageSourceDialog(
                        onCamera = captureImage,
                        onGallery = pickImageFromGallery,
                    )
                }
                LaunchedEffect(chatViewModel) {
                    chatViewModel.sideEffects.collect { effect ->
                        when (effect) {
                            is ChatSideEffect.RefreshCart -> cartViewModel.refresh()
                            is ChatSideEffect.ShowMockOrderResult -> {
                                Toast.makeText(
                                    this@MainActivity,
                                    effect.toToastText(),
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                            is ChatSideEffect.OpenCheckoutDraft -> {
                                currentScreen = ShopMateScreen.Checkout(
                                    previousScreen = ShopMateScreen.ChatRecommendation,
                                    draftId = effect.draftId,
                                )
                            }
                        }
                    }
                }
                cartUiState.operationMessage?.let { message ->
                    LaunchedEffect(message.id) {
                        cartOperationBanner = message
                        delay(CART_OPERATION_BANNER_DURATION_MS)
                        if (cartOperationBanner?.id == message.id) {
                            cartOperationBanner = null
                        }
                        cartViewModel.consumeOperationMessage(message.id)
                    }
                }
                LaunchedEffect(cartUiState.checkoutDraft?.id, currentScreen) {
                    val draft = cartUiState.checkoutDraft
                    val screen = currentScreen

                    if (draft != null) {
                        currentScreen = when (screen) {
                            is ShopMateScreen.Cart -> ShopMateScreen.Checkout(
                                previousScreen = restoreCartPrevious(screen.previousScreen),
                                draftId = draft.id,
                            )

                            is ShopMateScreen.ProductDetail -> ShopMateScreen.Checkout(
                                previousScreen = screen,
                                draftId = draft.id,
                            )

                            else -> screen
                        }
                    }
                }
                val historyConversations = chatUiState.historyConversations
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
                    cancelBuddyTransition()
                    chatViewModel.startNewChat()
                    currentScreen = ShopMateScreen.HomeChatEntry
                }
                val sendHomeChatMessage: () -> Unit = {
                    val currentChatState = chatViewModel.uiState.value
                    if (
                        (currentChatState.composerText.isNotBlank() ||
                            currentChatState.selectedImage != null) &&
                        !currentChatState.isSending
                    ) {
                        triggerHomeToChatBuddyTransitionIfNeeded()
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
                val buyNowProduct: (String) -> Unit = { productId ->
                    cartViewModel.buyNowProduct(productId)
                }
                val showCheckoutPending: () -> Unit = {
                    cancelVoiceInput()
                    cartViewModel.startCheckout()
                }
                val openHistoryConversation: (HistoryConversationUi) -> Unit = { conversation ->
                    cancelVoiceInput()
                    if (chatViewModel.openHistoryConversation(conversation.id)) {
                        currentScreen = ShopMateScreen.ChatRecommendation
                    }
                }

                Box(modifier = Modifier.fillMaxSize()) {
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
                        selectedImage = chatUiState.selectedImage,
                        onComposerTextChange = chatViewModel::onComposerTextChange,
                        onSend = sendHomeChatMessage,
                        onVoicePressStart = startVoiceInput,
                        onVoicePressEnd = finishVoiceInput,
                        onVoiceCancel = cancelVoiceInput,
                        onImagePickClick = pickImage,
                        onImageRemoveClick = chatViewModel::clearSelectedImage,
                        onImageRetryClick = chatViewModel::retryImageSearch,
                        onCartClick = openCart,
                        onKeyboardAvatarVisibilityChange = { visible ->
                            homeKeyboardAvatarVisible = visible
                        },
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
                        onImagePickClick = pickImage,
                        onImageRemoveClick = chatViewModel::clearSelectedImage,
                        onImageRetryClick = chatViewModel::retryImageSearch,
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
                        productAddCartStates = cartUiState.productAddCartStates,
                        onComparisonClick = { comparisonId ->
                            currentScreen = ShopMateScreen.ProductComparison(comparisonId)
                        },
                        onCheckoutViewClick = { draftId ->
                            chatViewModel.openActiveCheckoutDraft(draftId)
                        },
                        onCheckoutCancelClick = {
                            chatViewModel.cancelActiveCheckout()
                        },
                        onCheckoutSubmitClick = {
                            chatViewModel.confirmActiveCheckout()
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
                            ProductComparisonUnavailableScreen(
                                onBackClick = {
                                    currentScreen = ShopMateScreen.ChatRecommendation
                                },
                                onCartClick = openCart,
                            )
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
                                },
                                productAddCartStates = cartUiState.productAddCartStates,
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
                        val productInCart = cartUiState.items.any { item ->
                            item.product.id == productId && item.quantity > 0
                        }

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
                                buyNowProduct(productId)
                            },
                            productAddCartState = cartUiState.productAddCartStates[productId]
                                ?: ProductAddCartState.Idle,
                            productBuyNowState = cartUiState.productBuyNowStates[productId]
                                ?: ProductAddCartState.Idle,
                            isProductInCart = productInCart,
                        )
                    }

                    is ShopMateScreen.Cart -> {
                        val cartScreen = currentScreen as ShopMateScreen.Cart

                        CartScreen(
                            state = cartUiState,
                            onBackClick = {
                                currentScreen = restoreCartPrevious(cartScreen.previousScreen)
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
                            onProductClick = { item ->
                                currentScreen = ShopMateScreen.ProductDetail(
                                    productId = item.product.id,
                                    previousScreen = cartScreen,
                                )
                            },
                            onToggleAll = cartViewModel::selectAll
                        )
                    }

                    is ShopMateScreen.Checkout -> {
                        val checkoutScreen = currentScreen as ShopMateScreen.Checkout
                        val draft = checkoutScreen.draftId
                            ?.let { draftId ->
                                chatUiState.activeCheckoutDraft?.draft?.takeIf { draft ->
                                    draft.id == draftId
                                } ?: cartUiState.checkoutDraft?.takeIf { draft ->
                                    draft.id == draftId
                                }
                            }
                            ?: cartUiState.checkoutDraft
                        val openedFromChat = checkoutScreen.draftId != null &&
                            chatUiState.activeCheckoutDraft?.draft?.id == checkoutScreen.draftId
                        val openedFromProductDetail =
                            checkoutScreen.previousScreen is ShopMateScreen.ProductDetail

                        if (draft == null) {
                            CheckoutScreen(
                                state = CheckoutUiState(
                                    errorMessage = "待确认订单不可用，请返回购物车重新结算。"
                                ),
                                onBackClick = {
                                    currentScreen = checkoutScreen.previousScreen
                                },
                                onRecipientChange = {},
                                onPhoneChange = {},
                                onAddressChange = {},
                                onAddressEditClick = {},
                                onAddressBookClick = {},
                                onAddressPanelBack = {},
                                onAddressAddClick = {},
                                onSavedAddressClick = {},
                                onSavedAddressEditClick = {},
                                onAddressFormRecipientChange = {},
                                onAddressFormPhoneChange = {},
                                onAddressFormFullAddressChange = {},
                                onAddressFormRegionChange = {},
                                onAddressTagClick = {},
                                onAddressSaveClick = {},
                                onDeliveryMethodClick = {},
                                onPaymentMethodClick = {},
                                onSubmitClick = {},
                                onReturnToCart = {
                                    currentScreen = ShopMateScreen.Cart(
                                        previousScreen = checkoutScreen.previousScreen
                                    )
                                },
                                onReturnToChat = {
                                    currentScreen = ShopMateScreen.ChatRecommendation
                                },
                            )
                        } else {
                            val checkoutViewModel: CheckoutViewModel = viewModel(
                                key = "checkout-${draft.id}",
                                factory = appContainer.checkoutViewModelFactory(draft)
                            )
                            val checkoutState by checkoutViewModel.uiState.collectAsState()
                            val orderResult = checkoutState.orderResult

                            LaunchedEffect(orderResult?.orderId) {
                                if (orderResult != null) {
                                    cartViewModel.refresh()
                                    if (openedFromChat) {
                                        chatViewModel.markCheckoutDraftSubmittedFromCheckout(
                                            draftId = draft.id,
                                            orderNumber = orderResult.orderNumber,
                                        )
                                    }
                                }
                            }

                            CheckoutScreen(
                                state = checkoutState,
                                onBackClick = {
                                    if (!checkoutState.isSubmitting) {
                                        if (!openedFromChat) {
                                            cartViewModel.dismissCheckout()
                                            currentScreen = if (openedFromProductDetail) {
                                                checkoutScreen.previousScreen
                                            } else {
                                                ShopMateScreen.Cart(
                                                    previousScreen = checkoutScreen.previousScreen
                                                )
                                            }
                                        } else {
                                            currentScreen = checkoutScreen.previousScreen
                                        }
                                    }
                                },
                                onRecipientChange = checkoutViewModel::onRecipientChange,
                                onPhoneChange = checkoutViewModel::onPhoneChange,
                                onAddressChange = checkoutViewModel::onAddressChange,
                                onAddressEditClick = checkoutViewModel::openAddressEditor,
                                onAddressBookClick = checkoutViewModel::openAddressBook,
                                onAddressPanelBack = checkoutViewModel::closeAddressPanel,
                                onAddressAddClick = checkoutViewModel::addAddress,
                                onSavedAddressClick = checkoutViewModel::selectSavedAddress,
                                onSavedAddressEditClick = checkoutViewModel::editAddress,
                                onAddressFormRecipientChange =
                                    checkoutViewModel::onAddressFormRecipientChange,
                                onAddressFormPhoneChange =
                                    checkoutViewModel::onAddressFormPhoneChange,
                                onAddressFormFullAddressChange =
                                    checkoutViewModel::onAddressFormFullAddressChange,
                                onAddressFormRegionChange =
                                    checkoutViewModel::onAddressFormRegionChange,
                                onAddressTagClick = checkoutViewModel::selectAddressTag,
                                onAddressSaveClick = checkoutViewModel::saveAddressForm,
                                onDeliveryMethodClick = checkoutViewModel::selectDeliveryMethod,
                                onPaymentMethodClick = checkoutViewModel::selectPaymentMethod,
                                onSubmitClick = checkoutViewModel::submitOrder,
                                onReturnToCart = {
                                    if (!openedFromChat) {
                                        cartViewModel.clearCheckoutDraftAfterOrder()
                                    }
                                    currentScreen = ShopMateScreen.Cart(
                                        previousScreen = checkoutScreen.previousScreen
                                    )
                                },
                                onReturnToChat = {
                                    if (!openedFromChat) {
                                        cartViewModel.clearCheckoutDraftAfterOrder()
                                    }
                                    currentScreen = checkoutScreen.previousScreen
                                },
                            )
                        }
                    }
                    }

                    ShopMateBuddyTransitionOverlay(
                        request = buddyTransitionRequest,
                        onFinished = { request ->
                            buddyTransitionController.consume(request)
                            if (buddyTransitionRequest == request) {
                                buddyTransitionRequest = null
                            }
                        },
                        modifier = Modifier.fillMaxSize(),
                    )

                    cartOperationBanner?.let { message ->
                        ShopMateOperationBanner(
                            text = message.text,
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .padding(bottom = 86.dp)
                                .navigationBarsPadding()
                                .zIndex(5f),
                        )
                    }
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
    data class Checkout(
        val previousScreen: ShopMateScreen,
        val draftId: String? = null,
    ) : ShopMateScreen()
}

private const val CART_OPERATION_BANNER_DURATION_MS = 1700L

private val ShopMateScreenSaver: Saver<ShopMateScreen, List<String>> = Saver(
    save = { screen -> screen.toRouteParts() },
    restore = { parts -> restoreScreenFromRouteParts(parts) }
)

private fun restoreCartPrevious(previousScreen: ShopMateScreen): ShopMateScreen =
    when (previousScreen) {
        ShopMateScreen.Onboarding -> ShopMateScreen.HomeChatEntry
        is ShopMateScreen.Cart -> ShopMateScreen.HomeChatEntry
        is ShopMateScreen.Checkout -> ShopMateScreen.HomeChatEntry
        else -> previousScreen
    }

private fun restoreProductDetailPrevious(previousScreen: ShopMateScreen): ShopMateScreen =
    when (previousScreen) {
        ShopMateScreen.Onboarding -> ShopMateScreen.HomeChatEntry
        is ShopMateScreen.Cart -> previousScreen
        is ShopMateScreen.Checkout -> ShopMateScreen.ChatRecommendation
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
        is ShopMateScreen.Checkout -> listOf("checkout", draftId.orEmpty()) +
            previousScreen.toRouteParts().take(2)
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
        "checkout" -> ShopMateScreen.Checkout(
            draftId = parts.getOrNull(1)?.takeIf { value -> value.isNotBlank() },
            previousScreen = restoreScreenFromRouteParts(parts.drop(2))
                .let(::restoreCartPrevious)
        )
        else -> ShopMateScreen.Onboarding
    }

private fun imageAttachmentSizeBytes(
    contentResolver: ContentResolver,
    uri: Uri,
): Long? =
    contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (sizeIndex >= 0 && cursor.moveToFirst() && !cursor.isNull(sizeIndex)) {
            cursor.getLong(sizeIndex).takeIf { size -> size > 0 }
        } else {
            null
        }
    }

private fun MainActivity.createCameraImageUri(): Uri {
    val imageDirectory = File(cacheDir, CAMERA_IMAGE_CACHE_DIR).apply {
        mkdirs()
    }
    val imageFile = File.createTempFile("shopmate-image-search-", ".jpg", imageDirectory)

    return FileProvider.getUriForFile(
        this,
        "${BuildConfig.APPLICATION_ID}.fileprovider",
        imageFile,
    )
}

private fun MainActivity.showImageSourceDialog(
    onCamera: () -> Unit,
    onGallery: () -> Unit,
) {
    AlertDialog.Builder(this)
        .setItems(arrayOf("拍照找货", "从相册选择")) { dialog, selectedIndex ->
            when (selectedIndex) {
                0 -> onCamera()
                else -> onGallery()
            }
            dialog.dismiss()
        }
        .show()
}

private fun ChatSideEffect.ShowMockOrderResult.toToastText(): String {
    val orderText = orderNumber?.takeIf { value -> value.isNotBlank() }
        ?.toDisplayCheckoutOrderNumber()
        ?.let { value -> "订单 $value" }
        ?: "订单"
    val totalText = totalCents?.takeIf { value -> value >= 0 }
        ?.let { value -> "，合计 ${value.toPriceText()}" }
        .orEmpty()

    return "$orderText 已生成$totalText"
}

private fun String.toDisplayCheckoutOrderNumber(): String =
    if (startsWith("MOCK-", ignoreCase = true)) {
        substringAfterLast("-").takeIf { value -> value.isNotBlank() } ?: this
    } else {
        this
    }

private fun Int.toPriceText(): String {
    val whole = this / 100
    val cents = this % 100

    return if (cents == 0) {
        "¥$whole"
    } else {
        "¥$whole.${cents.toString().padStart(2, '0')}"
    }
}

private const val CAMERA_IMAGE_CACHE_DIR = "image-search-camera"
