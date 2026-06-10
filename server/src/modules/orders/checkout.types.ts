export type CheckoutIntentAction =
  | "start_checkout"
  | "confirm_checkout"
  | "update_checkout"
  | "update_address"
  | "cancel_checkout"
  | "summarize_checkout"
  | "unknown";

export type CheckoutIntentConfidence = "high" | "medium" | "low";

export type CheckoutActionType = Exclude<CheckoutIntentAction, "unknown">;
export type CheckoutTargetScope =
  | "selected_cart_items"
  | "recent_recommendation";

export type CheckoutActionStatus =
  | "draft_created"
  | "needs_confirmation"
  | "address_updated"
  | "draft_updated"
  | "order_created"
  | "cancelled"
  | "empty_cart"
  | "expired"
  | "failed";

export interface MockShippingAddress {
  id?: string;
  label: string;
  recipient: string;
  phoneMasked: string;
  fullAddress: string;
  region?: string;
  tag?: string;
  isDefault?: boolean;
}

export interface CheckoutSummary {
  itemCount: number;
  selectedCount: number;
  subtotalCents: number;
  shippingFeeCents: number;
  totalCents: number;
  currency: "CNY";
}

export interface PendingCheckoutItem {
  cartItemId: string;
  productId: string;
  productName: string;
  brand: string;
  category: string;
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
  imagePath: string | null;
}

export type PendingCheckoutSource = "cart" | "buy_now";

export interface CheckoutDeliveryOption {
  type: string;
  label: string;
  feeCents: number;
  etaText: string;
}

export interface CheckoutPaymentOption {
  type: string;
  label: string;
}

export interface CheckoutShippingInput {
  recipient: string;
  phone: string;
  fullAddress: string;
}

export interface CheckoutShippingPatchInput {
  recipient?: string;
  phone?: string;
  fullAddress?: string;
  savedAddressId?: string;
}

export interface CheckoutPatchInput {
  shipping?: CheckoutShippingPatchInput;
  deliveryMethodType?: string;
  paymentMethodType?: string;
}

export type CheckoutChangedField =
  | "shipping"
  | "delivery_method"
  | "payment_method"
  | "summary";

export interface CheckoutDeliverySnapshot {
  type: string;
  label: string;
  feeCents: number;
}

export interface CheckoutPaymentSnapshot {
  type: string;
  label: string;
  status: "not_charged";
}

export interface PendingCheckoutDraft {
  id: string;
  conversationId: string;
  userKey: string;
  source: PendingCheckoutSource;
  status: "pending";
  address: MockShippingAddress;
  savedAddresses?: MockShippingAddress[];
  items: PendingCheckoutItem[];
  summary: CheckoutSummary;
  selectedDeliveryMethod: CheckoutDeliverySnapshot;
  selectedPaymentMethod: CheckoutPaymentSnapshot;
  deliveryOptions: CheckoutDeliveryOption[];
  paymentOptions: CheckoutPaymentOption[];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutDraftSnapshot {
  id: string;
  source: PendingCheckoutSource;
  status: "pending";
  address: MockShippingAddress;
  savedAddresses?: MockShippingAddress[];
  items: PendingCheckoutItem[];
  summary: CheckoutSummary;
  selectedDeliveryMethod: CheckoutDeliverySnapshot;
  selectedPaymentMethod: CheckoutPaymentSnapshot;
  deliveryOptions: CheckoutDeliveryOption[];
  paymentOptions: CheckoutPaymentOption[];
  expiresAt: string;
}

export type CheckoutIntentDetection =
  | { isCheckoutIntent: false }
  | {
      isCheckoutIntent: true;
      action: CheckoutIntentAction;
      addressText?: string;
      checkoutPatch?: CheckoutPatchInput;
      targetScope: CheckoutTargetScope;
      targetOrdinal?: number;
      confidence: CheckoutIntentConfidence;
      needsConfirmation: boolean;
      clarificationQuestion?: string;
    };

export interface CheckoutActionResult {
  type: CheckoutActionType;
  status: CheckoutActionStatus;
  draftId?: string;
  orderId?: string;
  orderNumber?: string;
  selectedCount?: number;
  totalCents?: number;
  address?: MockShippingAddress;
  cartRefreshRequired?: boolean;
  draft?: CheckoutDraftSnapshot;
  changedFields?: CheckoutChangedField[];
}
