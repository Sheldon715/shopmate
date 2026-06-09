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

  it("asks LLM to generate a question when broad intent is misclassified as no clarification", async () => {
    const requests: LlmGenerateRequest[] = [];
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          requests.push(request);

          return createLlmResponse(JSON.stringify(
            requests.length === 1
              ? {
                  needs_clarification: false,
                  missing_slots: [],
                }
              : {
                  clarification_question: "你更看重拍照、续航还是预算？我按你的重点来筛。",
                },
          ));
        },
      }),
    });

    await expect(service.decide({
      question: "推荐一款手机",
    })).resolves.toEqual({
      needsClarification: true,
      question: "你更看重拍照、续航还是预算？我按你的重点来筛。",
      missingSlots: ["budget", "priority"],
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.map((message) => message.content).join("\n"))
      .toContain("澄清问题生成器");
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

  it("treats broad running-shoe recommendations as clarification candidates", async () => {
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(JSON.stringify({
            needs_clarification: true,
            clarification_question: "你主要用于日常慢跑、训练还是比赛？预算大概多少？",
            missing_slots: ["use_case", "priority", "budget"],
          }));
        },
      }),
    });

    const result = await service.decide({
      question: "跑鞋推荐",
    });

    const promptText = llmRequest?.messages
      .map((message) => message.content)
      .join("\n");
    expect(promptText).toContain("跑鞋推荐");
    expect(promptText).toContain('"message":"跑鞋推荐"');
    expect(result).toEqual({
      needsClarification: true,
      question: "你主要用于日常慢跑、训练还是比赛？预算大概多少？",
      missingSlots: ["use_case", "priority", "budget"],
    });
  });

  it("uses a slot fallback question when required clarification text generation is invalid", async () => {
    let requestCount = 0;
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          requestCount += 1;

          return createLlmResponse(JSON.stringify(
            requestCount === 1
              ? {
                  needs_clarification: false,
                  missing_slots: [],
                }
              : {},
          ));
        },
      }),
    });

    await expect(service.decide({
      question: "跑鞋推荐",
    })).resolves.toEqual({
      needsClarification: true,
      question: "请补充使用场景、更看重的性能或特点、预算，我再帮你筛更合适的商品。",
      missingSlots: ["use_case", "priority", "budget"],
    });
    expect(requestCount).toBe(2);
  });

  it("generates a required question if LLM confirms clarification but omits the user-facing question", async () => {
    let requestCount = 0;
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          requestCount += 1;

          return createLlmResponse(JSON.stringify(
            requestCount === 1
              ? {
                  needs_clarification: true,
                  missing_slots: ["budget", "priority"],
                }
              : {
                  clarification_question: "你更看重拍照、续航还是预算？我按你的重点来筛。",
                },
          ));
        },
      }),
    });

    await expect(service.decide({
      question: "推荐一款手机",
    })).resolves.toEqual({
      needsClarification: true,
      question: "你更看重拍照、续航还是预算？我按你的重点来筛。",
      missingSlots: ["budget", "priority"],
    });
    expect(requestCount).toBe(2);
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

  it("uses a slot fallback question when LLM output is invalid", async () => {
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse("{ nope"),
      }),
    });

    await expect(service.decide({
      question: "推荐一款手机",
    })).resolves.toEqual({
      needsClarification: true,
      question: "请补充预算、更看重的性能或特点，我再帮你筛更合适的商品。",
      missingSlots: ["budget", "priority"],
    });
  });

  it.each([
    {
      question: "跑鞋",
      missingSlots: ["use_case", "priority", "budget"],
      questionText: "请补充使用场景、更看重的性能或特点、预算，我再帮你筛更合适的商品。",
    },
    {
      question: "推荐一款跑步鞋",
      missingSlots: ["use_case", "priority", "budget"],
      questionText: "请补充使用场景、更看重的性能或特点、预算，我再帮你筛更合适的商品。",
    },
    {
      question: "帮我看看训练鞋",
      missingSlots: ["use_case", "priority", "budget"],
      questionText: "请补充使用场景、更看重的性能或特点、预算，我再帮你筛更合适的商品。",
    },
    {
      question: "想买真无线耳机",
      missingSlots: ["budget", "priority", "use_case"],
      questionText: "请补充预算、更看重的性能或特点、使用场景，我再帮你筛更合适的商品。",
    },
  ])("uses invariant fallback for broad paraphrase when LLM is invalid: $question", async ({
    question,
    missingSlots,
    questionText,
  }) => {
    const service = new ClarificationIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse("{ nope"),
      }),
    });

    await expect(service.decide({ question })).resolves.toEqual({
      needsClarification: true,
      question: questionText,
      missingSlots,
    });
  });

  it("uses a slot fallback question when LLM is unavailable", async () => {
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
      needsClarification: true,
      question: "请补充预算、更看重的性能或特点，我再帮你筛更合适的商品。",
      missingSlots: ["budget", "priority"],
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
