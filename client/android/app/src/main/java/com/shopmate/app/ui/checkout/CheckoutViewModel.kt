package com.shopmate.app.ui.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shopmate.app.data.orders.OrderOperationError
import com.shopmate.app.data.orders.OrderRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CheckoutViewModel(
    draft: CheckoutDraftUi,
    private val orderRepository: OrderRepository,
) : ViewModel() {
    private var nextLocalAddressIndex = 1
    private val _uiState = MutableStateFlow(draft.toInitialState())
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    fun onRecipientChange(value: String) {
        _uiState.update { state ->
            state.copy(
                editableShipping = state.editableShipping.copy(recipient = value),
                fieldErrors = state.fieldErrors.copy(recipient = null),
                errorMessage = null,
            )
        }
    }

    fun onPhoneChange(value: String) {
        _uiState.update { state ->
            state.copy(
                editableShipping = state.editableShipping.copy(phone = value.filter(Char::isDigit)),
                fieldErrors = state.fieldErrors.copy(phone = null),
                errorMessage = null,
            )
        }
    }

    fun onAddressChange(value: String) {
        _uiState.update { state ->
            state.copy(
                editableShipping = state.editableShipping.copy(fullAddress = value),
                fieldErrors = state.fieldErrors.copy(fullAddress = null),
                errorMessage = null,
            )
        }
    }

    fun openAddressEditor() {
        _uiState.update { state ->
            val address = state.selectedAddress
            state.copy(
                addressMode = CheckoutAddressModeUi.Edit,
                addressForm = (address?.toAddressForm() ?: state.editableShipping.toAddressForm()),
                editingAddressId = address?.id,
                fieldErrors = CheckoutFieldErrorsUi(),
                errorMessage = null,
            )
        }
    }

    fun openAddressBook() {
        _uiState.update { state ->
            state.copy(
                addressMode = CheckoutAddressModeUi.Book,
                fieldErrors = CheckoutFieldErrorsUi(),
                errorMessage = null,
            )
        }
    }

    fun closeAddressPanel() {
        _uiState.update { state ->
            state.copy(
                addressMode = CheckoutAddressModeUi.Summary,
                fieldErrors = CheckoutFieldErrorsUi(),
                errorMessage = null,
            )
        }
    }

    fun addAddress() {
        _uiState.update { state ->
            state.copy(
                addressMode = CheckoutAddressModeUi.Edit,
                addressForm = CheckoutAddressFormUi(),
                editingAddressId = null,
                fieldErrors = CheckoutFieldErrorsUi(),
                errorMessage = null,
            )
        }
    }

    fun editAddress(addressId: String) {
        _uiState.update { state ->
            val address = state.savedAddresses.firstOrNull { candidate -> candidate.id == addressId }
                ?: return@update state

            state.copy(
                addressMode = CheckoutAddressModeUi.Edit,
                addressForm = address.toAddressForm(),
                editingAddressId = address.id,
                fieldErrors = CheckoutFieldErrorsUi(),
                errorMessage = null,
            )
        }
    }

    fun selectSavedAddress(addressId: String) {
        _uiState.update { state ->
            val address = state.savedAddresses.firstOrNull { candidate -> candidate.id == addressId }
                ?: return@update state

            state.copy(
                editableShipping = address.toShippingInput(),
                selectedAddressId = address.id,
                addressMode = CheckoutAddressModeUi.Summary,
                fieldErrors = CheckoutFieldErrorsUi(),
                errorMessage = null,
            )
        }
    }

    fun onAddressFormRecipientChange(value: String) {
        _uiState.update { state ->
            state.copy(
                addressForm = state.addressForm.copy(recipient = value),
                fieldErrors = state.fieldErrors.copy(recipient = null),
                errorMessage = null,
            )
        }
    }

    fun onAddressFormPhoneChange(value: String) {
        _uiState.update { state ->
            state.copy(
                addressForm = state.addressForm.copy(phone = value.filter(Char::isDigit)),
                fieldErrors = state.fieldErrors.copy(phone = null),
                errorMessage = null,
            )
        }
    }

    fun onAddressFormFullAddressChange(value: String) {
        _uiState.update { state ->
            state.copy(
                addressForm = state.addressForm.copy(fullAddress = value),
                fieldErrors = state.fieldErrors.copy(fullAddress = null),
                errorMessage = null,
            )
        }
    }

    fun onAddressFormRegionChange(value: String) {
        _uiState.update { state ->
            state.copy(addressForm = state.addressForm.copy(region = value))
        }
    }

    fun selectAddressTag(tag: String) {
        _uiState.update { state ->
            state.copy(addressForm = state.addressForm.copy(tag = tag))
        }
    }

    fun saveAddressForm() {
        val state = _uiState.value
        val validation = validateAddressForm(state.addressForm)

        if (validation.hasErrors()) {
            _uiState.update { current ->
                current.copy(fieldErrors = validation, errorMessage = null)
            }
            return
        }

        val savedAddress = state.addressForm.trimmed().toSavedAddress(
            id = state.editingAddressId ?: nextAddressId(),
            isDefault = state.savedAddresses.isEmpty(),
        )

        _uiState.update { current ->
            val updatedAddresses = current.savedAddresses.upsert(savedAddress)

            current.copy(
                editableShipping = savedAddress.toShippingInput(),
                savedAddresses = updatedAddresses,
                selectedAddressId = savedAddress.id,
                addressForm = savedAddress.toAddressForm(),
                editingAddressId = savedAddress.id,
                addressMode = CheckoutAddressModeUi.Summary,
                fieldErrors = CheckoutFieldErrorsUi(),
                errorMessage = null,
            )
        }
    }

    fun selectDeliveryMethod(type: String) {
        _uiState.update { state ->
            state.copy(
                selectedDeliveryMethodType = type,
                fieldErrors = state.fieldErrors.copy(deliveryMethod = null),
                errorMessage = null,
            )
        }
    }

    fun selectPaymentMethod(type: String) {
        _uiState.update { state ->
            state.copy(
                selectedPaymentMethodType = type,
                fieldErrors = state.fieldErrors.copy(paymentMethod = null),
                errorMessage = null,
            )
        }
    }

    fun submitOrder() {
        val state = _uiState.value
        val draft = state.draft ?: return

        if (state.isSubmitting || state.orderResult != null) {
            return
        }

        val validation = validateCheckoutState(state)
        if (validation.hasErrors()) {
            _uiState.update { current ->
                current.copy(fieldErrors = validation, errorMessage = null)
            }
            return
        }

        val deliveryMethodType = state.selectedDeliveryMethodType ?: return
        val paymentMethodType = state.selectedPaymentMethodType ?: return

        _uiState.update { current ->
            current.copy(
                isSubmitting = true,
                errorMessage = null,
                fieldErrors = CheckoutFieldErrorsUi(),
            )
        }

        viewModelScope.launch {
            orderRepository.confirmMockCheckout(
                conversationId = draft.conversationId,
                draftId = draft.id,
                shipping = state.editableShipping.trimmed(),
                deliveryMethodType = deliveryMethodType,
                paymentMethodType = paymentMethodType,
            ).fold(
                onSuccess = { result ->
                    _uiState.update { current ->
                        current.copy(
                            isSubmitting = false,
                            errorMessage = null,
                            orderResult = result,
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            isSubmitting = false,
                            errorMessage = error.toCheckoutDisplayMessage(),
                        )
                    }
                },
            )
        }
    }

    private fun nextAddressId(): String {
        val id = "local-address-${nextLocalAddressIndex}"
        nextLocalAddressIndex += 1
        return id
    }
}

