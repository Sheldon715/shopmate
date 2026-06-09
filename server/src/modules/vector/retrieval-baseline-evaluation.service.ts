import { evaluateNegativeConstraintEvidence } from "../chat/negative-constraint-evidence";
import {
  createPostFilterTrace,
  createRagDebugTrace,
} from "../chat/rag-debug-trace";
import type { RagDebugTrace, RagFailureType } from "../chat/rag-debug-trace.types";
import type { Product } from "../products/product.types";
import type { VectorSearchFilters, VectorSearchHit } from "./vector-search.types";
import type {
  RetrievalBaselineCaseGroup,
  RetrievalBaselineEvaluationResult,
  RetrievalBaselineForbidden,
  RetrievalBaselineGroupResult,
  RetrievalBaselineMetrics,
  RetrievalBaselineProductLookup,
  RetrievalBaselineQueryResult,
  RetrievalBaselineQueryRewriteResult,
  RetrievalBaselineQueryRewriter,
  RetrievalBaselineSearchRunner,
} from "./retrieval-baseline-evaluation.types";

export interface EvaluateRetrievalBaselineInput {
  groups: RetrievalBaselineCaseGroup[];
  search: RetrievalBaselineSearchRunner;
  productLookup?: RetrievalBaselineProductLookup;
  queryRewriter?: RetrievalBaselineQueryRewriter;
  topK?: number;
  generatedAt?: string;
}

interface QueryEvaluationContext {
  group: RetrievalBaselineCaseGroup;
  query: string;
  generatedAt: string;
  topK: number;
  rewriteResult: RetrievalBaselineQueryRewriteResult;
  hits: VectorSearchHit[];
  products: Product[];
  searchError?: unknown;
  productLookupError?: unknown;
}

interface QueryEvaluationOutput {
  result: RetrievalBaselineQueryResult;
  trace: RagDebugTrace;
}

const DEFAULT_TOP_K = 20;
const FAILURE_TYPES: RagFailureType[] = [
  "chunking_failure",
  "embedding_text_failure",
  "metadata_filter_failure",
  "vector_retrieval_failure",
  "product_lookup_failure",
  "negative_post_filter_failure",
  "answer_grounding_failure",
  "data_missing",
  "no_failure_detected",
];

export async function evaluateRetrievalBaseline(
  input: EvaluateRetrievalBaselineInput,
): Promise<RetrievalBaselineEvaluationResult> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const topK = input.topK ?? DEFAULT_TOP_K;
  const groupResults: RetrievalBaselineGroupResult[] = [];
  const queryResults: RetrievalBaselineQueryResult[] = [];
  const traces: RagDebugTrace[] = [];

  for (const group of input.groups) {
    const groupQueryResults: RetrievalBaselineQueryResult[] = [];

    for (const query of group.queries) {
      const rewriteResult = await rewriteQuery(input.queryRewriter, group, query);
      const searchOutput = await runSearch({
        search: input.search,
        query: rewriteResult.query,
        filters: group.filters,
        topK,
      });
      const lookupOutput = await lookupProducts(
        input.productLookup,
        searchOutput.hits,
      );
      const output = evaluateBaselineQuery({
        group,
        query,
        generatedAt,
        topK,
        rewriteResult,
        hits: searchOutput.hits,
        products: lookupOutput.products,
        searchError: searchOutput.error,
        productLookupError: lookupOutput.error,
      });

      groupQueryResults.push(output.result);
      queryResults.push(output.result);
      traces.push(output.trace);
    }

    groupResults.push({
      caseId: group.caseId,
      capability: group.capability,
      queries: [...group.queries],
      passed: groupQueryResults.every((result) => result.passed),
      candidateOverlapAt10: calculateCandidateOverlapAt10(groupQueryResults),
      expectedHitConsistency: calculateExpectedHitConsistency(groupQueryResults),
      queryResults: groupQueryResults,
    });
  }

  return {
    generatedAt,
    topK,
    groupResults,
    queryResults,
    traces,
    metrics: calculateRetrievalBaselineMetrics(groupResults, queryResults),
  };
}

