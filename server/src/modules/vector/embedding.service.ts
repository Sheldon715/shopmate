import { setTimeout as sleep } from "node:timers/promises";
import { getEnv } from "../../lib/env";
import { FakeEmbeddingClient } from "./fake-embedding.service";
import type {
  EmbeddingClient,
  EmbeddingClientConfig,
  EmbeddingRequestOptions,
  EmbeddingResult,
  EmbeddingUsage,
} from "./embedding.types";

interface RawEmbeddingItem {
  embedding?: unknown;
  vector?: unknown;
}

interface RawEmbeddingResponse {
  data?: unknown;
  embeddings?: unknown;
  vectors?: unknown;
  model?: unknown;
  usage?: unknown;
}

export class EmbeddingError extends Error {
  readonly code = "EMBEDDING_REQUEST_FAILED";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmbeddingError";
  }
}

export function validateEmbeddingTexts(texts: string[]): void {
  if (texts.length === 0) {
    throw new EmbeddingError("At least one text is required for embedding.");
  }

  const emptyIndex = texts.findIndex((text) => text.trim().length === 0);

  if (emptyIndex !== -1) {
    throw new EmbeddingError(`Embedding text at index ${emptyIndex} is empty.`);
  }
}

export function validateEmbeddingResult(
  result: EmbeddingResult,
  expectedCount: number,
  expectedDimensions: number,
): EmbeddingResult {
  if (result.vectors.length !== expectedCount) {
    throw new EmbeddingError(
      `Embedding result count mismatch: expected ${expectedCount}, received ${result.vectors.length}.`,
    );
  }

  for (const [index, vector] of result.vectors.entries()) {
    if (vector.length !== expectedDimensions) {
      throw new EmbeddingError(
        `Embedding vector ${index} dimensions mismatch: expected ${expectedDimensions}, received ${vector.length}.`,
      );
    }
  }

  return result;
}

export class HttpEmbeddingClient implements EmbeddingClient {
  private readonly config: EmbeddingClientConfig;

  constructor(config: EmbeddingClientConfig) {
    this.config = config;
  }

  async embedDocuments(
    texts: string[],
    options: EmbeddingRequestOptions = {},
  ): Promise<EmbeddingResult> {
    throwIfAborted(options.abortSignal);
    validateEmbeddingTexts(texts);

    return validateEmbeddingResult(
      await this.requestEmbeddings(texts, options),
      texts.length,
      this.config.dimensions,
    );
  }

  async embedQuery(
    text: string,
    options: EmbeddingRequestOptions = {},
  ): Promise<EmbeddingResult> {
    throwIfAborted(options.abortSignal);
    validateEmbeddingTexts([text]);

    return validateEmbeddingResult(
      await this.requestEmbeddings([text], options),
      1,
      this.config.dimensions,
    );
  }

  private async requestEmbeddings(
    texts: string[],
    options: EmbeddingRequestOptions,
  ): Promise<EmbeddingResult> {
    if (this.config.endpointKind === "multimodal_embeddings" && texts.length > 1) {
      const results: EmbeddingResult[] = [];

      for (const text of texts) {
        throwIfAborted(options.abortSignal);
        results.push(await this.requestEmbeddingBatch([text], options));
      }

      return {
        model: results[0]?.model ?? this.config.model,
        dimensions: this.config.dimensions,
        vectors: results.flatMap((result) => result.vectors),
        usage: sumUsage(results),
      };
    }

    return this.requestEmbeddingBatch(texts, options);
  }

  private async requestEmbeddingBatch(
    texts: string[],
    options: EmbeddingRequestOptions,
  ): Promise<EmbeddingResult> {
    if (!this.config.baseUrl) {
      throw new EmbeddingError("EMBEDDING_BASE_URL is required.");
    }

    if (!this.config.apiKey) {
      throw new EmbeddingError("EMBEDDING_API_KEY is required.");
    }

    const endpoint = resolveEmbeddingEndpoint(
      this.config.baseUrl,
      this.config.endpointKind,
    );
    const body = createEmbeddingRequestBody(texts, this.config);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      throwIfAborted(options.abortSignal);
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.config.timeoutMs);
      const removeAbortListener = pipeAbortSignal(
        options.abortSignal,
        controller,
      );

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();

          if (response.status < 500 && response.status !== 429) {
            throw new EmbeddingError(
              `Embedding request failed with HTTP ${response.status}: ${text}`,
            );
          }

          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const payload = await response.json() as RawEmbeddingResponse;

