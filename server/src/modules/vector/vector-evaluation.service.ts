import {
  evaluateNegativeConstraintEvidence,
  type NegativeConstraintEvidenceResult,
  type NegativeConstraintProductFacts,
} from "../chat/negative-constraint-evidence";
import type { VectorSearchFilters, VectorSearchHit } from "./vector-search.types";
import type {
  VectorEvaluationCase,
  VectorEvaluationFailureReason,
  VectorEvaluationHit,
  VectorEvaluationProductLookup,
  VectorEvaluationProductSnapshot,
  VectorEvaluationQueryRewriteResult,
  VectorEvaluationQueryRewriter,
  VectorEvaluationResult,
  VectorEvaluationSearchRunner,
} from "./vector-evaluation.types";

interface EvaluateVectorSearchCasesInput {
  cases: VectorEvaluationCase[];
  search: VectorEvaluationSearchRunner;
  queryRewriter?: VectorEvaluationQueryRewriter;
  productLookup?: VectorEvaluationProductLookup;
  topK?: number;
  generatedAt?: string;
}

interface EvaluateSingleCaseInput {
  evaluationCase: VectorEvaluationCase;
  hits: VectorSearchHit[];
  rewriteResult?: VectorEvaluationQueryRewriteResult;
  productsById?: Map<string, VectorEvaluationProductSnapshot>;
  generatedAt: string;
  searchError?: unknown;
  productLookupError?: unknown;
}

const DEFAULT_MIN_MATCHING_HITS = 1;

export async function evaluateVectorSearchCases(
  input: EvaluateVectorSearchCasesInput,
): Promise<VectorEvaluationResult[]> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const results: VectorEvaluationResult[] = [];

  for (const evaluationCase of input.cases) {
    let rewriteResult: VectorEvaluationQueryRewriteResult | undefined;

    try {
      rewriteResult = input.queryRewriter
        ? await input.queryRewriter({
            query: evaluationCase.query,
            filters: evaluationCase.filters,
            caseId: evaluationCase.caseId,
          })
        : undefined;
      const hits = await input.search({
        query: rewriteResult?.query ?? evaluationCase.query,
        filters: evaluationCase.filters,
        topK: input.topK,
      });
      const lookupResult = await lookupProducts(input.productLookup, hits);

      results.push(
        evaluateSingleCase({
          evaluationCase,
          hits,
          rewriteResult,
          productsById: lookupResult.productsById,
          generatedAt,
          productLookupError: lookupResult.error,
        }),
      );
    } catch (error) {
      results.push(
        evaluateSingleCase({
          evaluationCase,
          hits: [],
          rewriteResult,
          generatedAt,
          searchError: error,
        }),
      );
    }
  }

  return results;
}

export function evaluateSingleCase(
  input: EvaluateSingleCaseInput,
): VectorEvaluationResult {
  const failureReasons = new Set<VectorEvaluationFailureReason>();
  const notes: string[] = [];
  const hits = input.hits.map(mapHitForOutput);

  if (input.searchError) {
    failureReasons.add("unexpected_result");
    notes.push(`Search failed: ${getErrorMessage(input.searchError)}`);
  } else {
    if (input.productLookupError) {
      failureReasons.add("unexpected_result");
      notes.push(
        `PostgreSQL product lookup failed: ${getErrorMessage(input.productLookupError)}`,
      );
    }

    addHardFilterFailures(
      input.hits,
      input.evaluationCase.filters,
      input.productsById,
      failureReasons,
      notes,
    );
    addExpectationFailures(
      input.evaluationCase,
      input.hits,
      failureReasons,
      notes,
    );
  }

  return {
    caseId: input.evaluationCase.caseId,
    query: input.evaluationCase.query,
    ...createRewriteOutputFields(input.evaluationCase.query, input.rewriteResult),
    filters: input.evaluationCase.filters,
    hits,
    passed: failureReasons.size === 0,
    failureReasons: [...failureReasons],
    notes,
    generatedAt: input.generatedAt,
  };
}

function createRewriteOutputFields(
  originalQuery: string,
  rewriteResult: VectorEvaluationQueryRewriteResult | undefined,
): Pick<
  VectorEvaluationResult,
  | "originalQuery"
  | "baseRetrievalQuery"
  | "retrievalQuery"
  | "queryRewriteStatus"
  | "queryRewriteReason"
