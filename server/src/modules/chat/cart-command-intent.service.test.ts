import { describe, expect, it } from "vitest";
import { LlmError } from "../llm/llm.error";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateRequest, LlmGenerateResponse } from "../llm/llm.types";
import { CartCommandIntentService } from "./cart-command-intent.service";

describe("CartCommandIntentService", () => {
  it("uses LLM intent to confirm cart add and extract target", async () => {
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new CartCommandIntentService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(JSON.stringify({
            is_cart_management: true,
            action: "add",
            target: { kind: "recent_recommendation_ordinal", index: 2 },
            quantity: 1,
            selected: null,
            needs_confirmation: false,
            confidence: "high",
            clarification_question: null,
          }));
        },
      }),
    });

    const result = await service.detect({
      question: "把第二个加进去",
      contextMemory: {
        conversationId: "cart-demo-1",
        constraints: {
          preferenceTerms: [],
          avoidTerms: [],
        },
        lastRecommendedProductIds: ["product_001", "product_002"],
      },
    });

    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("推荐加湿器");
    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("把数量改成 2");
    expect(result).toMatchObject({
      isCartCommand: true,
      action: "add",
      quantity: 1,
      target: { kind: "recent_recommendation_ordinal", index: 2 },
    });
  });

  it("uses LLM intent to extract cart management actions", async () => {
    const service = new CartCommandIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          is_cart_management: true,
          action: "update_quantity",
          target: { kind: "cart_ordinal", index: 2 },
          quantity: 2,
          selected: null,
          needs_confirmation: false,
          confidence: "high",
          clarification_question: null,
        })),
      }),
    });

    await expect(service.detect({
      question: "把第二个数量改成 2",
      cartSnapshot: {
        items: [],
        summary: {
          totalCount: 0,
          selectedCount: 0,
          selectedTotalCents: 0,
          currency: "CNY",
        },
      },
    })).resolves.toMatchObject({
      isCartCommand: true,
      action: "update_quantity",
      quantity: 2,
      target: { kind: "cart_ordinal", index: 2 },
    });
  });

  it("does not execute cart command when LLM says ordinary add text is not cart add", async () => {
    const service = new CartCommandIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          is_cart_add: false,
          target: { kind: "unknown" },
          quantity: 1,
        })),
      }),
    });

    await expect(service.detect({
      question: "推荐加湿器",
      contextMemory: {
        conversationId: "cart-demo-1",
        constraints: {
          preferenceTerms: [],
          avoidTerms: [],
        },
        lastRecommendedProductIds: ["product_001"],
      },
    })).resolves.toEqual({ isCartCommand: false });
  });

  it("requires confirmation for clear cart intent", async () => {
    const service = new CartCommandIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          is_cart_management: true,
          action: "clear",
          target: { kind: "all" },
          quantity: null,
          selected: null,
          needs_confirmation: true,
          confidence: "high",
          clarification_question: "确认要清空购物车吗？",
        })),
      }),
    });

    await expect(service.detect({
      question: "清空购物车",
    })).resolves.toMatchObject({
      isCartCommand: true,
      action: "clear",
      target: { kind: "all" },
      needsConfirmation: true,
      clarificationQuestion: "确认要清空购物车吗？",
    });
  });

  it("does not execute cart command when LLM intent output is invalid", async () => {
    const service = new CartCommandIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse("{ nope"),
      }),
    });

    await expect(service.detect({
      question: "把第二个加进去",
    })).resolves.toEqual({ isCartCommand: false });
  });

  it("rethrows aborted LLM intent requests", async () => {
    const abortController = new AbortController();
    const service = new CartCommandIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          abortController.abort();
          throw new LlmError("cart intent aborted", {
            code: "LLM_TIMEOUT",
          });
        },
      }),
    });

    await expect(service.detect({
      question: "把第二个加进去",
      abortSignal: abortController.signal,
    })).rejects.toThrow("cart intent aborted");
  });
});

function createLlmResponse(text: string): LlmGenerateResponse {
  return {
    text,
    model: "mock-llm",
    provider: "mock",
    finishReason: "stop",
    latencyMs: 0,
  };
}
