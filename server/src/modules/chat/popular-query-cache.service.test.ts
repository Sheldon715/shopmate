import { describe, expect, it } from "vitest";
import type { Product } from "../products/product.types";
import type { RagChatResult } from "./chat.types";
import {
  PopularQueryCacheService,
  createCacheHitResult,
} from "./popular-query-cache.service";
import {
  buildPopularQueryDataVersion,
  buildPopularQueryModelVersion,
} from "./popular-query-cache-version.service";

describe("PopularQueryCacheService", () => {
  it("canonicalizes query whitespace, case, and filter key order", () => {
    const cache = new PopularQueryCacheService();
    const baseInput = createReadInput({
      question: "  Recommend   SUNSCREEN  ",
      filters: {
        brand: "Demo",
        category: "Skin Care",
      },
    });
    const equivalentInput = createReadInput({
      question: "recommend sunscreen",
      filters: {
        category: "Skin Care",
        brand: "Demo",
      },
    });

    expect(cache.buildKey(baseInput)).toBe(cache.buildKey(equivalentInput));
  });

  it("changes the key when visible result boundaries change", () => {
    const cache = new PopularQueryCacheService();
    const baseInput = createReadInput();

    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({ ...baseInput, topK: 6 }),
    );
    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({ ...baseInput, maxRecommendedProducts: 5 }),
    );
    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({ ...baseInput, modelVersion: "other-model" }),
    );
    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({ ...baseInput, promptVersion: "rag-chat-v2" }),
    );
    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({ ...baseInput, dataVersion: "catalog-v2" }),
    );
    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({ ...baseInput, visibleBoundary: "locale=zh-CN" }),
    );
  });

  it("changes the key when any LLM lane model changes", () => {
    const cache = new PopularQueryCacheService();
    const baseInput = createReadInput({
      modelVersion: buildPopularQueryModelVersion({
        decisionPrimary: {
          enabled: true,
          provider: "openai",
          model: "gpt-5.4-mini",
        },
        decisionFallback: {
          enabled: true,
          provider: "openai",
          model: "gpt-5.4",
        },
        answer: {
          enabled: true,
          provider: "openai",
          model: "gpt-5.4-mini",
        },
      }),
    });

    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({
        ...baseInput,
        modelVersion: buildPopularQueryModelVersion({
          decisionPrimary: {
            enabled: true,
            provider: "openai",
            model: "gpt-5.4",
          },
          decisionFallback: {
            enabled: true,
            provider: "openai",
            model: "gpt-5.4",
          },
          answer: {
            enabled: true,
            provider: "openai",
            model: "gpt-5.4-mini",
          },
        }),
      }),
    );
    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({
        ...baseInput,
        modelVersion: buildPopularQueryModelVersion({
          decisionPrimary: {
            enabled: true,
            provider: "openai",
            model: "gpt-5.4-mini",
          },
          decisionFallback: {
            enabled: true,
            provider: "openai",
            model: "gpt-5.4-mini",
          },
          answer: {
            enabled: true,
            provider: "openai",
            model: "gpt-5.4-mini",
          },
        }),
      }),
    );
    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({
        ...baseInput,
        modelVersion: buildPopularQueryModelVersion({
          decisionPrimary: {
            enabled: true,
            provider: "openai",
            model: "gpt-5.4-mini",
          },
          decisionFallback: {
            enabled: true,
            provider: "openai",
            model: "gpt-5.4",
          },
          answer: {
            enabled: true,
            provider: "openai",
            model: "gpt-5.4",
          },
        }),
      }),
    );
  });

  it("changes the key when retrieval query or rewrite version changes", () => {
    const cache = new PopularQueryCacheService();
    const baseInput = createReadInput({
      question: "再便宜一点的有吗？",
      retrievalQuery: "真无线耳机 更便宜",
      queryRewriteVersion: "query-rewrite-v1",
    });

    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({
        ...baseInput,
        retrievalQuery: "真无线耳机 降噪",
      }),
    );
    expect(cache.buildKey(baseInput)).not.toBe(
      cache.buildKey({
        ...baseInput,
        queryRewriteVersion: "query-rewrite-v2",
      }),
    );
  });

  it("does not read personalized or temporary-context questions", () => {
    const cache = new PopularQueryCacheService();

    expect(cache.isEligibleForRead(createReadInput())).toBe(true);
    expect(cache.isEligibleForRead(createReadInput({
      question: "第二个也加进来",
    }))).toBe(false);
    expect(cache.isEligibleForRead(createReadInput({
      shortHistory: [{ role: "user", content: "之前说的预算 200" }],
    }))).toBe(false);
    expect(cache.isEligibleForRead(createReadInput({
      contextMemory: {
        conversationId: "chat-1",
        lastIntent: "推荐蓝牙耳机",
        constraints: {
          preferenceTerms: [],
          avoidTerms: [],
        },
        lastRecommendedProductIds: [],
      },
    }))).toBe(false);
    expect(cache.isEligibleForRead(createReadInput({
      contextMemory: {
        conversationId: "chat-1",
        constraints: {
          category: "数码电子",
          preferenceTerms: [],
          avoidTerms: [],
        },
        lastRecommendedProductIds: [],
      },
    }))).toBe(false);
  });

  it("writes and expires safe cache hits", async () => {
    let nowMs = Date.parse("2026-06-01T00:00:00.000Z");
    const cache = new PopularQueryCacheService({
      now: () => new Date(nowMs),
      ttlMs: 1000,
    });
    const input = createReadInput();

    await cache.set({
      ...input,
      result: createResult(),
    });

    const firstHit = await cache.get(input);
    expect(firstHit).toMatchObject({
      answer: "Use Product 1.",
      recommendedProductIds: ["product_001"],
      fallbackUsed: false,
      hitCount: 1,
    });

    nowMs += 1001;
    expect(await cache.get(input)).toBeNull();
  });

  it("does not write unsafe fallback or cart results", async () => {
    const cache = new PopularQueryCacheService();
    const input = createReadInput();

    await cache.set({
      ...input,
      result: createResult({
        fallbackUsed: true,
        fallbackReason: "LLM_ERROR",
      }),
    });
    expect(await cache.get(input)).toBeNull();

    await cache.set({
      ...input,
      result: createResult({
        cartAction: {
          type: "add",
          status: "success",
          productId: "product_001",
          productName: "Product 1",
          quantity: 1,
          message: "added",
        },
      }),
    });
    expect(await cache.get(input)).toBeNull();
  });

  it("allows safe no-candidates results", async () => {
    const cache = new PopularQueryCacheService();
    const input = createReadInput();

    await cache.set({
      ...input,
      result: createResult({
        answer: "库里暂时没有匹配商品。",
        recommendedProductIds: [],
        productCards: [],
        fallbackUsed: true,
        fallbackReason: "NO_CANDIDATES",
        retrieval: {
          candidateCount: 0,
          returnedProductIds: [],
        },
      }),
    });

    expect(await cache.get(input)).toMatchObject({
      answer: "库里暂时没有匹配商品。",
      fallbackUsed: true,
      fallbackReason: "NO_CANDIDATES",
    });
  });

  it("rebuilds cache hit results from active products and product cards", () => {
    const product = createProduct({ id: "product_001" });
    const result = createCacheHitResult(
      {
        key: "popular-query:test",
        answer: "Use Product 1.",
        recommendedProductIds: ["product_001"],
        fallbackUsed: false,
        retrieval: {
          query: "真无线耳机 更便宜",
          baseQuery: "再便宜一点的有吗？",
          rewrittenQuery: "真无线耳机 更便宜",
          queryRewriteStatus: "rewritten",
          queryRewriteReason: "短追问补全检索目标",
          retrievalStrategy: "original_query",
          queryRewriteTimedOut: true,
          candidateCount: 2,
          returnedProductIds: ["product_001"],
        },
        createdAt: "2026-06-01T00:00:00.000Z",
        expiresAt: "2026-06-01T00:20:00.000Z",
        hitCount: 1,
        modelVersion: "mock-llm",
        promptVersion: "rag-chat-v1",
        dataVersion: "catalog-v1",
      },
      [product],
      [{
        id: "product_001",
        name: "Product 1",
        brand: "Demo",
        category: "Skin Care",
        subCategory: "Sunscreen",
        priceCents: 2199,
        priceRangeCents: { min: 1999, max: 2599 },
        currency: "CNY",
        imagePath: "/images/product_001.png",
        ratingAvg: 4.5,
        tags: ["SPF"],
        available: true,
      }],
    );

    expect(result).toMatchObject({
      answer: "Use Product 1.",
      recommendedProductIds: ["product_001"],
      fallbackUsed: false,
      retrieval: {
        query: "真无线耳机 更便宜",
        baseQuery: "再便宜一点的有吗？",
        rewrittenQuery: "真无线耳机 更便宜",
        queryRewriteStatus: "rewritten",
        queryRewriteReason: "短追问补全检索目标",
        retrievalStrategy: "cache",
        candidateCount: 2,
        returnedProductIds: ["product_001"],
      },
    });
    expect(result.retrieval).not.toHaveProperty("queryRewriteTimedOut");
    expect(result.productCards).toHaveLength(1);
  });
});

