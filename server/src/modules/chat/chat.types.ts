import type {
  Product,
  ProductCardDto,
} from "../products/product.types";
import type {
  VectorSearchFilters,
  VectorSearchHitMetadata,
} from "../vector/vector-search.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export type ChatStreamEventName =
  | "message_delta"
  | "product_cards"
  | "done"
  | "error";

export interface ChatMessageDeltaPayload {
  text: string;
  index: number;
}

export interface ChatProductCardsPayload {
  items: ProductCardDto[];
}

export interface ChatDonePayload {
  recommendedProductIds: string[];
  fallbackUsed: boolean;
  fallbackReason?: RagChatFallbackReason | null;
  retrieval: {
    candidateCount: number;
    returnedProductIds: string[];
  };
  contextMemory?: ChatContextMemorySummary;
}

export interface ChatErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ChatStreamEventPayloadByName {
  message_delta: ChatMessageDeltaPayload;
  product_cards: ChatProductCardsPayload;
  done: ChatDonePayload;
  error: ChatErrorPayload;
}

export type ChatStreamContractEvent = {
  [EventName in ChatStreamEventName]: {
    eventName: EventName;
    payload: ChatStreamEventPayloadByName[EventName];
  };
}[ChatStreamEventName];

export interface RagChatRequest {
  conversationId?: string;
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
  contextMemory?: ChatContextMemorySummary;
}
