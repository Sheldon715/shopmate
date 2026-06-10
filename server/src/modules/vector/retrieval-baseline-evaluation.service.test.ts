import { describe, expect, it } from "vitest";
import type { Product } from "../products/product.types";
import type { VectorSearchHit } from "./vector-search.types";
import {
  createRetrievalBaselineMarkdownReport,
  evaluateRetrievalBaseline,
  validateRetrievalBaselineCaseGroups,
} from "./retrieval-baseline-evaluation.service";
import type {
  RetrievalBaselineCaseGroup,
} from "./retrieval-baseline-evaluation.types";

const GENERATED_AT = "2026-06-10T00:00:00.000Z";

describe("evaluateRetrievalBaseline", () => {
  it("calculates expected hit metrics across paraphrase groups", async () => {
    const groups: RetrievalBaselineCaseGroup[] = [{
      caseId: "oil-skin-cleanser-paraphrases",
      capability: "paraphrase_consistency",
      queries: ["适合油皮的洗面奶", "混油皮日常洁面乳"],
      filters: {
        category: "美妆护肤",
        subCategory: "洁面",
        availableOnly: true,
      },
      expectedProductIdsAny: ["p_beauty_011"],
      expectedCategory: "美妆护肤",
      expectedSubCategory: "洁面",
      expectedNoResult: false,
    }];
    const result = await evaluateRetrievalBaseline({
      groups,
      generatedAt: GENERATED_AT,
      topK: 10,
      search: async (input) =>
        input.query.includes("混油皮")
          ? [createHit("p_other"), createHit("p_beauty_011")]
          : [createHit("p_beauty_011"), createHit("p_other")],
      productLookup: async (productIds) =>
        productIds.map((id) => createProduct({ id })),
    });

    expect(result.queryResults).toHaveLength(2);
    expect(result.metrics.recallAt5).toBe(1);
    expect(result.metrics.mrrAt10).toBeCloseTo(0.75);
    expect(result.metrics.paraphraseExpectedHitConsistency).toBe(1);
    expect(result.groupResults[0].candidateOverlapAt10).toBe(1);
    expect(result.traces[0].vectorSearch.hits[0].rank).toBe(1);
  });

  it("passes correct no-result cases and records data_missing failure type", async () => {
    const result = await evaluateRetrievalBaseline({
      groups: [{
        caseId: "cheap-earbuds-no-result-paraphrases",
        capability: "data_gap",
        queries: ["200以内蓝牙耳机"],
        filters: {
          category: "数码电子",
          subCategory: "真无线耳机",
          maxPriceCents: 20000,
          availableOnly: true,
        },
        expectedProductIdsAny: [],
        expectedNoResult: true,
      }],
      generatedAt: GENERATED_AT,
      search: async () => [],
      productLookup: async () => [],
    });

    expect(result.queryResults[0]).toMatchObject({
      passed: true,
      noResultCorrect: true,
      failureType: "data_missing",
    });
    expect(result.metrics.noResultAccuracy).toBe(1);
  });

  it("fails forbidden products and reports negative post-filter failure", async () => {
    const result = await evaluateRetrievalBaseline({
      groups: [{
        caseId: "alcohol-free-sunscreen-paraphrases",
        capability: "negative_constraint",
        queries: ["不含酒精防晒"],
        filters: {
          category: "美妆护肤",
          subCategory: "防晒",
          availableOnly: true,
        },
        expectedProductIdsAny: ["p_safe"],
        expectedNoResult: false,
        forbidden: {
          productIds: ["p_risky"],
          terms: ["酒精"],
        },
      }],
      generatedAt: GENERATED_AT,
      search: async () => [
        createHit("p_risky", {
          subCategory: "防晒",
          snippet: "酒精敏感人群慎用。",
        }),
      ],
      productLookup: async () => [
        createProduct({
          id: "p_risky",
          subCategory: "防晒",
          avoidWhen: ["酒精敏感人群慎用"],
          marketingDescription: "酒精敏感人群慎用。",
        }),
      ],
    });

    expect(result.queryResults[0].passed).toBe(false);
    expect(result.queryResults[0].failureType)
      .toBe("negative_post_filter_failure");
    expect(result.queryResults[0].negativeConstraintSatisfied).toBe(false);
    expect(result.traces[0].postFilter.removed[0]).toMatchObject({
      productId: "p_risky",
      reason: "forbidden_or_negative_constraint",
    });
  });

  it("records stale product lookup failures", async () => {
    const result = await evaluateRetrievalBaseline({
      groups: [{
        caseId: "stale-hit",
        capability: "category_retrieval",
        queries: ["洁面"],
        filters: { category: "美妆护肤" },
        expectedProductIdsAny: ["p_missing"],
        expectedNoResult: false,
      }],
      generatedAt: GENERATED_AT,
      search: async () => [createHit("p_missing")],
      productLookup: async () => [],
    });

    expect(result.queryResults[0].passed).toBe(false);
    expect(result.queryResults[0].staleProductIds).toEqual(["p_missing"]);
    expect(result.queryResults[0].failureType).toBe("product_lookup_failure");
    expect(result.metrics.staleHitRate).toBe(1);
  });

  it("writes a baseline-only markdown report with evidence file paths", async () => {
    const result = await evaluateRetrievalBaseline({
      groups: [{
        caseId: "oil-skin-cleanser-paraphrases",
        capability: "category_retrieval",
        queries: ["洁面"],
        filters: { category: "美妆护肤", subCategory: "洁面" },
        expectedProductIdsAny: ["p_beauty_011"],
        expectedNoResult: false,
      }],
      generatedAt: GENERATED_AT,
      search: async () => [createHit("p_beauty_011")],
      productLookup: async () => [createProduct({ id: "p_beauty_011" })],
    });
    const markdown = createRetrievalBaselineMarkdownReport(result, {
      resultJsonlPath: "../data/processed/rag/results.jsonl",
      traceJsonlPath: "../data/processed/rag/traces.jsonl",
    });

    expect(markdown).toContain("# RAG Tuning Report");
    expect(markdown).toContain("baseline-only");
    expect(markdown).toContain("../data/processed/rag/results.jsonl");
    expect(markdown).toContain("## 9. Next Recommended Spec");
  });
});

