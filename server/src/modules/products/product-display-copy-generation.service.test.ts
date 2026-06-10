import { describe, expect, it } from "vitest";
import {
  ProductDisplayCopyGenerationOutputError,
  parseProductDisplayCopyOutput,
} from "./product-display-copy-generation.service";

describe("parseProductDisplayCopyOutput", () => {
  it("accepts valid generated card, detail, and highlight copy", () => {
    const copies = parseProductDisplayCopyOutput(
      JSON.stringify({
        products: [
          {
            product_id: "product_001",
            card_reason: "推荐理由：半入耳轻盈，通勤久戴不闷，通话也清楚。",
            detail_reason: "半入耳佩戴轻松，适合通勤和办公长时间使用，兼顾通话清晰度。",
            detail_highlights: [
              "半入耳佩戴轻松",
              "适合通勤办公",
              "通话清晰度更稳",
            ],
          },
        ],
      }),
      ["product_001"],
    );

    expect(copies.get("product_001")).toEqual({
      productId: "product_001",
      cardReason: "推荐理由：半入耳轻盈，通勤久戴不闷，通话也清楚。",
      detailReason: "半入耳佩戴轻松，适合通勤和办公长时间使用，兼顾通话清晰度。",
      detailHighlights: [
        "半入耳佩戴轻松",
        "适合通勤办公",
        "通话清晰度更稳",
      ],
    });
  });

  it("drops non-allowlisted ids, internal data notices, and weak template copy", () => {
    const copies = parseProductDisplayCopyOutput(
      JSON.stringify({
        products: [
          {
            product_id: "product_999",
            card_reason: "推荐理由：越权商品。",
          },
          {
            product_id: "product_001",
            card_reason: "推荐理由：配置清晰，适合参数比较。",
            detail_reason: "价格、SKU、评论和 FAQ 为比赛数据集模拟内容。",
            detail_highlights: [
              "SKU 选择较多",
              "通勤佩戴舒服",
            ],
          },
        ],
      }),
      ["product_001"],
    );

    expect(copies.get("product_999")).toBeUndefined();
    expect(copies.get("product_001")).toEqual({
      productId: "product_001",
      detailHighlights: ["通勤佩戴舒服"],
    });
  });

  it("rejects non-json output", () => {
    expect(() =>
      parseProductDisplayCopyOutput("not json", ["product_001"])
    ).toThrow(ProductDisplayCopyGenerationOutputError);
  });
});
