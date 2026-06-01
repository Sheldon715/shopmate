import type { Product } from "../products/product.types";
import type { RetrievedProductContext } from "./chat.types";
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
  const term = normalizeText(constraint.term);

  if (!term) {
    return false;
  }

  switch (constraint.matchPolicy) {
    case "exclude_brand":
      return textMatchesTerm(context.product.brand, term);
    case "exclude_product":
      return productIdentityMatchesTerm(context.product, term);
    case "exclude_category":
      return categoryMatchesTerm(context.product, term);
    case "exclude_if_product_facts_conflict":
      return productFactsConflictWithTerm(context, term);
    case "needs_clarification":
      return false;
  }
}

function isFilteringConstraint(constraint: NegativeConstraint): boolean {
  return (
    constraint.matchPolicy !== "needs_clarification"
    && constraint.kind !== "price"
  );
}

function productIdentityMatchesTerm(product: Product, term: string): boolean {
  return [
    product.id,
    product.name,
    product.brand,
  ].some((value) => textMatchesTerm(value, term));
}

function categoryMatchesTerm(product: Product, term: string): boolean {
  return [
    product.category,
    product.subCategory ?? "",
    ...product.categoryPath,
  ].some((value) => textMatchesTerm(value, term));
}

function productFactsConflictWithTerm(
  context: RetrievedProductContext,
  term: string,
): boolean {
  const strictRiskFacts = [
    ...context.product.avoidWhen,
    ...context.product.cons,
  ];

  if (strictRiskFacts.some((fact) => textMatchesTerm(fact, term))) {
    return true;
  }

  const facts = [
    context.product.name,
    context.product.brand,
    context.product.marketingDescription,
    context.product.knowledgeText,
    ...context.product.visualTags,
    ...context.product.pros,
    ...context.product.recommendWhen,
    ...context.snippets,
    ...flattenFactValues(context.product.attributes),
    ...flattenFactValues(context.product.reviewSummary),
    ...flattenFactValues(context.product.contentBlocks),
    ...flattenFactValues(context.product.officialFaq),
    ...flattenFactValues(context.product.userReviews),
  ];

  return facts.some((fact) => factMentionsConflict(fact, term));
}

function factMentionsConflict(value: string, term: string): boolean {
  const text = normalizeText(value);

  return text.includes(term) && !hasSafeFreeStatement(text, term);
}

function hasSafeFreeStatement(text: string, term: string): boolean {
  const escapedTerm = escapeRegExp(term);
  const patterns = [
    new RegExp(`(?:不含|无|没有|未添加|零添加|0添加)${escapedTerm}`, "u"),
    new RegExp(`${escapedTerm}(?:free|0添加|零添加)`, "iu"),
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function textMatchesTerm(value: string, normalizedTerm: string): boolean {
  return normalizeText(value).includes(normalizedTerm);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .toLocaleLowerCase("zh-CN");
}

function flattenFactValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenFactValues(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => flattenFactValues(item));
  }

  return [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
