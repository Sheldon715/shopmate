import { describe, expect, it } from "vitest";
import {
  normalizeLlmText,
  parseJsonObject,
  stripCodeFence,
  tryParseJsonObject,
} from "./llm-output-utils";

describe("llm-output-utils", () => {
  it("strips optional json code fences", () => {
    expect(stripCodeFence("```json\n{\"answer\":\"ok\"}\n```")).toBe(
      "{\"answer\":\"ok\"}",
    );
    expect(stripCodeFence(" plain text ")).toBe("plain text");
  });

  it("parses only JSON objects", () => {
    expect(parseJsonObject("{\"answer\":\"ok\"}")).toEqual({
      answer: "ok",
    });
    expect(() => parseJsonObject("[1,2]")).toThrow(
      "LLM output must be a JSON object.",
    );
    expect(tryParseJsonObject("{ nope")).toBeUndefined();
  });

  it("normalizes and truncates short LLM text", () => {
    expect(normalizeLlmText("  这  是\n回答  ", { maxChars: 20 })).toBe(
      "这 是 回答",
    );
    expect(
      normalizeLlmText("一二三四五", {
        maxChars: 3,
        truncateSuffix: "？",
      }),
    ).toBe("一二三？");
  });
});