export function createRetrievalBaselineMarkdownReport(
  result: RetrievalBaselineEvaluationResult,
  evidenceFiles: {
    resultJsonlPath: string;
    traceJsonlPath: string;
  },
): string {
  const metrics = result.metrics;
  const failureRows = Object.entries(metrics.failureTypeDistribution)
    .filter(([, count]) => count > 0)
    .map(([failureType, count]) => `| ${failureType} | ${count} |`)
    .join("\n") || "| none | 0 |";
  const failedRows = metrics.topFailedCases
    .map((item) =>
      `| ${item.caseId} | ${item.query} | ${item.failureType} | ${item.notes.join("; ")} |`
    )
    .join("\n") || "| none | none | none | none |";

  return [
    "# RAG Tuning Report",
    "",
    "## 1. Baseline Scope",
    "",
    `- Generated at: ${result.generatedAt}`,
    `- Case groups: ${metrics.totalGroups}`,
    `- Queries: ${metrics.totalQueries}`,
    `- Top K: ${result.topK}`,
    "",
    "## 2. Current RAG Path",
    "",
    "- Query rewrite is optional and recorded per query when enabled.",
    "- Vector retrieval uses the current ShopMate vector search service.",
    "- Product facts are reloaded from PostgreSQL for stale-hit and constraint checks.",
    "- This report is baseline-only and does not claim retrieval optimization.",
    "",
    "## 3. Baseline Metrics",
    "",
    `- Passed queries: ${metrics.passedQueries}/${metrics.totalQueries}`,
    `- recall@5: ${formatMetric(metrics.recallAt5)}`,
    `- recall@10: ${formatMetric(metrics.recallAt10)}`,
    `- recall@20: ${formatMetric(metrics.recallAt20)}`,
    `- MRR@10: ${formatMetric(metrics.mrrAt10)}`,
    `- Average expected rank: ${metrics.averageExpectedRank === undefined ? "n/a" : formatMetric(metrics.averageExpectedRank)}`,
    "",
    "## 4. Paraphrase Consistency",
    "",
    `- Candidate overlap@10: ${formatMetric(metrics.paraphraseCandidateOverlapAt10)}`,
    `- Expected hit consistency: ${formatMetric(metrics.paraphraseExpectedHitConsistency)}`,
    "",
    "## 5. Constraint and Negative Constraint Accuracy",
    "",
    `- Constraint satisfaction rate: ${formatMetric(metrics.constraintSatisfactionRate)}`,
    `- Negative constraint accuracy: ${formatMetric(metrics.negativeConstraintAccuracy)}`,
    `- Stale hit rate: ${formatMetric(metrics.staleHitRate)}`,
    `- No-result accuracy: ${formatMetric(metrics.noResultAccuracy)}`,
    "",
    "## 6. Failure Type Distribution",
    "",
    "| Failure Type | Count |",
    "| --- | ---: |",
    failureRows,
    "",
    "## 7. Top Failed Cases",
    "",
    "| Case | Query | Failure Type | Notes |",
    "| --- | --- | --- | --- |",
    failedRows,
    "",
    "## 8. Evidence Files",
    "",
    `- Results JSONL: ${evidenceFiles.resultJsonlPath}`,
    `- Trace JSONL: ${evidenceFiles.traceJsonlPath}`,
    "",
    "## 9. Next Recommended Spec",
    "",
    createNextRecommendedSpec(metrics),
    "",
  ].join("\n");
}

