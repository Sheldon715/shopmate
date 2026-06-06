export type CheckoutIntentAction =
  | "start_checkout"
  | "confirm_checkout"
  | "update_address"
  | "cancel_checkout"
  | "summarize_checkout"
  | "unknown";

export type CheckoutIntentConfidence = "high" | "medium" | "low";

export type CheckoutActionType = Exclude<CheckoutIntentAction, "unknown">;

export type CheckoutActionStatus =
  | "draft_created"
  | "needs_confirmation"
  | "address_updated"
  | "order_created"
  | "cancelled"
  | "empty_cart"
  | "expired"
  | "failed";

export interface MockShippingAddress {
  label: string;
  recipient: string;
  phoneMasked: string;
  fullAddress: string;
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

export interface PendingCheckoutDraft {
  id: string;
  conversationId: string;
  userKey: string;
  status: "pending";
  address: MockShippingAddress;
  items: PendingCheckoutItem[];
  summary: CheckoutSummary;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export type CheckoutIntentDetection =
  | { isCheckoutIntent: false }
  | {
      isCheckoutIntent: true;
      action: CheckoutIntentAction;
      addressText?: string;
      targetScope: "selected_cart_items";
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
}
