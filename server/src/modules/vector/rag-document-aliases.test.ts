import { describe, expect, it } from "vitest";
import type { Product } from "../products/product.types";
import { buildRagDocumentAliases } from "./rag-document-aliases";

describe("buildRagDocumentAliases", () => {
  it("adds narrow kitchen small-appliance aliases from product facts", () => {
    const aliases = buildRagDocumentAliases(createProduct({
      category: "家用电器",
      subCategory: "厨房小电",
      attributes: {
        使用场景: ["早餐制作", "一人食", "快手料理"],
        核心卖点: ["小容量", "宿舍友好"],
      },
      pros: ["小容量"],
      recommendWhen: ["适合炖汤"],
    }));

    expect(aliases).toEqual([
      "小家电",
      "小电器",
      "厨房电器",
      "一人食",
      "租房",
      "宿舍",
      "宿舍小电器",
      "省空间",
      "小容量",
    ]);
  });

  it("dedupes aliases and trims out empty values", () => {
    const aliases = buildRagDocumentAliases(createProduct({
      category: "美妆护肤",
      subCategory: "洁面",
      categoryPath: ["美妆护肤", "洁面"],
      visualTags: ["洁面", "洗面奶"],
      attributes: {
        skin_type: ["油皮"],
      },
    }));

    expect(aliases).toEqual([
      "洗面奶",
      "洁面乳",
      "洁面",
      "控油洁面",
      "油皮清洁",
    ]);
  });

  it("does not add unrelated category aliases", () => {
    const aliases = buildRagDocumentAliases(createProduct({
      category: "食品生活",
      subCategory: "饮料",
      categoryPath: ["食品生活", "饮料"],
      visualTags: ["饮料"],
      attributes: {
        口味: ["乌龙茶"],
      },
    }));

    expect(aliases).toEqual([]);
  });
});

function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p_test",
    status: "active",
    name: "测试商品",
    brand: "测试品牌",
    category: "家用电器",
    subCategory: "厨房小电",
    imagePath: null,
    imageCaption: null,
    currency: "CNY",
    basePriceCents: 10000,
    priceMinCents: 10000,
    priceMaxCents: 12000,
    marketingDescription: "",
    knowledgeText: "",
    ratingAvg: 4.5,
    categoryPath: ["家用电器", "厨房小电"],
    visualTags: ["家用电器", "厨房小电"],
    attributes: {},
    pros: [],
    cons: [],
    recommendWhen: [],
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
    skus: [],
    ...overrides,
  };
}
