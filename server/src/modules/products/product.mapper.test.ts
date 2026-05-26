import { describe, expect, it } from "vitest";
import type { NormalizedProduct } from "../../lib/catalog/types";
import {
  mapNormalizedProductToUpsertInput,
  mapProductToCardDto,
  mapProductToDetailDto,
  moneyToCents,
} from "./product.mapper";
import type { Product } from "./product.types";

function createNormalizedProduct(): NormalizedProduct {
  return {
    product_id: "prod_cleanser_001",
    status: "active",
    name: "清透控油洁面乳",
    brand: "示例品牌",
    category: "美妆护肤",
    sub_category: "洁面",
    category_path: ["美妆护肤", "洁面"],
    currency: "CNY",
    base_price: 199.99,
    price_range: [199.99, 219.5],
    image_path: "beauty/prod_cleanser_001/main.png",
    image_caption: "洁面乳主图",
    visual_tags: ["控油", "温和"],
    skus: [
      {
        sku_id: "sku_cleanser_001",
        properties: { size: "150ml", texture: "乳状" },
        price: 199.99,
        available: true,
        stock_level: "in_stock",
      },
    ],
    attributes: {
      skin_type: ["油皮", "混油"],
      texture: ["乳状"],
    },
    pros: ["清洁力温和", "控油"],
    cons: ["容量较小"],
    recommend_when: ["油皮日常洁面"],
    avoid_when: ["极干皮"],
    compare_with: ["prod_cleanser_002"],
    content_blocks: [
      {
        block_id: "usage",
        block_type: "usage",
        title: "使用场景",
        content: "适合早晚洁面。",
        keywords: ["洁面", "控油"],
      },
    ],
    review_summary: {
      rating_avg: 4.7,
      positive_points: ["清爽"],
      negative_points: ["价格偏高"],
      common_complaints: [],
    },
    marketing_description: "适合油皮的温和洁面乳。",
    official_faq: [
      {
        question: "敏感肌能用吗？",
        answer: "建议先局部测试。",
      },
    ],
    user_reviews: [
      {
        nickname: "demo_user",
        rating: 5,
        content: "洗后不紧绷。",
      },
    ],
    knowledge_text: "商品名:清透控油洁面乳\n类目:美妆护肤",
    source: {
      source_dataset: "ecommerce_agent_dataset_v3",
      source_version: "v3",
      source_type: "synthetic_desensitized",
      data_version: "catalog_v1",
      is_desensitized: true,
      ingest_batch_id: "catalog_test_batch",
      source_path: "beauty/data/prod_cleanser_001.json",
    },
  };
}

function createProduct(): Product {
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
      common_complaints: [],
    },
    contentBlocks: [
      {
        block_id: "usage",
        block_type: "usage",
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
  };
}

describe("moneyToCents", () => {
  it("converts decimal money values into cents", () => {
    expect(moneyToCents(199.99, "price")).toBe(19999);
  });

  it("rejects negative, NaN, and infinite values", () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => moneyToCents(value, "price")).toThrow(
        "price must be a non-negative finite number.",
      );
    }
  });
});

describe("mapNormalizedProductToUpsertInput", () => {
  it("maps price, SKU, source metadata, and JSONB fields", () => {
    const input = mapNormalizedProductToUpsertInput(createNormalizedProduct());

    expect(input.product).toMatchObject({
      id: "prod_cleanser_001",
      basePriceCents: 19999,
      priceMinCents: 19999,
      priceMaxCents: 21950,
      sourceDataset: "ecommerce_agent_dataset_v3",
      sourceVersion: "v3",
      sourceType: "synthetic_desensitized",
      dataVersion: "catalog_v1",
      isDesensitized: true,
      ingestBatchId: "catalog_test_batch",
      sourcePath: "beauty/data/prod_cleanser_001.json",
      attributes: {
        skin_type: ["油皮", "混油"],
        texture: ["乳状"],
      },
    });
    expect(input.product.normalizedPayload).toMatchObject({
      product_id: "prod_cleanser_001",
    });
    expect(input.skus).toEqual([
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
    ]);
  });
});

describe("mapProductToCardDto", () => {
  it("maps card fields and derives availability from SKUs", () => {
    const card = mapProductToCardDto(createProduct());

    expect(card).toEqual({
      id: "prod_cleanser_001",
      name: "清透控油洁面乳",
      brand: "示例品牌",
      category: "美妆护肤",
      subCategory: "洁面",
      priceCents: 19999,
      priceRangeCents: {
        min: 19999,
        max: 21950,
      },
      currency: "CNY",
      imagePath: "beauty/prod_cleanser_001/main.png",
      ratingAvg: 4.7,
      tags: ["控油", "温和"],
      available: true,
    });
  });
});

describe("mapProductToDetailDto", () => {
  it("keeps detail fields from the product model", () => {
    const product = createProduct();
    const detail = mapProductToDetailDto(product);

    expect(detail).toMatchObject({
      id: "prod_cleanser_001",
      marketingDescription: "适合油皮的温和洁面乳。",
      skus: product.skus,
      attributes: product.attributes,
      pros: product.pros,
      cons: product.cons,
      recommendWhen: product.recommendWhen,
      avoidWhen: product.avoidWhen,
      reviewSummary: product.reviewSummary,
      officialFaq: product.officialFaq,
      contentBlocks: product.contentBlocks,
    });
  });
});
