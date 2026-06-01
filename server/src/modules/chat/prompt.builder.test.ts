import { describe, expect, it } from "vitest";
import type { Product } from "../products/product.types";
import type { RetrievedProductContext } from "./chat.types";
import {
  MAX_SHORT_HISTORY_MESSAGES,
  buildRagPrompt,
} from "./prompt.builder";

describe("buildRagPrompt", () => {
  it("includes RAG facts, short history, snippets, and safety rules", () => {
    const longHistory = "x".repeat(600);
    const messages = buildRagPrompt({
      question: "I need a sunscreen for commuting.",
      generatedAt: new Date("2026-05-27T10:00:00.000Z"),
      contextMemory: {
        conversationId: "local-chat-session-1",
        lastIntent: "推荐防晒霜",
        constraints: {
          maxPriceCents: 50000,
          preferenceTerms: ["轻量"],
          avoidTerms: ["酒精"],
        },
        lastRecommendedProductIds: ["product_001"],
      },
      negativeConstraints: [
        {
          rawText: "不要含酒精",
          term: "酒精",
          kind: "ingredient",
          scope: "product",
          matchPolicy: "exclude_if_product_facts_conflict",
        },
      ],
      shortHistory: [
        { role: "user", content: "oldest message should be dropped" },
        { role: "assistant", content: "first kept answer" },
        { role: "user", content: longHistory },
        { role: "assistant", content: "third kept answer" },
        { role: "user", content: "latest kept question" },
      ],
      candidates: [createContext()],
    });
    const text = messages.map((message) => message.content).join("\n");

    expect(messages).toHaveLength(2);
    expect(text).toContain("2026-05-27");
    expect(text).toContain("synthetic");
    expect(text).toContain("curated demo catalog");
    expect(text).toContain("I need a sunscreen for commuting.");
    expect(text).toContain("当前会话记忆");
    expect(text).toContain("推荐防晒霜");
    expect(text).toContain("预算上限：500 元");
    expect(text).toContain("会话记忆只能辅助理解当前用户问题");
    expect(text).toContain("当前排除约束");
    expect(text).toContain("exclude_if_product_facts_conflict");
    expect(text).not.toContain("conversationId");
    expect(text).not.toContain("local-chat-session-1");
    expect(text).toContain("first kept answer");
    expect(text).toContain("latest kept question");
    expect(text).not.toContain("oldest message should be dropped");
    expect(text).not.toContain("x".repeat(501));
    expect(text).toContain("product_001");
    expect(text).toContain("Gentle SPF");
    expect(text).toContain("Demo Brand");
    expect(text).toContain("Skin Care");
    expect(text).toContain("lightweight sunscreen snippet");
    expect(text).toContain("不要编造价格");
    expect(text).toContain("候选列表外");
    expect(text).toContain("只输出 JSON object");
    expect(text).not.toContain("LLM_API_KEY");
    expect(text).not.toContain(".env");
  });

  it("keeps only the latest short history messages", () => {
    const messages = buildRagPrompt({
      question: "Recommend headphones.",
      shortHistory: Array.from({ length: 6 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `history_${index}`,
      })),
      candidates: [createContext()],
      generatedAt: new Date("2026-05-27T10:00:00.000Z"),
    });
    const text = messages.map((message) => message.content).join("\n");

    expect(text).not.toContain("history_0");
    expect(text).not.toContain("history_1");

    for (let index = 2; index < 2 + MAX_SHORT_HISTORY_MESSAGES; index += 1) {
      expect(text).toContain(`history_${index}`);
    }
  });
});

function createContext(): RetrievedProductContext {
  return {
    product: createProduct(),
    score: 0.91,
    snippets: [
      "lightweight sunscreen snippet",
      "commute and oily skin context",
    ],
    metadata: {
      docType: "description",
      category: "Skin Care",
      subCategory: "Sunscreen",
      brand: "Demo Brand",
      tags: ["SPF", "Lightweight"],
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
  };
}

function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product_001",
    status: "active",
    name: "Gentle SPF",
    brand: "Demo Brand",
    category: "Skin Care",
    subCategory: "Sunscreen",
    imagePath: "/images/product_001.png",
    imageCaption: "Bottle",
    currency: "CNY",
    basePriceCents: 2199,
    priceMinCents: 1999,
    priceMaxCents: 2599,
    marketingDescription: "A lightweight sunscreen for daily commuting.",
    knowledgeText: "Sunscreen knowledge text.",
    ratingAvg: 4.6,
    categoryPath: ["Skin Care", "Sunscreen"],
    visualTags: ["SPF", "Lightweight"],
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
        id: "sku_001",
        productId: "product_001",
        properties: { size: "50ml" },
        priceCents: 2199,
        currency: "CNY",
        available: true,
        stockLevel: "in_stock",
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}
