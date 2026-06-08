package com.shopmate.app

import android.Manifest
import android.content.ContentResolver
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.content.pm.PackageManager
import android.view.View
import android.view.WindowInsets
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.zIndex
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewModelScope
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
import com.shopmate.app.ui.components.ShopMateEnterMotion
import com.shopmate.app.ui.components.ShopMateOperationBanner
import com.shopmate.app.ui.components.shopMatePressable
import com.shopmate.app.ui.comparison.ProductComparisonScreen
import com.shopmate.app.ui.comparison.ProductComparisonUnavailableScreen
import com.shopmate.app.ui.home.HomeChatEntryScreen
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.ProductAddCartState
import com.shopmate.app.ui.onboarding.OnboardingScreen
import com.shopmate.app.ui.product.ProductDetailScreen
import com.shopmate.app.ui.product.ProductDetailViewModel
import com.shopmate.app.ui.theme.ShopMateGreen
import com.shopmate.app.ui.theme.ShopMateLightGreen
import com.shopmate.app.ui.theme.ShopMatePillShape
import com.shopmate.app.ui.theme.ShopMateTextPrimary
import com.shopmate.app.ui.theme.ShopMateTextSecondary
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

        window.statusBarColor = AndroidColor.WHITE
        window.navigationBarColor = AndroidColor.WHITE
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
                var transientMessageSequence by remember { mutableStateOf(0L) }
                var transientMessage by remember {
                    mutableStateOf<ShopMateTransientMessage?>(null)
                }
                var showImageSourceDialog by remember { mutableStateOf(false) }
                var homeKeyboardAvatarVisible by remember { mutableStateOf(false) }
                fun showTransientMessage(text: String) {
                    val normalizedText = text.trim()
                    if (normalizedText.isBlank()) {
                        return
                    }
                    transientMessageSequence += 1
                    transientMessage = ShopMateTransientMessage(
                        key = "local-$transientMessageSequence",
                        text = normalizedText,
                    )
                }
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
                        showTransientMessage("需要开启麦克风权限才能语音输入")
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
                    } else if (!captured && uri != null) {
                        showTransientMessage("已取消拍照，当前输入不会被修改")
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
                            showTransientMessage("无法启动拍照，请稍后重试")
                        }
                        .getOrNull()

                    if (uri != null) {
                        pendingCameraImageUri = uri
                        runCatching { cameraCaptureLauncher.launch(uri) }
                            .onFailure {
                                pendingCameraImageUri = null
                                showTransientMessage("无法打开相机，请从相册选择图片")
                            }
                    }
                }
                val pickImage: () -> Unit = {
                    cancelVoiceInput()
                    showImageSourceDialog = true
                }
                LaunchedEffect(chatViewModel) {
                    chatViewModel.sideEffects.collect { effect ->
                        when (effect) {
                            is ChatSideEffect.RefreshCart -> cartViewModel.refresh()
                            is ChatSideEffect.ShowMockOrderResult -> {
                                showTransientMessage(effect.toBannerText())
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
                        transientMessage = ShopMateTransientMessage(
                            key = "cart-${message.id}",
                            text = message.text,
                        )
                        delay(CART_OPERATION_BANNER_DURATION_MS)
                        if (transientMessage?.key == "cart-${message.id}") {
                            transientMessage = null
                        }
                        cartViewModel.consumeOperationMessage(message.id)
                    }
                }
                transientMessage
                    ?.takeUnless { message -> message.key.startsWith("cart-") }
                    ?.let { message ->
                    LaunchedEffect(message.key) {
                        delay(CART_OPERATION_BANNER_DURATION_MS)
                        if (transientMessage?.key == message.key) {
                            transientMessage = null
                        }
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
                        ShopMateScreen.Onboarding -> ShopMateEnterMotion(
                            modifier = Modifier.fillMaxSize()
                        ) {
                            OnboardingScreen(
                                onStartShopping = {
                                    currentScreen = ShopMateScreen.HomeChatEntry
                                }
                            )
                        }

                    ShopMateScreen.HomeChatEntry -> ShopMateEnterMotion(
                        modifier = Modifier.fillMaxSize()
                    ) {
                        HomeChatEntryScreen(
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
                    }

                    ShopMateScreen.ChatRecommendation -> ShopMateEnterMotion(
                        modifier = Modifier.fillMaxSize()
                    ) {
                        ChatRecommendationScreen(
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
                    }

                    is ShopMateScreen.ProductComparison -> {
                        val comparisonId =
                            (currentScreen as ShopMateScreen.ProductComparison).comparisonId
                        val comparison = comparisonId?.let(chatViewModel::findComparison)

                        ShopMateEnterMotion(modifier = Modifier.fillMaxSize()) {
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

                        ShopMateEnterMotion(modifier = Modifier.fillMaxSize()) {
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
                    }

                    is ShopMateScreen.Cart -> {
                        val cartScreen = currentScreen as ShopMateScreen.Cart

                        ShopMateEnterMotion(modifier = Modifier.fillMaxSize()) {
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
                            ShopMateEnterMotion(modifier = Modifier.fillMaxSize()) {
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
                            }
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

                            ShopMateEnterMotion(modifier = Modifier.fillMaxSize()) {
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

                    if (showImageSourceDialog) {
                        ShopMateImageSourceDialog(
                            onCamera = {
                                showImageSourceDialog = false
                                captureImage()
                            },
                            onGallery = {
                                showImageSourceDialog = false
                                pickImageFromGallery()
                            },
                            onDismiss = {
                                showImageSourceDialog = false
                            },
                        )
                    }

                    transientMessage?.let { message ->
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

internal sealed class ShopMateScreen {
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

private data class ShopMateTransientMessage(
    val key: String,
    val text: String,
)

private const val CART_OPERATION_BANNER_DURATION_MS = 1700L

private val ShopMateScreenSaver: Saver<ShopMateScreen, List<String>> = Saver(
    save = { screen -> screen.toRouteParts() },
    restore = { parts -> restoreScreenFromRouteParts(parts) }
)

internal fun restoreCartPrevious(previousScreen: ShopMateScreen): ShopMateScreen =
    when (previousScreen) {
        ShopMateScreen.Onboarding -> ShopMateScreen.HomeChatEntry
        is ShopMateScreen.Cart -> ShopMateScreen.HomeChatEntry
        is ShopMateScreen.Checkout -> ShopMateScreen.HomeChatEntry
        else -> previousScreen
    }

internal fun restoreProductDetailPrevious(previousScreen: ShopMateScreen): ShopMateScreen =
    when (previousScreen) {
        ShopMateScreen.Onboarding -> ShopMateScreen.HomeChatEntry
        is ShopMateScreen.Cart -> previousScreen
        is ShopMateScreen.Checkout -> ShopMateScreen.ChatRecommendation
        is ShopMateScreen.ProductDetail -> ShopMateScreen.ChatRecommendation
        else -> previousScreen
    }

internal fun ShopMateScreen.toRouteParts(): List<String> =
    when (this) {
        ShopMateScreen.Onboarding -> listOf("onboarding")
        ShopMateScreen.HomeChatEntry -> listOf("home")
        ShopMateScreen.ChatRecommendation -> listOf("chat-recommendation")
        is ShopMateScreen.ProductComparison -> listOf("comparison", comparisonId.orEmpty())
        is ShopMateScreen.ProductDetail -> listOf("product-detail", productId) +
            previousScreen.toRouteParts()
        is ShopMateScreen.Cart -> listOf("cart") + previousScreen.toRouteParts()
        is ShopMateScreen.Checkout -> listOf("checkout", draftId.orEmpty()) +
            previousScreen.toRouteParts()
    }

internal fun restoreScreenFromRouteParts(parts: List<String>): ShopMateScreen =
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

@Composable
private fun ShopMateImageSourceDialog(
    onCamera: () -> Unit,
    onGallery: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(
            modifier = Modifier
                .padding(horizontal = 24.dp)
                .fillMaxWidth()
                .shadow(
                    elevation = 24.dp,
                    shape = RoundedCornerShape(28.dp),
                    clip = false,
                )
                .clip(RoundedCornerShape(28.dp))
                .background(
                    Brush.linearGradient(
                        listOf(Color.White, Color(0xFFEAFBF4))
                    )
                )
                .border(
                    width = 0.667.dp,
                    color = ShopMateGreen.copy(alpha = 0.18f),
                    shape = RoundedCornerShape(28.dp),
                )
                .padding(horizontal = 18.dp, vertical = 18.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(
                    painter = painterResource(id = R.drawable.sidebar_shopmate_buddy),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(38.dp),
                )
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = 10.dp),
                ) {
                    Text(
                        text = "图片找货",
                        color = ShopMateTextPrimary,
                        fontSize = 20.sp,
                        lineHeight = 26.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.sp,
                    )
                    Text(
                        text = "选择拍照或相册图片，我来帮你识别好物",
                        color = ShopMateTextSecondary,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        letterSpacing = 0.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            ImageSourceOption(
                icon = R.drawable.ic_prompt_camera,
                title = "拍照找货",
                subtitle = "适合现场商品、包装和搭配灵感",
                onClick = onCamera,
            )
            Spacer(modifier = Modifier.height(10.dp))
            ImageSourceOption(
                icon = R.drawable.ic_image,
                title = "从相册选择",
                subtitle = "从已有图片中挑一张来搜索",
                onClick = onGallery,
            )
            Spacer(modifier = Modifier.height(14.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .clip(ShopMatePillShape)
                    .background(Color.White.copy(alpha = 0.72f), ShopMatePillShape)
                    .border(
                        width = 0.667.dp,
                        color = Color(0xFFDDE8E4),
                        shape = ShopMatePillShape,
                    )
                    .shopMatePressable(role = Role.Button, onClick = onDismiss),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "取消",
                    color = ShopMateTextSecondary,
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp,
                )
            }
        }
    }
}

@Composable
private fun ImageSourceOption(
    icon: Int,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(66.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Color.White.copy(alpha = 0.86f), RoundedCornerShape(18.dp))
            .border(
                width = 0.667.dp,
                color = ShopMateGreen.copy(alpha = 0.14f),
                shape = RoundedCornerShape(18.dp),
            )
            .shopMatePressable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(19.dp))
                .background(Brush.linearGradient(listOf(ShopMateLightGreen, ShopMateGreen))),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(id = icon),
                contentDescription = null,
                colorFilter = ColorFilter.tint(Color.White),
                modifier = Modifier.size(18.dp),
            )
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 12.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = title,
                color = ShopMateTextPrimary,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
            )
            Text(
                text = subtitle,
                color = ShopMateTextSecondary,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private fun ChatSideEffect.ShowMockOrderResult.toBannerText(): String {
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
