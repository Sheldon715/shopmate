import { describe, expect, it } from "vitest";
import type { Product } from "../products/product.types";
import {
  buildNegativeFactVectorFilters,
  extractRagNegativeFactMetadata,
} from "./rag-negative-fact-metadata";

describe("extractRagNegativeFactMetadata", () => {
  it("maps explicit free-from alcohol evidence without adding risk terms", () => {
    const metadata = extractRagNegativeFactMetadata(createProduct({
      officialFaq: [
        {
          question: "敏感肌能用吗？",
          answer: "这款隔离露不含酒精、香精和parabens防腐剂。",
        },
      ],
    }));

    expect(metadata.freeFromTerms).toEqual(
      expect.arrayContaining(["酒精", "香精", "parabens"]),
    );
    expect(metadata.riskTerms).not.toContain("酒精");
  });

  it("maps alcohol sensitivity evidence to risk terms", () => {
    const metadata = extractRagNegativeFactMetadata(createProduct({
      avoidWhen: ["酒精敏感人群慎用"],
    }));

    expect(metadata.riskTerms).toEqual(
      expect.arrayContaining(["酒精", "酒精敏感"]),
    );
    expect(metadata.freeFromTerms).not.toContain("酒精");
  });

  it("maps semi-in-ear without also adding in-ear", () => {
    const metadata = extractRagNegativeFactMetadata(createProduct({
      attributes: {
        佩戴形态: ["半入耳式"],
      },
    }));

    expect(metadata.wearingStyles).toEqual(["semi_in_ear"]);
    expect(metadata.wearingStyles).not.toContain("in_ear");
  });
});

describe("buildNegativeFactVectorFilters", () => {
  it("canonicalizes user-facing negative terms for vector metadata filters", () => {
    expect(buildNegativeFactVectorFilters(["酒精", "入耳"])).toEqual({
      excludeRiskTerms: ["酒精"],
      excludeWearingStyles: ["in_ear"],
    });
  });
});

function createProduct(overrides: Partial<Product> = {}): Product {
  const id = overrides.id ?? "product_001";

  return {
    id,
    status: "active",
    name: "Demo Product",
    brand: "Demo Brand",
    category: "美妆护肤",
    subCategory: "防晒",
    imagePath: `/images/${id}.png`,
    imageCaption: "Product image",
    currency: "CNY",
    basePriceCents: 2199,
    priceMinCents: 1999,
    priceMaxCents: 2599,
    marketingDescription: "适合日常通勤。",
    knowledgeText: "商品名:Demo Product",
    ratingAvg: 4.5,
    categoryPath: ["美妆护肤", "防晒"],
    visualTags: ["防晒"],
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
    sourceDataset: "demo",
    sourceVersion: "v1",
    sourceType: "synthetic_desensitized",
    dataVersion: "v1",
    isDesensitized: true,
    ingestBatchId: "batch_001",
    sourcePath: "data/raw/demo.json",
    skus: [],
    ...overrides,
  };
}
