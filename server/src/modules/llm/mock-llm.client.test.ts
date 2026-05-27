import { describe, expect, it } from "vitest";
import { LlmError } from "./llm.error";
import { MockLlmClient } from "./mock-llm.client";
import type { LlmGenerateResponse } from "./llm.types";

describe("MockLlmClient", () => {
  it("returns a fixed response", async () => {
    const response: LlmGenerateResponse = {
      text: "fixed",
      model: "mock-model",
      provider: "mock",
      finishReason: "stop",
      latencyMs: 1,
    };
    const client = new MockLlmClient({ response });

    await expect(
      client.generate({ messages: [{ role: "user", content: "hello" }] }),
    ).resolves.toEqual(response);
  });

  it("returns handler output based on the request", async () => {
    const client = new MockLlmClient({
      handler: (request) => ({
        text: request.messages[0]?.content ?? "",
        model: "mock-model",
        provider: "mock",
        finishReason: "stop",
        latencyMs: 0,
      }),
    });

    await expect(
      client.generate({ messages: [{ role: "user", content: "蓝牙耳机" }] }),
    ).resolves.toMatchObject({
      text: "蓝牙耳机",
    });
  });

  it("can simulate LLM errors", async () => {
    const error = new LlmError("boom", { code: "LLM_REQUEST_FAILED" });
    const client = new MockLlmClient({ error });

    await expect(
      client.generate({ messages: [{ role: "user", content: "hello" }] }),
    ).rejects.toBe(error);
  });
});
