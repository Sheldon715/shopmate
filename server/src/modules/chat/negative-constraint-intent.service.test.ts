import { describe, expect, it } from "vitest";
import { LlmError } from "../llm/llm.error";
import { MockLlmClient } from "../llm/mock-llm.client";
import { NegativeConstraintIntentService } from "./negative-constraint-intent.service";

describe("NegativeConstraintIntentService", () => {
  it("parses alcohol-free ingredient constraints", async () => {
    let capturedMaxCompletionTokens: number | undefined;
    const service = new NegativeConstraintIntentService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          capturedMaxCompletionTokens = request.maxCompletionTokens;

          return createLlmResponse({
            has_negative_constraints: true,
            confidence: "high",
            constraints: [
              {
                raw_text: "不要含酒精",
                term: "酒精",
                kind: "ingredient",
                scope: "product",
                match_policy: "exclude_if_product_facts_conflict",
              },
            ],
            needs_clarification: false,
            clarification_question: null,
          });
        },
      }),
    });

    const result = await service.detect({
      question: "推荐防晒霜，但不要含酒精的",
    });

    expect(result).toMatchObject({
      hasNegativeConstraints: true,
      confidence: "high",
      needsClarification: false,
      constraints: [
        {
          rawText: "不要含酒精",
          term: "酒精",
          kind: "ingredient",
          scope: "product",
          matchPolicy: "exclude_if_product_facts_conflict",
        },
      ],
    });
    expect(capturedMaxCompletionTokens).toBe(900);
  });

  it("parses except-brand constraints", async () => {
    const service = new NegativeConstraintIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse({
          has_negative_constraints: true,
          confidence: "medium",
          constraints: [
            {
              raw_text: "除了安热沙",
              term: "安热沙",
              kind: "brand",
              scope: "recommendation_set",
              match_policy: "exclude_brand",
            },
          ],
          needs_clarification: false,
          clarification_question: null,
        }),
      }),
    });

    const result = await service.detect({
      question: "除了安热沙还有什么防晒",
    });

    expect(result.constraints).toEqual([
      {
        rawText: "除了安热沙",
        term: "安热沙",
        kind: "brand",
        scope: "recommendation_set",
        matchPolicy: "exclude_brand",
      },
    ]);
  });

  it("accepts camelCase model fields", async () => {
    const service = new NegativeConstraintIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse({
          hasNegativeConstraints: true,
          confidence: "high",
          constraints: [
            {
              rawText: "不要入耳式",
              term: "入耳",
              kind: "feature",
              scope: "product",
              matchPolicy: "exclude_if_product_facts_conflict",
            },
          ],
          needsClarification: false,
          clarificationQuestion: null,
        }),
      }),
    });

    const result = await service.detect({
      question: "耳机不要入耳式",
    });

    expect(result).toMatchObject({
      hasNegativeConstraints: true,
      confidence: "high",
      needsClarification: false,
      constraints: [
        {
          rawText: "不要入耳式",
          term: "入耳",
          kind: "feature",
          scope: "product",
          matchPolicy: "exclude_if_product_facts_conflict",
        },
      ],
    });
  });

  it("does not turn price wording into an avoid term", async () => {
    const service = new NegativeConstraintIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse({
          has_negative_constraints: true,
          confidence: "high",
          constraints: [
            {
              raw_text: "不要太贵",
              term: "太贵",
              kind: "price",
              scope: "recommendation_set",
              match_policy: "needs_clarification",
            },
          ],
          needs_clarification: true,
          clarification_question: "你大概希望预算控制在多少元以内？",
        }),
      }),
    });

    const result = await service.detect({
      question: "不要太贵，推荐一款手机",
    });

    expect(result.constraints[0]).toMatchObject({
      kind: "price",
      matchPolicy: "needs_clarification",
    });
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toBe(
      "你大概希望预算控制在多少元以内？",
    );
  });

  it("returns no constraints for invalid JSON, invalid schema, or provider failure", async () => {
    const invalidJson = new NegativeConstraintIntentService({
      llmClient: new MockLlmClient({ response: { ...createText("{ nope") } }),
    });
    const invalidSchema = new NegativeConstraintIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse({
          has_negative_constraints: true,
          confidence: "high",
          constraints: "酒精",
          needs_clarification: false,
        }),
      }),
    });
    const providerFailure = new NegativeConstraintIntentService({
      llmClient: new MockLlmClient({
        error: new LlmError("provider down", {
          code: "LLM_REQUEST_FAILED",
        }),
      }),
    });

    await expect(invalidJson.detect({ question: "不要含酒精" }))
      .resolves.toMatchObject({ hasNegativeConstraints: false });
    await expect(invalidSchema.detect({ question: "不要含酒精" }))
      .resolves.toMatchObject({ hasNegativeConstraints: false });
    await expect(providerFailure.detect({ question: "不要含酒精" }))
      .resolves.toMatchObject({ hasNegativeConstraints: false });
  });

  it("treats low confidence as uncertain and does not apply constraints", async () => {
    const service = new NegativeConstraintIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse({
          has_negative_constraints: true,
          confidence: "low",
          constraints: [
            {
              raw_text: "不要那个",
              term: "那个",
              kind: "unknown",
              scope: "unknown",
              match_policy: "needs_clarification",
            },
          ],
          needs_clarification: true,
          clarification_question: "你想排除哪一类商品？",
        }),
      }),
    });

    await expect(service.detect({ question: "不要那个" }))
      .resolves.toMatchObject({
        hasNegativeConstraints: false,
        constraints: [],
      });
  });
});

function createLlmResponse(payload: Record<string, unknown>) {
  return createText(JSON.stringify(payload));
}

function createText(text: string) {
  return {
    text,
    model: "mock-llm",
    provider: "mock",
    finishReason: "stop" as const,
    latencyMs: 0,
  };
}
