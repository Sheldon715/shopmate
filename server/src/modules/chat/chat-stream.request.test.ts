import { describe, expect, it } from "vitest";
import {
  ChatStreamRequestError,
  parseChatStreamRequestBody,
} from "./chat-stream.request";

describe("parseChatStreamRequestBody", () => {
  it("maps a valid request body to a RagChatRequest", () => {
    const request = parseChatStreamRequestBody({
      conversationId: "local-chat-session-1",
      message: "  recommend commuting headphones  ",
      history: [
        { role: "user", content: "  I care about battery life. " },
        { role: "assistant", content: "Look for lightweight models." },
      ],
      filters: {
        category: " Electronics ",
        subCategory: "Headphones",
        brand: "Demo",
        minPriceCents: 10000,
        maxPriceCents: 50000,
        availableOnly: true,
        tagsAny: [" wireless ", "commute"],
        avoidTerms: ["heavy"],
      },
      imageSearch: {
        mode: "vlm_first",
        confidence: "medium",
        visualQuery: " 黑色真无线蓝牙耳机 ",
        detectedCategory: " 数码电子 ",
      },
      topK: 8,
      maxRecommendedProducts: 3,
    });

    expect(request).toEqual({
      conversationId: "local-chat-session-1",
      question: "recommend commuting headphones",
      shortHistory: [
        { role: "user", content: "I care about battery life." },
        { role: "assistant", content: "Look for lightweight models." },
      ],
      filters: {
        category: "Electronics",
        subCategory: "Headphones",
        brand: "Demo",
        minPriceCents: 10000,
        maxPriceCents: 50000,
        availableOnly: true,
        tagsAny: ["wireless", "commute"],
        avoidTerms: ["heavy"],
      },
      imageSearch: {
        mode: "vlm_first",
        confidence: "medium",
        visualQuery: "黑色真无线蓝牙耳机",
        detectedCategory: "数码电子",
      },
      topK: 8,
      maxRecommendedProducts: 3,
    });
  });

  it("accepts image search metadata with a null detected category", () => {
    const request = parseChatStreamRequestBody({
      message: "图片找货：黑色耳机",
      imageSearch: {
        mode: "vlm_first",
        confidence: "high",
        visualQuery: "黑色耳机",
        detectedCategory: null,
      },
    });

    expect(request.imageSearch).toEqual({
      mode: "vlm_first",
      confidence: "high",
      visualQuery: "黑色耳机",
      detectedCategory: null,
    });
  });

  it("deduplicates and trims filter arrays", () => {
    const request = parseChatStreamRequestBody({
      message: "hello",
      filters: {
        tagsAny: [" wireless ", "wireless", "commute"],
        avoidTerms: [" heavy ", "heavy"],
      },
    });

    expect(request.filters).toEqual({
      tagsAny: ["wireless", "commute"],
      avoidTerms: ["heavy"],
    });
  });

  it("deduplicates and trims recent product ids", () => {
    const request = parseChatStreamRequestBody({
      message: "hello",
      recentProductIds: [" product_001 ", "product_002", "product_001"],
    });

    expect(request.recentProductIds).toEqual(["product_001", "product_002"]);
  });

  it("rejects invalid message values", () => {
    expect(() => parseChatStreamRequestBody({ message: "   " })).toThrow(
      ChatStreamRequestError,
    );
    expect(() =>
      parseChatStreamRequestBody({ message: "a".repeat(1001) })
    ).toThrow(ChatStreamRequestError);
  });

  it("accepts safe optional conversation ids and rejects unsafe values", () => {
    expect(parseChatStreamRequestBody({
      conversationId: "session_1.demo-2",
      message: "hello",
    }).conversationId).toBe("session_1.demo-2");

    expect(() =>
      parseChatStreamRequestBody({
        conversationId: "session/1",
        message: "hello",
      })
    ).toThrow(ChatStreamRequestError);

    expect(() =>
      parseChatStreamRequestBody({
        conversationId: "a".repeat(81),
        message: "hello",
      })
    ).toThrow(ChatStreamRequestError);
  });

  it("rejects invalid history entries", () => {
    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        history: [{ role: "system", content: "nope" }],
      })
    ).toThrow(ChatStreamRequestError);

    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        history: [
          { role: "user", content: "one" },
          { role: "assistant", content: "two" },
          { role: "user", content: "three" },
          { role: "assistant", content: "four" },
          { role: "user", content: "five" },
        ],
      })
    ).toThrow(ChatStreamRequestError);
  });

  it("rejects topK and maxRecommendedProducts outside allowed ranges", () => {
    expect(() =>
      parseChatStreamRequestBody({ message: "hello", topK: 0 })
    ).toThrow(ChatStreamRequestError);
    expect(() =>
      parseChatStreamRequestBody({ message: "hello", topK: 21 })
    ).toThrow(ChatStreamRequestError);
    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        maxRecommendedProducts: 0,
      })
    ).toThrow(ChatStreamRequestError);
    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        maxRecommendedProducts: 6,
      })
    ).toThrow(ChatStreamRequestError);
  });

  it("only accepts supported filter fields with valid types", () => {
    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        filters: { unknownField: true },
      })
    ).toThrow(ChatStreamRequestError);

    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        filters: { maxPriceCents: "50000" },
      })
    ).toThrow(ChatStreamRequestError);

    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        filters: { minPriceCents: 50000, maxPriceCents: 10000 },
      })
    ).toThrow(ChatStreamRequestError);
  });

  it("rejects oversized filter arrays and terms", () => {
    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        filters: {
          tagsAny: Array.from({ length: 13 }, (_, index) => `tag-${index}`),
        },
      })
    ).toThrow(ChatStreamRequestError);

    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        filters: {
          avoidTerms: ["a".repeat(81)],
        },
      })
    ).toThrow(ChatStreamRequestError);
  });

  it("rejects invalid recent product id arrays", () => {
    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        recentProductIds: Array.from(
          { length: 6 },
          (_, index) => `product_${index}`,
        ),
      })
    ).toThrow(ChatStreamRequestError);

    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        recentProductIds: ["a".repeat(81)],
      })
    ).toThrow(ChatStreamRequestError);

    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        recentProductIds: ["   "],
      })
    ).toThrow(ChatStreamRequestError);
  });

  it("rejects invalid image search metadata", () => {
    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        imageSearch: { mode: "raw_provider_response" },
      })
    ).toThrow(ChatStreamRequestError);

    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        imageSearch: {
          mode: "vlm_first",
          confidence: "medium",
          visualQuery: "hello",
          providerResponse: { unsafe: true },
        },
      })
    ).toThrow(ChatStreamRequestError);

    expect(() =>
      parseChatStreamRequestBody({
        message: "hello",
        imageSearch: {
          mode: "vlm_first",
          confidence: "medium",
          visualQuery: "",
        },
      })
    ).toThrow(ChatStreamRequestError);
  });
});