function evaluateBaselineQuery(
  input: QueryEvaluationContext,
): QueryEvaluationOutput {
  const notes: string[] = [];
  const productRanking = uniqueProductIds(input.hits);
  const productsById = new Map(input.products.map((product) => [product.id, product]));
  const missingProductIds = productRanking.filter((productId) =>
    !productsById.has(productId)
  );
  const foundProductIds = productRanking.filter((productId) =>
    productsById.has(productId)
  );
  const expectedHitRank = findExpectedHitRank(
    productRanking,
    input.group.expectedProductIdsAny,
  );
  const expectedHit =
    input.group.expectedProductIdsAny.length === 0
    || expectedHitRank !== undefined;
  const noResultCorrect =
    input.group.expectedNoResult && productRanking.length === 0;
  const constraintSatisfied = checkConstraintSatisfaction(
    input.group,
    input.products,
    input.hits,
    notes,
  );
  const negativeConstraintSatisfied = checkNegativeConstraintSatisfaction(
    input.group.forbidden,
    input.products,
    input.hits,
    notes,
  );
  const postFilterProductIds = input.products
    .filter((product) =>
      !productViolatesForbidden(product, input.group.forbidden, input.hits)
    )
    .map((product) => product.id);
  const postFilter = createPostFilterTrace({
    beforeProductIds: foundProductIds,
    afterProductIds: postFilterProductIds,
    removedReason: "forbidden_or_negative_constraint",
  });

  if (input.searchError) {
    notes.push(`Vector search failed: ${safeErrorMessage(input.searchError)}`);
  }

  if (input.productLookupError) {
    notes.push(
      `PostgreSQL product lookup failed: ${safeErrorMessage(input.productLookupError)}`,
    );
  }

  if (missingProductIds.length > 0) {
    notes.push(`Stale product ids: ${missingProductIds.join(", ")}`);
  }

  if (!input.group.expectedNoResult && !expectedHit) {
    notes.push("No expected product id appeared in product-level top-k.");
  }

  if (input.group.expectedNoResult && productRanking.length > 0) {
    notes.push("Expected no result, but vector retrieval returned candidates.");
  }

  const failureType = classifyFailureType({
    group: input.group,
    hits: input.hits,
    missingProductIds,
    expectedHit,
    noResultCorrect,
    constraintSatisfied,
    negativeConstraintSatisfied,
    postFilterAfterCount: postFilter.afterCount,
    searchError: input.searchError,
  });
  const passed = input.group.expectedNoResult
    ? noResultCorrect && negativeConstraintSatisfied && constraintSatisfied
    : productRanking.length > 0
      && expectedHit
      && constraintSatisfied
      && negativeConstraintSatisfied
      && missingProductIds.length === 0;
  const trace = createRagDebugTrace({
    generatedAt: input.generatedAt,
    originalQuery: input.query,
    baseRetrievalQuery: input.rewriteResult.baseQuery ?? input.query,
    retrievalQuery: input.rewriteResult.query,
    retrievalStrategy: input.rewriteResult.status === "rewritten"
      ? "rewritten_query"
      : "original_query",
    queryRewriteStatus: input.rewriteResult.status,
    queryRewriteReason:
      input.rewriteResult.reason ?? input.rewriteResult.fallbackReason,
    filters: input.group.filters,
    vectorHits: input.hits,
    vectorTopK: input.topK,
    vectorError: input.searchError,
    products: input.products,
    postFilter,
    finalSelection: {
      selectedProductIds: postFilterProductIds.slice(0, 3),
      productCardIds: postFilterProductIds.slice(0, 3),
      fallbackUsed: !passed,
      fallbackReason: passed ? undefined : failureType,
      answer: passed
        ? "baseline query passed"
        : `baseline query failed: ${failureType}`,
    },
    failureType,
    notes,
  });

  return {
    trace,
    result: {
      caseId: input.group.caseId,
      capability: input.group.capability,
      query: input.query,
      originalQuery: input.query,
      baseRetrievalQuery: input.rewriteResult.baseQuery ?? input.query,
      retrievalQuery: input.rewriteResult.query,
      queryRewriteStatus: input.rewriteResult.status,
      queryRewriteReason:
        input.rewriteResult.reason ?? input.rewriteResult.fallbackReason,
      filters: input.group.filters,
      expectedProductIdsAny: input.group.expectedProductIdsAny,
      expectedNoResult: input.group.expectedNoResult,
      productRanking,
      expectedHitRank,
      expectedHit,
      noResultCorrect,
      constraintSatisfied,
      negativeConstraintSatisfied,
      staleProductIds: missingProductIds,
      passed,
      failureType,
      notes,
      traceId: trace.traceId,
      generatedAt: input.generatedAt,
    },
  };
}

