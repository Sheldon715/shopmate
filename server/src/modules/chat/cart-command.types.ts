import type { ChatContextMemorySummary } from "./chat-context-memory.types";

export type CartCommandDetection =
  | { isCartCommand: false }
  | {
      isCartCommand: true;
      quantity: number;
      target: CartCommandTarget;
    };

export type CartCommandTarget =
  | { kind: "deictic" }
  | { kind: "ordinal"; index: number }
  | { kind: "name"; text: string }
  | { kind: "unknown" };

export type CartCommandTargetInput = CartCommandTarget;

export type CartCommandFallbackReason =
  | "CART_TARGET_MISSING"
  | "CART_TARGET_AMBIGUOUS"
  | "CART_ADD_FAILED";

export type CartActionStatus =
  | "success"
  | "needs_target"
  | "not_found"
  | "unavailable"
  | "failed";

export interface CartActionResult {
  type: "add";
  status: CartActionStatus;
  productId?: string;
  productName?: string;
  quantity?: number;
  message: string;
}

export interface CartCommandDetectInput {
  question: string;
  contextMemory?: ChatContextMemorySummary;
}
