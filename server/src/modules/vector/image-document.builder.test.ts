import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProductImageDocuments,
  createProductImageDocument,
  detectSupportedImageMimeType,
  resolveImageFilePath,
} from "./image-document.builder";
import type { Product } from "../products/product.types";

describe("buildProductImageDocuments", () => {
  it("creates one stable image_main document per product image", async () => {
    const staticImageRoot = await mkdtemp(
      path.join(os.tmpdir(), "shopmate-image-docs-"),
    );
    await writeFile(
      path.join(staticImageRoot, "beauty-main.jpg"),
      Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    );

    const result = await buildProductImageDocuments([
      createProduct({ imagePath: "beauty-main.jpg" }),
    ], {
      staticImageRoot,
    });

    expect(result.skipped).toEqual([]);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      docId: "product:prod_cleanser_001:image:main",
      productId: "prod_cleanser_001",
      docType: "image_main",
      imagePath: "beauty-main.jpg",
      imageMimeType: "image/jpeg",
      visualTags: ["控油", "温和"],
      category: "美妆护肤",
      subCategory: "洁面",
      brand: "示例品牌",
      status: "active",
      available: true,
      priceMinCents: 19999,
      priceMaxCents: 21950,
    });
    expect(result.documents[0].visualCaption).toContain("洁面乳主图");
    expect(result.documents[0].imageHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("skips missing image path and missing files", async () => {
    const staticImageRoot = await mkdtemp(
      path.join(os.tmpdir(), "shopmate-image-docs-"),
    );

    const result = await buildProductImageDocuments([
      createProduct({ id: "missing_path", imagePath: null }),
      createProduct({ id: "missing_file", imagePath: "missing.jpg" }),
    ], {
      staticImageRoot,
    });

    expect(result.documents).toEqual([]);
    expect(result.skipped).toEqual([
      {
        productId: "missing_path",
        reason: "missing_image_path",
      },
      {
        productId: "missing_file",
        imagePath: "missing.jpg",
        reason: "missing_image_file",
      },
    ]);
  });
});

describe("createProductImageDocument", () => {
  it("does not use image vectors as product facts", () => {
    const document = createProductImageDocument({
      product: createProduct(),
      imagePath: "beauty-main.jpg",
      imageMimeType: "image/jpeg",
      imageHash: "abc123",
    });

    expect(document.visualCaption).toContain("商品名: 清透控油洁面乳");
    expect(document.visualCaption).toContain("品牌: 示例品牌");
    expect(document.visualCaption).toContain("类目: 美妆护肤 / 洁面");
    expect(document.imageHash).toBe("abc123");
  });
});

describe("image path helpers", () => {
  it("detects supported image types by extension", () => {
    expect(detectSupportedImageMimeType("a.jpg")).toBe("image/jpeg");
    expect(detectSupportedImageMimeType("a.png")).toBe("image/png");
    expect(detectSupportedImageMimeType("a.webp")).toBe("image/webp");
    expect(detectSupportedImageMimeType("a.gif")).toBeUndefined();
  });

  it("rejects paths outside the configured image root", () => {
    expect(() =>
      resolveImageFilePath("C:/safe/root", "../escape.jpg")
    ).toThrow(/escapes/);
  });
});

function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod_cleanser_001",
    status: "active",
    name: "清透控油洁面乳",
    brand: "示例品牌",
    category: "美妆护肤",
    subCategory: "洁面",
    imagePath: "beauty-main.jpg",
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
        properties: {},
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