describe("buildPopularQueryDataVersion", () => {
  it("returns an empty version when either RAG manifest is unavailable", () => {
    expect(buildPopularQueryDataVersion(undefined, {
      embedding_model: "fake",
      embedding_dimensions: 4,
      ingest_batch_id: "batch_001",
      generated_at: "2026-06-01T00:00:00.000Z",
    })).toBe("");

    expect(buildPopularQueryDataVersion({
      data_version: "v1",
      ingest_batch_id: "batch_001",
      generated_at: "2026-06-01T00:00:00.000Z",
    }, undefined)).toBe("");
  });

  it("combines document and vector manifest fields when both are available", () => {
    expect(buildPopularQueryDataVersion({
      data_version: "v1",
      ingest_batch_id: "batch_001",
      generated_at: "2026-06-01T00:00:00.000Z",
    }, {
      embedding_model: "fake",
      embedding_dimensions: 4,
      ingest_batch_id: "batch_001",
      generated_at: "2026-06-01T00:10:00.000Z",
    })).toBe(
      "v1|batch_001|2026-06-01T00:00:00.000Z|fake|4|batch_001|2026-06-01T00:10:00.000Z",
    );
  });
});

function createReadInput(overrides: Partial<Parameters<PopularQueryCacheService["buildKey"]>[0]> = {}) {
  return {
    question: "recommend sunscreen",
    maxRecommendedProducts: 3,
    modelVersion: "mock-llm",
    promptVersion: "rag-chat-v1",
    dataVersion: "catalog-v1",
    visibleBoundary: "locale=zh-CN|currency=CNY|imageBase=local",
    ...overrides,
  };
}

