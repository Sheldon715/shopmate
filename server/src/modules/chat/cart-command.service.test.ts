import { describe, expect, it } from "vitest";
import type { Product } from "../products/product.types";
import { CartCommandService } from "./cart-command.service";

describe("CartCommandService", () => {
  it("creates cart command detections from LLM intent target and quantity", () => {
    const service = new CartCommandService();

    expect(service.createDetection({
      question: "把第二个加进去",
      quantity: 2,
      target: { kind: "ordinal", index: 2 },
    })).toMatchObject({
      isCartCommand: true,
      quantity: 2,
      target: { kind: "ordinal", index: 2 },
    });
    expect(service.createDetection({
      question: "把这个加到购物车",
      target: { kind: "deictic" },
    })).toMatchObject({
      isCartCommand: true,
      quantity: 1,
      target: { kind: "deictic" },
    });
    expect(service.createDetection({
      question: "把小米那款加进去",
      target: { kind: "name", text: "小米那款" },
    })).toMatchObject({
      isCartCommand: true,
      target: { kind: "name", text: "小米那款" },
    });
  });

  it("falls back to deterministic parsing only after LLM intent confirmed cart add", () => {
    const service = new CartCommandService();

    expect(service.createDetection({
      question: "第一个也是",
      target: { kind: "unknown" },
    })).toMatchObject({
      isCartCommand: true,
      quantity: 1,
      target: { kind: "ordinal", index: 1 },
    });
    expect(service.createDetection({
      question: "第二个加 2 件",
      target: { kind: "unknown" },
    })).toMatchObject({
      isCartCommand: true,
      quantity: 2,
      target: { kind: "ordinal", index: 2 },
    });
    expect(service.createDetection({
      question: "把第2个加进去",
      target: { kind: "unknown" },
    })).toMatchObject({
      isCartCommand: true,
      quantity: 1,
      target: { kind: "ordinal", index: 2 },
    });
    expect(service.createDetection({
      question: "加入购物车",
      target: { kind: "unknown" },
    })).toMatchObject({
      isCartCommand: true,
      quantity: 1,
      target: { kind: "unknown" },
    });
    expect(service.createDetection({
      question: "推荐加湿器",
      target: { kind: "unknown" },
    })).toMatchObject({
      isCartCommand: true,
      quantity: 1,
      target: { kind: "unknown" },
    });
  });

  it("clamps LLM quantity to cart limits", () => {
    const service = new CartCommandService();

    expect(service.createDetection({
      question: "把第一个加 120 件",
      quantity: 120,
      target: { kind: "ordinal", index: 1 },
    })).toMatchObject({
      quantity: 99,
      target: { kind: "ordinal", index: 1 },
    });
    expect(service.createDetection({
      question: "把第一个加进去",
      quantity: 0,
      target: { kind: "ordinal", index: 1 },
    })).toMatchObject({
      quantity: 1,
      target: { kind: "ordinal", index: 1 },
    });
  });

  it("resolves ordinal, deictic, and name targets against recent products", () => {
    const service = new CartCommandService();
    const products = [
      createProduct({ id: "product_001", name: "索尼降噪耳机" }),
      createProduct({ id: "product_002", name: "小米通勤耳机", brand: "小米" }),
    ];

    expect(service.resolveTarget({
      detection: {
        isCartCommand: true,
        quantity: 1,
        target: { kind: "ordinal", index: 2 },
      },
      products,
    })).toMatchObject({
      status: "found",
      product: { id: "product_002" },
    });
    expect(service.resolveTarget({
      detection: {
        isCartCommand: true,
        quantity: 1,
        target: { kind: "deictic" },
      },
      products: [products[0]],
    })).toMatchObject({
      status: "found",
      product: { id: "product_001" },
    });
    expect(service.resolveTarget({
      detection: {
        isCartCommand: true,
        quantity: 1,
        target: { kind: "name", text: "小米那款" },
      },
      products,
    })).toMatchObject({
      status: "found",
      product: { id: "product_002" },
    });
  });

  it("returns missing, ambiguous, or not_found without guessing", () => {
    const service = new CartCommandService();
    const products = [
      createProduct({ id: "product_001", name: "索尼降噪耳机" }),
      createProduct({ id: "product_002", name: "小米通勤耳机" }),
    ];

    expect(service.resolveTarget({
      detection: {
        isCartCommand: true,
        quantity: 1,
        target: { kind: "deictic" },
      },
      products: [],
    })).toEqual({ status: "missing" });
    expect(service.resolveTarget({
      detection: {
        isCartCommand: true,
        quantity: 1,
        target: { kind: "deictic" },
      },
      products,
    })).toEqual({ status: "ambiguous" });
    expect(service.resolveTarget({
      detection: {
        isCartCommand: true,
        quantity: 1,
        target: { kind: "unknown" },
      },
      products,
    })).toEqual({ status: "ambiguous" });
    expect(service.resolveTarget({
      detection: {
        isCartCommand: true,
        quantity: 1,
        target: { kind: "ordinal", index: 3 },
      },
      products,
    })).toEqual({ status: "not_found" });
  });
});

function createProduct(overrides: Partial<Product> = {}): Product {
  const id = overrides.id ?? "product_001";

  return {
    id,
    status: "active",
    name: "Demo Product",
    brand: "Demo Brand",
    category: "数码电子",
    subCategory: "真无线耳机",
    imagePath: `/images/${id}.png`,
    imageCaption: "Product image",
    currency: "CNY",
    basePriceCents: 19900,
    priceMinCents: 19900,
    priceMaxCents: 21900,
    marketingDescription: "适合通勤。",
    knowledgeText: "通勤蓝牙耳机",
    ratingAvg: 4.5,
    categoryPath: ["数码电子", "真无线耳机"],
    visualTags: ["通勤", "蓝牙"],
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
    sourceVersion: "test",
    sourceType: "test",
    dataVersion: "test",
    isDesensitized: true,
    ingestBatchId: "test",
    sourcePath: "test",
    skus: [
      {
        id: `${id}-sku-1`,
        productId: id,
        properties: {},
        priceCents: 19900,
        currency: "CNY",
        available: true,
        stockLevel: "in_stock",
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}
