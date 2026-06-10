import { createHash } from "node:crypto";
import type { Product } from "../products/product.types";
import type {
  VectorSearchFilters,
  VectorSearchHit,
} from "../vector/vector-search.types";
import type { NegativeConstraint } from "./negative-constraint.types";
import type {
  RagDebugTrace,
  RagFailureType,
  RagTraceLlmLanes,
  RagTraceNegativeConstraint,
  RagTracePostFilter,
  RagTraceProductLookup,
  RagTraceVectorHit,
} from "./rag-debug-trace.types";

export interface RagDebugTraceInput {
  requestId?: string;
  generatedAt: string;
  llm?: RagTraceLlmLanes;
  originalQuery: string;
  baseRetrievalQuery: string;
  retrievalQuery: string;
  retrievalStrategy?: string;
  queryRewriteStatus?: string;
  queryRewriteReason?: string;
  filters?: VectorSearchFilters;
  negativeConstraints?: readonly NegativeConstraint[];
  vectorHits?: readonly VectorSearchHit[];
  vectorTopK: number;
  vectorError?: unknown;
  requestedProductIds?: readonly string[];
  products?: readonly Product[];
  postFilter?: RagTracePostFilter;
  finalSelection?: {
    selectedProductIds?: readonly string[];
    productCardIds?: readonly string[];
    fallbackUsed?: boolean;
    fallbackReason?: string;
    answer?: string;
  };
  failureType?: RagFailureType;
  notes?: readonly string[];
}

const MAX_SNIPPET_CHARS = 220;
const MAX_NOTE_CHARS = 220;
const MAX_ANSWER_PREVIEW_CHARS = 220;
const MAX_ERROR_CHARS = 180;

export function createRagDebugTrace(input: RagDebugTraceInput): RagDebugTrace {
  const vectorHits = input.vectorHits ?? [];
  const productLookup = createProductLookupTrace({
    requestedProductIds: input.requestedProductIds ?? productIdsFromHits(vectorHits),
    products: input.products ?? [],
    vectorHits,
  });
  const notes = sanitizeNotes([
    ...(input.notes ?? []),
    ...(input.vectorError
      ? [`Vector search error: ${safeErrorMessage(input.vectorError)}`]
      : []),
  ]);

  return {
    traceId: createTraceId(input),
    requestId: optionalNonEmpty(input.requestId),
    generatedAt: input.generatedAt,
    llm: input.llm ? sanitizeLlmLanes(input.llm) : undefined,
    originalQuery: sanitizeText(input.originalQuery, MAX_NOTE_CHARS),
    baseRetrievalQuery: sanitizeText(input.baseRetrievalQuery, MAX_NOTE_CHARS),
    retrievalQuery: sanitizeText(input.retrievalQuery, MAX_NOTE_CHARS),
    retrievalStrategy: input.retrievalStrategy,
    queryRewriteStatus: input.queryRewriteStatus,
    queryRewriteReason: input.queryRewriteReason
      ? sanitizeText(input.queryRewriteReason, MAX_NOTE_CHARS)
      : undefined,
    filters: sanitizeFilterObject(input.filters ?? {}),
    negativeConstraints: (input.negativeConstraints ?? []).map(
      mapNegativeConstraint,
    ),
    vectorSearch: {
      topK: input.vectorTopK,
      hitCount: vectorHits.length,
      hits: vectorHits.map(mapVectorHit),
      error: input.vectorError ? safeErrorMessage(input.vectorError) : undefined,
    },
    productLookup,
    postFilter: sanitizePostFilter(
      input.postFilter ?? createEmptyPostFilter(productLookup.foundProductIds.length),
    ),
    finalSelection: {
      selectedProductIds: [...(input.finalSelection?.selectedProductIds ?? [])],
      productCardIds: [...(input.finalSelection?.productCardIds ?? [])],
      fallbackUsed: input.finalSelection?.fallbackUsed,
      fallbackReason: input.finalSelection?.fallbackReason,
      answerPreview: input.finalSelection?.answer
        ? sanitizeText(input.finalSelection.answer, MAX_ANSWER_PREVIEW_CHARS)
        : undefined,
    },
    failureType: input.failureType ?? inferTraceFailureType({
      vectorHitCount: vectorHits.length,
      missingProductIds: productLookup.missingProductIds,
      postFilter: input.postFilter,
      vectorError: input.vectorError,
    }),
    notes,
  };
}

