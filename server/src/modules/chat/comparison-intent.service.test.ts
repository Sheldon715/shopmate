import { describe, expect, it } from "vitest";
import { MockLlmClient } from "../llm/mock-llm.client";
import { ComparisonIntentService } from "./comparison-intent.service";

describe("ComparisonIntentService", () => {
  it("detects recent recommendation comparison intent", async () => {
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse({
          is_comparison: true,
          confidence: "high",
          target: {
            kind: "recent_recommendations",
            ordinals: [1, 2],
            names: [],
          },
          user_priority: "油皮通勤",
          needs_clarification: false,
          clarification_question: null,
        }),
      }),
    });

    const result = await service.detect({
      question: "帮我对比这两款，哪个更适合油皮通勤",
      recentProductIds: ["product_001", "product_002"],
    });

    expect(result).toMatchObject({
      isComparison: true,
      confidence: "high",
      target: {
        kind: "recent_recommendations",
        ordinals: [1, 2],
        names: [],
      },
      userPriority: "油皮通勤",
      needsClarification: false,
    });
  });

  it("does not treat a request for two recommendations as comparison", async () => {
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse({
          is_comparison: false,
          confidence: "high",
          target: {
            kind: "unknown",
            ordinals: [],
            names: [],
          },
          user_priority: null,
          needs_clarification: false,
          clarification_question: null,
        }),
      }),
    });

    const result = await service.detect({
      question: "推荐两款适合通勤的防晒",
    });

    expect(result.isComparison).toBe(false);
  });

  it("accepts camelCase model fields", async () => {
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse({
          isComparison: true,
          confidence: "medium",
          target: {
            kind: "recent_recommendations",
            ordinals: [1, 2],
            names: [],
          },
          userPriority: "通勤",
          needsClarification: false,
          clarificationQuestion: null,
        }),
      }),
    });

    const result = await service.detect({
      question: "帮我对比这两款",
    });

    expect(result.isComparison).toBe(true);
    expect(result.userPriority).toBe("通勤");
  });

  it("turns more than two comparison targets into a clarification", async () => {
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse({
          is_comparison: true,
          confidence: "high",
          target: {
            kind: "recent_recommendations",
            ordinals: [1, 2, 3],
            names: [],
          },
          user_priority: "油皮通勤",
          needs_clarification: false,
          clarification_question: "目前只支持两款商品对比，请从这三款里选两款。",
        }),
      }),
    });

    const result = await service.detect({
      question: "对比一下这三款，哪个更适合油皮通勤",
      recentProductIds: ["product_001", "product_002", "product_003"],
    });

    expect(result.isComparison).toBe(true);
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toBe(
      "目前只支持两款商品对比，请从这三款里选两款。",
    );
  });

  it("uses a focused LLM check for recent recommendation comparison cues", async () => {
    let calls = 0;
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          calls += 1;
          return createLlmResponse(
            calls === 1
              ? {
                  is_comparison: false,
                  confidence: "low",
                  target: {
                    kind: "unknown",
                    ordinals: [],
                    names: [],
                  },
                  needs_clarification: false,
                  clarification_question: null,
                }
              : {
                  is_comparison: true,
                  confidence: "high",
                  target: {
                    kind: "recent_recommendations",
                    ordinals: [1, 2],
                    names: [],
                  },
                  user_priority: "油皮通勤",
                  needs_clarification: false,
                  clarification_question: null,
                },
          );
        },
      }),
    });

    const result = await service.detect({
      question: "帮我对比这两款，哪个更适合油皮通勤",
      recentProductIds: ["product_001", "product_002"],
    });

    expect(calls).toBe(2);
    expect(result.isComparison).toBe(true);
    expect(result.target.ordinals).toEqual([1, 2]);
  });

  it("uses a focused LLM check for second and third ordinal comparison cues", async () => {
    let calls = 0;
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          calls += 1;
          return createLlmResponse(
            calls === 1
              ? {
                  is_comparison: false,
                  confidence: "low",
                  target: {
                    kind: "unknown",
                    ordinals: [],
                    names: [],
                  },
                  needs_clarification: false,
                  clarification_question: null,
                }
              : {
                  is_comparison: true,
                  confidence: "high",
                  target: {
                    kind: "recent_recommendations",
                    ordinals: [2, 3],
                    names: [],
                  },
                  user_priority: "油皮抗老",
                  needs_clarification: false,
                  clarification_question: null,
                },
          );
        },
      }),
    });

    const result = await service.detect({
      question: "对比一下第二个和第三个",
      recentProductIds: ["product_001", "product_002", "product_003"],
    });

    expect(calls).toBe(2);
    expect(result.isComparison).toBe(true);
    expect(result.target.ordinals).toEqual([2, 3]);
  });

  it("uses a focused LLM check when the first comparison detection is low confidence", async () => {
    let calls = 0;
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          calls += 1;
          return createLlmResponse(
            calls === 1
              ? {
                  is_comparison: true,
                  confidence: "low",
                  target: {
                    kind: "recent_recommendations",
                    ordinals: [2, 3],
                    names: [],
                  },
                  needs_clarification: false,
                  clarification_question: null,
                }
              : {
                  is_comparison: true,
                  confidence: "high",
                  target: {
                    kind: "recent_recommendations",
                    ordinals: [2, 3],
                    names: [],
                  },
                  user_priority: "油皮抗老",
                  needs_clarification: false,
                  clarification_question: null,
                },
          );
        },
      }),
    });

    const result = await service.detect({
      question: "对比一下第二个和第三个",
      recentProductIds: ["product_001", "product_002", "product_003"],
    });

    expect(calls).toBe(2);
    expect(result.isComparison).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.target.ordinals).toEqual([2, 3]);
  });

  it("keeps explicit recent ordinal comparison when both LLM checks miss", async () => {
    let calls = 0;
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          calls += 1;
          return createLlmResponse({
            is_comparison: false,
            confidence: "high",
            target: {
              kind: "unknown",
              ordinals: [],
              names: [],
            },
            user_priority: null,
            needs_clarification: false,
            clarification_question: null,
          });
        },
      }),
    });

    const result = await service.detect({
      question: "对比一下第二个和第三个",
      recentProductIds: ["product_001", "product_002", "product_003"],
    });

    expect(calls).toBe(2);
    expect(result).toMatchObject({
      isComparison: true,
      confidence: "medium",
      target: {
        kind: "recent_recommendations",
        ordinals: [2, 3],
        names: [],
      },
      needsClarification: false,
    });
  });

  it("keeps explicit two-recent-products comparison when both LLM checks miss", async () => {
    let calls = 0;
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          calls += 1;
          return createLlmResponse({
            is_comparison: false,
            confidence: "high",
            target: {
              kind: "unknown",
              ordinals: [],
              names: [],
            },
            user_priority: null,
            needs_clarification: false,
            clarification_question: null,
          });
        },
      }),
    });

    const result = await service.detect({
      question: "帮我对比这两款",
      recentProductIds: ["product_001", "product_002"],
    });

    expect(calls).toBe(2);
    expect(result).toMatchObject({
      isComparison: true,
      confidence: "medium",
      target: {
        kind: "recent_recommendations",
        ordinals: [1, 2],
        names: [],
      },
      needsClarification: false,
    });
  });

  it("does not guess demonstrative comparison targets when more than two products were recommended", async () => {
    let calls = 0;
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          calls += 1;
          return createLlmResponse({
            is_comparison: false,
            confidence: "high",
            target: {
              kind: "unknown",
              ordinals: [],
              names: [],
            },
            user_priority: null,
            needs_clarification: false,
            clarification_question: null,
          });
        },
      }),
    });

    const result = await service.detect({
      question: "帮我对比这两款",
      recentProductIds: ["product_001", "product_002", "product_003"],
    });

    expect(calls).toBe(2);
    expect(result.isComparison).toBe(false);
  });

  it("repairs explicit recent ordinals when LLM returns an unsupported target shape", async () => {
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse({
          is_comparison: true,
          confidence: "high",
          target: {
            kind: "category_search",
            ordinals: [],
            names: [],
          },
          user_priority: "油皮",
          needs_clarification: false,
          clarification_question: null,
        }),
      }),
    });

    const result = await service.detect({
      question: "对比一下第2个和第3个",
      recentProductIds: ["product_001", "product_002", "product_003"],
    });

    expect(result).toMatchObject({
      isComparison: true,
      confidence: "high",
      target: {
        kind: "recent_recommendations",
        ordinals: [2, 3],
        names: [],
      },
      userPriority: "油皮",
      needsClarification: false,
    });
  });

  it("does not create explicit ordinal fallback when the ordinal is outside recent recommendations", async () => {
    let calls = 0;
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          calls += 1;
          return createLlmResponse({
            is_comparison: false,
            confidence: "high",
            target: {
              kind: "unknown",
              ordinals: [],
              names: [],
            },
            user_priority: null,
            needs_clarification: false,
            clarification_question: null,
          });
        },
      }),
    });

    const result = await service.detect({
      question: "对比一下第二个和第三个",
      recentProductIds: ["product_001", "product_002"],
    });

    expect(calls).toBe(2);
    expect(result.isComparison).toBe(false);
  });

  it("fails closed when the LLM output is invalid", async () => {
    const service = new ComparisonIntentService({
      llmClient: new MockLlmClient({
        response: {
          text: "not json",
          model: "mock",
          provider: "mock",
          finishReason: "stop",
          latencyMs: 0,
        },
      }),
    });

    const result = await service.detect({
      question: "帮我对比这两款",
    });

    expect(result.isComparison).toBe(false);
  });
});

function createLlmResponse(payload: Record<string, unknown>) {
  return {
    text: JSON.stringify(payload),
    model: "mock",
    provider: "mock",
    finishReason: "stop",
    latencyMs: 0,
  };
}
