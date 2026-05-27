import { describe, expect, it } from "vitest";
import { LlmError } from "./llm.error";
import { loadLlmConfig } from "./llm.config";

describe("loadLlmConfig", () => {
  it("returns disabled config when key, base URL, or model is missing", () => {
    expect(loadLlmConfig({})).toMatchObject({
      enabled: false,
      provider: "volcengine-ark",
      missing: ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"],
    });

    expect(
      loadLlmConfig({
        LLM_API_KEY: "test-key",
        LLM_BASE_URL: "https://ark.example.com/api/v3",
      }),
    ).toMatchObject({
      enabled: false,
      missing: ["LLM_MODEL"],
    });
  });

  it("returns enabled config when required provider values are present", () => {
    expect(loadLlmConfig(validEnv())).toEqual({
      enabled: true,
      provider: "volcengine-ark",
      baseUrl: "https://ark.example.com/api/v3",
      apiKey: "test-key",
      model: "Doubao-Seed-2.0-lite",
      timeoutMs: 20000,
      maxRetries: 1,
      maxCompletionTokens: 700,
      temperature: 0.2,
    });
  });

  it("rejects invalid base URLs", () => {
    expect(() =>
      loadLlmConfig({
        ...validEnv(),
        LLM_BASE_URL: "not a url",
      }),
    ).toThrow(expect.objectContaining({ code: "LLM_BAD_BASE_URL" }));

    expect(() =>
      loadLlmConfig({
        ...validEnv(),
        LLM_BASE_URL: "ftp://ark.example.com",
      }),
    ).toThrow(expect.objectContaining({ code: "LLM_BAD_BASE_URL" }));
  });

  it("validates timeout, retry, token, and temperature ranges", () => {
    expectInvalidConfig("LLM_TIMEOUT_MS", "999");
    expectInvalidConfig("LLM_TIMEOUT_MS", "60001");
    expectInvalidConfig("LLM_MAX_RETRIES", "-1");
    expectInvalidConfig("LLM_MAX_RETRIES", "4");
    expectInvalidConfig("LLM_MAX_RETRIES", "1.5");
    expectInvalidConfig("LLM_MAX_COMPLETION_TOKENS", "63");
    expectInvalidConfig("LLM_MAX_COMPLETION_TOKENS", "2001");
    expectInvalidConfig("LLM_TEMPERATURE", "-0.1");
    expectInvalidConfig("LLM_TEMPERATURE", "1.1");
  });
});

function validEnv(): NodeJS.ProcessEnv {
  return {
    LLM_PROVIDER: "volcengine-ark",
    LLM_BASE_URL: "https://ark.example.com/api/v3",
    LLM_API_KEY: "test-key",
    LLM_MODEL: "Doubao-Seed-2.0-lite",
    LLM_TIMEOUT_MS: "20000",
    LLM_MAX_RETRIES: "1",
    LLM_MAX_COMPLETION_TOKENS: "700",
    LLM_TEMPERATURE: "0.2",
  };
}

function expectInvalidConfig(name: string, value: string): void {
  expect(() =>
    loadLlmConfig({
      ...validEnv(),
      [name]: value,
    }),
  ).toThrowError(LlmError);

  expect(() =>
    loadLlmConfig({
      ...validEnv(),
      [name]: value,
    }),
  ).toThrow(expect.objectContaining({ code: "LLM_BAD_REQUEST" }));
}