export function createPostFilterTrace(input: {
  beforeProductIds: readonly string[];
  afterProductIds: readonly string[];
  removedReason: string;
}): RagTracePostFilter {
  const after = new Set(input.afterProductIds);

  return {
    beforeCount: input.beforeProductIds.length,
    afterCount: input.afterProductIds.length,
    removed: input.beforeProductIds
      .filter((productId) => !after.has(productId))
      .map((productId) => ({
        productId,
        reason: input.removedReason,
        evidence: [],
      })),
  };
}

export function sanitizeTraceTextForTest(value: string): string {
  return sanitizeText(value, 10_000);
}

function sanitizeLlmLanes(llm: RagTraceLlmLanes): RagTraceLlmLanes {
  return {
    decisionPrimary: sanitizeLlmLaneModel(llm.decisionPrimary),
    decisionFallback: llm.decisionFallback
      ? sanitizeLlmLaneModel(llm.decisionFallback)
      : undefined,
    answer: sanitizeLlmLaneModel(llm.answer),
  };
}

function sanitizeLlmLaneModel(
  model: RagTraceLlmLanes["decisionPrimary"],
): RagTraceLlmLanes["decisionPrimary"] {
  return {
    enabled: model.enabled,
    provider: sanitizeText(model.provider, MAX_NOTE_CHARS),
    model: model.model ? sanitizeText(model.model, MAX_NOTE_CHARS) : undefined,
  };
}

function createTraceId(input: RagDebugTraceInput): string {
  const hash = createHash("sha1")
    .update([
      input.requestId ?? "",
      input.generatedAt,
      input.originalQuery,
      input.retrievalQuery,
    ].join("|"))
    .digest("hex")
    .slice(0, 16);

  return `rag-trace-${hash}`;
}

function mapVectorHit(hit: VectorSearchHit, index: number): RagTraceVectorHit {
  return {
    rank: index + 1,
    docId: hit.docId,
    productId: hit.productId,
    score: hit.score,
    snippet: sanitizeText(hit.snippet, MAX_SNIPPET_CHARS),
    metadata: {
      docType: hit.metadata.docType,
      blockType: hit.metadata.blockType,
      category: hit.metadata.category,
      subCategory: hit.metadata.subCategory,
      brand: hit.metadata.brand,
      priceMinCents: hit.metadata.priceMinCents,
      priceMaxCents: hit.metadata.priceMaxCents,
      available: hit.metadata.available,
      tags: hit.metadata.tags.map((tag) => sanitizeText(tag, MAX_NOTE_CHARS)),
      recommendWhen: hit.metadata.recommendWhen.map((value) =>
        sanitizeText(value, MAX_NOTE_CHARS)
      ),
      avoidWhen: hit.metadata.avoidWhen.map((value) =>
        sanitizeText(value, MAX_NOTE_CHARS)
      ),
      freeFromTerms: [...hit.metadata.freeFromTerms],
      riskTerms: [...hit.metadata.riskTerms],
      wearingStyles: [...hit.metadata.wearingStyles],
    },
  };
}

function createProductLookupTrace(input: {
  requestedProductIds: readonly string[];
  products: readonly Product[];
  vectorHits: readonly VectorSearchHit[];
}): RagTraceProductLookup {
  const requestedProductIds = uniqueNonEmpty(input.requestedProductIds);
  const productsById = new Map(input.products.map((product) => [product.id, product]));
  const foundProductIds = requestedProductIds.filter((productId) =>
    productsById.has(productId)
  );
  const missingProductIds = requestedProductIds.filter((productId) =>
    !productsById.has(productId)
  );

  return {
    requestedProductIds,
    foundProductIds,
    missingProductIds,
    candidates: requestedProductIds.map((productId) => {
      const product = productsById.get(productId);

      return {
        productId,
        foundInPostgres: Boolean(product),
        status: product?.status,
        available: product ? isProductAvailable(product) : undefined,
        category: product?.category,
        subCategory: product?.subCategory,
        brand: product?.brand,
        priceMinCents: product?.priceMinCents,
        priceMaxCents: product?.priceMaxCents,
        sourceVectorRanks: vectorRanksForProduct(input.vectorHits, productId),
        snippets: snippetsForProduct(input.vectorHits, productId),
      };
    }),
  };
}

