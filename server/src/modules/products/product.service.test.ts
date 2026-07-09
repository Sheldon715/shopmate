import { describe, expect, it } from "vitest";
import {
  PRODUCT_QUERY_DEFAULT_LIMIT,
  PRODUCT_QUERY_MAX_OFFSET,
  ProductDetailCopyGenerationError,
  ProductQueryError,
  getProductDetail,
  parseProductIdParam,
  parseProductListQuery,
} from "./product.service";

describe("parseProductListQuery", () => {
  it("returns default limit and offset", () => {
    const query = parseProductListQuery({});

    expect(query.limit).toBe(PRODUCT_QUERY_DEFAULT_LIMIT);
    expect(query.offset).toBe(0);
  });

  it("rejects limit outside the allowed range", () => {
    expect(() => parseProductListQuery({ limit: "0" })).toThrow(
      ProductQueryError,
    );
    expect(() => parseProductListQuery({ limit: "51" })).toThrow(
      ProductQueryError,
    );
  });

  it("rejects offsets above the allowed range", () => {
    expect(() =>
      parseProductListQuery({ offset: String(PRODUCT_QUERY_MAX_OFFSET + 1) })
    ).toThrow(ProductQueryError);
  });

  it("rejects non-integer price params", () => {
    expect(() => parseProductListQuery({ minPriceCents: "199.5" })).toThrow(
      ProductQueryError,
    );
    expect(() => parseProductListQuery({ maxPriceCents: "abc" })).toThrow(
      ProductQueryError,
    );
  });

  it("rejects minPriceCents greater than maxPriceCents", () => {
    expect(() =>
      parseProductListQuery({
        minPriceCents: "20000",
        maxPriceCents: "10000",
      }),
    ).toThrow(ProductQueryError);
  });
});

describe("parseProductIdParam", () => {
  it("returns a trimmed product id", () => {
    expect(parseProductIdParam(" product_001 ")).toBe("product_001");
  });

  it("rejects empty product ids", () => {
    expect(() => parseProductIdParam("   ")).toThrow(ProductQueryError);
  });
});

describe("getProductDetail", () => {
  it("uses generated LLM detail copy for product detail recommendation content", async () => {
    const detail = await getProductDetail("p_beauty_006", {
      displayCopyGenerator: {
        generate: async () =>
          new Map([
            [
              "p_beauty_006",
              {
                productId: "p_beauty_006",
                cardReason: "推荐理由：卡片理由不应覆盖详情理由。",
                detailReason: "水感轻薄，SPF50+ PA++++，适合日常通勤防晒。",
                detailHighlights: [
                  "SPF50+ PA++++",
                  "水感轻薄不厚重",
                ],
                displayName: "欧莱雅水感防晒",
                displayTags: ["水感轻薄", "高倍防晒"],
                displaySpecs: [
                  { label: "防护", value: "SPF50+ PA++++" },
                  { label: "肤感", value: "水感轻薄" },
                  { label: "场景", value: "日常通勤" },
                  { label: "取舍", value: "户外暴晒看高阶款" },
                ],
                suitabilityText:
                  "适合想要清爽通勤防晒的人群，如果长时间户外暴晒，可以比较防水更强的款。",
              },
            ],
          ]),
      },
    });

    expect(detail.recommendationReason).toBe(
      "水感轻薄，SPF50+ PA++++，适合日常通勤防晒。",
    );
    expect(detail.recommendationHighlights).toEqual([
      "SPF50+ PA++++",
      "水感轻薄不厚重",
    ]);
    expect(detail.displayName).toBe("欧莱雅水感防晒");
    expect(detail.displayTags).toEqual(["水感轻薄", "高倍防晒"]);
    expect(detail.displaySpecs).toEqual([
      { label: "防护", value: "SPF50+ PA++++" },
      { label: "肤感", value: "水感轻薄" },
      { label: "场景", value: "日常通勤" },
      { label: "取舍", value: "户外暴晒看高阶款" },
    ]);
    expect(detail.suitabilityText).toContain("清爽通勤防晒");
  });

  it("fails explicitly when product detail LLM copy is missing", async () => {
    await expect(
      getProductDetail("p_beauty_006", {
        displayCopyGenerator: {
          generate: async () => new Map(),
        },
      }),
    ).rejects.toMatchObject({
      code: "PRODUCT_DETAIL_COPY_GENERATION_FAILED",
    } satisfies Partial<ProductDetailCopyGenerationError>);
  });

  it("fails explicitly when generated detail display fields are incomplete", async () => {
    await expect(
      getProductDetail("p_beauty_006", {
        displayCopyGenerator: {
          generate: async () =>
            new Map([
              [
                "p_beauty_006",
                {
                  productId: "p_beauty_006",
                  detailReason: "水感轻薄，适合通勤防晒。",
                  detailHighlights: ["水感轻薄"],
                  displayName: "欧莱雅水感防晒",
                  displayTags: ["水感轻薄"],
                  displaySpecs: [
                    { label: "肤感", value: "水感轻薄" },
                  ],
                  suitabilityText: "适合通勤防晒。",
                },
              ],
            ]),
        },
      }),
    ).rejects.toMatchObject({
      code: "PRODUCT_DETAIL_COPY_GENERATION_FAILED",
    } satisfies Partial<ProductDetailCopyGenerationError>);
  });
});
