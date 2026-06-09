import { describe, expect, it } from "vitest";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateResponse } from "../llm/llm.types";
import {
  RagResponseGenerationService,
  createMinimalRagFallbackAnswer,
} from "./rag-response-generation.service";

describe("RagResponseGenerationService", () => {
  it("uses a complete no-candidates answer from the LLM", async () => {
    const service = new RagResponseGenerationService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(
          "目前库内暂时没有符合这个预算的蓝牙耳机，你可以放宽预算或补充降噪、续航等偏好，我再继续筛选。",
        ),
      }),
    });

    await expect(service.generateNoCandidatesResponse({
      question: "1000元以下的蓝牙耳机有哪些？",
    })).resolves.toEqual({
      answer:
        "目前库内暂时没有符合这个预算的蓝牙耳机，你可以放宽预算或补充降噪、续航等偏好，我再继续筛选。",
      generatedByLlm: true,
    });
  });

  it("falls back when the LLM no-candidates answer looks incomplete", async () => {
    const service = new RagResponseGenerationService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(
          "很抱歉，目前库内暂时没有找到完全符合1000元以下蓝牙耳机的商品，您",
        ),
      }),
    });

    await expect(service.generateNoCandidatesResponse({
      question: "1000元以下的蓝牙耳机有哪些？",
    })).resolves.toEqual({
      answer: createMinimalRagFallbackAnswer("NO_CANDIDATES"),
      generatedByLlm: false,
    });
  });

  it.each([
    "目前库内暂时没有符合预算的跑鞋，你可以",
    "当前库内没有找到适合学生党的蓝牙耳机，或者",
    "暂时没有匹配的小家电，",
    "我可以继续帮你筛选：",
  ])("falls back for dangling no-candidates text: %s", async (text) => {
    const service = new RagResponseGenerationService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(text),
      }),
    });

    await expect(service.generateNoCandidatesResponse({
      question: "300块内耐穿的跑步鞋",
    })).resolves.toEqual({
      answer: createMinimalRagFallbackAnswer("NO_CANDIDATES"),
      generatedByLlm: false,
    });
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