function calculateRetrievalBaselineMetrics(
  groupResults: RetrievalBaselineGroupResult[],
  queryResults: RetrievalBaselineQueryResult[],
): RetrievalBaselineMetrics {
  const recallQueries = queryResults.filter((result) =>
    !result.expectedNoResult && result.expectedProductIdsAny.length > 0
  );
  const noResultQueries = queryResults.filter((result) => result.expectedNoResult);
  const expectedRanks = recallQueries
    .map((result) => result.expectedHitRank)
    .filter((rank): rank is number => rank !== undefined);
  const staleHitCount = queryResults.reduce(
    (sum, result) => sum + result.staleProductIds.length,
    0,
  );
  const retrievedProductCount = queryResults.reduce(
    (sum, result) => sum + result.productRanking.length,
    0,
  );

  return {
    totalGroups: groupResults.length,
    totalQueries: queryResults.length,
    passedQueries: queryResults.filter((result) => result.passed).length,
    recallAt5: ratio(
      recallQueries.filter((result) =>
        result.expectedHitRank !== undefined && result.expectedHitRank <= 5
      ).length,
      recallQueries.length,
    ),
    recallAt10: ratio(
      recallQueries.filter((result) =>
        result.expectedHitRank !== undefined && result.expectedHitRank <= 10
      ).length,
      recallQueries.length,
    ),
    recallAt20: ratio(
      recallQueries.filter((result) =>
        result.expectedHitRank !== undefined && result.expectedHitRank <= 20
      ).length,
      recallQueries.length,
    ),
    mrrAt10: ratio(
      recallQueries.reduce((sum, result) =>
        result.expectedHitRank !== undefined && result.expectedHitRank <= 10
          ? sum + 1 / result.expectedHitRank
          : sum,
      0),
      recallQueries.length,
    ),
    averageExpectedRank:
      expectedRanks.length > 0
        ? expectedRanks.reduce((sum, rank) => sum + rank, 0) / expectedRanks.length
        : undefined,
    noResultAccuracy: ratio(
      noResultQueries.filter((result) => result.noResultCorrect).length,
      noResultQueries.length,
    ),
    constraintSatisfactionRate: ratio(
      queryResults.filter((result) => result.constraintSatisfied).length,
      queryResults.length,
    ),
    negativeConstraintAccuracy: ratio(
      queryResults.filter((result) => result.negativeConstraintSatisfied).length,
      queryResults.length,
    ),
    staleHitRate: ratio(staleHitCount, retrievedProductCount),
    paraphraseCandidateOverlapAt10: ratio(
      groupResults.reduce((sum, group) => sum + group.candidateOverlapAt10, 0),
      groupResults.length,
    ),
    paraphraseExpectedHitConsistency: ratio(
      groupResults.reduce((sum, group) => sum + group.expectedHitConsistency, 0),
      groupResults.length,
    ),
    failureTypeDistribution: createFailureDistribution(queryResults),
    capabilitySummary: createCapabilitySummary(queryResults),
    topFailedCases: queryResults
      .filter((result) => !result.passed)
      .slice(0, 10)
      .map((result) => ({
        caseId: result.caseId,
        query: result.query,
        failureType: result.failureType,
        notes: result.notes,
      })),
  };
}

function calculateCandidateOverlapAt10(
  results: RetrievalBaselineQueryResult[],
): number {
  if (results.length < 2) {
    return 1;
  }

  let total = 0;
  let pairs = 0;

  for (let left = 0; left < results.length; left += 1) {
    for (let right = left + 1; right < results.length; right += 1) {
      total += jaccard(
        results[left].productRanking.slice(0, 10),
        results[right].productRanking.slice(0, 10),
      );
      pairs += 1;
    }
  }

  return ratio(total, pairs);
}

function calculateExpectedHitConsistency(
  results: RetrievalBaselineQueryResult[],
): number {
  if (results.length === 0) {
    return 0;
  }

  return ratio(
    results.filter((result) =>
      result.expectedNoResult ? result.noResultCorrect : result.expectedHit
    ).length,
    results.length,
  );
}

async function rewriteQuery(
  queryRewriter: RetrievalBaselineQueryRewriter | undefined,
  group: RetrievalBaselineCaseGroup,
  query: string,
): Promise<RetrievalBaselineQueryRewriteResult> {
  if (!queryRewriter) {
    return {
      status: "not_needed",
      query,
      baseQuery: query,
    };
  }

  return queryRewriter({
    caseId: group.caseId,
    query,
    filters: group.filters,
  });
}

async function runSearch(input: {
  search: RetrievalBaselineSearchRunner;
  query: string;
  filters: VectorSearchFilters;
  topK: number;
}): Promise<{ hits: VectorSearchHit[]; error?: unknown }> {
  try {
    return {
      hits: await input.search({
        query: input.query,
        filters: input.filters,
        topK: input.topK,
      }),
    };
  } catch (error) {
    return { hits: [], error };
  }
}

async function lookupProducts(
  productLookup: RetrievalBaselineProductLookup | undefined,
  hits: VectorSearchHit[],
): Promise<{ products: Product[]; error?: unknown }> {
  if (!productLookup) {
    return { products: [] };
  }

  try {
    return { products: await productLookup(uniqueProductIds(hits)) };
  } catch (error) {
    return { products: [], error };
  }
}