private fun CheckoutDraftUi.toInitialState(): CheckoutUiState =
    createInitialSavedAddresses(this).let { savedAddresses ->
        val selectedAddress = savedAddresses.firstOrNull()
        CheckoutUiState(
            draft = this,
            editableShipping = selectedAddress?.toShippingInput() ?: CheckoutShippingInputUi(
                recipient = address.recipient,
                phone = "",
                fullAddress = address.fullAddress,
            ),
            savedAddresses = savedAddresses,
            selectedAddressId = selectedAddress?.id,
            addressForm = selectedAddress?.toAddressForm() ?: CheckoutAddressFormUi(
                recipient = address.recipient,
                fullAddress = address.fullAddress,
            ),
            selectedDeliveryMethodType = selectedDeliveryMethodType
                ?: deliveryOptions.firstOrNull()?.type,
            selectedPaymentMethodType = selectedPaymentMethodType
                ?: paymentOptions.firstOrNull()?.type,
        )
    }

private fun validateCheckoutState(state: CheckoutUiState): CheckoutFieldErrorsUi {
    val shipping = state.editableShipping

    return CheckoutFieldErrorsUi(
        recipient = if (shipping.recipient.trim().isBlank()) {
            "请输入联系人"
        } else {
            null
        },
        phone = if (!PHONE_PATTERN.matches(shipping.phone.trim())) {
            "请输入完整手机号"
        } else {
            null
        },
        fullAddress = if (shipping.fullAddress.trim().isBlank()) {
            "请输入详细地址"
        } else {
            null
        },
        deliveryMethod = if (state.selectedDeliveryMethod == null) {
            "请选择配送方式"
        } else {
            null
        },
        paymentMethod = if (state.selectedPaymentMethod == null) {
            "请选择支付方式"
        } else {
            null
        },
    )
}

