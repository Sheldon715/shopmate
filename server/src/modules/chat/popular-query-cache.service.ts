import { createHash } from "node:crypto";
import type { Product } from "../products/product.types";
import type { VectorSearchFilters } from "../vector/vector-search.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";
import type { RagChatRequest, RagChatResult } from "./chat.types";

export interface PopularQueryCacheVersions {
  modelVersion: string;
  promptVersion: string;
  dataVersion: string;
  visibleBoundary: string;
}

export interface PopularQueryCacheReadInput extends PopularQueryCacheVersions {
  question: string;
  retrievalQuery?: string;
  queryRewriteVersion?: string;
  filters?: VectorSearchFilters;
  topK?: number;
  maxRecommendedProducts: number;
  shortHistory?: RagChatRequest["shortHistory"];
  contextMemory?: ChatContextMemorySummary;
}

export interface PopularQueryCacheWriteInput extends PopularQueryCacheReadInput {
  result: RagChatResult;
}

export interface PopularQueryCacheHit {
  key: string;
  answer: string;
  recommendedProductIds: string[];
  fallbackUsed: boolean;
  fallbackReason?: "NO_CANDIDATES";
  retrieval: RagChatResult["retrieval"];
  createdAt: string;
  expiresAt: string;
  hitCount: number;
  modelVersion: string;
  promptVersion: string;
  dataVersion: string;
}

export interface PopularQueryCache {
  get(input: PopularQueryCacheReadInput): Promise<PopularQueryCacheHit | null>;
  set(input: PopularQueryCacheWriteInput): Promise<void>;
  delete(input: PopularQueryCacheReadInput): Promise<void>;
  isEligibleForRead(input: PopularQueryCacheReadInput): boolean;
  isEligibleForWrite(input: PopularQueryCacheWriteInput): boolean;
  buildKey(input: PopularQueryCacheReadInput): string;
}

export interface PopularQueryCacheServiceOptions {
  now?: () => Date;
  ttlMs?: number;
  maxEntries?: number;
}

interface PopularQueryCacheEntry {
  key: string;
  answer: string;
  recommendedProductIds: string[];
  fallbackUsed: boolean;
  fallbackReason?: "NO_CANDIDATES";
  retrieval: RagChatResult["retrieval"];
  createdAtMs: number;
  expiresAtMs: number;
  hitCount: number;
  modelVersion: string;
  promptVersion: string;
  dataVersion: string;
  visibleBoundary: string;
}

const DEFAULT_TTL_MS = 20 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;
const SAFE_CACHEABLE_FALLBACK_REASONS = new Set<RagChatResult["fallbackReason"] | undefined>([
  undefined,
  "NO_CANDIDATES",
]);

export class PopularQueryCacheService implements PopularQueryCache {
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, PopularQueryCacheEntry>();

  constructor(options: PopularQueryCacheServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  async get(
    input: PopularQueryCacheReadInput,
  ): Promise<PopularQueryCacheHit | null> {
    if (!this.isEligibleForRead(input)) {
      return null;
    }

    const key = this.buildKey(input);
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAtMs <= this.now().getTime()) {
      this.entries.delete(key);
      return null;
    }

    const updatedEntry = {
      ...entry,
      hitCount: entry.hitCount + 1,
    };

    this.entries.delete(key);
    this.entries.set(key, updatedEntry);
    return toHit(updatedEntry);
  }

  async set(input: PopularQueryCacheWriteInput): Promise<void> {
    if (!this.isEligibleForWrite(input)) {
      return;
    }

    const key = this.buildKey(input);
    const nowMs = this.now().getTime();
    const entry: PopularQueryCacheEntry = {
      key,
      answer: input.result.answer,
      recommendedProductIds: [...input.result.recommendedProductIds],
      fallbackUsed: input.result.fallbackUsed,
      fallbackReason: toCacheFallbackReason(input.result.fallbackReason),
      retrieval: {
        query: input.result.retrieval.query,
        baseQuery: input.result.retrieval.baseQuery,
        rewrittenQuery: input.result.retrieval.rewrittenQuery,
        queryRewriteStatus: input.result.retrieval.queryRewriteStatus,
        queryRewriteReason: input.result.retrieval.queryRewriteReason,
        retrievalStrategy: input.result.retrieval.retrievalStrategy,
        queryRewriteTimedOut: input.result.retrieval.queryRewriteTimedOut,
        candidateCount: input.result.retrieval.candidateCount,
        returnedProductIds: [...input.result.retrieval.returnedProductIds],
      },
      createdAtMs: nowMs,
      expiresAtMs: nowMs + this.ttlMs,
      hitCount: 0,
      modelVersion: input.modelVersion,
      promptVersion: input.promptVersion,
      dataVersion: input.dataVersion,
      visibleBoundary: input.visibleBoundary,
    };

    this.entries.set(key, entry);
    this.pruneOverflow();
  }

  async delete(input: PopularQueryCacheReadInput): Promise<void> {
    this.entries.delete(this.buildKey(input));
  }

  isEligibleForRead(input: PopularQueryCacheReadInput): boolean {
    return isReusableQuestion(input.question)
      && input.shortHistory === undefined
      && !hasPersonalContext(input.contextMemory)
      && hasRequiredVersions(input);
  }

