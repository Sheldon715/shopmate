import { describe, expect, it } from "vitest";
import {
  PRODUCT_QUERY_DEFAULT_LIMIT,
  PRODUCT_QUERY_MAX_OFFSET,
  ProductQueryError,
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
