import { describe, expect, it } from "vitest";
import { loadImageSearchConfig } from "./image-search.config";

describe("loadImageSearchConfig", () => {
  it("defaults to disabled provider without pretending image search is configured", () => {
    const config = loadImageSearchConfig({});

    expect(config).toMatchObject({
      enabled: false,
      provider: "disabled",
      maxImageBytes: 5 * 1024 * 1024,
      maxCompletionTokens: 700,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      missing: ["IMAGE_SEARCH_PROVIDER"],
    });
  });

  it("reuses LLM base URL and key but requires an independent image model", () => {
    const config = loadImageSearchConfig({
      IMAGE_SEARCH_PROVIDER: "openai-compatible",
      LLM_BASE_URL: "https://ark.example.com/api/v3/",
      LLM_API_KEY: "llm-key",
    });

    expect(config).toMatchObject({
      enabled: false,
      provider: "openai-compatible",
      baseUrl: "https://ark.example.com/api/v3",
      apiKey: "llm-key",
      missing: ["IMAGE_SEARCH_MODEL"],
    });
  });

  it("loads dedicated image search provider settings", () => {
    const config = loadImageSearchConfig({
      IMAGE_SEARCH_PROVIDER: "openai-compatible",
      IMAGE_SEARCH_BASE_URL: "https://vision.example.com/api/v3/",
      IMAGE_SEARCH_API_KEY: "vision-key",
      IMAGE_SEARCH_MODEL: "vision-model",
      IMAGE_SEARCH_TIMEOUT_MS: "30000",
      IMAGE_SEARCH_MAX_IMAGE_BYTES: "2048",
      IMAGE_SEARCH_MAX_COMPLETION_TOKENS: "800",
      IMAGE_SEARCH_ALLOWED_MIME_TYPES: "image/png,image/jpeg,image/png",
    });

    expect(config).toMatchObject({
      enabled: true,
      provider: "openai-compatible",
      baseUrl: "https://vision.example.com/api/v3",
      apiKey: "vision-key",
      model: "vision-model",
      timeoutMs: 30000,
      maxImageBytes: 2048,
      maxCompletionTokens: 800,
      allowedMimeTypes: ["image/png", "image/jpeg"],
      missing: [],
    });
  });
});
