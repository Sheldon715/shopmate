import { describe, expect, it } from "vitest";
import { LlmError } from "../llm/llm.error";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateRequest, LlmGenerateResponse } from "../llm/llm.types";
import type { Product } from "../products/product.types";
import type { VectorSearchHit } from "../vector/vector-search.types";
import type { RagProductReader, RagVectorSearchClient } from "./rag.service";
import { RagChatService } from "./rag.service";

describe("RagChatService", () => {
  it("runs vector search, PostgreSQL lookup, LLM JSON parsing, and product card mapping", async () => {
    const products = [
      createProduct({ id: "product_001", name: "PostgreSQL Product 1" }),
      createProduct({
        id: "product_002",
        name: "PostgreSQL Product 2",
        basePriceCents: 3200,
      }),
    ];
    const productReaderCalls: string[][] = [];
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new RagChatService({
      vectorSearch: createVectorSearch([
        createHit("product_001", { score: 0.91, snippet: "first snippet" }),
        createHit("product_001", { score: 0.72, snippet: "second snippet" }),
        createHit("product_002", { score: 0.82, snippet: "third snippet" }),
      ]),
      productReader: {
        findActiveByIds: async (productIds) => {
          productReaderCalls.push(productIds);
          return products;
        },
      },
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(
            JSON.stringify({
              answer: "Product 2 is the best match.",
              recommended_product_ids: ["product_002"],
            }),
          );
        },
      }),
      now: () => new Date("2026-05-27T00:00:00.000Z"),
    });

    const result = await service.answer({
      question: " recommend headphones ",
      shortHistory: [{ role: "user", content: "I like light products." }],
    });

    expect(productReaderCalls).toEqual([["product_001", "product_002"]]);
    expect(llmRequest?.responseFormat).toEqual({ type: "json_object" });
    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("first snippet");
    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("second snippet");
    expect(result).toMatchObject({
      answer: "Product 2 is the best match.",
      recommendedProductIds: ["product_002"],
      fallbackUsed: false,
      retrieval: {
        candidateCount: 2,
        returnedProductIds: ["product_002"],
      },
    });
    expect(result.productCards).toHaveLength(1);
    expect(result.productCards[0]).toMatchObject({
      id: "product_002",
      name: "PostgreSQL Product 2",
      priceCents: 3200,
    });
  });

  it("drops LLM product ids outside the retrieved allowlist", async () => {
    const service = createServiceWithProducts({
      llmText: JSON.stringify({
        answer: "Use product 1.",
        recommended_product_ids: ["product_999", "product_001"],
      }),
    });

    const result = await service.answer({ question: "recommend one" });

    expect(result.fallbackUsed).toBe(false);
    expect(result.recommendedProductIds).toEqual(["product_001"]);
    expect(result.productCards.map((card) => card.id)).toEqual(["product_001"]);
  });

  it("falls back to retrieval order when all LLM product ids are invalid", async () => {
    const service = createServiceWithProducts({
      llmText: JSON.stringify({
        answer: "Use another product.",
        recommended_product_ids: ["product_999"],
      }),
    });

    const result = await service.answer({ question: "recommend one" });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("NO_VALID_PRODUCT_IDS");
    expect(result.recommendedProductIds).toEqual([
      "product_001",
      "product_002",
    ]);
  });

  it("falls back to the first retrieved products when the LLM fails", async () => {
    const service = createServiceWithProducts({
      llmClient: new MockLlmClient({
        error: new LlmError("provider down", {
          code: "LLM_REQUEST_FAILED",
        }),
      }),
    });

    const result = await service.answer({
      question: "recommend one",
      maxRecommendedProducts: 1,
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("LLM_ERROR");
    expect(result.recommendedProductIds).toEqual(["product_001"]);
    expect(result.productCards).toHaveLength(1);
  });

  it("does not call product lookup or LLM when vector search has no candidates", async () => {
    let productLookupCalled = false;
    let llmCalled = false;
    const service = new RagChatService({
      vectorSearch: createVectorSearch([]),
      productReader: {
        findActiveByIds: async () => {
          productLookupCalled = true;
          return [];
        },
      },
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse("{}");
        },
      }),
    });

    const result = await service.answer({ question: "unknown request" });

    expect(productLookupCalled).toBe(false);
    expect(llmCalled).toBe(false);
    expect(result).toMatchObject({
      recommendedProductIds: [],
      productCards: [],
      fallbackUsed: true,
      fallbackReason: "NO_CANDIDATES",
    });
  });

  it("skips stale vector hits missing from active PostgreSQL products", async () => {
    let llmCalled = false;
    const service = new RagChatService({
      vectorSearch: createVectorSearch([createHit("stale_product")]),
      productReader: {
        findActiveByIds: async () => [],
      },
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse("{}");
        },
      }),
    });

    const result = await service.answer({ question: "recommend one" });

    expect(llmCalled).toBe(false);
    expect(result.fallbackReason).toBe("NO_CANDIDATES");
    expect(result.retrieval.candidateCount).toBe(0);
  });

  it("passes filters, topK, abortSignal, and requestId to downstream dependencies", async () => {
    const abortController = new AbortController();
    const vectorCalls: Array<Parameters<RagVectorSearchClient["search"]>[0]> = [];
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new RagChatService({
      vectorSearch: {
        search: async (input) => {
          vectorCalls.push(input);
          return [createHit("product_001")];
        },
      },
      productReader: createProductReader(),
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(
            JSON.stringify({
              answer: "Use product 1.",
              recommended_product_ids: ["product_001"],
            }),
          );
        },
      }),
    });

    await service.answer({
      question: "recommend one",
      filters: { category: "Skin Care", maxPriceCents: 5000 },
      topK: 7,
      requestId: "request_123",
      abortSignal: abortController.signal,
    });

    expect(vectorCalls).toEqual([
      {
        query: "recommend one",
        filters: { category: "Skin Care", maxPriceCents: 5000 },
        topK: 7,
        abortSignal: abortController.signal,
      },
    ]);
    expect(llmRequest?.requestId).toBe("request_123");
    expect(llmRequest?.abortSignal).toBe(abortController.signal);
  });

  it("uses invalid-output fallback for malformed LLM JSON", async () => {
    const service = createServiceWithProducts({ llmText: "{ nope" });

    const result = await service.answer({ question: "recommend one" });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("LLM_INVALID_OUTPUT");
    expect(result.recommendedProductIds).toEqual([
      "product_001",
      "product_002",
    ]);
  });
});

