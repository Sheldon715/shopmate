import { describe, expect, it } from "vitest";
import { LlmError } from "../llm/llm.error";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateRequest, LlmGenerateResponse } from "../llm/llm.types";
import { ClarificationIntentService } from "./clarification-intent.service";

describe("ClarificationIntentService", () => {
  it("uses LLM intent to confirm clarification and generate the user-facing question", async () => {
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(JSON.stringify({
            needs_clarification: true,
            clarification_question: "你更看重拍照、续航还是预算？我按你的重点来筛。",
            missing_slots: ["budget", "priority"],
          }));
        },
      }),
    });

    const result = await service.decide({
      question: "推荐一款手机",
    });

    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("主动澄清意图判断器");
    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("clarification_question");
    expect(result).toEqual({
      needsClarification: true,
      question: "你更看重拍照、续航还是预算？我按你的重点来筛。",
      missingSlots: ["budget", "priority"],
    });
  });

  it("does not clarify when the LLM says the broad candidate can proceed", async () => {
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          needs_clarification: false,
          missing_slots: [],
        })),
      }),
    });

    await expect(service.decide({
      question: "推荐一款手机",
    })).resolves.toEqual({
      needsClarification: false,
      missingSlots: [],
    });
  });

  it("sends terse broad categories to LLM clarification intent", async () => {
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(JSON.stringify({
            needs_clarification: true,
            clarification_question: "你想要跑步、通勤还是日常穿？预算大概多少？",
            missing_slots: ["use_case", "priority", "budget"],
          }));
        },
      }),
    });

    const result = await service.decide({
      question: "鞋",
    });

    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain('"message":"鞋"');
    expect(result).toEqual({
      needsClarification: true,
      question: "你想要跑步、通勤还是日常穿？预算大概多少？",
      missingSlots: ["use_case", "priority", "budget"],
    });
  });

  it("does not clarify if LLM omits the user-facing question", async () => {
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          needs_clarification: true,
          missing_slots: ["budget", "priority"],
        })),
      }),
    });

    await expect(service.decide({
      question: "推荐一款手机",
    })).resolves.toEqual({
      needsClarification: false,
      missingSlots: [],
    });
  });

  it("does not call LLM when rules do not find a broad clarification candidate", async () => {
    let llmCalled = false;
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse("{}");
        },
      }),
    });

    const result = await service.decide({
      question: "推荐 3000 元以内拍照好的手机",
    });

    expect(llmCalled).toBe(false);
    expect(result.needsClarification).toBe(false);
  });

  it("falls back to no clarification when LLM output is invalid", async () => {
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse("{ nope"),
      }),
    });

    await expect(service.decide({
      question: "推荐一款手机",
    })).resolves.toEqual({
      needsClarification: false,
      missingSlots: [],
    });
  });

  it("falls back to no clarification when LLM is unavailable", async () => {
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        error: new LlmError("provider down", {
          code: "LLM_REQUEST_FAILED",
        }),
      }),
    });

    await expect(service.decide({
      question: "推荐一款手机",
    })).resolves.toEqual({
      needsClarification: false,
      missingSlots: [],
    });
  });

  it("rethrows aborted LLM clarification requests", async () => {
    const abortController = new AbortController();
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          abortController.abort();
          throw new LlmError("clarification aborted", {
            code: "LLM_TIMEOUT",
          });
        },
      }),
    });

    await expect(service.decide({
      question: "推荐一款手机",
      abortSignal: abortController.signal,
    })).rejects.toThrow("clarification aborted");
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
