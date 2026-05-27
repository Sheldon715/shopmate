import type {
  Product,
  ProductCardDto,
} from "../products/product.types";
import type {
  VectorSearchFilters,
  VectorSearchHitMetadata,
} from "../vector/vector-search.types";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RagChatRequest {
  question: string;
  shortHistory?: ChatHistoryMessage[];
  filters?: VectorSearchFilters;
  topK?: number;
  maxRecommendedProducts?: number;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface RetrievedProductContext {
  product: Product;
  score: number;
  snippets: string[];
  metadata: VectorSearchHitMetadata;
}

export type RagChatFallbackReason =
  | "NO_CANDIDATES"
  | "LLM_ERROR"
  | "LLM_INVALID_OUTPUT"
  | "NO_VALID_PRODUCT_IDS";

export interface RagChatResult {
  answer: string;
  recommendedProductIds: string[];
  productCards: ProductCardDto[];
  fallbackUsed: boolean;
  fallbackReason?: RagChatFallbackReason;
  retrieval: {
    candidateCount: number;
    returnedProductIds: string[];
  };
}
