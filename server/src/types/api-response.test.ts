import { describe, expect, it } from "vitest";
import { fail, ok } from "./api-response";

describe("api response helpers", () => {
  it("wraps successful data", () => {
    const data = { id: "product_001", name: "控油洁面乳" };

    expect(ok(data)).toEqual({
      success: true,
      data,
    });
  });

  it("wraps stable error code and message", () => {
    expect(fail("PRODUCT_NOT_FOUND", "商品不存在")).toEqual({
      success: false,
      error: {
        code: "PRODUCT_NOT_FOUND",
        message: "商品不存在",
      },
    });
  });
});
