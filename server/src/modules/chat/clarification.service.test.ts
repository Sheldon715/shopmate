import { describe, expect, it } from "vitest";
import { ClarificationService } from "./clarification.service";

describe("ClarificationService", () => {
  const service = new ClarificationService();

  it("asks a mobile-friendly follow-up for a broad phone request", () => {
    const decision = service.decide({
      question: "推荐一款手机",
    });

    expect(decision).toEqual({
      needsClarification: true,
      question: "你更看重拍照、续航、预算还是性价比？告诉我一两个重点，我再帮你筛。",
      missingSlots: ["budget", "priority"],
    });
  });

  it("does not ask again when the question already has budget or priority", () => {
    expect(
      service.decide({
        question: "推荐 3000 元以内拍照好的手机",
      }).needsClarification,
    ).toBe(false);
  });

  it("does not ask when conversation memory already has usable constraints", () => {
    expect(
      service.decide({
        question: "那推荐手机",
        contextMemory: {
          conversationId: "local-chat-session-1",
          lastIntent: "推荐 3000 元以内拍照好的手机",
          constraints: {
            category: "数码电子",
            subCategory: "智能手机",
            maxPriceCents: 300000,
            preferenceTerms: ["拍照"],
            avoidTerms: [],
          },
          lastRecommendedProductIds: [],
        },
      }).needsClarification,
    ).toBe(false);
  });

  it("respects explicit broad recommendation requests", () => {
    expect(
      service.decide({
        question: "推荐手机，先给我几个看看",
      }).needsClarification,
    ).toBe(false);
  });
});
