import { describe, expect, it } from "vitest";
import { LlmError } from "../llm/llm.error";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateRequest, LlmGenerateResponse } from "../llm/llm.types";
import { QueryRewriteService } from "./query-rewrite.service";

describe("QueryRewriteService", () => {
  it("returns a rewritten retrieval query from valid LLM output", async () => {
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new QueryRewriteService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(JSON.stringify({
            should_rewrite: true,
            rewritten_query: "真无线耳机 更便宜 蓝牙耳机 预算更低",
            reason: "短追问需要补全品类和价格偏好",
            confidence: "high",
          }));
        },
      }),
    });

    const result = await service.rewrite({
      question: "再便宜一点的有吗？",
      baseRetrievalQuery: "再便宜一点的有吗？ 推荐蓝牙耳机 数码电子 真无线耳机",
      shortHistory: [{ role: "assistant", content: "我推荐了三款蓝牙耳机。" }],
      contextMemory: {
        conversationId: "chat-1",
        lastIntent: "推荐蓝牙耳机",
        constraints: {
          category: "数码电子",
          subCategory: "真无线耳机",
          preferenceTerms: [],
          avoidTerms: [],
        },
        lastRecommendedProductIds: ["p_digital_001"],
      },
      filters: {
        category: "数码电子",
        subCategory: "真无线耳机",
      },
    });

    expect(llmRequest?.temperature).toBe(0);
    expect(llmRequest?.maxCompletionTokens).toBeLessThanOrEqual(500);
    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("只输出 JSON object");
    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("negative constraints 只能保留中性检索语义");
    expect(result).toEqual({
      status: "rewritten",
      query: "真无线耳机 更便宜 蓝牙耳机 预算更低",
      baseQuery: "再便宜一点的有吗？ 推荐蓝牙耳机 数码电子 真无线耳机",
      rewrittenQuery: "真无线耳机 更便宜 蓝牙耳机 预算更低",
      reason: "短追问需要补全品类和价格偏好",
      confidence: "high",
    });
  });

  it("falls back when the model says rewrite is not needed", async () => {
    const service = createService({
      should_rewrite: false,
      rewritten_query: null,
      reason: "原 query 已足够明确",
      confidence: "medium",
    });

    const result = await service.rewrite(createInput());

    expect(result).toEqual({
      status: "not_needed",
      query: "推荐防晒霜",
      baseQuery: "推荐防晒霜",
      reason: "原 query 已足够明确",
    });
  });

  it("falls back on low confidence", async () => {
    const service = createService({
      should_rewrite: true,
      rewritten_query: "防晒",
      reason: "不确定用户是否想继续上一轮",
      confidence: "low",
    });

    const result = await service.rewrite(createInput());

    expect(result).toEqual({
      status: "fallback",
      query: "推荐防晒霜",
      baseQuery: "推荐防晒霜",
      reason: "不确定用户是否想继续上一轮",
      fallbackReason: "LOW_CONFIDENCE",
    });
  });

  it("falls back on invalid JSON", async () => {
    const service = new QueryRewriteService({
      llmClient: new MockLlmClient({
        response: createLlmResponse("{ nope"),
      }),
    });

    const result = await service.rewrite(createInput());

    expect(result).toEqual({
      status: "fallback",
      query: "推荐防晒霜",
      baseQuery: "推荐防晒霜",
      fallbackReason: "LLM_INVALID_OUTPUT",
    });
  });

  it("falls back on empty rewritten query", async () => {
    const service = createService({
      should_rewrite: true,
      rewritten_query: "   ",
      reason: "空结果",
      confidence: "medium",
    });

    const result = await service.rewrite(createInput());

    expect(result).toEqual({
      status: "fallback",
      query: "推荐防晒霜",
      baseQuery: "推荐防晒霜",
      reason: "空结果",
      fallbackReason: "EMPTY_QUERY",
    });
  });

  it("falls back on overlong rewritten query", async () => {
    const service = createService({
      should_rewrite: true,
      rewritten_query: "蓝牙耳机".repeat(60),
      confidence: "high",
    });

    const result = await service.rewrite(createInput());

    expect(result).toEqual({
      status: "fallback",
      query: "推荐防晒霜",
      baseQuery: "推荐防晒霜",
      fallbackReason: "EMPTY_QUERY",
    });
  });

  it("falls back on generic or unsafe rewritten query", async () => {
    const genericService = createService({
      should_rewrite: true,
      rewritten_query: "商品",
      confidence: "medium",
    });
    const productIdService = createService({
      should_rewrite: true,
      rewritten_query: "product_001 便宜耳机",
      confidence: "medium",
    });
    const gluedProductIdService = createService({
      should_rewrite: true,
      rewritten_query: "推荐p_digital_001便宜耳机",
      confidence: "medium",
    });

    await expect(genericService.rewrite(createInput())).resolves.toMatchObject({
      status: "fallback",
      fallbackReason: "UNSAFE_QUERY",
    });
    await expect(productIdService.rewrite(createInput())).resolves.toMatchObject({
      status: "fallback",
      fallbackReason: "UNSAFE_QUERY",
    });
    await expect(
      gluedProductIdService.rewrite(createInput()),
    ).resolves.toMatchObject({
      status: "fallback",
      fallbackReason: "UNSAFE_QUERY",
    });
  });

  it("accepts camelCase output fields", async () => {
    const service = createService({
      shouldRewrite: true,
      rewrittenQuery: "美妆护肤 防晒 油皮 通勤",
      reason: "camelCase schema",
      confidence: "medium",
    });

    await expect(service.rewrite(createInput())).resolves.toMatchObject({
      status: "rewritten",
      query: "美妆护肤 防晒 油皮 通勤",
      baseQuery: "推荐防晒霜",
      rewrittenQuery: "美妆护肤 防晒 油皮 通勤",
      reason: "camelCase schema",
      confidence: "medium",
    });
  });

  it("falls back on LLM errors without leaking provider details", async () => {
    const service = new QueryRewriteService({
      llmClient: new MockLlmClient({
        error: new LlmError("provider secret stack", {
          code: "LLM_REQUEST_FAILED",
        }),
      }),
    });

    const result = await service.rewrite(createInput());

    expect(result).toEqual({
      status: "fallback",
      query: "推荐防晒霜",
      baseQuery: "推荐防晒霜",
      fallbackReason: "LLM_ERROR",
    });
  });

  it("rethrows abortSignal errors", async () => {
    const abortController = new AbortController();
    const service = new QueryRewriteService({
      llmClient: new MockLlmClient({
        handler: () => {
          abortController.abort(new Error("request aborted"));
          throw new Error("provider after abort");
        },
      }),
    });

    await expect(service.rewrite({
      ...createInput(),
      abortSignal: abortController.signal,
    })).rejects.toThrow("request aborted");
  });
});

function createService(payload: Record<string, unknown>): QueryRewriteService {
  return new QueryRewriteService({
    llmClient: new MockLlmClient({
      response: createLlmResponse(JSON.stringify(payload)),
    }),
  });
}

function createInput() {
  return {
    question: "推荐防晒霜",
    baseRetrievalQuery: " 推荐防晒霜 ",
  };
}

function createLlmResponse(text: string): LlmGenerateResponse {
  return {
    text,
    model: "mock-llm",
    provider: "mock",
    finishReason: "stop",
    latencyMs: 0,
  };
}
