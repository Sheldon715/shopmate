import { describe, expect, it } from "vitest";
import { buildProductRagDocuments } from "./rag-document.builder";
import type { Product } from "../products/product.types";

function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod_cleanser_001",
    status: "active",
    name: "清透控油洁面乳",
    brand: "示例品牌",
    category: "美妆护肤",
    subCategory: "洁面",
    imagePath: "beauty/prod_cleanser_001/main.png",
    imageCaption: "洁面乳主图",
    currency: "CNY",
    basePriceCents: 19999,
    priceMinCents: 19999,
    priceMaxCents: 21950,
    marketingDescription: "适合油皮的温和洁面乳。",
    knowledgeText: "商品名:清透控油洁面乳\n类目:美妆护肤",
    ratingAvg: 4.7,
    categoryPath: ["美妆护肤", "洁面"],
    visualTags: ["控油", "温和"],
    attributes: {
      skin_type: ["油皮", "混油"],
      texture: ["乳状"],
    },
    pros: ["清洁力温和", "控油"],
    cons: ["容量较小"],
    recommendWhen: ["油皮日常洁面"],
    avoidWhen: ["极干皮"],
    compareWith: ["prod_cleanser_002"],
    reviewSummary: {
      rating_avg: 4.7,
      positive_points: ["清爽"],
      negative_points: ["价格偏高"],
      common_complaints: ["容量较小"],
    },
    contentBlocks: [
      {
        block_id: "usage",
        block_type: "scenario",
        title: "使用场景",
        content: "适合早晚洁面。",
        keywords: ["洁面", "控油"],
      },
    ],
    officialFaq: [
      {
        question: "敏感肌能用吗？",
        answer: "建议先局部测试。",
      },
    ],
    userReviews: [
      {
        nickname: "demo_user",
        rating: 5,
        content: "洗后不紧绷。",
      },
    ],
    normalizedPayload: { product_id: "prod_cleanser_001" },
    sourceDataset: "ecommerce_agent_dataset_v3",
    sourceVersion: "v3",
    sourceType: "synthetic_desensitized",
    dataVersion: "catalog_v1",
    isDesensitized: true,
    ingestBatchId: "catalog_test_batch",
    sourcePath: "beauty/data/prod_cleanser_001.json",
    skus: [
      {
        id: "sku_cleanser_001",
        productId: "prod_cleanser_001",
        properties: { size: "150ml", texture: "乳状" },
        priceCents: 19999,
        currency: "CNY",
        available: true,
        stockLevel: "in_stock",
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

describe("buildProductRagDocuments", () => {
  it("generates stable document ids for each supported document type", () => {
    const documents = buildProductRagDocuments(createProduct());

    expect(documents.map((document) => document.docId)).toEqual([
      "prod_cleanser_001::content_block::usage",
      "prod_cleanser_001::faq::001",
      "prod_cleanser_001::description",
      "prod_cleanser_001::review_summary",
    ]);
    expect(documents.map((document) => document.docType)).toEqual([
      "content_block",
      "faq",
      "description",
      "review_summary",
    ]);
  });

  it("includes product context and synthetic/desensitized data disclosure in text", () => {
    const documents = buildProductRagDocuments(createProduct());

    for (const document of documents) {
      expect(document.text).toContain("商品名: 清透控油洁面乳");
      expect(document.text).toContain("品牌: 示例品牌");
      expect(document.text).toContain("类目: 美妆护肤 / 洁面");
      expect(document.text).toContain("价格参考: 199.99-219.50 CNY");
      expect(document.text).toContain("属性: skin_type:油皮、混油；texture:乳状");
      expect(document.text).toContain("适合: 油皮日常洁面");
      expect(document.text).toContain("不适合: 极干皮");
      expect(document.text).toContain("synthetic/desensitized");
      expect(document.text).toContain("PostgreSQL 回查");
    }
  });

  it("keeps provenance and debug metadata", () => {
    const [contentBlock] = buildProductRagDocuments(createProduct());

    expect(contentBlock.metadata).toMatchObject({
      productName: "清透控油洁面乳",
      status: "active",
      available: true,
      priceMinCents: 19999,
      priceMaxCents: 21950,
      sourceDataset: "ecommerce_agent_dataset_v3",
      sourceVersion: "v3",
      sourceType: "synthetic_desensitized",
      dataVersion: "catalog_v1",
      isDesensitized: true,
      ingestBatchId: "catalog_test_batch",
      sourcePath: "beauty/data/prod_cleanser_001.json",
      docType: "content_block",
      blockId: "usage",
      blockType: "scenario",
    });
    expect(contentBlock.metadata.documentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("adds product-level negative fact metadata to every document", () => {
    const documents = buildProductRagDocuments(createProduct({
      attributes: {
        佩戴形态: ["半入耳式"],
      },
      officialFaq: [
        {
          question: "敏感肌能用吗？",
          answer: "这款隔离露不含酒精，敏感肌建议先测试。",
        },
      ],
    }));

    expect(documents).not.toHaveLength(0);

    for (const document of documents) {
      expect(document.metadata.freeFromTerms).toContain("酒精");
      expect(document.metadata.riskTerms).not.toContain("酒精");
      expect(document.metadata.wearingStyles).toEqual(["semi_in_ear"]);
    }
  });

  it("does not generate documents for empty content", () => {
    const documents = buildProductRagDocuments(
      createProduct({
        marketingDescription: " ",
        contentBlocks: [
          {
            block_id: "empty",
            block_type: "scenario",
            title: " ",
            content: " ",
            keywords: [],
          },
        ],
        officialFaq: [{ question: " ", answer: " " }],
        reviewSummary: {},
      }),
    );

    expect(documents).toEqual([]);
  });
});
