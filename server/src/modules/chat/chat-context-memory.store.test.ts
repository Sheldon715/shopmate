import { describe, expect, it } from "vitest";
import { ChatContextMemoryStore } from "./chat-context-memory.store";
import type { ChatContextMemory } from "./chat-context-memory.types";

describe("ChatContextMemoryStore", () => {
  it("returns undefined for expired memories and removes them", () => {
    let now = new Date("2026-05-30T00:00:00.000Z");
    const store = new ChatContextMemoryStore({
      ttlMs: 1000,
      now: () => now,
    });

    store.set(createMemory({ conversationId: "session-1", updatedAt: now.toISOString() }));
    now = new Date("2026-05-30T00:00:02.000Z");

    expect(store.get("session-1")).toBeUndefined();
  });

  it("overwrites existing session memory", () => {
    const store = new ChatContextMemoryStore({
      now: () => new Date("2026-05-30T00:00:00.000Z"),
    });

    store.set(createMemory({ conversationId: "session-1", lastIntent: "推荐跑鞋" }));
    store.set(createMemory({ conversationId: "session-1", lastIntent: "推荐手机" }));

    expect(store.get("session-1")?.lastIntent).toBe("推荐手机");
  });

  it("keeps the newest sessions when capacity is exceeded", () => {
    const store = new ChatContextMemoryStore({
      maxSessions: 2,
      now: () => new Date("2026-05-30T00:00:03.000Z"),
    });

    store.set(createMemory({
      conversationId: "oldest",
      updatedAt: "2026-05-30T00:00:00.000Z",
    }));
    store.set(createMemory({
      conversationId: "middle",
      updatedAt: "2026-05-30T00:00:01.000Z",
    }));
    store.set(createMemory({
      conversationId: "newest",
      updatedAt: "2026-05-30T00:00:02.000Z",
    }));

    expect(store.get("oldest")).toBeUndefined();
    expect(store.get("middle")).toBeDefined();
    expect(store.get("newest")).toBeDefined();
  });
});

function createMemory(
  overrides: Partial<ChatContextMemory> = {},
): ChatContextMemory {
  return {
    conversationId: "session-1",
    lastIntent: "推荐耳机",
    constraints: {
      preferenceTerms: [],
      avoidTerms: [],
    },
    lastRecommendedProductIds: [],
    updatedAt: "2026-05-30T00:00:00.000Z",
    turnCount: 1,
    ...overrides,
  };
}
