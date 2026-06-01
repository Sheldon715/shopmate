import type { PendingClarification } from "./clarification.types";
import type { NegativeConstraint } from "./negative-constraint.types";

export interface ChatContextMemory {
  conversationId: string;
  lastIntent?: string;
  constraints: ChatContextConstraints;
  negativeConstraints?: NegativeConstraint[];
  lastRecommendedProductIds: string[];
  pendingClarification?: PendingClarification;
  updatedAt: string;
  turnCount: number;
}

export interface ChatContextConstraints {
  category?: string;
  subCategory?: string;
  brand?: string;
  maxPriceCents?: number;
  minPriceCents?: number;
  preferenceTerms: string[];
  avoidTerms: string[];
}

export interface ChatContextMemorySummary {
  conversationId: string;
  lastIntent?: string;
  constraints: ChatContextConstraints;
  lastRecommendedProductIds: string[];
  pendingClarification?: PendingClarification;
}