function checkConstraintSatisfaction(
  group: RetrievalBaselineCaseGroup,
  products: readonly Product[],
  hits: readonly VectorSearchHit[],
  notes: string[],
): boolean {
  const productsById = new Map(products.map((product) => [product.id, product]));
  let passed = true;

  for (const hit of hits) {
    const product = productsById.get(hit.productId);
    const source = product ?? hit.metadata;

    if (group.filters.category && source.category !== group.filters.category) {
      notes.push(`${hit.productId} violates category filter.`);
      passed = false;
    }

    if (
      group.filters.subCategory
      && source.subCategory !== group.filters.subCategory
    ) {
      notes.push(`${hit.productId} violates subCategory filter.`);
      passed = false;
    }

    if (
      group.filters.maxPriceCents !== undefined
      && source.priceMinCents > group.filters.maxPriceCents
    ) {
      notes.push(`${hit.productId} is above maxPriceCents.`);
      passed = false;
    }

    if (
      group.filters.minPriceCents !== undefined
      && source.priceMaxCents < group.filters.minPriceCents
    ) {
      notes.push(`${hit.productId} is below minPriceCents.`);
      passed = false;
    }

    if (group.filters.availableOnly !== false && !isAvailable(source)) {
      notes.push(`${hit.productId} is not available.`);
      passed = false;
    }
  }

  return passed;
}

function checkNegativeConstraintSatisfaction(
  forbidden: RetrievalBaselineForbidden | undefined,
  products: readonly Product[],
  hits: readonly VectorSearchHit[],
  notes: string[],
): boolean {
  let passed = true;

  for (const product of products) {
    const violations = forbiddenViolations(product, forbidden, hits);

    if (violations.length > 0) {
      notes.push(`${product.id} violates forbidden constraints: ${violations.join(", ")}`);
      passed = false;
    }
  }

  return passed;
}

function productViolatesForbidden(
  product: Product,
  forbidden: RetrievalBaselineForbidden | undefined,
  hits: readonly VectorSearchHit[],
): boolean {
  return forbiddenViolations(product, forbidden, hits).length > 0;
}

function forbiddenViolations(
  product: Product,
  forbidden: RetrievalBaselineForbidden | undefined,
  hits: readonly VectorSearchHit[],
): string[] {
  if (!forbidden) {
    return [];
  }

  const violations: string[] = [];

  if (forbidden.productIds?.includes(product.id)) {
    violations.push(`productId:${product.id}`);
  }

  if (forbidden.brands?.includes(product.brand)) {
    violations.push(`brand:${product.brand}`);
  }

  const productHit = hits.find((hit) => hit.productId === product.id);
  const riskTerms = productHit?.metadata.riskTerms ?? [];
  const wearingStyles = productHit?.metadata.wearingStyles ?? [];

  for (const riskTerm of forbidden.riskTerms ?? []) {
    if (riskTerms.includes(riskTerm)) {
      violations.push(`riskTerm:${riskTerm}`);
    }
  }

  for (const wearingStyle of forbidden.wearingStyles ?? []) {
    if (wearingStyles.includes(wearingStyle)) {
      violations.push(`wearingStyle:${wearingStyle}`);
    }
  }

  for (const term of forbidden.terms ?? []) {
    const result = evaluateNegativeConstraintEvidence({
      term,
      kind: "unknown",
      matchPolicy: "exclude_if_product_facts_conflict",
      productFacts: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        subCategory: product.subCategory,
        tags: product.visualTags,
        recommendWhen: product.recommendWhen,
        avoidWhen: product.avoidWhen,
        pros: product.pros,
        cons: product.cons,
        attributes: product.attributes,
        marketingDescription: product.marketingDescription,
        knowledgeText: product.knowledgeText,
        snippets: hits
          .filter((hit) => hit.productId === product.id)
          .map((hit) => hit.snippet),
        reviewSummary: product.reviewSummary,
        contentBlocks: product.contentBlocks,
        officialFaq: product.officialFaq,
        userReviews: product.userReviews,
      },
    });

    if (result.conflicts) {
      violations.push(`term:${term}`);
    }
  }

  return violations;
}

