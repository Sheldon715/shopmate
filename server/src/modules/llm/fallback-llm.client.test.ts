import { describe, expect, it } from "vitest";
import { LlmError } from "./llm.error";
import { FallbackLlmClient } from "./fallback-llm.client";
import { MockLlmClient } from "./mock-llm.client";
import type { LlmGenerateRequest } from "./llm.types";

describe("FallbackLlmClient", () => {
  it("uses fallback client when primary generate throws", async () => {
    const calls: string[] = [];
    const primary = new MockLlmClient({
      handler: () => {
        calls.push("primary");
        throw new LlmError("bad output", { code: "LLM_INVALID_RESPONSE" });
      },
    });
    const fallback = new MockLlmClient({
      handler: () => {
        calls.push("fallback");
        return response("fallback answer");
      },
    });
    const client = new FallbackLlmClient({ primary, fallback });

    await expect(client.generate(request())).resolves.toMatchObject({
      text: "fallback answer",
    });
    expect(calls).toEqual(["primary", "fallback"]);
  });

  it("uses fallback client when primary response fails validation", async () => {
    const calls: string[] = [];
    const primary = new MockLlmClient({
      handler: () => {
        calls.push("primary");
        return response("not json");
      },
    });
    const fallback = new MockLlmClient({
      handler: () => {
        calls.push("fallback");
        return response("{\"ok\":true}");
      },
    });
    const client = new FallbackLlmClient({
      primary,
      fallback,
      shouldFallback: (llmResponse) => !llmResponse.text.startsWith("{"),
    });

    await expect(client.generate(request())).resolves.toMatchObject({
      text: "{\"ok\":true}",
    });
    expect(calls).toEqual(["primary", "fallback"]);
  });
});

function request(): LlmGenerateRequest {
  return {
    messages: [{ role: "user", content: "test" }],
  };
}

function response(text: string) {
  return {
    text,
    model: "test-model",
    provider: "test-provider",
    finishReason: "stop" as const,
    latencyMs: 1,
  };
}