function createResult(overrides: Partial<RagChatResult> = {}): RagChatResult {
  return {
    answer: "Use Product 1.",
    recommendedProductIds: ["product_001"],
    productCards: [],
    fallbackUsed: false,
      retrieval: {
        query: "真无线耳机 更便宜",
        baseQuery: "再便宜一点的有吗？",
        rewrittenQuery: "真无线耳机 更便宜",
        queryRewriteStatus: "rewritten",
        queryRewriteReason: "短追问补全检索目标",
        candidateCount: 2,
        returnedProductIds: ["product_001"],
      },
    ...overrides,
  };
}

function createProduct(overrides: Partial<Product> = {}): Product {
  const id = overrides.id ?? "product_001";

  return {
    id,
    status: "active",
    name: "Demo Product",
    brand: "Demo Brand",
    category: "Skin Care",
    subCategory: "Sunscreen",
    imagePath: `/images/${id}.png`,
    imageCaption: "Product image",
    currency: "CNY",
    basePriceCents: 2199,
    priceMinCents: 1999,
    priceMaxCents: 2599,
    marketingDescription: "A lightweight product for daily use.",
    knowledgeText: "Knowledge text.",
    ratingAvg: 4.5,
    categoryPath: ["Skin Care", "Sunscreen"],
    visualTags: ["SPF"],
    attributes: { skin_type: ["oily"] },
    pros: ["lightweight"],
    cons: ["small bottle"],
    recommendWhen: ["commuting"],
    avoidWhen: ["fragrance sensitive"],
    compareWith: [],
    reviewSummary: {},
    contentBlocks: [],
    officialFaq: [],
    userReviews: [],
    normalizedPayload: {},
    sourceDataset: "demo",
    sourceVersion: "v1",
    sourceType: "synthetic_desensitized",
    dataVersion: "v1",
    isDesensitized: true,
    ingestBatchId: "batch_001",
    sourcePath: "data/raw/demo.json",
    skus: [],
    ...overrides,
  };
}