private fun validateAddressForm(form: CheckoutAddressFormUi): CheckoutFieldErrorsUi =
    CheckoutFieldErrorsUi(
        recipient = if (form.recipient.trim().isBlank()) {
            "请输入收货人名字"
        } else {
            null
        },
        phone = if (!PHONE_PATTERN.matches(form.phone.trim())) {
            "请输入完整手机号"
        } else {
            null
        },
        fullAddress = if (form.fullAddress.trim().isBlank()) {
            "请输入详细地址"
        } else {
            null
        },
    )

private fun CheckoutFieldErrorsUi.hasErrors(): Boolean =
    recipient != null ||
        phone != null ||
        fullAddress != null ||
        deliveryMethod != null ||
        paymentMethod != null

private fun CheckoutShippingInputUi.trimmed(): CheckoutShippingInputUi =
    copy(
        recipient = recipient.trim(),
        phone = phone.trim(),
        fullAddress = fullAddress.trim(),
    )

private fun CheckoutAddressFormUi.trimmed(): CheckoutAddressFormUi =
    copy(
        recipient = recipient.trim(),
        phone = phone.trim(),
        fullAddress = fullAddress.trim(),
        region = region.trim().ifBlank { CHECKOUT_DEMO_REGION },
        tag = tag.trim().ifBlank { "自定义" },
    )

val CheckoutUiState.selectedAddress: CheckoutSavedAddressUi?
    get() = savedAddresses.firstOrNull { address -> address.id == selectedAddressId }

private fun CheckoutShippingInputUi.toAddressForm(): CheckoutAddressFormUi =
    CheckoutAddressFormUi(
        recipient = recipient,
        phone = phone,
        fullAddress = fullAddress,
        region = CHECKOUT_DEMO_REGION,
        tag = "公司",
    )

private fun CheckoutSavedAddressUi.toAddressForm(): CheckoutAddressFormUi =
    CheckoutAddressFormUi(
        recipient = recipient,
        phone = phone,
        fullAddress = fullAddress,
        region = region,
        tag = tag,
    )

private fun CheckoutSavedAddressUi.toShippingInput(): CheckoutShippingInputUi =
    CheckoutShippingInputUi(
        recipient = recipient,
        phone = phone,
        fullAddress = combineAddressParts(region, fullAddress),
    )

private fun CheckoutAddressFormUi.toSavedAddress(
    id: String,
    isDefault: Boolean,
): CheckoutSavedAddressUi =
    CheckoutSavedAddressUi(
        id = id,
        recipient = recipient,
        phone = phone,
        phoneMasked = maskPhone(phone),
        fullAddress = fullAddress,
        region = region,
        tag = tag,
        isDefault = isDefault,
    )

private fun List<CheckoutSavedAddressUi>.upsert(
    address: CheckoutSavedAddressUi,
): List<CheckoutSavedAddressUi> {
    val existingIndex = indexOfFirst { candidate -> candidate.id == address.id }

    return if (existingIndex >= 0) {
        map { candidate ->
            if (candidate.id == address.id) {
                address.copy(isDefault = candidate.isDefault)
            } else {
                candidate
            }
        }
    } else {
        this + address
    }
}

private fun createInitialSavedAddresses(draft: CheckoutDraftUi): List<CheckoutSavedAddressUi> =
    listOf(
        CheckoutSavedAddressUi(
            id = "draft-address",
            recipient = draft.address.recipient,
            phone = "",
            phoneMasked = draft.address.phoneMasked,
            fullAddress = draft.address.fullAddress,
            region = CHECKOUT_DEMO_REGION,
            tag = "默认",
            isDefault = true,
        ),
    )

private fun combineAddressParts(region: String, fullAddress: String): String {
    val normalizedRegion = region.trim()
    val normalizedAddress = fullAddress.trim()

    return when {
        normalizedRegion.isBlank() -> normalizedAddress
        normalizedAddress.isBlank() -> normalizedRegion
        normalizedAddress.startsWith(normalizedRegion) -> normalizedAddress
        else -> "$normalizedRegion $normalizedAddress"
    }
}

private fun maskPhone(phone: String): String =
    if (phone.length > 7) {
        "${phone.take(3)}****${phone.takeLast(4)}"
    } else {
        phone
    }

private fun Throwable.toCheckoutDisplayMessage(): String =
    when (this) {
        OrderOperationError.EmptyCart -> "购物车没有可结算商品。"
        OrderOperationError.Expired -> "订单确认信息已过期，请返回购物车重新结算。"
        OrderOperationError.CartChanged -> "购物车商品已变化，请返回购物车刷新后再试。"
        OrderOperationError.ProductUnavailable -> "部分商品当前不可结算。"
        OrderOperationError.InvalidRequest -> "订单信息不完整，请检查后重试。"
        OrderOperationError.ParseFailure -> "订单数据格式异常。"
        is OrderOperationError.NetworkFailure -> "无法连接订单服务，请确认后端正在运行。"
        else -> "暂时无法提交订单。"
    }

private val PHONE_PATTERN = Regex("^[0-9]{7,15}$")