function productIdsFromHits(hits: readonly VectorSearchHit[]): string[] {
  return uniqueNonEmpty(hits.map((hit) => hit.productId));
}

function vectorRanksForProduct(
  hits: readonly VectorSearchHit[],
  productId: string,
): number[] {
  return hits.flatMap((hit, index) =>
    hit.productId === productId ? [index + 1] : []
  );
}

function snippetsForProduct(
  hits: readonly VectorSearchHit[],
  productId: string,
): string[] {
  return uniqueNonEmpty(
    hits
      .filter((hit) => hit.productId === productId)
      .map((hit) => sanitizeText(hit.snippet, MAX_SNIPPET_CHARS)),
  );
}

function createEmptyPostFilter(beforeCount: number): RagTracePostFilter {
  return {
    beforeCount,
    afterCount: beforeCount,
    removed: [],
  };
}

function sanitizePostFilter(postFilter: RagTracePostFilter): RagTracePostFilter {
  return {
    beforeCount: postFilter.beforeCount,
    afterCount: postFilter.afterCount,
    removed: postFilter.removed.map((removed) => ({
      productId: removed.productId,
      reason: sanitizeText(removed.reason, MAX_NOTE_CHARS),
      evidence: removed.evidence.map((item) =>
        sanitizeText(item, MAX_SNIPPET_CHARS)
      ),
    })),
  };
}

function mapNegativeConstraint(
  constraint: NegativeConstraint,
): RagTraceNegativeConstraint {
  return {
    rawText: sanitizeText(constraint.rawText, MAX_NOTE_CHARS),
    term: sanitizeText(constraint.term, MAX_NOTE_CHARS),
    kind: constraint.kind,
    scope: constraint.scope,
    matchPolicy: constraint.matchPolicy,
  };
}

function inferTraceFailureType(input: {
  vectorHitCount: number;
  missingProductIds: readonly string[];
  postFilter?: RagTracePostFilter;
  vectorError?: unknown;
}): RagFailureType {
  if (input.vectorError || input.vectorHitCount === 0) {
    return "vector_retrieval_failure";
  }

  if (input.missingProductIds.length > 0) {
    return "product_lookup_failure";
  }

  if (
    input.postFilter
    && input.postFilter.beforeCount > 0
    && input.postFilter.afterCount === 0
  ) {
    return "negative_post_filter_failure";
  }

  return "no_failure_detected";
}

function sanitizeFilterObject(filters: VectorSearchFilters): VectorSearchFilters {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value.map((item) =>
              typeof item === "string"
                ? sanitizeText(item, MAX_NOTE_CHARS)
                : item
            )
          : typeof value === "string"
            ? sanitizeText(value, MAX_NOTE_CHARS)
            : value,
      ]),
  ) as VectorSearchFilters;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return sanitizeText(message, MAX_ERROR_CHARS);
}

function sanitizeNotes(notes: readonly string[]): string[] {
  return notes
    .map((note) => sanitizeText(note, MAX_NOTE_CHARS))
    .filter((note) => note.length > 0);
}

function sanitizeText(value: string, maxChars: number): string {
  const redacted = value
    .replace(/postgres(?:ql)?:\/\/\S+/giu, "[REDACTED_DATABASE_URL]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/gu, "[REDACTED_API_KEY]")
    .replace(/bearer\s+[A-Za-z0-9._-]+/giu, "Bearer [REDACTED_TOKEN]")
    .replace(
      /\b(?:api[_ -]?key|llm_api_key|embedding_api_key|qdrant_api_key|database_url|authorization|token)\s*[:=]\s*["']?[^,\s"']+/giu,
      (match) => `${match.split(/[:=]/u)[0]}=[REDACTED]`,
    )
    .replace(/\s+/gu, " ")
    .trim();

  return Array.from(redacted).length <= maxChars
    ? redacted
    : `${Array.from(redacted).slice(0, maxChars - 3).join("")}...`;
}

function optionalNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();

    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }

  return result;
}

function isProductAvailable(product: Product): boolean {
  return product.skus.length === 0
    ? product.status === "active"
    : product.skus.some((sku) => sku.available);
}
