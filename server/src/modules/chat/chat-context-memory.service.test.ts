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

  it("stores intent, budget, preferences, avoid terms, and product ids", () => {
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
    expect(summary).toMatchObject({
      conversationId: "local-chat-session-1",
      lastIntent: "帮我推荐跑鞋，要轻量的，预算 500 以内，不要酒精",
      constraints: {
        category: "服饰运动",
        subCategory: "跑步鞋",
        maxPriceCents: 50000,
        preferenceTerms: ["轻量"],
        avoidTerms: ["酒精"],
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
});

function createService(): ChatContextMemoryService {
  const now = () => new Date("2026-05-30T00:00:00.000Z");

  return new ChatContextMemoryService({
    store: new ChatContextMemoryStore({ now }),
    now,
  });
}
