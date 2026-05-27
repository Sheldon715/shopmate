import { describe, expect, it, vi } from "vitest";
import type { LlmConfig } from "./llm.config";
import { OpenAiCompatibleChatClient } from "./openai-compatible-chat.client";
import type { LlmGenerateRequest } from "./llm.types";

describe("OpenAiCompatibleChatClient", () => {
  it("maps successful OpenAI-compatible responses", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          id: "provider-response-id",
          model: "provider-model",
          choices: [
            {
              finish_reason: "stop",
              message: { content: "推荐这款耳机。" },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        },
        { headers: { "x-tt-logid": "log-001" } },
      ),
    );
    const client = createClient({ fetchImpl });

    const response = await client.generate({
      ...request(),
      responseFormat: { type: "json_object" },
      requestId: "req-001",
    });

    expect(response).toMatchObject({
      text: "推荐这款耳机。",
      model: "provider-model",
      provider: "volcengine-ark",
      finishReason: "stop",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      providerRequestId: "log-001",
    });
    expect(response.latencyMs).toEqual(expect.any(Number));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://ark.example.com/api/v3/chat/completions",
    );

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Authorization": "Bearer test-key",
      "Content-Type": "application/json",
      "X-Request-Id": "req-001",
    });
    expect(body).toEqual({
      model: "Doubao-Seed-2.0-lite",
      messages: [{ role: "user", content: "推荐蓝牙耳机" }],
      temperature: 0.2,
      max_completion_tokens: 700,
      response_format: { type: "json_object" },
    });
  });

  it("throws LLM_CONFIG_MISSING when disabled config is used", async () => {
    const client = new OpenAiCompatibleChatClient({
      config: {
        enabled: false,
        provider: "volcengine-ark",
        timeoutMs: 20000,
        maxRetries: 1,
        maxCompletionTokens: 700,
        temperature: 0.2,
        missing: ["LLM_API_KEY"],
      },
    });

    await expect(client.generate(request())).rejects.toMatchObject({
      code: "LLM_CONFIG_MISSING",
    });
  });

  it("maps auth and bad request provider errors without retrying", async () => {
    const authFetch = vi.fn(async () => textResponse("bad key", 401));
    const badRequestFetch = vi.fn(async () => textResponse("bad body", 400));

    await expect(
      createClient({ fetchImpl: authFetch }).generate(request()),
    ).rejects.toMatchObject({
      code: "LLM_AUTH_FAILED",
      retryable: false,
      statusCode: 401,
    });
    await expect(
      createClient({ fetchImpl: badRequestFetch }).generate(request()),
    ).rejects.toMatchObject({
      code: "LLM_BAD_REQUEST",
      retryable: false,
      statusCode: 400,
    });
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(badRequestFetch).toHaveBeenCalledTimes(1);
  });

  it("retries rate limits and provider unavailable errors", async () => {
    const rateLimitedFetch = vi
      .fn()
      .mockResolvedValueOnce(textResponse("slow down", 429))
      .mockResolvedValueOnce(okResponse("after retry"));
    const unavailableFetch = vi
      .fn()
      .mockResolvedValueOnce(textResponse("server error", 500))
      .mockResolvedValueOnce(okResponse("after provider retry"));

    await expect(
      createClient({ fetchImpl: rateLimitedFetch }).generate(request()),
    ).resolves.toMatchObject({
      text: "after retry",
    });
    await expect(
      createClient({ fetchImpl: unavailableFetch }).generate(request()),
    ).resolves.toMatchObject({
      text: "after provider retry",
    });
    expect(rateLimitedFetch).toHaveBeenCalledTimes(2);
    expect(unavailableFetch).toHaveBeenCalledTimes(2);
  });

  it("maps network errors to retryable request failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(
      createClient({
        fetchImpl,
        config: enabledConfig({ maxRetries: 0 }),
      }).generate(request()),
    ).rejects.toMatchObject({
      code: "LLM_REQUEST_FAILED",
      retryable: true,
    });
  });

  it("maps timeouts", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );
    const client = createClient({
      fetchImpl,
      config: enabledConfig({ maxRetries: 0 }),
    });
    const assertion = expect(client.generate({
      ...request(),
      timeoutMs: 25,
    })).rejects.toMatchObject({
      code: "LLM_TIMEOUT",
      retryable: true,
    });

    await vi.advanceTimersByTimeAsync(25);
    await assertion;

    vi.useRealTimers();
  });

  it("maps invalid JSON and empty content", async () => {
    await expect(
      createClient({
        fetchImpl: vi.fn(async () => new Response("not json", { status: 200 })),
      }).generate(request()),
    ).rejects.toMatchObject({
      code: "LLM_INVALID_RESPONSE",
    });

    await expect(
      createClient({
        fetchImpl: vi.fn(async () => okResponse("")),
      }).generate(request()),
    ).rejects.toMatchObject({
      code: "LLM_EMPTY_RESPONSE",
    });
  });
});

function request(): LlmGenerateRequest {
  return {
    messages: [{ role: "user", content: "推荐蓝牙耳机" }],
  };
}

function enabledConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    enabled: true,
    provider: "volcengine-ark",
    baseUrl: "https://ark.example.com/api/v3",
    apiKey: "test-key",
    model: "Doubao-Seed-2.0-lite",
    timeoutMs: 20000,
    maxRetries: 1,
    maxCompletionTokens: 700,
    temperature: 0.2,
    ...overrides,
  };
}

function createClient(options: {
  config?: LlmConfig;
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
}): OpenAiCompatibleChatClient {
  return new OpenAiCompatibleChatClient({
    config: options.config ?? enabledConfig(),
    fetchImpl: options.fetchImpl,
    retryDelayMs: 0,
  });
}

function okResponse(content: string): Response {
  return jsonResponse({
    model: "provider-model",
    choices: [
      {
        finish_reason: "stop",
        message: { content },
      },
    ],
  });
}

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    statusText: status === 429 ? "Too Many Requests" : "Error",
  });
}
