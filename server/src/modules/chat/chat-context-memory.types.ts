export interface ChatContextMemory {
  conversationId: string;
  lastIntent?: string;
  constraints: ChatContextConstraints;
  lastRecommendedProductIds: string[];
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
}
