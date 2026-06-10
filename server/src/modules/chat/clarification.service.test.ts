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
      missingSlots: ["budget", "priority"],
    });
  });

  it("creates a clarification candidate for a terse broad category", () => {
    const decision = service.decide({
      question: "鞋",
    });

    expect(decision).toEqual({
      needsClarification: true,
      missingSlots: ["use_case", "priority", "budget"],
    });
  });

  it("creates a clarification candidate for broad running-shoe recommendation", () => {
    const decision = service.decide({
      question: "跑鞋推荐",
    });

    expect(decision).toEqual({
      needsClarification: true,
      missingSlots: ["use_case", "priority", "budget"],
    });
  });

  it.each([
    "跑鞋",
    "推荐一款跑步鞋",
    "运动鞋推荐",
    "帮我看看训练鞋",
    "想买真无线耳机",
    "降噪耳机有什么推荐",
  ])("creates a clarification candidate for broad paraphrase: %s", (question) => {
    const decision = service.decide({ question });

    expect(decision.needsClarification).toBe(true);
    expect(decision.missingSlots.length).toBeGreaterThan(0);
  });

  it("does not ask again when the question already has budget or priority", () => {
    expect(
      service.decide({
        question: "推荐 3000 元以内拍照好的手机",
      }).needsClarification,
    ).toBe(false);
  });

  it("does not count words inside the product category as filled preference slots", () => {
    expect(service.decide({ question: "推荐一款跑步鞋" })).toEqual({
      needsClarification: true,
      missingSlots: ["use_case", "priority", "budget"],
    });

    expect(service.decide({ question: "推荐跑鞋，日常慢跑用" }).needsClarification)
      .toBe(false);
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

  it("does not clarify broad category requests that already include explicit exclusion constraints", () => {
    expect(
      service.decide({
        question: "推荐无酒精防晒霜",
      }).needsClarification,
    ).toBe(false);

    expect(
      service.decide({
        question: "推荐防晒霜，不要酒精",
      }).needsClarification,
    ).toBe(false);
  });

  it("does not clarify when negative fact filters were already extracted", () => {
    expect(
      service.decide({
        question: "推荐防晒霜",
        filters: {
          category: "美妆护肤",
          subCategory: "防晒",
          excludeRiskTerms: ["酒精"],
        },
      }).needsClarification,
    ).toBe(false);
  });
});