function classifyFailureType(input: {
  group: RetrievalBaselineCaseGroup;
  hits: readonly VectorSearchHit[];
  missingProductIds: readonly string[];
  expectedHit: boolean;
  noResultCorrect: boolean;
  constraintSatisfied: boolean;
  negativeConstraintSatisfied: boolean;
  postFilterAfterCount: number;
  searchError?: unknown;
}): RagFailureType {
  if (input.group.expectedNoResult && input.noResultCorrect) {
    return "data_missing";
  }

  if (input.searchError || input.hits.length === 0) {
    return hasMeaningfulFilters(input.group.filters)
      ? "metadata_filter_failure"
      : "vector_retrieval_failure";
  }

  if (input.missingProductIds.length > 0) {
    return "product_lookup_failure";
  }

  if (!input.negativeConstraintSatisfied || input.postFilterAfterCount === 0) {
    return "negative_post_filter_failure";
  }

  if (!input.constraintSatisfied) {
    return "metadata_filter_failure";
  }

  if (!input.expectedHit) {
    return "vector_retrieval_failure";
  }

  return "no_failure_detected";
}

function findExpectedHitRank(
  productRanking: readonly string[],
  expectedProductIdsAny: readonly string[],
): number | undefined {
  if (expectedProductIdsAny.length === 0) {
    return undefined;
  }

  const expected = new Set(expectedProductIdsAny);
  const index = productRanking.findIndex((productId) => expected.has(productId));

  return index >= 0 ? index + 1 : undefined;
}

function uniqueProductIds(hits: readonly VectorSearchHit[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const hit of hits) {
    if (!seen.has(hit.productId)) {
      seen.add(hit.productId);
      ids.push(hit.productId);
    }
  }

  return ids;
}

function isAvailable(
  source: Product | VectorSearchHit["metadata"],
): boolean {
  if ("skus" in source) {
    return source.skus.length === 0
      ? source.status === "active"
      : source.skus.some((sku) => sku.available);
  }

  return source.available;
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
      || (filters.avoidTerms && filters.avoidTerms.length > 0)
      || (filters.excludeRiskTerms && filters.excludeRiskTerms.length > 0)
      || (filters.excludeWearingStyles && filters.excludeWearingStyles.length > 0)
      || (filters.excludeBrands && filters.excludeBrands.length > 0)
      || (filters.excludeProductIds && filters.excludeProductIds.length > 0),
  );
}

function createFailureDistribution(
  queryResults: readonly RetrievalBaselineQueryResult[],
): Record<RagFailureType, number> {
  const distribution = Object.fromEntries(
    FAILURE_TYPES.map((failureType) => [failureType, 0]),
  ) as Record<RagFailureType, number>;

  for (const result of queryResults) {
    distribution[result.failureType] += 1;
  }

  return distribution;
}

function createCapabilitySummary(
  queryResults: readonly RetrievalBaselineQueryResult[],
): RetrievalBaselineMetrics["capabilitySummary"] {
  const summary: RetrievalBaselineMetrics["capabilitySummary"] = {};

  for (const result of queryResults) {
    summary[result.capability] ??= {
      pass: 0,
      fail: 0,
      noResultCorrect: 0,
    };

    if (result.passed) {
      summary[result.capability].pass += 1;
    } else {
      summary[result.capability].fail += 1;
    }

    if (result.noResultCorrect) {
      summary[result.capability].noResultCorrect += 1;
    }
  }

  return summary;
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);

  if (union.size === 0) {
    return 1;
  }

  let intersection = 0;

  for (const item of leftSet) {
    if (rightSet.has(item)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function formatMetric(value: number): string {
  return value.toFixed(3);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createNextRecommendedSpec(metrics: RetrievalBaselineMetrics): string {
  const failureCounts = metrics.failureTypeDistribution;

  if (failureCounts.metadata_filter_failure > 0) {
    return "- Hard constraints are failing; prioritize metadata/filter fixes before rerank.";
  }

  if (failureCounts.vector_retrieval_failure > 0) {
    return "- Expected products are often missing from top-k; prioritize document and embedding text cleanup.";
  }

  if (metrics.recallAt20 > metrics.recallAt5) {
    return "- Expected products appear deeper in the list; hybrid retrieval or rerank can be evaluated next.";
  }

  if (failureCounts.answer_grounding_failure > 0) {
    return "- Candidate retrieval is stable but final selection is weak; evaluate rule-based reranker or answer grounding fixes.";
  }

  return "- Baseline is acceptable for this case set; expand cases before introducing a new retrieval strategy.";
}
