import type { VectorSearchFilters } from "../vector/vector-search.types";
import type { RagWearingStyle } from "../vector/rag-negative-fact-metadata";

export type RagFailureType =
  | "chunking_failure"
  | "embedding_text_failure"
  | "metadata_filter_failure"
  | "vector_retrieval_failure"
  | "product_lookup_failure"
  | "negative_post_filter_failure"
  | "answer_grounding_failure"
  | "data_missing"
  | "no_failure_detected";

export type RagTraceFilters = VectorSearchFilters;

export interface RagTraceNegativeConstraint {
  rawText: string;
  term: string;
  kind: string;
  scope: string;
  matchPolicy: string;
}

export interface RagTraceVectorHit {
  rank: number;
  docId: string;
  productId: string;
  score: number;
  snippet: string;
  metadata: {
    docType: string;
    blockType: string | null;
    category: string;
    subCategory: string | null;
    brand: string;
    priceMinCents: number;
    priceMaxCents: number;
    available: boolean;
    tags: string[];
    recommendWhen: string[];
    avoidWhen: string[];
    freeFromTerms: string[];
    riskTerms: string[];
    wearingStyles: RagWearingStyle[];
  };
}

export interface RagTraceVectorSearch {
  topK: number;
  hitCount: number;
  hits: RagTraceVectorHit[];
  error?: string;
}

export interface RagTraceProductCandidate {
  productId: string;
  foundInPostgres: boolean;
  status?: string;
  available?: boolean;
  category?: string;
  subCategory?: string | null;
  brand?: string;
  priceMinCents?: number;
  priceMaxCents?: number;
  sourceVectorRanks: number[];
  snippets: string[];
}

export interface RagTraceProductLookup {
  requestedProductIds: string[];
  foundProductIds: string[];
  missingProductIds: string[];
  candidates: RagTraceProductCandidate[];
}

export interface RagTracePostFilter {
  beforeCount: number;
  afterCount: number;
  removed: Array<{
    productId: string;
    reason: string;
    evidence: string[];
  }>;
}

export interface RagTraceFinalSelection {
  selectedProductIds: string[];
  productCardIds: string[];
  fallbackUsed?: boolean;
  fallbackReason?: string;
  answerPreview?: string;
}

export interface RagTraceLlmLaneModel {
  enabled: boolean;
  provider: string;
  model?: string;
}

export interface RagTraceLlmLanes {
  decisionPrimary: RagTraceLlmLaneModel;
  decisionFallback?: RagTraceLlmLaneModel;
  answer: RagTraceLlmLaneModel;
}

export interface RagDebugTrace {
  traceId: string;
  requestId?: string;
  generatedAt: string;
  llm?: RagTraceLlmLanes;
  originalQuery: string;
  baseRetrievalQuery: string;
  retrievalQuery: string;
  retrievalStrategy?: string;
  queryRewriteStatus?: string;
  queryRewriteReason?: string;
  filters: RagTraceFilters;
  negativeConstraints: RagTraceNegativeConstraint[];
  vectorSearch: RagTraceVectorSearch;
  productLookup: RagTraceProductLookup;
  postFilter: RagTracePostFilter;
  finalSelection: RagTraceFinalSelection;
  failureType: RagFailureType;
  notes: string[];
}