describe("validateRetrievalBaselineCaseGroups", () => {
  it("rejects undersized expanded baseline suites", async () => {
    await expect(validateRetrievalBaselineCaseGroups({
      groups: [createGroup()],
      minGroups: 2,
    })).rejects.toThrow("at least 2 case groups");
  });

  it("rejects duplicate case ids", async () => {
    await expect(validateRetrievalBaselineCaseGroups({
      groups: [
        createGroup({ caseId: "same-case" }),
        createGroup({ caseId: "same-case" }),
      ],
    })).rejects.toThrow("Duplicate baseline caseId");
  });

  it("rejects expected products on no-result cases", async () => {
    await expect(validateRetrievalBaselineCaseGroups({
      groups: [createGroup({
        expectedNoResult: true,
        expectedProductIdsAny: ["p_beauty_011"],
      })],
    })).rejects.toThrow("cannot set expectedNoResult");
  });

  it("rejects expected product ids that are not active", async () => {
    await expect(validateRetrievalBaselineCaseGroups({
      groups: [createGroup({
        expectedProductIdsAny: ["p_active", "p_missing"],
      })],
      productLookup: async (productIds) =>
        productIds.includes("p_active")
          ? [createProduct({ id: "p_active" })]
          : [],
    })).rejects.toThrow("p_missing");
  });
});

function createGroup(
  overrides: Partial<RetrievalBaselineCaseGroup> = {},
): RetrievalBaselineCaseGroup {
  return {
    caseId: "baseline-case",
    capability: "category_retrieval",
    queries: ["洁面", "洗面奶", "日常清洁", "温和洁面"],
    filters: { category: "美妆护肤" },
    expectedProductIdsAny: ["p_beauty_011"],
    expectedNoResult: false,
    ...overrides,
  };
}

function createHit(
  productId: string,
  overrides: Partial<{
    category: string;
    subCategory: string | null;
    snippet: string;
    riskTerms: string[];
  }> = {},
): VectorSearchHit {
  return {
    docId: `${productId}::description`,
    productId,
    score: 0.9,
    snippet: overrides.snippet ?? `${productId} snippet`,
    metadata: {
      docType: "description",
      category: overrides.category ?? "美妆护肤",
      subCategory: overrides.subCategory ?? "洁面",
      brand: "Demo Brand",
      tags: ["tag"],
      recommendWhen: ["日常使用"],
      avoidWhen: [],
      freeFromTerms: [],
      riskTerms: overrides.riskTerms ?? [],
      wearingStyles: [],
      blockType: null,
      priceMinCents: 5200,
      priceMaxCents: 6900,
      available: true,
      embeddingModel: "fake",
      embeddingDimensions: 4,
      ingestBatchId: "batch_001",
    },
  };
}

function createProduct(overrides: Partial<Product> = {}): Product {
  const id = overrides.id ?? "p_beauty_011";

  return {
    id,
    status: "active",
    name: "Demo Product",
    brand: "Demo Brand",
    category: "美妆护肤",
    subCategory: "洁面",
    imagePath: null,
    imageCaption: null,
    currency: "CNY",
    basePriceCents: 5900,
    priceMinCents: 5200,
    priceMaxCents: 6900,
    marketingDescription: "温和日常使用。",
    knowledgeText: "商品知识文本。",
    ratingAvg: 4.5,
    categoryPath: ["美妆护肤"],
    visualTags: ["tag"],
    attributes: {},
    pros: [],
    cons: [],
    recommendWhen: ["日常使用"],
    avoidWhen: [],
    compareWith: [],
    reviewSummary: {},
    contentBlocks: [],
    officialFaq: [],
    userReviews: [],
    normalizedPayload: {},
    sourceDataset: "test",
    sourceVersion: "v1",
    sourceType: "synthetic_desensitized",
    dataVersion: "v1",
    isDesensitized: true,
    ingestBatchId: "batch_001",
    sourcePath: "test.json",
    skus: [{
      id: `${id}_sku`,
      productId: id,
      properties: {},
      priceCents: 5900,
      currency: "CNY",
      available: true,
      stockLevel: "in_stock",
      sortOrder: 0,
    }],
    ...overrides,
  };
}
