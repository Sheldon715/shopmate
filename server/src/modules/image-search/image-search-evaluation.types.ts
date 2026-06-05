import type { VisualIntent } from "./image-search.types";

export const IMAGE_SEARCH_EVALUATION_OUTCOMES = [
  "recommendation",
  "clarification",
  "refusal",
] as const;

export type ImageSearchEvaluationOutcome =
  (typeof IMAGE_SEARCH_EVALUATION_OUTCOMES)[number];

export const IMAGE_SEARCH_EVALUATION_FAILURE_CATEGORIES = [
  "visual_misread",
  "category_mismatch",
  "constraint_lost",
  "catalog_miss",
  "hallucinated_product",
  "price_or_stock_error",
  "privacy_leak",
  "low_confidence_missing",
  "latency_too_high",
] as const;

export type ImageSearchEvaluationFailureCategory =
  (typeof IMAGE_SEARCH_EVALUATION_FAILURE_CATEGORIES)[number];

export const IMAGE_SEARCH_EVALUATION_RUN_STATUSES = [
  "not_run",
  "passed",
  "failed",
  "needs_review",
] as const;

export type ImageSearchEvaluationRunStatus =
  (typeof IMAGE_SEARCH_EVALUATION_RUN_STATUSES)[number];

export interface ImageSearchEvaluationCase {
  caseId: string;
  imageRef: string;
  imageDescription: string;
  userText: string;
  expectedOutcome: ImageSearchEvaluationOutcome;
  expectedBehavior: string;
  expectedCategory: string | null;
  expectedProductIdPrefixes: string[];
  mustNot: string[];
}

export interface ImageSearchEvaluationFilters {
  category?: string;
}

export interface ImageSearchEvaluationTiming {
  imageInterpretMs: number;
  chatTtftMs: number;
  totalMs: number;
}

export interface ImageSearchEvaluationHumanScores {
  visualUnderstanding: number;
  catalogGrounding: number;
  constraintFollowing: number;
  factualAccuracy: number;
  privacySafety: number;
  latencyExperience: number;
}

export interface ImageSearchEvaluationResult {
  caseId: string;
  runAt: string;
  runStatus: ImageSearchEvaluationRunStatus;
  imageSearchMode: "vlm_first";
  visualIntent: VisualIntent | null;
  chatMessage: string | null;
  filters: ImageSearchEvaluationFilters | null;
  returnedProductIds: string[];
  refusalReason?: string;
  timing: ImageSearchEvaluationTiming;
  humanScores: ImageSearchEvaluationHumanScores | null;
  issues: ImageSearchEvaluationFailureCategory[];
  notes: string[];
}