  isEligibleForWrite(input: PopularQueryCacheWriteInput): boolean {
    return this.isEligibleForRead(input)
      && SAFE_CACHEABLE_FALLBACK_REASONS.has(input.result.fallbackReason)
      && input.result.cartAction === undefined
      && input.result.clarification === undefined
      && input.result.answer.trim().length > 0
      && input.result.recommendedProductIds.every((productId) =>
        input.result.retrieval.returnedProductIds.includes(productId)
      );
  }

  buildKey(input: PopularQueryCacheReadInput): string {
    const payload = {
      normalizedQuery: normalizeQuery(input.question),
      normalizedRetrievalQuery: normalizeQuery(
        input.retrievalQuery ?? input.question,
      ),
      queryRewriteVersion: input.queryRewriteVersion ?? "none",
      filters: normalizeJson(input.filters ?? {}),
      topK: input.topK ?? null,
      maxRecommendedProducts: input.maxRecommendedProducts,
      modelVersion: input.modelVersion,
      promptVersion: input.promptVersion,
      dataVersion: input.dataVersion,
      visibleBoundary: input.visibleBoundary,
    };
    const hash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");

    return `popular-query:${hash}`;
  }

  private pruneOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;

      if (!oldestKey) {
        return;
      }

      this.entries.delete(oldestKey);
    }
  }
}

function toCacheFallbackReason(
  fallbackReason: RagChatResult["fallbackReason"],
): "NO_CANDIDATES" | undefined {
  return fallbackReason === "NO_CANDIDATES" ? "NO_CANDIDATES" : undefined;
}

export function createCacheHitResult(
  hit: PopularQueryCacheHit,
  products: Product[],
  productCards: RagChatResult["productCards"],
): RagChatResult {
  const activeProductIds = new Set(products.map((product) => product.id));
  const recommendedProductIds = hit.recommendedProductIds.filter((productId) =>
    activeProductIds.has(productId)
  );

  return {
    answer: hit.answer,
    recommendedProductIds,
    productCards,
    fallbackUsed: hit.fallbackUsed,
    fallbackReason: hit.fallbackReason,
    retrieval: {
      query: hit.retrieval.query,
      baseQuery: hit.retrieval.baseQuery,
      rewrittenQuery: hit.retrieval.rewrittenQuery,
      queryRewriteStatus: hit.retrieval.queryRewriteStatus,
      queryRewriteReason: hit.retrieval.queryRewriteReason,
      retrievalStrategy: "cache",
      candidateCount: hit.retrieval.candidateCount,
      returnedProductIds: recommendedProductIds,
    },
  };
}

function toHit(entry: PopularQueryCacheEntry): PopularQueryCacheHit {
  return {
    key: entry.key,
    answer: entry.answer,
    recommendedProductIds: [...entry.recommendedProductIds],
    fallbackUsed: entry.fallbackUsed,
    fallbackReason: entry.fallbackReason,
    retrieval: {
      query: entry.retrieval.query,
      baseQuery: entry.retrieval.baseQuery,
      rewrittenQuery: entry.retrieval.rewrittenQuery,
      queryRewriteStatus: entry.retrieval.queryRewriteStatus,
      queryRewriteReason: entry.retrieval.queryRewriteReason,
      retrievalStrategy: entry.retrieval.retrievalStrategy,
      queryRewriteTimedOut: entry.retrieval.queryRewriteTimedOut,
      candidateCount: entry.retrieval.candidateCount,
      returnedProductIds: [...entry.retrieval.returnedProductIds],
    },
    createdAt: new Date(entry.createdAtMs).toISOString(),
    expiresAt: new Date(entry.expiresAtMs).toISOString(),
    hitCount: entry.hitCount,
    modelVersion: entry.modelVersion,
    promptVersion: entry.promptVersion,
    dataVersion: entry.dataVersion,
  };
}

function hasRequiredVersions(input: PopularQueryCacheVersions): boolean {
  return input.modelVersion.trim().length > 0
    && input.promptVersion.trim().length > 0
    && input.dataVersion.trim().length > 0
    && input.visibleBoundary.trim().length > 0;
}

function hasPersonalContext(
  contextMemory: ChatContextMemorySummary | undefined,
): boolean {
  if (!contextMemory) {
    return false;
  }

  return Boolean(
    contextMemory.pendingClarification
      || contextMemory.lastIntent
      || contextMemory.lastRecommendedProductIds.length > 0
      || contextMemory.constraints.category
      || contextMemory.constraints.subCategory
      || contextMemory.constraints.brand
      || contextMemory.constraints.minPriceCents !== undefined
      || contextMemory.constraints.maxPriceCents !== undefined
      || contextMemory.constraints.preferenceTerms.length > 0
      || contextMemory.constraints.avoidTerms.length > 0,
  );
}

function isReusableQuestion(question: string): boolean {
  const normalized = normalizeQuery(question);

  return normalized.length > 0
    && !/(上一个|上个|刚才|第二个|第一个|第三个|这个|那个|它|再便宜|换一个)/u.test(normalized);
}

function normalizeQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("zh-CN");
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJson(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([entryKey, entryValue]) => [entryKey, normalizeJson(entryValue)]),
  );
}