function createServiceWithProducts(input: {
  llmText?: string;
  llmClient?: MockLlmClient;
}): RagChatService {
  return new RagChatService({
    vectorSearch: createVectorSearch([
      createHit("product_001", { score: 0.91 }),
      createHit("product_002", { score: 0.82 }),
    ]),
    productReader: createProductReader(),
    llmClient: input.llmClient ?? new MockLlmClient({
      response: createLlmResponse(
        input.llmText
          ?? JSON.stringify({
            answer: "Use product 1.",
            recommended_product_ids: ["product_001"],
          }),
      ),
    }),
  });
}

function createVectorSearch(hits: VectorSearchHit[]): RagVectorSearchClient {
  return {
    search: async () => hits,
  };
}

function createProductReader(): RagProductReader {
  const products = [
    createProduct({ id: "product_001", name: "Product 1" }),
    createProduct({ id: "product_002", name: "Product 2" }),
  ];

  return {
    findActiveByIds: async (productIds) =>
      productIds.flatMap((productId) => {
        const product = products.find((item) => item.id === productId);

        return product ? [product] : [];
      }),
  };
}

function createLlmResponse(text: string): LlmGenerateResponse {
  return {
    text,
    model: "mock-llm",
    provider: "mock",
    finishReason: "stop",
    latencyMs: 0,
  };
}

function createHit(
  productId: string,
  overrides: Partial<VectorSearchHit> = {},
): VectorSearchHit {
  return {
    docId: `${productId}::description`,
    productId,
    score: 0.9,
    snippet: `${productId} snippet`,
    metadata: {
      docType: "description",
      category: "Skin Care",
      subCategory: "Sunscreen",
      brand: "Demo Brand",
      tags: ["SPF"],
      recommendWhen: ["commuting"],
      avoidWhen: ["fragrance sensitive"],
      blockType: null,
      priceMinCents: 1999,
      priceMaxCents: 2599,
      available: true,
      embeddingModel: "fake",
      embeddingDimensions: 4,
      ingestBatchId: "batch_001",
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
    skus: [
      {
        id: `${id}_sku_001`,
        productId: id,
        properties: { size: "standard" },
        priceCents: overrides.basePriceCents ?? 2199,
        currency: "CNY",
        available: true,
        stockLevel: "in_stock",
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}
