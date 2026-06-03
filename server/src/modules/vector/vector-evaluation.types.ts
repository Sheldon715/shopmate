import type { VectorSearchFilters, VectorSearchHit } from "./vector-search.types";

export type VectorEvaluationFailureReason =
  | "no_vector_result"
  | "wrong_category"
  | "budget_violation"
  | "stale_hit"
  | "filter_too_strict"
  | "unexpected_result";

export interface VectorEvaluationPassCriteria {
  description: string;
  minMatchingHits?: number;
  requireExpectedProductId?: boolean;
}

export interface VectorEvaluationCase {
  caseId: string;
  query: string;
  filters: VectorSearchFilters;
  expectedCategory?: string;
  expectedSubCategory?: string | null;
  expectedProductIdsAny: string[];
  expectedNoResult: boolean;
  passCriteria: VectorEvaluationPassCriteria;
}

export interface VectorEvaluationProductSnapshot {
  productId: string;
  status: string;
  name: string;
  brand: string;
  category: string;
  subCategory: string | null;
  tags: string[];
  recommendWhen: string[];
  avoidWhen: string[];
  pros: string[];
  cons: string[];
  attributes: Record<string, string[]>;
  marketingDescription: string;
  knowledgeText: string;
  reviewSummary: unknown;
  contentBlocks: unknown;
  officialFaq: unknown;
  userReviews: unknown;
  priceMinCents: number;
  priceMaxCents: number;
  available: boolean;
}

export interface VectorEvaluationHit {
  doc_id: string;
  product_id: string;
  score: number;
  snippet: string;
  category: string;
  subCategory: string | null;
  priceMinCents: number;
  priceMaxCents: number;
  available: boolean;
}

export interface VectorEvaluationResult {
  caseId: string;
  query: string;
  originalQuery?: string;
  baseRetrievalQuery?: string;
  retrievalQuery?: string;
  queryRewriteStatus?: "rewritten" | "not_needed" | "fallback";
  queryRewriteReason?: string;
  filters: VectorSearchFilters;
  hits: VectorEvaluationHit[];
  passed: boolean;
  failureReasons: VectorEvaluationFailureReason[];
  notes: string[];
  generatedAt: string;
}

export interface VectorEvaluationSearchInput {
  query: string;
  filters?: VectorSearchFilters;
  topK?: number;
}

export type VectorEvaluationSearchRunner = (
  input: VectorEvaluationSearchInput,
) => Promise<VectorSearchHit[]>;

export interface VectorEvaluationQueryRewriteInput {
  query: string;
  filters: VectorSearchFilters;
  caseId: string;
}

export interface VectorEvaluationQueryRewriteResult {
  query: string;
  baseQuery?: string;
  rewrittenQuery?: string;
  status: "rewritten" | "not_needed" | "fallback";
  reason?: string;
  fallbackReason?: string;
}

export type VectorEvaluationQueryRewriter = (
  input: VectorEvaluationQueryRewriteInput,
) => Promise<VectorEvaluationQueryRewriteResult>;

export type VectorEvaluationProductLookup = (
  productIds: string[],
) => Promise<Map<string, VectorEvaluationProductSnapshot>>;
