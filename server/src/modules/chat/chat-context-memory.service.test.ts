import { describe, expect, it } from "vitest";
import { ChatContextMemoryStore } from "./chat-context-memory.store";
import { ChatContextMemoryService } from "./chat-context-memory.service";

describe("ChatContextMemoryService", () => {
  it("keeps no-memory requests compatible", () => {
    const service = new ChatContextMemoryService();

    const resolution = service.resolve({
      question: "帮我推荐跑鞋",
    });

    expect(resolution).toEqual({
      retrievalQuery: "帮我推荐跑鞋",
    });
    expect(service.commit(resolution, ["product_001"])).toBeUndefined();
  });

  it("stores intent, budget, preferences, and product ids without regex avoid terms", () => {
    const service = createService();

    const resolution = service.resolve({
      conversationId: "local-chat-session-1",
      question: "帮我推荐跑鞋，要轻量的，预算 500 以内，不要酒精",
    });
    const summary = service.commit(resolution, ["product_001", "product_001"]);

    expect(resolution.retrievalQuery).toContain("跑鞋");
    expect(resolution.retrievalQuery).toContain("轻量");
    expect(resolution.filters).toMatchObject({
      category: "服饰运动",
      subCategory: "跑步鞋",
      maxPriceCents: 50000,
    });
    expect(resolution.filters?.avoidTerms).toBeUndefined();
    expect(summary).toMatchObject({
      conversationId: "local-chat-session-1",
      lastIntent: "帮我推荐跑鞋，要轻量的，预算 500 以内，不要酒精",
      constraints: {
        category: "服饰运动",
        subCategory: "跑步鞋",
        maxPriceCents: 50000,
        preferenceTerms: ["轻量"],
        avoidTerms: [],
      },
      lastRecommendedProductIds: ["product_001"],
    });
  });

  it("uses previous intent on short follow-up turns", () => {
    const service = createService();

    service.commit(
      service.resolve({
        conversationId: "session-1",
        question: "帮我推荐跑鞋",
      }),
      ["shoe_001"],
    );

    const followUp = service.resolve({
      conversationId: "session-1",
      question: "要轻量的，预算 500 以内",
    });

    expect(followUp.retrievalQuery).toContain("帮我推荐跑鞋");
    expect(followUp.retrievalQuery).toContain("轻量");
    expect(followUp.filters).toMatchObject({
      category: "服饰运动",
      subCategory: "跑步鞋",
      maxPriceCents: 50000,
    });
  });

  it("stores terse broad category words as intent for clarification follow-ups", () => {
    const service = createService();

    const resolution = service.resolve({
      conversationId: "shoe-session",
      question: "鞋",
    });
    const summary = service.commit(resolution, [], {
      pendingClarification: {
        originalQuestion: "鞋",
        missingSlots: ["use_case", "priority", "budget"],
      },
    });

    expect(summary).toMatchObject({
      lastIntent: "鞋",
      constraints: {
        category: "服饰运动",
        preferenceTerms: [],
        avoidTerms: [],
      },
      pendingClarification: {
        originalQuestion: "鞋",
      },
    });
    expect(summary?.constraints.subCategory).toBeUndefined();
  });

  it("treats approximate budget wording as a soft ceiling", () => {
    const service = createService();

    const resolution = service.resolve({
      conversationId: "phone-session",
      question: "预算 3000 左右，拍照好一点",
    });

    expect(resolution.filters).toMatchObject({
      maxPriceCents: 330000,
    });
  });

  it("parses colloquial Chinese budget shorthand", () => {
    const service = createService();

    const shorthand = service.resolve({
      conversationId: "phone-session",
      question: "预算三千五左右，拍照好一点",
    });
    const exactWithZero = service.resolve({
      conversationId: "phone-session-2",
      question: "预算三千零五左右，拍照好一点",
    });
    const wanShorthand = service.resolve({
      conversationId: "phone-session-3",
      question: "预算一万二左右，拍照好一点",
    });

    expect(shorthand.filters).toMatchObject({
      maxPriceCents: 385000,
    });
    expect(exactWithZero.filters).toMatchObject({
      maxPriceCents: 330550,
    });
    expect(wanShorthand.filters).toMatchObject({
      maxPriceCents: 1320000,
    });
  });

  it("keeps strict budget wording as a hard ceiling", () => {
    const service = createService();

    const resolution = service.resolve({
      conversationId: "phone-session",
      question: "预算 3000 以内，拍照好一点",
    });

    expect(resolution.filters).toMatchObject({
      maxPriceCents: 300000,
    });
  });

  it("stores pending clarification metadata and clears it on the next normal commit", () => {
    const service = createService();
    const broadRequest = service.resolve({
      conversationId: "session-1",
      question: "推荐一款手机",
    });
    const clarificationSummary = service.commit(broadRequest, [], {
      pendingClarification: {
        originalQuestion: "推荐一款手机",
        missingSlots: ["budget", "priority"],
      },
    });

    expect(clarificationSummary?.pendingClarification).toEqual({
      originalQuestion: "推荐一款手机",
      missingSlots: ["budget", "priority"],
    });

    const answeredRequest = service.resolve({
      conversationId: "session-1",
      question: "预算 3000，拍照好一点",
    });
    const answeredSummary = service.commit(answeredRequest, ["phone_001"]);

    expect(answeredSummary?.pendingClarification).toBeUndefined();
    expect(answeredSummary?.lastIntent).toBe("推荐一款手机");
    expect(answeredSummary?.lastRecommendedProductIds).toEqual(["phone_001"]);
  });

  it("maps conversational product words to canonical catalog categories", () => {
    const service = createService();

    const headphones = service.resolve({
      conversationId: "headphones-session",
      question: "推荐通勤蓝牙耳机",
    });
    const snacks = service.resolve({
      conversationId: "snacks-session",
      question: "推荐零食",
    });
    const phone = service.resolve({
      conversationId: "phone-session",
      question: "推荐手机",
    });

    expect(headphones.filters).toMatchObject({
      category: "数码电子",
      subCategory: "真无线耳机",
    });
    expect(snacks.filters).toMatchObject({
      category: "食品饮料",
    });
    expect(phone.filters).toMatchObject({
      category: "数码电子",
      subCategory: "智能手机",
    });
  });

  it("clears stale subcategory memory when a new category has no subcategory", () => {
    const service = createService();

    service.commit(
      service.resolve({
        conversationId: "session-1",
        question: "帮我推荐跑鞋",
      }),
      ["shoe_001"],
    );
    const switched = service.resolve({
      conversationId: "session-1",
      question: "推荐零食",
    });

    expect(switched.filters).toMatchObject({
      category: "食品饮料",
    });
    expect(switched.filters?.subCategory).toBeUndefined();
  });

  it("does not leak memory between different conversation ids", () => {
    const service = createService();

    service.commit(
      service.resolve({
        conversationId: "running-session",
        question: "帮我推荐跑鞋",
      }),
      ["shoe_001"],
    );
    const other = service.resolve({
      conversationId: "phone-session",
      question: "预算 500 以内",
    });

    expect(other.retrievalQuery).not.toContain("跑鞋");
    expect(other.filters).toEqual({ maxPriceCents: 50000 });
  });

  it("lets explicit filters override memory defaults", () => {
    const service = createService();

    service.commit(
      service.resolve({
        conversationId: "session-1",
        question: "帮我推荐跑鞋，预算 500 以内",
      }),
      ["shoe_001"],
    );
    const followUp = service.resolve({
      conversationId: "session-1",
      question: "要轻量的",
      filters: {
        category: "数码电子",
        maxPriceCents: 30000,
      },
    });

    expect(followUp.filters).toMatchObject({
      category: "数码电子",
      maxPriceCents: 30000,
    });
    expect(followUp.filters?.subCategory).toBeUndefined();
  });

  it("uses remembered avoid terms as fact constraints on follow-up turns", () => {
    const service = createService();

    service.commit(
      service.applyNegativeConstraints(
        service.resolve({
          conversationId: "sunscreen-session",
          question: "推荐防晒霜，不要酒精",
        }),
        [createNegativeConstraint("酒精")],
      ),
      ["sunscreen_001"],
    );
    const followUp = service.resolve({
      conversationId: "sunscreen-session",
      question: "再给我几个看看",
    });

    expect(followUp.filters).toMatchObject({
      category: "美妆护肤",
      subCategory: "防晒",
      excludeRiskTerms: ["酒精"],
    });
    expect(followUp.filters?.avoidTerms).toBeUndefined();
    expect(followUp.negativeConstraints).toHaveLength(1);
    expect(followUp.contextMemory?.constraints.avoidTerms).toEqual(["酒精"]);
  });

  it("applies LLM-confirmed negative constraints to memory and fact filters", () => {
    const service = createService();
    const resolution = service.applyNegativeConstraints(
      service.resolve({
        conversationId: "negative-session",
        question: "推荐防晒霜，但不要含酒精的",
      }),
      [createNegativeConstraint("酒精")],
    );
    const summary = service.commit(resolution, ["sunscreen_001"]);

    expect(resolution.filters).toMatchObject({
      category: "美妆护肤",
      subCategory: "防晒",
      excludeRiskTerms: ["酒精"],
    });
    expect(resolution.filters?.avoidTerms).toBeUndefined();
    expect(resolution.negativeConstraints).toHaveLength(1);
    expect(summary?.constraints.avoidTerms).toEqual(["酒精"]);
  });

  it("preserves explicit avoid terms as fact constraints when applying LLM-confirmed constraints", () => {
    const service = createService();
    const resolution = service.applyNegativeConstraints(
      service.resolve({
        conversationId: "explicit-negative-session",
        question: "推荐防晒霜，但不要含酒精的",
        filters: {
          avoidTerms: ["香精"],
        },
      }),
      [createNegativeConstraint("酒精")],
    );

    expect(resolution.filters?.avoidTerms).toBeUndefined();
    expect(resolution.filters?.excludeRiskTerms).toEqual(
      expect.arrayContaining(["香精", "酒精"]),
    );
    expect(resolution.negativeConstraints?.map((constraint) => constraint.term))
      .toEqual(
      expect.arrayContaining(["香精", "酒精"]),
    );
    expect(resolution.negativeConstraints).toHaveLength(2);
    expect(resolution.contextMemory?.constraints.avoidTerms).toEqual(
      expect.arrayContaining(["香精", "酒精"]),
    );
  });

  it("turns LLM-confirmed wearing negative constraints into vector metadata filters", () => {
    const service = createService();
    const resolution = service.applyNegativeConstraints(
      service.resolve({
        conversationId: "wearing-session",
        question: "耳机不要入耳式",
      }),
      [{
        rawText: "不要入耳式",
        term: "入耳",
        kind: "feature",
        scope: "product",
        matchPolicy: "exclude_if_product_facts_conflict",
      }],
    );

    expect(resolution.filters).toMatchObject({
      category: "数码电子",
      subCategory: "真无线耳机",
      excludeWearingStyles: ["in_ear"],
    });
    expect(resolution.filters?.avoidTerms).toBeUndefined();
  });

  it("turns explicit no-memory avoid terms into fact constraints without vector avoidTerms", () => {
    const service = createService();
    const resolution = service.resolve({
      question: "推荐防晒霜",
      filters: {
        category: "美妆护肤",
        subCategory: "防晒",
        avoidTerms: ["酒精"],
      },
    });

    expect(resolution.filters).toEqual({
      category: "美妆护肤",
      subCategory: "防晒",
      excludeRiskTerms: ["酒精"],
    });
    expect(resolution.negativeConstraints).toEqual([
      {
        rawText: "酒精",
        term: "酒精",
        kind: "unknown",
        scope: "product",
        matchPolicy: "exclude_if_product_facts_conflict",
      },
    ]);
  });
});

function createService(): ChatContextMemoryService {
  const now = () => new Date("2026-05-30T00:00:00.000Z");

  return new ChatContextMemoryService({
    store: new ChatContextMemoryStore({ now }),
    now,
  });
}

function createNegativeConstraint(term: string) {
  return {
    rawText: `不要含${term}`,
    term,
    kind: "ingredient" as const,
    scope: "product" as const,
    matchPolicy: "exclude_if_product_facts_conflict" as const,
  };
}
