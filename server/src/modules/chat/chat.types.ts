import type {
  Product,
  ProductCardDto,
} from "../products/product.types";
import type {
  VectorSearchFilters,
  VectorSearchHitMetadata,
} from "../vector/vector-search.types";
import type { RagDebugTrace } from "./rag-debug-trace.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";
import type { CartActionResult, CartCommandFallbackReason } from "./cart-command.types";
import type { ChatTimingEntry, ChatTimingTracker } from "./chat-timing";
import type { ClarificationSlot } from "./clarification.types";
import type { CheckoutActionResult } from "../orders/checkout.types";
import type { LlmLaneMetadata } from "../llm/llm-lanes";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export type ChatStreamEventName =
  | "message_delta"
  | "product_cards"
  | "checkout_action"
  | "comparison_result"
  | "done"
  | "error";

export interface ChatMessageDeltaPayload {
  text: string;
  index: number;
}

export interface ChatProductCardsPayload {
  items: ProductCardDto[];
}

export interface ChatComparisonResultPayload {
  id: string;
  title: string;
  query: string;
  productIds: string[];
  dimensions: Array<{
    id: string;
    label: string;
    cells: Array<{
      productId: string;
      value: string;
      highlight?: boolean;
    }>;
  }>;
  recommendedProductId?: string | null;
  conclusion: string;
  highlights: Array<{
    productId: string;
    label: string;
    text: string;
  }>;
}

export type ChatCheckoutActionPayload = CheckoutActionResult;

export interface ChatImageSearchMetadata {
  mode: "vlm_first";
  confidence: "high" | "medium" | "low";
  visualQuery: string;
  detectedCategory?: string | null;
}

export interface ChatDonePayload {
  recommendedProductIds: string[];
  fallbackUsed: boolean;
  fallbackReason?: RagChatFallbackReason | null;
  clarification?: {
    missingSlots: ClarificationSlot[];
  };
  retrieval: {
    query?: string;
    baseQuery?: string;
    rewrittenQuery?: string;
    queryRewriteStatus?: "rewritten" | "not_needed" | "fallback";
    queryRewriteReason?: string;
    retrievalStrategy?: "cache" | "original_query" | "rewritten_query" | "fallback";
    queryRewriteTimedOut?: boolean;
    candidateCount: number;
    returnedProductIds: string[];
    imageSearch?: ChatImageSearchMetadata;
    llm?: LlmLaneMetadata;
    timing?: ChatTimingEntry[];
  };
  contextMemory?: ChatContextMemorySummary;
  cartAction?: CartActionResult;
  checkoutAction?: CheckoutActionResult;
}

export interface ChatErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ChatStreamEventPayloadByName {
  message_delta: ChatMessageDeltaPayload;
  product_cards: ChatProductCardsPayload;
  checkout_action: ChatCheckoutActionPayload;
  comparison_result: ChatComparisonResultPayload;
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
  recentProductIds?: string[];
  filters?: VectorSearchFilters;
  imageSearch?: ChatImageSearchMetadata;
  topK?: number;
  maxRecommendedProducts?: number;
  requestId?: string;
  abortSignal?: AbortSignal;
  timing?: ChatTimingTracker;
  debugTrace?: boolean;
}

export interface RetrievedProductContext {
  product: Product;
  score: number;
  snippets: string[];
  metadata: VectorSearchHitMetadata;
}

export type RagChatFallbackReason =
  | CartCommandFallbackReason
  | "NEEDS_CLARIFICATION"
  | "COMPARISON_TARGET_CLARIFICATION"
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
  clarification?: {
    missingSlots: ClarificationSlot[];
  };
  retrieval: {
    query?: string;
    baseQuery?: string;
    rewrittenQuery?: string;
    queryRewriteStatus?: "rewritten" | "not_needed" | "fallback";
    queryRewriteReason?: string;
    retrievalStrategy?: "cache" | "original_query" | "rewritten_query" | "fallback";
    queryRewriteTimedOut?: boolean;
    candidateCount: number;
    returnedProductIds: string[];
    imageSearch?: ChatImageSearchMetadata;
    llm?: LlmLaneMetadata;
    timing?: ChatTimingEntry[];
  };
  contextMemory?: ChatContextMemorySummary;
  cartAction?: CartActionResult;
  checkoutAction?: CheckoutActionResult;
  comparisonResult?: ChatComparisonResultPayload;
  debugTrace?: RagDebugTrace;
}

export interface ChatStreamWriter {
  writeMessageDelta(text: string): Promise<boolean>;
  writeCheckoutAction(payload: ChatCheckoutActionPayload): Promise<boolean>;
  writeProductCards(items: ProductCardDto[]): Promise<boolean>;
  writeComparisonResult(payload: ChatComparisonResultPayload): Promise<boolean>;
  writeDone(payload: ChatDonePayload): Promise<boolean>;
  isClosed(): boolean;
}
