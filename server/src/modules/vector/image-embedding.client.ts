import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { getEnv } from "../../lib/env";

export interface ImageEmbeddingInput {
  buffer: Buffer;
  mimeType: string;
  caption?: string;
  imagePath?: string;
}

export interface ImageEmbeddingResult {
  model: string;
  dimensions: number;
  vectors: number[][];
}

export interface ImageEmbeddingRequestOptions {
  abortSignal?: AbortSignal;
}

export interface ImageEmbeddingClient {
  embedImages(
    images: ImageEmbeddingInput[],
    options?: ImageEmbeddingRequestOptions,
  ): Promise<ImageEmbeddingResult>;
  embedImage(
    image: ImageEmbeddingInput,
    options?: ImageEmbeddingRequestOptions,
  ): Promise<ImageEmbeddingResult>;
}

export interface ImageEmbeddingClientConfig {
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
  maxRetries: number;
}

interface RawImageEmbeddingItem {
  embedding?: unknown;
  vector?: unknown;
}

interface RawImageEmbeddingResponse {
  data?: unknown;
  embeddings?: unknown;
  vectors?: unknown;
  model?: unknown;
}

export class ImageEmbeddingError extends Error {
  readonly code:
    | "IMAGE_EMBEDDING_DISABLED"
    | "IMAGE_EMBEDDING_REQUEST_FAILED"
    | "IMAGE_EMBEDDING_INVALID_OUTPUT";

  constructor(
    message: string,
    options: {
      code?:
        | "IMAGE_EMBEDDING_DISABLED"
        | "IMAGE_EMBEDDING_REQUEST_FAILED"
        | "IMAGE_EMBEDDING_INVALID_OUTPUT";
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ImageEmbeddingError";
    this.code = options.code ?? "IMAGE_EMBEDDING_REQUEST_FAILED";
  }
}

export class DisabledImageEmbeddingClient implements ImageEmbeddingClient {
  async embedImages(): Promise<ImageEmbeddingResult> {
    throw new ImageEmbeddingError("Image embedding provider is disabled.", {
      code: "IMAGE_EMBEDDING_DISABLED",
    });
  }

  async embedImage(): Promise<ImageEmbeddingResult> {
    throw new ImageEmbeddingError("Image embedding provider is disabled.", {
      code: "IMAGE_EMBEDDING_DISABLED",
    });
  }
}

export class FakeImageEmbeddingClient implements ImageEmbeddingClient {
  private readonly model: string;
  private readonly dimensions: number;

  constructor(options: { model?: string; dimensions?: number } = {}) {
    this.model = options.model ?? "fake-image-embedding";
    this.dimensions = options.dimensions ?? 8;
  }

  async embedImages(
    images: ImageEmbeddingInput[],
    options: ImageEmbeddingRequestOptions = {},
  ): Promise<ImageEmbeddingResult> {
    throwIfAborted(options.abortSignal);
    validateImages(images);

    return {
      model: this.model,
      dimensions: this.dimensions,
      vectors: images.map((image) =>
        createDeterministicVector(
          Buffer.concat([
            image.buffer,
            Buffer.from(image.caption ?? ""),
            Buffer.from(image.imagePath ?? ""),
          ]),
          this.dimensions,
        )
      ),
    };
  }

  async embedImage(
    image: ImageEmbeddingInput,
    options: ImageEmbeddingRequestOptions = {},
  ): Promise<ImageEmbeddingResult> {
    return this.embedImages([image], options);
  }
}

export class HttpImageEmbeddingClient implements ImageEmbeddingClient {
  private readonly config: ImageEmbeddingClientConfig;

  constructor(config: ImageEmbeddingClientConfig) {
    this.config = config;
  }

  async embedImages(
    images: ImageEmbeddingInput[],
    options: ImageEmbeddingRequestOptions = {},
  ): Promise<ImageEmbeddingResult> {
    throwIfAborted(options.abortSignal);
    validateImages(images);

    const results: ImageEmbeddingResult[] = [];

    for (const image of images) {
      results.push(await this.requestSingleImageEmbedding(image, options));
    }

    return {
      model: results[0]?.model ?? this.config.model,
      dimensions: this.config.dimensions,
      vectors: results.flatMap((result) => result.vectors),
    };
  }

  async embedImage(
    image: ImageEmbeddingInput,
    options: ImageEmbeddingRequestOptions = {},
  ): Promise<ImageEmbeddingResult> {
    return this.embedImages([image], options);
  }

