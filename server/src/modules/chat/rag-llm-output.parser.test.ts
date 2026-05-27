import { describe, expect, it } from "vitest";
import {
  RagLlmOutputParseError,
  parseRagLlmOutput,
} from "./rag-llm-output.parser";

describe("parseRagLlmOutput", () => {
  it("parses normal JSON output", () => {
    const parsed = parseRagLlmOutput(
      JSON.stringify({
        answer: "Pick product 1.",
        recommended_product_ids: ["product_001"],
      }),
      ["product_001", "product_002"],
    );

    expect(parsed).toEqual({
      answer: "Pick product 1.",
      recommendedProductIds: ["product_001"],
    });
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    const parsed = parseRagLlmOutput(
      [
        "```json",
        "{\"answer\":\"Pick product 2.\",\"recommended_product_ids\":[\"product_002\"]}",
        "```",
      ].join("\n"),
      ["product_001", "product_002"],
    );

    expect(parsed.recommendedProductIds).toEqual(["product_002"]);
  });

  it("rejects malformed JSON", () => {
    expect(() =>
      parseRagLlmOutput("{ answer: nope }", ["product_001"]),
    ).toThrow(RagLlmOutputParseError);
  });

  it("rejects an empty answer", () => {
    expect(() =>
      parseRagLlmOutput(
        JSON.stringify({
          answer: "   ",
          recommended_product_ids: ["product_001"],
        }),
        ["product_001"],
      ),
    ).toThrow(RagLlmOutputParseError);
  });

  it("filters blank, duplicate, and out-of-allowlist product ids", () => {
    const parsed = parseRagLlmOutput(
      JSON.stringify({
        answer: "Use the allowed products.",
        recommended_product_ids: [
          "",
          "product_001",
          "product_999",
          "product_001",
          " product_002 ",
        ],
      }),
      ["product_001", "product_002"],
    );

    expect(parsed.recommendedProductIds).toEqual([
      "product_001",
      "product_002",
    ]);
  });

  it("rejects non-array recommended_product_ids", () => {
    expect(() =>
      parseRagLlmOutput(
        JSON.stringify({
          answer: "Pick one.",
          recommended_product_ids: "product_001",
        }),
        ["product_001"],
      ),
    ).toThrow(RagLlmOutputParseError);
  });
});
