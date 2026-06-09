import { describe, expect, it } from "vitest";
import {
  createPostFilterTrace,
  createRagDebugTrace,
  sanitizeTraceTextForTest,
} from "./rag-debug-trace";
import type { Product } from "../products/product.types";
import type { VectorSearchHit } from "../vector/vector-search.types";

const GENERATED_AT = "2026-06-10T00:00:00.000Z";

describe("createRagDebugTrace", () => {
  it("captures vector search, product lookup, post-filter, and final selection", () => {
    const hit = createHit("p_beauty_011");
    const product = createProduct({ id: "p_beauty_011" });
    const trace = createRagDebugTrace({
      requestId: "req_001",
      generatedAt: GENERATED_AT,
      originalQuery: "推荐一款适合油皮的洗面奶",
      baseRetrievalQuery: "油皮 洗面奶",
      retrievalQuery: "油皮 洁面 控油",
      retrievalStrategy: "rewritten_query",
      queryRewriteStatus: "rewritten",
      queryRewriteReason: "补全洁面同义词",
      filters: {
        category: "美妆护肤",
        subCategory: "洁面",
        availableOnly: true,
      },
      negativeConstraints: [{
        rawText: "不要酒精",
        term: "酒精",
        kind: "ingredient",
        scope: "product",
        matchPolicy: "exclude_if_product_facts_conflict",
      }],
      vectorHits: [hit],
      vectorTopK: 20,
      products: [product],
      postFilter: createPostFilterTrace({
        beforeProductIds: ["p_beauty_011"],
        afterProductIds: ["p_beauty_011"],
        removedReason: "negative_constraint",
      }),
      finalSelection: {
        selectedProductIds: ["p_beauty_011"],
        productCardIds: ["p_beauty_011"],
        fallbackUsed: false,
        answer: "这款洁面适合油皮日常使用。",
      },
    });

    expect(trace).toMatchObject({
      requestId: "req_001",
      originalQuery: "推荐一款适合油皮的洗面奶",
      baseRetrievalQuery: "油皮 洗面奶",
      retrievalQuery: "油皮 洁面 控油",
      retrievalStrategy: "rewritten_query",
      queryRewriteStatus: "rewritten",
      failureType: "no_failure_detected",
      vectorSearch: {
        topK: 20,
        hitCount: 1,
      },
      productLookup: {
        requestedProductIds: ["p_beauty_011"],
        foundProductIds: ["p_beauty_011"],
        missingProductIds: [],
      },
      postFilter: {
        beforeCount: 1,
        afterCount: 1,
      },
      finalSelection: {
        selectedProductIds: ["p_beauty_011"],
        productCardIds: ["p_beauty_011"],
      },
    });
    expect(trace.vectorSearch.hits[0]).toMatchObject({
      rank: 1,
      docId: "p_beauty_011::description",
      productId: "p_beauty_011",
      snippet: "温和清洁，适合油皮。",
      metadata: {
        docType: "description",
        category: "美妆护肤",
        subCategory: "洁面",
      },
    });
  });

  it("redacts sensitive strings from trace text", () => {
    const trace = createRagDebugTrace({
      generatedAt: GENERATED_AT,
      originalQuery: "hello",
      baseRetrievalQuery: "hello",
      retrievalQuery: "hello",
      vectorTopK: 10,
      vectorError: new Error(
        "DATABASE_URL=postgresql://user:pass@example/db api_key=sk-secret123456789 token=abc.def",
      ),
      finalSelection: {
        answer: "Bearer abc.def.ghi should not leak",
      },
    });
    const serialized = JSON.stringify(trace);

    expect(serialized).not.toContain("postgresql://user:pass");
    expect(serialized).not.toContain("sk-secret123456789");
    expect(serialized).not.toContain("abc.def.ghi");
    expect(serialized).toContain("[REDACTED");
  });

  it("exposes text sanitizer for report tests", () => {
    expect(sanitizeTraceTextForTest("api_key=sk-testtoken000000"))
      .toContain("[REDACTED]");
  });
});

function createHit(productId: string): VectorSearchHit {
  return {
    docId: `${productId}::description`,
    productId,
    score: 0.91,
    snippet: "温和清洁，适合油皮。",
    metadata: {
      docType: "description",
      category: "美妆护肤",
      subCategory: "洁面",
      brand: "Demo Brand",
      tags: ["洁面"],
      recommendWhen: ["油皮日常清洁"],
      avoidWhen: [],
      freeFromTerms: [],
      riskTerms: [],
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
    name: "洁面乳",
    brand: "Demo Brand",
    category: "美妆护肤",
    subCategory: "洁面",
    imagePath: `/images/${id}.png`,
    imageCaption: null,
    currency: "CNY",
    basePriceCents: 5900,
    priceMinCents: 5200,
    priceMaxCents: 6900,
    marketingDescription: "适合油皮日常清洁。",
    knowledgeText: "洁面乳 控油 温和。",
    ratingAvg: 4.5,
    categoryPath: ["美妆护肤", "洁面"],
    visualTags: ["洁面"],
    attributes: {},
    pros: [],
    cons: [],
    recommendWhen: ["油皮日常清洁"],
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
