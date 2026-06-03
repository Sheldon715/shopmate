import { describe, expect, it } from "vitest";
import { loadAsrConfig } from "./asr.config";

describe("loadAsrConfig", () => {
  it("reuses LLM env by default", () => {
    const config = loadAsrConfig({
      LLM_API_KEY: "llm-key",
      LLM_BASE_URL: "https://ark.example.com/v1/",
      LLM_MODEL: "doubao-audio",
    });

    expect(config).toMatchObject({
      enabled: true,
      provider: "llm-audio",
      apiKey: "llm-key",
      baseUrl: "https://ark.example.com/v1",
      model: "doubao-audio",
      language: "zh-CN",
    });
  });

  it("uses ASR overrides when provided", () => {
    const config = loadAsrConfig({
      LLM_API_KEY: "llm-key",
      LLM_BASE_URL: "https://llm.example.com/v1",
      LLM_MODEL: "llm-model",
      ASR_API_KEY: "asr-key",
      ASR_BASE_URL: "https://asr.example.com/v1",
      ASR_MODEL: "asr-model",
      ASR_PROVIDER: "dedicated-asr",
      ASR_TIMEOUT_MS: "9000",
      ASR_MAX_AUDIO_BYTES: "4096",
      ASR_LANGUAGE: "zh-CN",
    });

    expect(config).toMatchObject({
      enabled: true,
      provider: "dedicated-asr",
      apiKey: "asr-key",
      baseUrl: "https://asr.example.com/v1",
      model: "asr-model",
      timeoutMs: 9000,
      maxAudioBytes: 4096,
    });
  });

  it("reports missing provider settings without exposing secrets", () => {
    const config = loadAsrConfig({});

    expect(config.enabled).toBe(false);
    expect(config.missing).toEqual([
      "ASR_API_KEY or LLM_API_KEY",
      "ASR_BASE_URL or LLM_BASE_URL",
      "ASR_MODEL or LLM_MODEL",
    ]);
  });
});