> {
  if (!rewriteResult) {
    return {};
  }

  return {
    originalQuery,
    baseRetrievalQuery: rewriteResult.baseQuery ?? originalQuery,
    retrievalQuery: rewriteResult.query,
    queryRewriteStatus: rewriteResult.status,
    queryRewriteReason: rewriteResult.reason ?? rewriteResult.fallbackReason,
  };
}

async function lookupProducts(
  productLookup: VectorEvaluationProductLookup | undefined,
  hits: VectorSearchHit[],
): Promise<{
  productsById?: Map<string, VectorEvaluationProductSnapshot>;
  error?: unknown;
}> {
  if (!productLookup) {
    return {};
  }

  try {
    return {
      productsById: await productLookup(uniqueProductIds(hits)),
    };
  } catch (error) {
    return { error };
  }
}

function addExpectationFailures(
  evaluationCase: VectorEvaluationCase,
  hits: VectorSearchHit[],
  failureReasons: Set<VectorEvaluationFailureReason>,
  notes: string[],
): void {
  if (evaluationCase.expectedNoResult) {
    if (hits.length > 0) {
      failureReasons.add("unexpected_result");
      notes.push("Expected no vector result, but hits were returned.");
    } else {
      notes.push("Expected no vector result and none were returned.");
    }

    return;
  }

  if (hits.length === 0) {
    failureReasons.add("no_vector_result");
    notes.push("No vector results returned for a case that expected hits.");

    if (hasMeaningfulFilters(evaluationCase.filters)) {
      failureReasons.add("filter_too_strict");
      notes.push("Filters may be too strict, or the current vector index may not cover this product slice.");
    }

    return;
  }

  const minMatchingHits =
    evaluationCase.passCriteria.minMatchingHits ?? DEFAULT_MIN_MATCHING_HITS;
  const matchingHits = hits.filter((hit) =>
    matchesExpectedCategory(hit, evaluationCase),
  );

  if (matchingHits.length < minMatchingHits) {
    failureReasons.add("wrong_category");
    notes.push(
      `Expected at least ${minMatchingHits} matching category hit(s), got ${matchingHits.length}.`,
    );
  }

  if (
    evaluationCase.passCriteria.requireExpectedProductId === true
    && evaluationCase.expectedProductIdsAny.length > 0
    && !hits.some((hit) =>
      evaluationCase.expectedProductIdsAny.includes(hit.productId),
    )
  ) {
    failureReasons.add("unexpected_result");
    notes.push("No hit matched expectedProductIdsAny.");
  }
}

function addHardFilterFailures(
  hits: VectorSearchHit[],
  filters: VectorSearchFilters,
  productsById: Map<string, VectorEvaluationProductSnapshot> | undefined,
  failureReasons: Set<VectorEvaluationFailureReason>,
  notes: string[],
): void {
  const recordedAvoidTermConflicts = new Set<string>();

  for (const hit of hits) {
    const product = productsById?.get(hit.productId);

    if (productsById && !product) {
      failureReasons.add("stale_hit");
      notes.push(`Hit product_id ${hit.productId} was not found as active in PostgreSQL.`);
      continue;
    }

    const source = product ?? {
      productId: hit.productId,
      status: "active",
      name: "",
      brand: hit.metadata.brand,
      category: hit.metadata.category,
      subCategory: hit.metadata.subCategory,
      tags: hit.metadata.tags,
      recommendWhen: hit.metadata.recommendWhen,
      avoidWhen: hit.metadata.avoidWhen,
      pros: [],
      cons: [],
      attributes: {},
      marketingDescription: "",
      knowledgeText: "",
      reviewSummary: {},
      contentBlocks: [],
      officialFaq: [],
      userReviews: [],
      priceMinCents: hit.metadata.priceMinCents,
      priceMaxCents: hit.metadata.priceMaxCents,
      available: hit.metadata.available,
    };

    if (source.status !== "active" || !source.available) {
      failureReasons.add("stale_hit");
      notes.push(`Hit product_id ${hit.productId} is not active and available.`);
    }

    if (filters.category && source.category !== filters.category) {
      failureReasons.add("wrong_category");
      notes.push(`Hit product_id ${hit.productId} violates category filter.`);
    }

    if (
      filters.subCategory
      && source.subCategory !== filters.subCategory
    ) {
      failureReasons.add("wrong_category");
      notes.push(`Hit product_id ${hit.productId} violates subCategory filter.`);
    }

    if (
      filters.maxPriceCents !== undefined
      && source.priceMinCents > filters.maxPriceCents
    ) {
      failureReasons.add("budget_violation");
      notes.push(`Hit product_id ${hit.productId} is above maxPriceCents.`);
    }

    if (
      filters.minPriceCents !== undefined
      && source.priceMaxCents < filters.minPriceCents
    ) {
      failureReasons.add("budget_violation");
      notes.push(`Hit product_id ${hit.productId} is below minPriceCents.`);
    }

    if (filters.availableOnly !== false && !hit.metadata.available) {
      failureReasons.add("stale_hit");
      notes.push(`Hit product_id ${hit.productId} violates availableOnly.`);
    }

    for (const conflict of findAvoidTermConflicts(
      hit,
      filters.avoidTerms,
      source,
    )) {
      const conflictKey = `${hit.productId}\u0000${conflict.term}`;

      if (recordedAvoidTermConflicts.has(conflictKey)) {
        continue;
      }

      recordedAvoidTermConflicts.add(conflictKey);
      failureReasons.add("unexpected_result");
      notes.push(
        `Hit product_id ${hit.productId} violates avoidTerm "${conflict.term}" (${conflict.result.reason}): ${formatEvidence(conflict.result.evidence)}`,
      );
    }
  }
}

