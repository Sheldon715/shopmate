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
    marketingDescription:
      "清透控油洁面乳 是真实品牌 示例品牌 旗下的美妆护肤/洁面商品，本数据集保留真实品牌与产品名，便于后续查找对应商品图片和构建商品详情页。导购信息经过脱敏和结构化整理，主要卖点包括清洁力温和、控油，适合油皮日常洁面。价格、SKU、评论和 FAQ 为比赛数据集模拟内容，不代表实时售价或真实用户反馈。",
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
        block_id: "spec",
        block_type: "spec",
        title: "规格与价格",
        content: "清透控油洁面乳 属于美妆护肤/洁面，品牌为示例品牌，价格范围为 199.99-219.50 CNY，共 1 个 SKU。",
        keywords: ["规格", "价格", "SKU"],
      },
      {
        block_id: "selling",
        block_type: "selling_point",
        title: "商品详情介绍",
        content: "清透控油洁面乳 是美妆护肤/洁面下的商品详情页数据。它的核心特点包括清洁力温和、控油，适合油皮日常洁面。",
        keywords: ["详情页", "卖点", "商品介绍"],
      },
      {
        block_id: "usage",
        block_type: "scenario",
        title: "使用场景",
        content: "适合早晚洁面。",
        keywords: ["洁面", "控油"],
      },
      {
        block_id: "limits",
        block_type: "limitation",
        title: "限制与注意事项",
        content: "清透控油洁面乳 不太适合极干皮。购买前应注意：容量较小。",
        keywords: ["限制", "注意事项", "避坑"],
      },
      {
        block_id: "sku",
        block_type: "sku",
        title: "规格摘要",
        content: "清透控油洁面乳 当前包含 1 个 SKU，购买前应确认规格属性与实际需求一致。",
        keywords: ["SKU", "规格", "价格"],
      },
      {
        block_id: "visual",
        block_type: "visual",
        title: "图片信息",
        content: "清透控油洁面乳 的占位商品主图，用于开发阶段展示商品类型和标题。",
        keywords: ["图片", "外观", "视觉"],
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
      "prod_cleanser_001::product_profile",
      "prod_cleanser_001::product_specs::spec",
      "prod_cleanser_001::selling_points::selling",
      "prod_cleanser_001::use_cases::usage",
      "prod_cleanser_001::constraints::limits",
      "prod_cleanser_001::product_specs::sku",
      "prod_cleanser_001::faq::001",
      "prod_cleanser_001::reviews_summary",
    ]);
    expect(documents.map((document) => document.docType)).toEqual([
      "product_profile",
      "product_specs",
      "selling_points",
      "use_cases",
      "constraints",
      "product_specs",
      "faq",
      "reviews_summary",
    ]);
  });

  it("includes product context and cleaned natural language aliases in text", () => {
    const documents = buildProductRagDocuments(createProduct());

    for (const document of documents) {
      expect(document.text).toContain("商品: 清透控油洁面乳");
      expect(document.text).toContain("原始标题: 清透控油洁面乳");
      expect(document.text).toContain("品牌: 示例品牌");
      expect(document.text).toContain("类目: 美妆护肤 / 洁面");
      expect(document.text).toContain("属性: skin_type:油皮、混油；texture:乳状");
      expect(document.text).toContain("自然语言标签: 洗面奶、洁面乳、洁面、控油洁面、油皮清洁");
      expect(document.text).not.toContain("synthetic/desensitized");
      expect(document.text).not.toContain("本数据集保留真实品牌");
      expect(document.text).not.toContain("后续查找对应商品图片");
      expect(document.text).not.toContain("占位商品主图");
      expect(document.text).not.toContain("商品详情页数据");
    }

    expect(documents[0].text).toContain("价格: 199.99-219.50 CNY");
    expect(documents[1].text).toContain("价格参考: 199.99-219.50 CNY");
    expect(documents[1].text).toContain("适合: 油皮日常洁面");
    expect(documents[1].text).toContain("不适合: 极干皮");
  });

  it("keeps provenance and debug metadata", () => {
    const [, specDocument] = buildProductRagDocuments(createProduct());

    expect(specDocument.metadata).toMatchObject({
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
      docType: "product_specs",
      blockId: "spec",
      blockType: "spec",
    });
    expect(specDocument.metadata.tags).toEqual(["控油", "温和"]);
    expect(specDocument.metadata.documentHash).toMatch(/^[a-f0-9]{64}$/);
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

  it("still generates product profile for otherwise empty product content", () => {
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

    expect(documents.map((document) => document.docType)).toEqual([
      "product_profile",
    ]);
  });
});
