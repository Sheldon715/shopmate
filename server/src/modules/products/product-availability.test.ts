import { describe, expect, it } from "vitest";
import { isProductAvailable } from "./product-availability";
import type { Product, ProductSku } from "./product.types";

describe("isProductAvailable", () => {
  it("requires an active product even when a SKU is available", () => {
    expect(isProductAvailable(productFixture({
      status: "inactive",
      skus: [skuFixture(true)],
    }))).toBe(false);
  });

  it("uses SKU availability for active products with SKUs", () => {
    expect(isProductAvailable(productFixture({
      skus: [skuFixture(false), skuFixture(true)],
    }))).toBe(true);
    expect(isProductAvailable(productFixture({
      skus: [skuFixture(false)],
    }))).toBe(false);
  });

  it("allows active products without SKU rows", () => {
    expect(isProductAvailable(productFixture({ skus: [] }))).toBe(true);
  });
});

function productFixture(
  overrides: Partial<Product> = {},
): Product {
  return {
    id: "product_001",
    status: "active",
    name: "测试商品",
    brand: "测试品牌",
    category: "测试品类",
    subCategory: null,
    imagePath: null,
    imageCaption: null,
    currency: "CNY",
    basePriceCents: 1000,
    priceMinCents: 1000,
    priceMaxCents: 1000,
    marketingDescription: "",
    knowledgeText: "",
    ratingAvg: null,
    categoryPath: [],
    visualTags: [],
    attributes: {},
    pros: [],
    cons: [],
    recommendWhen: [],
    avoidWhen: [],
    compareWith: [],
    reviewSummary: null,
    contentBlocks: null,
    officialFaq: null,
    userReviews: null,
    normalizedPayload: null,
    sourceDataset: "test",
    sourceVersion: "test",
    sourceType: "test",
    dataVersion: "test",
    isDesensitized: true,
    ingestBatchId: "batch_001",
    sourcePath: "test.json",
    skus: [],
    ...overrides,
  };
}

function skuFixture(available: boolean): ProductSku {
  return {
    id: available ? "sku_available" : "sku_unavailable",
    productId: "product_001",
    properties: {},
    priceCents: 1000,
    currency: "CNY",
    available,
    stockLevel: null,
    sortOrder: 0,
  };
}
