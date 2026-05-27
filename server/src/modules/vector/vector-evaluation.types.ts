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
  category: string;
  subCategory: string | null;
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

export type VectorEvaluationProductLookup = (
  productIds: string[],
) => Promise<Map<string, VectorEvaluationProductSnapshot>>;
