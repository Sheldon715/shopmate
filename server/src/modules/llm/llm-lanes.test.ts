import { describe, expect, it } from "vitest";
import { createLlmLaneMetadata, loadLlmLaneConfig } from "./llm-lanes";

describe("loadLlmLaneConfig", () => {
  it("inherits the legacy LLM config when lane-specific models are absent", () => {
    const config = loadLlmLaneConfig(validEnv());

    expect(config.decisionPrimary).toMatchObject({
      enabled: true,
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "openai-default",
    });
    expect(config.decisionFallback).toBeUndefined();
    expect(config.answer).toMatchObject({
      enabled: true,
      provider: "openai",
      model: "openai-default",
    });
  });

  it("loads decision primary, decision fallback, and answer models independently", () => {
    const config = loadLlmLaneConfig({
      ...validEnv(),
      LLM_DECISION_BASE_URL: "https://api.openai.com/v1",
      LLM_DECISION_API_KEY: "openai-key",
      LLM_DECISION_MODEL: "openai-mini",
      LLM_DECISION_FALLBACK_MODEL: "openai-strong",
      LLM_ANSWER_MODEL: "answer-mini",
      LLM_DECISION_TEMPERATURE: "0",
      LLM_ANSWER_TEMPERATURE: "0.3",
    });

    expect(config.decisionPrimary).toMatchObject({
      enabled: true,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "openai-key",
      model: "openai-mini",
      temperature: 0,
    });
    expect(config.decisionFallback).toMatchObject({
      enabled: true,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "openai-key",
      model: "openai-strong",
      temperature: 0,
    });
    expect(config.answer).toMatchObject({
      enabled: true,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "openai-key",
      model: "answer-mini",
      temperature: 0.3,
    });
  });

  it("allows lane-specific provider credentials and base URLs", () => {
    const config = loadLlmLaneConfig({
      ...validEnv(),
      LLM_DECISION_MODEL: "decision-model",
      LLM_DECISION_BASE_URL: "https://decision.example.com/v1/",
      LLM_DECISION_API_KEY: "decision-key",
      LLM_ANSWER_MODEL: "answer-model",
      LLM_ANSWER_BASE_URL: "https://answer.example.com/v1",
      LLM_ANSWER_API_KEY: "answer-key",
    });

    expect(config.decisionPrimary).toMatchObject({
      baseUrl: "https://decision.example.com/v1",
      apiKey: "decision-key",
      model: "decision-model",
    });
    expect(config.answer).toMatchObject({
      baseUrl: "https://answer.example.com/v1",
      apiKey: "answer-key",
      model: "answer-model",
    });
  });

  it("exposes sanitized lane metadata without credentials or base URLs", () => {
    const config = loadLlmLaneConfig({
      ...validEnv(),
      LLM_DECISION_API_KEY: "decision-secret-key",
      LLM_DECISION_MODEL: "openai-mini",
      LLM_DECISION_FALLBACK_MODEL: "openai-strong",
      LLM_ANSWER_MODEL: "answer-mini",
    });

    const metadata = createLlmLaneMetadata(config);
    const serialized = JSON.stringify(metadata);

    expect(metadata).toEqual({
      decisionPrimary: {
        enabled: true,
        provider: "openai",
        model: "openai-mini",
      },
      decisionFallback: {
        enabled: true,
        provider: "openai",
        model: "openai-strong",
      },
      answer: {
        enabled: true,
        provider: "openai",
        model: "answer-mini",
      },
    });
    expect(serialized).not.toContain("decision-secret-key");
    expect(serialized).not.toContain("api.openai.com");
  });
});

function validEnv(): NodeJS.ProcessEnv {
  return {
    LLM_PROVIDER: "openai",
    LLM_BASE_URL: "https://api.openai.com/v1",
    LLM_API_KEY: "test-key",
    LLM_MODEL: "openai-default",
    LLM_TIMEOUT_MS: "20000",
    LLM_MAX_RETRIES: "1",
    LLM_MAX_COMPLETION_TOKENS: "700",
    LLM_TEMPERATURE: "0.2",
  };
}
