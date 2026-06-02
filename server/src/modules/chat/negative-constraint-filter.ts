import type { RetrievedProductContext } from "./chat.types";
import {
  evaluateNegativeConstraintEvidence,
  type NegativeConstraintProductFacts,
} from "./negative-constraint-evidence";
import type { NegativeConstraint } from "./negative-constraint.types";

export function filterContextsByNegativeConstraints(
  contexts: RetrievedProductContext[],
  constraints: readonly NegativeConstraint[],
): RetrievedProductContext[] {
  const activeConstraints = constraints.filter(isFilteringConstraint);

  if (activeConstraints.length === 0) {
    return contexts;
  }

  return contexts.filter((context) =>
    !activeConstraints.some((constraint) =>
      productViolatesNegativeConstraint(context, constraint)
    )
  );
}

export function productViolatesNegativeConstraint(
  context: RetrievedProductContext,
  constraint: NegativeConstraint,
): boolean {
  return evaluateNegativeConstraintEvidence({
    term: constraint.term,
    kind: constraint.kind,
    matchPolicy: constraint.matchPolicy,
    productFacts: contextToProductFacts(context),
  }).conflicts;
}

function isFilteringConstraint(constraint: NegativeConstraint): boolean {
  return (
    constraint.matchPolicy !== "needs_clarification"
    && constraint.kind !== "price"
  );
}

function contextToProductFacts(
  context: RetrievedProductContext,
): NegativeConstraintProductFacts {
  return {
    id: context.product.id,
    name: context.product.name,
    brand: context.product.brand,
    category: context.product.category,
    subCategory: context.product.subCategory,
    tags: context.product.visualTags,
    recommendWhen: context.product.recommendWhen,
    avoidWhen: context.product.avoidWhen,
    pros: context.product.pros,
    cons: context.product.cons,
    attributes: context.product.attributes,
    marketingDescription: context.product.marketingDescription,
    knowledgeText: context.product.knowledgeText,
    snippets: context.snippets,
    reviewSummary: context.product.reviewSummary,
    contentBlocks: context.product.contentBlocks,
    officialFaq: context.product.officialFaq,
    userReviews: context.product.userReviews,
  };
}
