import type { Product } from "../products/product.types";
import type { RagDebugTrace, RagFailureType } from "../chat/rag-debug-trace.types";
import type { RagWearingStyle } from "./rag-negative-fact-metadata";
import type { VectorSearchFilters, VectorSearchHit } from "./vector-search.types";

export type RetrievalBaselineCapability =
  | "category_retrieval"
  | "budget_filter"
  | "negative_constraint"
  | "use_case"
  | "paraphrase_consistency"
  | "data_gap";

export interface RetrievalBaselineForbidden {
  productIds?: string[];
  brands?: string[];
  riskTerms?: string[];
  wearingStyles?: RagWearingStyle[];
  terms?: string[];
}

export interface RetrievalBaselineCaseGroup {
  caseId: string;
  capability: RetrievalBaselineCapability;
  queries: string[];
  filters: VectorSearchFilters;
  expectedProductIdsAny: string[];
  expectedCategory?: string;
  expectedSubCategory?: string | null;
  expectedNoResult: boolean;
  forbidden?: RetrievalBaselineForbidden;
  notes?: string;
}

export interface RetrievalBaselineQueryResult {
  caseId: string;
  capability: RetrievalBaselineCapability;
  query: string;
  originalQuery?: string;
  baseRetrievalQuery?: string;
  retrievalQuery?: string;
  queryRewriteStatus?: "rewritten" | "not_needed" | "fallback";
  queryRewriteReason?: string;
  filters: VectorSearchFilters;
  expectedProductIdsAny: string[];
  expectedNoResult: boolean;
  productRanking: string[];
  expectedHitRank?: number;
  expectedHit: boolean;
  noResultCorrect: boolean;
  constraintSatisfied: boolean;
  negativeConstraintSatisfied: boolean;
  staleProductIds: string[];
  passed: boolean;
  failureType: RagFailureType;
  notes: string[];
  traceId: string;
  generatedAt: string;
}

export interface RetrievalBaselineGroupResult {
  caseId: string;
  capability: RetrievalBaselineCapability;
  queries: string[];
  passed: boolean;
  candidateOverlapAt10: number;
  expectedHitConsistency: number;
  queryResults: RetrievalBaselineQueryResult[];
}

export interface RetrievalBaselineMetrics {
  totalGroups: number;
  totalQueries: number;
  passedQueries: number;
  recallAt5: number;
  recallAt10: number;
  recallAt20: number;
  mrrAt10: number;
  averageExpectedRank?: number;
  noResultAccuracy: number;
  constraintSatisfactionRate: number;
  negativeConstraintAccuracy: number;
  staleHitRate: number;
  paraphraseCandidateOverlapAt10: number;
  paraphraseExpectedHitConsistency: number;
  failureTypeDistribution: Record<RagFailureType, number>;
  capabilitySummary: Record<
    string,
    {
      pass: number;
      fail: number;
      noResultCorrect: number;
    }
  >;
  topFailedCases: Array<{
    caseId: string;
    query: string;
    failureType: RagFailureType;
    notes: string[];
  }>;
}

export interface RetrievalBaselineEvaluationResult {
  generatedAt: string;
  topK: number;
  groupResults: RetrievalBaselineGroupResult[];
  queryResults: RetrievalBaselineQueryResult[];
  traces: RagDebugTrace[];
  metrics: RetrievalBaselineMetrics;
}

export interface RetrievalBaselineSearchInput {
  query: string;
  filters?: VectorSearchFilters;
  topK?: number;
}

export type RetrievalBaselineSearchRunner = (
  input: RetrievalBaselineSearchInput,
) => Promise<VectorSearchHit[]>;

export type RetrievalBaselineProductLookup = (
  productIds: string[],
) => Promise<Product[]>;

export interface RetrievalBaselineQueryRewriteInput {
  query: string;
  filters: VectorSearchFilters;
  caseId: string;
}

export interface RetrievalBaselineQueryRewriteResult {
  query: string;
  baseQuery?: string;
  rewrittenQuery?: string;
  status: "rewritten" | "not_needed" | "fallback";
  reason?: string;
  fallbackReason?: string;
}

export type RetrievalBaselineQueryRewriter = (
  input: RetrievalBaselineQueryRewriteInput,
) => Promise<RetrievalBaselineQueryRewriteResult>;
