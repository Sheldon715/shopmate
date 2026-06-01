export type NegativeConstraintConfidence = "high" | "medium" | "low";

export type NegativeConstraintKind =
  | "ingredient"
  | "brand"
  | "feature"
  | "category"
  | "price"
  | "product"
  | "unknown";

export type NegativeConstraintScope =
  | "product"
  | "sku"
  | "recommendation_set"
  | "unknown";

export type NegativeConstraintMatchPolicy =
  | "exclude_brand"
  | "exclude_product"
  | "exclude_category"
  | "exclude_if_product_facts_conflict"
  | "needs_clarification";

export interface NegativeConstraint {
  rawText: string;
  term: string;
  kind: NegativeConstraintKind;
  scope: NegativeConstraintScope;
  matchPolicy: NegativeConstraintMatchPolicy;
}

export interface NegativeConstraintIntentResult {
  hasNegativeConstraints: boolean;
  confidence: NegativeConstraintConfidence;
  constraints: NegativeConstraint[];
  needsClarification: boolean;
  clarificationQuestion?: string;
}

export const NO_NEGATIVE_CONSTRAINTS: NegativeConstraintIntentResult = {
  hasNegativeConstraints: false,
  confidence: "low",
  constraints: [],
  needsClarification: false,
};
