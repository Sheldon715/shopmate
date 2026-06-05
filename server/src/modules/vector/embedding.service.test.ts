import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmbeddingError,
  HttpEmbeddingClient,
} from "./embedding.service";
import type { EmbeddingClientConfig } from "./embedding.types";

describe("HttpEmbeddingClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not expose provider error response bodies in error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("secret embedding prompt fragment", { status: 400 }),
      ),
    );
    const client = new HttpEmbeddingClient(config());
    let error: unknown;

    try {
      await client.embedQuery("推荐蓝牙耳机");
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(EmbeddingError);
    expect((error as Error).message).toBe(
      "Embedding request failed with HTTP 400.",
    );
    expect((error as Error).message).not.toContain("secret embedding");
  });
});

function config(
  overrides: Partial<EmbeddingClientConfig> = {},
): EmbeddingClientConfig {
  return {
    provider: "openai-compatible",
    baseUrl: "https://embedding.example.com/api/v1",
    apiKey: "test-key",
    model: "test-embedding",
    dimensions: 4,
    endpointKind: "embeddings",
    timeoutMs: 1000,
    maxRetries: 0,
    ...overrides,
  };
}
