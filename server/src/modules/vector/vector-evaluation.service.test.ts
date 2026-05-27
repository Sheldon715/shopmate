import { describe, expect, it } from "vitest";
import {
  evaluateSingleCase,
  evaluateVectorSearchCases,
} from "./vector-evaluation.service";
import type {
  VectorEvaluationCase,
  VectorEvaluationProductSnapshot,
} from "./vector-evaluation.types";
import type { VectorSearchHit } from "./vector-search.types";

const GENERATED_AT = "2026-05-27T00:00:00.000Z";

describe("evaluateSingleCase", () => {
  it("passes when a hit matches the expected category and product id", () => {
    const hit = createHit();
    const result = evaluateSingleCase({
      evaluationCase: createCase({
        passCriteria: {
          description: "exact product",
          requireExpectedProductId: true,
        },
      }),
      hits: [hit],
      productsById: new Map([[hit.productId, createProductSnapshot(hit)]]),
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.failureReasons).toEqual([]);
    expect(result.hits[0]).toMatchObject({
      doc_id: "p_beauty_011::description",
      product_id: "p_beauty_011",
      score: 0.91,
      snippet: "温和清洁洁面",
    });
  });

  it("marks wrong_category when top-k misses the expected category", () => {
    const hit = createHit({
      productId: "p_digital_001",
      category: "数码电子",
      subCategory: "智能手机",
    });
    const result = evaluateSingleCase({
      evaluationCase: createCase({
        expectedProductIdsAny: [],
        filters: { category: "美妆护肤" },
      }),
      hits: [hit],
      productsById: new Map([[hit.productId, createProductSnapshot(hit)]]),
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(false);
    expect(result.failureReasons).toContain("wrong_category");
  });

  it("marks budget_violation when a hit is outside maxPriceCents", () => {
    const hit = createHit({
      productId: "p_digital_007",
      category: "数码电子",
      subCategory: "真无线耳机",
      priceMinCents: 149900,
      priceMaxCents: 169900,
    });
    const result = evaluateSingleCase({
      evaluationCase: createCase({
        filters: {
          category: "数码电子",
          subCategory: "真无线耳机",
          maxPriceCents: 20000,
        },
        expectedCategory: "数码电子",
        expectedSubCategory: "真无线耳机",
        expectedProductIdsAny: [],
      }),
      hits: [hit],
      productsById: new Map([[hit.productId, createProductSnapshot(hit)]]),
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(false);
    expect(result.failureReasons).toContain("budget_violation");
  });

  it("marks stale_hit when PostgreSQL lookup cannot find an active product", () => {
    const hit = createHit();
    const result = evaluateSingleCase({
      evaluationCase: createCase(),
      hits: [hit],
      productsById: new Map(),
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(false);
    expect(result.failureReasons).toContain("stale_hit");
  });

  it("passes an expected no result case when there are no hits", () => {
    const result = evaluateSingleCase({
      evaluationCase: createCase({
        expectedNoResult: true,
        expectedProductIdsAny: [],
        filters: {
          category: "服饰运动",
          subCategory: "跑步鞋",
          maxPriceCents: 50000,
        },
      }),
      hits: [],
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.failureReasons).toEqual([]);
    expect(result.notes).toContain("Expected no vector result and none were returned.");
  });

  it("fails an expected no result case when hits are returned", () => {
    const hit = createHit();
    const result = evaluateSingleCase({
      evaluationCase: createCase({
        expectedNoResult: true,
        expectedProductIdsAny: [],
      }),
      hits: [hit],
      productsById: new Map([[hit.productId, createProductSnapshot(hit)]]),
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(false);
    expect(result.failureReasons).toContain("unexpected_result");
  });
});

describe("evaluateVectorSearchCases", () => {
  it("uses the injected search runner and product lookup", async () => {
    const hit = createHit();
    const results = await evaluateVectorSearchCases({
      cases: [createCase()],
      search: async () => [hit],
      productLookup: async () =>
        new Map([[hit.productId, createProductSnapshot(hit)]]),
      generatedAt: GENERATED_AT,
    });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it("records search errors without calling external services in tests", async () => {
    const results = await evaluateVectorSearchCases({
      cases: [createCase()],
      search: async () => {
        throw new Error("search unavailable");
      },
      generatedAt: GENERATED_AT,
    });

    expect(results[0].passed).toBe(false);
    expect(results[0].failureReasons).toEqual(["unexpected_result"]);
    expect(results[0].notes[0]).toContain("search unavailable");
  });

  it("preserves hits when PostgreSQL product lookup fails", async () => {
    const hit = createHit();
    const results = await evaluateVectorSearchCases({
      cases: [createCase()],
      search: async () => [hit],
      productLookup: async () => {
        throw new Error("postgres auth failed");
      },
      generatedAt: GENERATED_AT,
    });

    expect(results[0].passed).toBe(false);
    expect(results[0].hits).toHaveLength(1);
    expect(results[0].failureReasons).toContain("unexpected_result");
    expect(results[0].notes[0]).toContain("postgres auth failed");
  });
});

function createCase(
  overrides: Partial<VectorEvaluationCase> = {},
): VectorEvaluationCase {
  return {
    caseId: "oil-skin-cleanser",
    query: "推荐一款适合油皮的洗面奶",
    filters: {
      category: "美妆护肤",
      subCategory: "洁面",
      availableOnly: true,
    },
    expectedCategory: "美妆护肤",
    expectedSubCategory: "洁面",
    expectedProductIdsAny: ["p_beauty_011"],
    expectedNoResult: false,
    passCriteria: {
      description: "top-k should hit cleanser",
      minMatchingHits: 1,
    },
    ...overrides,
  };
}

function createHit(
  overrides: Partial<{
    productId: string;
    category: string;
    subCategory: string | null;
    priceMinCents: number;
    priceMaxCents: number;
    available: boolean;
    tags: string[];
    avoidWhen: string[];
  }> = {},
): VectorSearchHit {
  const productId = overrides.productId ?? "p_beauty_011";

  return {
    docId: `${productId}::description`,
    productId,
    score: 0.91,
    snippet: "温和清洁洁面",
    metadata: {
      docType: "description",
      category: overrides.category ?? "美妆护肤",
      subCategory: overrides.subCategory ?? "洁面",
      brand: "珊珂",
      tags: overrides.tags ?? ["美妆护肤", "洁面"],
      recommendWhen: ["日常护理"],
      avoidWhen: overrides.avoidWhen ?? [],
      blockType: null,
      priceMinCents: overrides.priceMinCents ?? 5200,
      priceMaxCents: overrides.priceMaxCents ?? 6900,
      available: overrides.available ?? true,
      embeddingModel: "fake",
      embeddingDimensions: 8,
      ingestBatchId: "batch_001",
    },
  };
}

function createProductSnapshot(
  hit: VectorSearchHit,
): VectorEvaluationProductSnapshot {
  return {
    productId: hit.productId,
    status: "active",
    category: hit.metadata.category,
    subCategory: hit.metadata.subCategory,
    priceMinCents: hit.metadata.priceMinCents,
    priceMaxCents: hit.metadata.priceMaxCents,
    available: hit.metadata.available,
  };
}