function matchesExpectedCategory(
  hit: VectorSearchHit,
  evaluationCase: VectorEvaluationCase,
): boolean {
  if (
    evaluationCase.expectedCategory
    && hit.metadata.category !== evaluationCase.expectedCategory
  ) {
    return false;
  }

  if (
    evaluationCase.expectedSubCategory
    && hit.metadata.subCategory !== evaluationCase.expectedSubCategory
  ) {
    return false;
  }

  return true;
}

function findAvoidTermConflicts(
  hit: VectorSearchHit,
  avoidTerms: string[] | undefined,
  product: VectorEvaluationProductSnapshot,
): Array<{
  term: string;
  result: NegativeConstraintEvidenceResult;
}> {
  const terms = normalizeTerms(avoidTerms);

  if (terms.length === 0) {
    return [];
  }

  return terms.flatMap((term) => {
    const result = evaluateNegativeConstraintEvidence({
      term,
      kind: "unknown",
      matchPolicy: "exclude_if_product_facts_conflict",
      productFacts: createProductFacts(hit, product),
    });

    return result.conflicts ? [{ term, result }] : [];
  });
}

function normalizeTerms(values: string[] | undefined): string[] {
  return values
    ? values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
    : [];
}

function createProductFacts(
  hit: VectorSearchHit,
  product: VectorEvaluationProductSnapshot,
): NegativeConstraintProductFacts {
  return {
    id: product.productId,
    name: product.name,
    brand: product.brand,
    category: product.category,
    subCategory: product.subCategory,
    tags: product.tags,
    recommendWhen: product.recommendWhen,
    avoidWhen: product.avoidWhen,
    pros: product.pros,
    cons: product.cons,
    attributes: product.attributes,
    marketingDescription: product.marketingDescription,
    knowledgeText: product.knowledgeText,
    snippets: [hit.snippet],
    reviewSummary: product.reviewSummary,
    contentBlocks: product.contentBlocks,
    officialFaq: product.officialFaq,
    userReviews: product.userReviews,
  };
}

function formatEvidence(evidence: string[]): string {
  return evidence.length > 0
    ? evidence.map((item) => truncateText(item)).join(" | ")
    : "no evidence";
}

function truncateText(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/gu, " ").trim();

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}…`;
}

function hasMeaningfulFilters(filters: VectorSearchFilters): boolean {
  return Boolean(
    filters.category
      || filters.subCategory
      || filters.brand
      || filters.minPriceCents !== undefined
      || filters.maxPriceCents !== undefined
      || filters.availableOnly !== undefined
      || (filters.tagsAny && filters.tagsAny.length > 0)
      || (filters.avoidTerms && filters.avoidTerms.length > 0),
  );
}

function mapHitForOutput(hit: VectorSearchHit): VectorEvaluationHit {
  return {
    doc_id: hit.docId,
    product_id: hit.productId,
    score: hit.score,
    snippet: hit.snippet,
    category: hit.metadata.category,
    subCategory: hit.metadata.subCategory,
    priceMinCents: hit.metadata.priceMinCents,
    priceMaxCents: hit.metadata.priceMaxCents,
    available: hit.metadata.available,
  };
}

function uniqueProductIds(hits: VectorSearchHit[]): string[] {
  return [...new Set(hits.map((hit) => hit.productId))];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = "cause" in error ? error.cause : undefined;

    if (cause !== undefined) {
      return `${error.message}: ${getErrorMessage(cause)}`;
    }

    return error.message;
  }

  return String(error);
}
