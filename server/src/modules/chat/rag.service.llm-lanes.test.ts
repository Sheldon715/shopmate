import { describe, expect, it, vi } from "vitest";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateRequest } from "../llm/llm.types";
import type { Product } from "../products/product.types";
import type { VectorSearchHit } from "../vector/vector-search.types";
import { NO_NEGATIVE_CONSTRAINTS } from "./negative-constraint.types";
import { RagChatService, type RagChatServiceOptions } from "./rag.service";

const decisionRequests: LlmGenerateRequest[] = [];
const answerRequests: LlmGenerateRequest[] = [];

vi.mock("../llm/llm-lanes", () => ({
  createLlmLaneClients: () => ({
    decision: new MockLlmClient({
      handler: (request) => {
        decisionRequests.push(request);
        return createLlmResponse(JSON.stringify({
          should_rewrite: true,
          rewritten_query: "降噪蓝牙耳机",
          confidence: "high",
          reason: "补全检索词",
        }));
      },
    }),
    answer: new MockLlmClient({
      handler: (request) => {
        answerRequests.push(request);
        return createLlmResponse(JSON.stringify({
          answer: "这款降噪耳机更适合通勤。",
          recommended_product_ids: ["product_001"],
        }));
      },
    }),
  }),
  createLlmLaneMetadata: () => ({
    decisionPrimary: {
      enabled: true,
      provider: "test-provider",
      model: "decision-mini",
    },
    decisionFallback: {
      enabled: true,
      provider: "test-provider",
      model: "decision-strong",
    },
    answer: {
      enabled: true,
      provider: "test-provider",
      model: "answer-mini",
    },
  }),
}));

describe("RagChatService LLM lanes", () => {
  it("routes query decisions to the decision lane and RAG answers to the answer lane", async () => {
    decisionRequests.length = 0;
    answerRequests.length = 0;
    const searchedQueries: string[] = [];
    const service = new RagChatService(withNoNonRewriteDecisions({
      vectorSearch: {
        search: async (input) => {
          searchedQueries.push(input.query);
          return [createHit("product_001")];
        },
      },
      productReader: {
        findActiveByIds: async () => [createProduct()],
      },
      productDisplayCopyGenerator: {
        generate: async () => new Map(),
      },
    }));

    const result = await service.answer({
      question: "耳机推荐",
    });

    expect(searchedQueries).toContain("耳机推荐");
    expect(searchedQueries).toContain("降噪蓝牙耳机");
    expect(decisionRequests).toHaveLength(1);
    expect(decisionRequests[0]?.messages[0]?.content).toContain(
      "RAG 检索 query 改写器",
    );
    expect(answerRequests).toHaveLength(1);
    expect(answerRequests[0]?.messages[0]?.content).toContain(
      "ShopMate 的商品推荐助手",
    );
    expect(result).toMatchObject({
      answer: "这款降噪耳机更适合通勤。",
      recommendedProductIds: ["product_001"],
      fallbackUsed: false,
      retrieval: {
        llm: {
          decisionPrimary: {
            enabled: true,
            provider: "test-provider",
            model: "decision-mini",
          },
          decisionFallback: {
            enabled: true,
            provider: "test-provider",
            model: "decision-strong",
          },
          answer: {
            enabled: true,
            provider: "test-provider",
            model: "answer-mini",
          },
        },
      },
    });
  });
});

function withNoNonRewriteDecisions(
  options: RagChatServiceOptions,
): RagChatServiceOptions {
  return {
    ...options,
    cartCommandIntentService:
      options.cartCommandIntentService
      ?? {
        detect: async () => ({ isCartCommand: false }),
      },
    checkoutIntentService:
      options.checkoutIntentService
      ?? {
        detect: async () => ({ isCheckoutIntent: false }),
      },
    negativeConstraintIntentService:
      options.negativeConstraintIntentService
      ?? {
        detect: async () => NO_NEGATIVE_CONSTRAINTS,
      },
    clarificationIntentService:
      options.clarificationIntentService
      ?? {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
    comparisonIntentService:
      options.comparisonIntentService
      ?? {
        detect: async () => ({
          isComparison: false,
          confidence: "low",
          target: {
            kind: "unknown",
            ordinals: [],
            names: [],
          },
          needsClarification: false,
        }),
      },
  };
}

function createLlmResponse(text: string) {
  return {
    text,
    model: "test-model",
    provider: "test-provider",
    finishReason: "stop" as const,
    latencyMs: 1,
  };
}

function createHit(productId: string): VectorSearchHit {
  return {
    docId: `${productId}::profile`,
    productId,
    score: 0.91,
    snippet: "适合通勤的主动降噪蓝牙耳机。",
    metadata: {
      docType: "product_profile",
      category: "electronics",
      subCategory: "headphones",
      brand: "Acme",
      tags: ["noise-cancelling"],
      recommendWhen: ["commuting"],
      avoidWhen: [],
      freeFromTerms: [],
      riskTerms: [],
      wearingStyles: [],
      blockType: null,
      priceMinCents: 39900,
      priceMaxCents: 39900,
      available: true,
      embeddingModel: "fake",
      embeddingDimensions: 4,
      ingestBatchId: "batch_001",
    },
  };
}

function createProduct(): Product {
  return {
    id: "product_001",
    status: "active",
    name: "测试降噪耳机",
    brand: "Acme",
    category: "electronics",
    subCategory: "headphones",
    imagePath: null,
    imageCaption: null,
    marketingDescription: "适合通勤的主动降噪蓝牙耳机。",
    knowledgeText: "适合通勤的主动降噪蓝牙耳机。",
    basePriceCents: 39900,
    priceMinCents: 39900,
    priceMaxCents: 39900,
    currency: "CNY",
    ratingAvg: 4.8,
    categoryPath: ["electronics", "headphones"],
    visualTags: ["noise-cancelling"],
    attributes: { feature: ["noise-cancelling"] },
    pros: ["降噪稳"],
    cons: [],
    recommendWhen: ["commuting"],
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
    sourcePath: "test",
    skus: [
      {
        id: "product_001_sku",
        productId: "product_001",
        properties: { color: "black" },
        priceCents: 39900,
        currency: "CNY",
        available: true,
        stockLevel: "in_stock",
        sortOrder: 0,
      },
    ],
  };
}
