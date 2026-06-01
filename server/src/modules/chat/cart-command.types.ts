import type { CartDto } from "../cart/cart.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";

export type CartCommandAction =
  | "inspect"
  | "add"
  | "remove"
  | "update_quantity"
  | "update_selected"
  | "clear";

export type CartCommandConfidence = "high" | "medium" | "low";

export type CartCommandDetection =
  | { isCartCommand: false }
  | {
      isCartCommand: true;
      action: CartCommandAction;
      target: CartCommandTarget;
      quantity?: number;
      selected?: boolean;
      needsConfirmation: boolean;
      confidence: CartCommandConfidence;
      clarificationQuestion?: string;
    };

export type CartCommandTarget =
  | { kind: "deictic" }
  | { kind: "ordinal"; index: number }
  | { kind: "cart_ordinal"; index: number }
  | { kind: "recent_recommendation_ordinal"; index: number }
  | { kind: "name"; text: string }
  | { kind: "all" }
  | { kind: "unknown" };

export type CartCommandTargetInput = CartCommandTarget;

export type CartCommandFallbackReason =
  | "CART_TARGET_MISSING"
  | "CART_TARGET_AMBIGUOUS"
  | "CART_CONFIRMATION_REQUIRED"
  | "CART_INTENT_UNCLEAR"
  | "CART_SNAPSHOT_UNAVAILABLE"
  | "CART_ADD_FAILED"
  | "CART_ACTION_FAILED";

export type CartActionType =
  | "inspect"
  | "add"
  | "remove"
  | "update_quantity"
  | "update_selected"
  | "clear";

export type CartActionStatus =
  | "success"
  | "needs_target"
  | "needs_confirmation"
  | "not_found"
  | "unavailable"
  | "failed";

export interface CartActionResult {
  type: CartActionType;
  status: CartActionStatus;
  itemId?: string;
  productId?: string;
  productName?: string;
  quantity?: number;
  selected?: boolean;
  cartSummary?: CartDto["summary"];
  message?: string;
}

export interface CartCommandDetectInput {
  question: string;
  contextMemory?: ChatContextMemorySummary;
  cartSnapshot?: CartDto;
}