        return parseEmbeddingResponse(payload, this.config);
      } catch (error) {
        lastError = error;

        if (error instanceof EmbeddingError) {
          throw error;
        }

        if (!timedOut && isAbortError(error)) {
          throw new EmbeddingError("Embedding request was aborted.", {
            cause: error,
          });
        }

        if (attempt === this.config.maxRetries) {
          break;
        }

        await sleep(250 * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
        removeAbortListener();
      }
    }

    throw new EmbeddingError("Embedding request failed after retries.", {
      cause: lastError,
    });
  }
}

export function createEmbeddingClient(): EmbeddingClient {
  const env = getEnv();

  if (env.embeddingProvider === "fake") {
    return new FakeEmbeddingClient({
      model: env.embeddingModel,
      dimensions: env.embeddingDimensions,
    });
  }

  return new HttpEmbeddingClient({
    provider: env.embeddingProvider,
    baseUrl: env.embeddingBaseUrl,
    apiKey: env.embeddingApiKey,
    model: env.embeddingModel,
    dimensions: env.embeddingDimensions,
    endpointKind: env.embeddingEndpointKind,
    timeoutMs: env.embeddingTimeoutMs,
    maxRetries: env.embeddingMaxRetries,
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new EmbeddingError("Embedding request was aborted.", {
      cause: signal.reason,
    });
  }
}

function pipeAbortSignal(
  source: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (!source) {
    return () => undefined;
  }

  if (source.aborted) {
    controller.abort(source.reason);
    return () => undefined;
  }

  const onAbort = () => controller.abort(source.reason);
  source.addEventListener("abort", onAbort, { once: true });

  return () => source.removeEventListener("abort", onAbort);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error
    && (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function resolveEmbeddingEndpoint(
  baseUrl: string,
  endpointKind: EmbeddingClientConfig["endpointKind"],
): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  if (endpointKind === "multimodal_embeddings") {
    return `${normalizedBase}/embeddings/multimodal`;
  }

  return `${normalizedBase}/embeddings`;
}

function createEmbeddingRequestBody(
  texts: string[],
  config: EmbeddingClientConfig,
): Record<string, unknown> {
  if (config.endpointKind === "multimodal_embeddings") {
    if (texts.length !== 1) {
      throw new EmbeddingError(
        "Multimodal embedding requests support one text at a time.",
      );
    }

    return {
      model: config.model,
      dimensions: config.dimensions,
      encoding_format: "float",
      input: [
        {
          type: "text",
          text: texts[0],
        },
      ],
    };
  }

  return {
    model: config.model,
    dimensions: config.dimensions,
    input: texts,
  };
}

function parseEmbeddingResponse(
  payload: RawEmbeddingResponse,
  config: EmbeddingClientConfig,
): EmbeddingResult {
  const vectors = extractVectors(payload);
  const usage = extractUsage(payload.usage);

  return {
    model: typeof payload.model === "string" ? payload.model : config.model,
    dimensions: config.dimensions,
    vectors,
    usage,
  };
}

function extractVectors(payload: RawEmbeddingResponse): number[][] {
  const directVectors = parseVectorList(payload.embeddings)
    ?? parseVectorList(payload.vectors);

  if (directVectors) {
    return directVectors;
  }

  const singleDataVector = parseVectorFromEmbeddingRecord(payload.data);

  if (singleDataVector) {
    return [singleDataVector];
  }

  if (Array.isArray(payload.data)) {
    return payload.data.map((item, index) => {
      const record = item as RawEmbeddingItem;
      const vector = parseVector(record.embedding) ?? parseVector(record.vector);

      if (!vector) {
        throw new EmbeddingError(`Embedding response item ${index} has no vector.`);
      }

      return vector;
    });
  }

  throw new EmbeddingError("Embedding response does not include vectors.");
}

function parseVectorList(value: unknown): number[][] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item, index) => {
    const vector = parseVector(item);

    if (!vector) {
      throw new EmbeddingError(`Embedding vector ${index} is invalid.`);
    }

    return vector;
  });
}

function parseVector(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  if (value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return value;
  }

  return undefined;
}

function parseVectorFromEmbeddingRecord(value: unknown): number[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as RawEmbeddingItem;

  return parseVector(record.embedding) ?? parseVector(record.vector);
}

function extractUsage(value: unknown): EmbeddingUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const inputTokens = record.input_tokens ?? record.prompt_tokens;

  return typeof inputTokens === "number"
    ? { inputTokens }
    : undefined;
}

function sumUsage(results: EmbeddingResult[]): EmbeddingUsage | undefined {
  const inputTokens = results.reduce(
    (sum, result) => sum + (result.usage?.inputTokens ?? 0),
    0,
  );

  return inputTokens > 0 ? { inputTokens } : undefined;
}