  private async requestSingleImageEmbedding(
    image: ImageEmbeddingInput,
    options: ImageEmbeddingRequestOptions,
  ): Promise<ImageEmbeddingResult> {
    if (!this.config.baseUrl) {
      throw new ImageEmbeddingError("IMAGE_EMBEDDING_BASE_URL is required.");
    }

    if (!this.config.apiKey) {
      throw new ImageEmbeddingError("IMAGE_EMBEDDING_API_KEY is required.");
    }

    const endpoint = `${this.config.baseUrl.replace(/\/+$/, "")}/embeddings/multimodal`;
    const body = createImageEmbeddingRequestBody(image, this.config);
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
          if (response.status < 500 && response.status !== 429) {
            throw new ImageEmbeddingError(
              `Image embedding request failed with HTTP ${response.status}.`,
            );
          }

          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json() as RawImageEmbeddingResponse;

        return validateImageEmbeddingResult(
          parseImageEmbeddingResponse(payload, this.config),
          1,
          this.config.dimensions,
        );
      } catch (error) {
        lastError = error;

        if (error instanceof ImageEmbeddingError) {
          throw error;
        }

        if (!timedOut && isAbortError(error)) {
          throw new ImageEmbeddingError("Image embedding request was aborted.", {
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

    throw new ImageEmbeddingError(
      "Image embedding request failed after retries.",
      { cause: lastError },
    );
  }
}

export function createImageEmbeddingClient(): ImageEmbeddingClient {
  const env = getEnv();

  if (env.imageEmbeddingProvider === "disabled") {
    return new DisabledImageEmbeddingClient();
  }

  if (env.imageEmbeddingProvider === "fake") {
    return new FakeImageEmbeddingClient({
      model: env.imageEmbeddingModel,
      dimensions: env.imageEmbeddingDimensions,
    });
  }

  return new HttpImageEmbeddingClient({
    provider: env.imageEmbeddingProvider,
    baseUrl: env.imageEmbeddingBaseUrl,
    apiKey: env.imageEmbeddingApiKey,
    model: env.imageEmbeddingModel,
    dimensions: env.imageEmbeddingDimensions,
    timeoutMs: env.imageEmbeddingTimeoutMs,
    maxRetries: env.imageEmbeddingMaxRetries,
  });
}

export function validateImageEmbeddingResult(
  result: ImageEmbeddingResult,
  expectedCount: number,
  expectedDimensions: number,
): ImageEmbeddingResult {
  if (result.vectors.length !== expectedCount) {
    throw new ImageEmbeddingError(
      `Image embedding result count mismatch: expected ${expectedCount}, received ${result.vectors.length}.`,
      { code: "IMAGE_EMBEDDING_INVALID_OUTPUT" },
    );
  }

  for (const [index, vector] of result.vectors.entries()) {
    if (vector.length !== expectedDimensions) {
      throw new ImageEmbeddingError(
        `Image embedding vector ${index} dimensions mismatch: expected ${expectedDimensions}, received ${vector.length}.`,
        { code: "IMAGE_EMBEDDING_INVALID_OUTPUT" },
      );
    }
  }

  return result;
}

function createImageEmbeddingRequestBody(
  image: ImageEmbeddingInput,
  config: ImageEmbeddingClientConfig,
): Record<string, unknown> {
  const input: unknown[] = [
    {
      type: "image_url",
      image_url: {
        url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}`,
      },
    },
  ];

  if (image.caption?.trim()) {
    input.push({
      type: "text",
      text: image.caption.trim(),
    });
  }

  return {
    model: config.model,
    dimensions: config.dimensions,
    encoding_format: "float",
    input,
  };
}

function parseImageEmbeddingResponse(
  payload: RawImageEmbeddingResponse,
  config: ImageEmbeddingClientConfig,
): ImageEmbeddingResult {
  return {
    model: typeof payload.model === "string" ? payload.model : config.model,
    dimensions: config.dimensions,
    vectors: extractVectors(payload),
  };
}

function extractVectors(payload: RawImageEmbeddingResponse): number[][] {
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
      const record = item as RawImageEmbeddingItem;
      const vector = parseVector(record.embedding) ?? parseVector(record.vector);

      if (!vector) {
        throw new ImageEmbeddingError(
          `Image embedding response item ${index} has no vector.`,
          { code: "IMAGE_EMBEDDING_INVALID_OUTPUT" },
        );
      }

      return vector;
    });
  }

  throw new ImageEmbeddingError(
    "Image embedding response does not include vectors.",
    { code: "IMAGE_EMBEDDING_INVALID_OUTPUT" },
  );
}

function parseVectorList(value: unknown): number[][] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item, index) => {
    const vector = parseVector(item);

    if (!vector) {
      throw new ImageEmbeddingError(
        `Image embedding vector ${index} is invalid.`,
        { code: "IMAGE_EMBEDDING_INVALID_OUTPUT" },
      );
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

  const record = value as RawImageEmbeddingItem;

  return parseVector(record.embedding) ?? parseVector(record.vector);
}

function validateImages(images: ImageEmbeddingInput[]): void {
  if (images.length === 0) {
    throw new ImageEmbeddingError("At least one image is required.");
  }

  const emptyIndex = images.findIndex((image) => image.buffer.length === 0);

  if (emptyIndex !== -1) {
    throw new ImageEmbeddingError(`Image at index ${emptyIndex} is empty.`);
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ImageEmbeddingError("Image embedding request was aborted.", {
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

function createDeterministicVector(bytes: Buffer, dimensions: number): number[] {
  const values: number[] = [];
  let seed = createHash("sha256").update(bytes).digest();

  while (values.length < dimensions) {
    for (const byte of seed) {
      const value = (byte / 255) * 2 - 1;
      values.push(Number(value.toFixed(6)));

      if (values.length === dimensions) {
        break;
      }
    }

    seed = createHash("sha256").update(seed).digest();
  }

  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );

  return magnitude === 0 ? values : values.map((value) => value / magnitude);
}
