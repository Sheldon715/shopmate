import { describe, expect, it } from "vitest";
import type { Product } from "../products/product.types";
import type { RetrievedProductContext } from "./chat.types";
import { filterContextsByNegativeConstraints } from "./negative-constraint-filter";
import type { NegativeConstraint } from "./negative-constraint.types";

describe("filterContextsByNegativeConstraints", () => {
  it("filters excluded brands and products", () => {
    const contexts = [
      createContext({
        id: "product_001",
        brand: "安热沙",
        name: "安热沙金瓶防晒",
      }),
      createContext({
        id: "product_002",
        brand: "理肤泉",
        name: "理肤泉防晒乳",
      }),
    ];

    expect(filterContextsByNegativeConstraints(contexts, [
      createConstraint({
        term: "安热沙",
        kind: "brand",
        matchPolicy: "exclude_brand",
      }),
    ]).map((context) => context.product.id)).toEqual(["product_002"]);
  });

  it("filters conflict facts but keeps explicit free-from facts", () => {
    const contexts = [
      createContext({
        id: "product_with_alcohol_risk",
        avoidWhen: ["酒精敏感人群"],
        snippets: ["部分敏感肌可能对酒精敏感。"],
      }),
      createContext({
        id: "product_alcohol_free",
        marketingDescription: "这款隔离露不含酒精，适合日常通勤。",
        snippets: ["不含酒精、香精和 parabens 防腐剂。"],
      }),
    ];

    expect(filterContextsByNegativeConstraints(contexts, [
      createConstraint({
        term: "酒精",
        kind: "ingredient",
        matchPolicy: "exclude_if_product_facts_conflict",
      }),
    ]).map((context) => context.product.id)).toEqual([
      "product_alcohol_free",
    ]);
  });

  it("does not let free-from facts mask separate structured conflict facts", () => {
    const contexts = [
      createContext({
        id: "product_with_mixed_faq",
        officialFaq: [
          { answer: "这款防晒不含酒精。" },
          { answer: "部分敏感肌可能对酒精敏感。" },
        ],
      }),
    ];

    expect(filterContextsByNegativeConstraints(contexts, [
      createConstraint({
        term: "酒精",
        kind: "ingredient",
        matchPolicy: "exclude_if_product_facts_conflict",
      }),
    ])).toEqual([]);
  });

  it("keeps semi-in-ear products when the negative constraint only excludes in-ear", () => {
    const contexts = [
      createContext({
        id: "semi_in_ear_product",
        attributes: {
          佩戴形态: ["半入耳式"],
        },
      }),
      createContext({
        id: "in_ear_product",
        attributes: {
          佩戴形态: ["入耳式"],
        },
      }),
    ];

    expect(filterContextsByNegativeConstraints(contexts, [
      createConstraint({
        term: "入耳",
        kind: "feature",
        matchPolicy: "exclude_if_product_facts_conflict",
      }),
    ]).map((context) => context.product.id)).toEqual([
      "semi_in_ear_product",
    ]);
  });

  it("ignores clarification-only and price constraints", () => {
    const contexts = [createContext({ id: "product_001" })];

    expect(filterContextsByNegativeConstraints(contexts, [
      createConstraint({
        term: "太贵",
        kind: "price",
        matchPolicy: "needs_clarification",
      }),
    ])).toEqual(contexts);
  });
});

function createConstraint(
  overrides: Partial<NegativeConstraint>,
): NegativeConstraint {
  return {
    rawText: overrides.rawText ?? `不要${overrides.term ?? "示例"}`,
    term: overrides.term ?? "示例",
    kind: overrides.kind ?? "feature",
    scope: overrides.scope ?? "product",
    matchPolicy:
      overrides.matchPolicy ?? "exclude_if_product_facts_conflict",
  };
}

function createContext(
  overrides: Partial<Product> & { snippets?: string[] } = {},
): RetrievedProductContext {
  const product = createProduct(overrides);

  return {
    product,
    score: 0.9,
    snippets: overrides.snippets ?? [],
    metadata: {
      docType: "description",
      category: product.category,
      subCategory: product.subCategory,
      brand: product.brand,
      tags: product.visualTags,
      recommendWhen: product.recommendWhen,
      avoidWhen: product.avoidWhen,
      freeFromTerms: [],
      riskTerms: [],
      wearingStyles: [],
      blockType: null,
      priceMinCents: product.priceMinCents,
      priceMaxCents: product.priceMaxCents,
      available: true,
      embeddingModel: "fake",
      embeddingDimensions: 4,
      ingestBatchId: "batch_001",
    },
  };
}

function createProduct(
  overrides: Partial<Product> = {},
): Product {
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
    marketingDescription: "A lightweight product for daily use.",
    knowledgeText: "Knowledge text.",
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
