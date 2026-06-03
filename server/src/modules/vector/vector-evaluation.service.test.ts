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

  it("does not fail avoidTerms when a hit only has explicit free-from evidence", () => {
    const hit = createHit({
      productId: "p_beauty_006",
      subCategory: "防晒",
      snippet: "这款隔离露不含酒精、香精和 parabens 防腐剂。",
    });
    const result = evaluateSingleCase({
      evaluationCase: createCase({
        filters: {
          category: "美妆护肤",
          subCategory: "防晒",
          avoidTerms: ["酒精"],
          availableOnly: true,
        },
        expectedSubCategory: "防晒",
        expectedProductIdsAny: ["p_beauty_006"],
      }),
      hits: [hit],
      productsById: new Map([[
        hit.productId,
        createProductSnapshot(hit, {
          officialFaq: [
            {
              question: "有没有酒精成分？",
              answer: "这款隔离露不含酒精，敏感肌建议先测试。",
            },
          ],
        }),
      ]]),
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.failureReasons).toEqual([]);
  });

  it("fails avoidTerms when product facts contain explicit risk evidence", () => {
    const hit = createHit({
      productId: "p_beauty_010",
      subCategory: "防晒",
      snippet: "敏感肌使用前建议先测试。",
    });
    const result = evaluateSingleCase({
      evaluationCase: createCase({
        filters: {
          category: "美妆护肤",
          subCategory: "防晒",
          avoidTerms: ["酒精"],
          availableOnly: true,
        },
        expectedSubCategory: "防晒",
        expectedProductIdsAny: ["p_beauty_010"],
      }),
      hits: [hit],
      productsById: new Map([[
        hit.productId,
        createProductSnapshot(hit, {
          avoidWhen: ["酒精敏感人群慎用"],
        }),
      ]]),
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(false);
    expect(result.failureReasons).toContain("unexpected_result");
    expect(result.notes.join("\n")).toContain("avoidTerm \"酒精\" (strict_risk_fact)");
    expect(result.notes.join("\n")).toContain("p_beauty_010");
  });

  it("fails when a hit violates negative fact metadata filters", () => {
    const hit = createHit({
      productId: "p_digital_018",
      category: "数码电子",
      subCategory: "真无线耳机",
      riskTerms: ["酒精"],
      wearingStyles: ["in_ear"],
    });
    const result = evaluateSingleCase({
      evaluationCase: createCase({
        filters: {
          category: "数码电子",
          subCategory: "真无线耳机",
          availableOnly: true,
          excludeRiskTerms: ["酒精"],
          excludeWearingStyles: ["in_ear"],
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
    expect(result.notes.join("\n")).toContain("excludeRiskTerms \"酒精\"");
    expect(result.notes.join("\n")).toContain("excludeWearingStyles \"in_ear\"");
    expect(result.hits[0]).toMatchObject({
      riskTerms: ["酒精"],
      wearingStyles: ["in_ear"],
    });
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

  it("uses rewritten retrieval query and records rewrite metadata", async () => {
    const searchInputs: string[] = [];
    const hit = createHit();
    const results = await evaluateVectorSearchCases({
      cases: [createCase({
        query: "再便宜一点的有吗？",
      })],
      queryRewriter: async (input) => ({
        query: `${input.query} 真无线耳机 更便宜`,
        baseQuery: input.query,
        rewrittenQuery: `${input.query} 真无线耳机 更便宜`,
        status: "rewritten",
        reason: "短追问补全品类和价格偏好",
      }),
      search: async (input) => {
        searchInputs.push(input.query);
        return [hit];
      },
      productLookup: async () =>
        new Map([[hit.productId, createProductSnapshot(hit)]]),
      generatedAt: GENERATED_AT,
    });

    expect(searchInputs).toEqual(["再便宜一点的有吗？ 真无线耳机 更便宜"]);
    expect(results[0]).toMatchObject({
      query: "再便宜一点的有吗？",
      originalQuery: "再便宜一点的有吗？",
      baseRetrievalQuery: "再便宜一点的有吗？",
      retrievalQuery: "再便宜一点的有吗？ 真无线耳机 更便宜",
      queryRewriteStatus: "rewritten",
      queryRewriteReason: "短追问补全品类和价格偏好",
    });
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
    brand: string;
    snippet: string;
    category: string;
    subCategory: string | null;
    priceMinCents: number;
    priceMaxCents: number;
    available: boolean;
    tags: string[];
    avoidWhen: string[];
    freeFromTerms: string[];
    riskTerms: string[];
    wearingStyles: VectorSearchHit["metadata"]["wearingStyles"];
  }> = {},
): VectorSearchHit {
  const productId = overrides.productId ?? "p_beauty_011";

  return {
    docId: `${productId}::description`,
    productId,
    score: 0.91,
    snippet: overrides.snippet ?? "温和清洁洁面",
    metadata: {
      docType: "description",
      category: overrides.category ?? "美妆护肤",
      subCategory: overrides.subCategory ?? "洁面",
      brand: overrides.brand ?? "珊珂",
      tags: overrides.tags ?? ["美妆护肤", "洁面"],
      recommendWhen: ["日常护理"],
      avoidWhen: overrides.avoidWhen ?? [],
      freeFromTerms: overrides.freeFromTerms ?? [],
      riskTerms: overrides.riskTerms ?? [],
      wearingStyles: overrides.wearingStyles ?? [],
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
  overrides: Partial<VectorEvaluationProductSnapshot> = {},
): VectorEvaluationProductSnapshot {
  return {
    productId: hit.productId,
    status: "active",
    name: "Demo Product",
    brand: hit.metadata.brand,
    category: hit.metadata.category,
    subCategory: hit.metadata.subCategory,
    tags: hit.metadata.tags,
    recommendWhen: hit.metadata.recommendWhen,
    avoidWhen: hit.metadata.avoidWhen,
    freeFromTerms: hit.metadata.freeFromTerms,
    riskTerms: hit.metadata.riskTerms,
    wearingStyles: hit.metadata.wearingStyles,
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
    ...overrides,
  };
}
