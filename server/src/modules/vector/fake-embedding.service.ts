import { createHash } from "node:crypto";
import type {
  EmbeddingClient,
  EmbeddingRequestOptions,
  EmbeddingResult,
} from "./embedding.types";

export interface FakeEmbeddingClientOptions {
  model?: string;
  dimensions?: number;
}

export class FakeEmbeddingClient implements EmbeddingClient {
  private readonly model: string;
  private readonly dimensions: number;

  constructor(options: FakeEmbeddingClientOptions = {}) {
    this.model = options.model ?? "fake-embedding";
    this.dimensions = options.dimensions ?? 8;
  }

  async embedDocuments(
    texts: string[],
    options: EmbeddingRequestOptions = {},
  ): Promise<EmbeddingResult> {
    throwIfAborted(options.abortSignal);
    validateEmbeddingTexts(texts);

    return {
      model: this.model,
      dimensions: this.dimensions,
      vectors: texts.map((text) => createDeterministicVector(text, this.dimensions)),
    };
  }

  async embedQuery(
    text: string,
    options: EmbeddingRequestOptions = {},
  ): Promise<EmbeddingResult> {
    throwIfAborted(options.abortSignal);
    validateEmbeddingTexts([text]);

    return {
      model: this.model,
      dimensions: this.dimensions,
      vectors: [createDeterministicVector(text, this.dimensions)],
    };
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Embedding request was aborted.");
  }
}

function validateEmbeddingTexts(texts: string[]): void {
  if (texts.length === 0) {
    throw new Error("At least one text is required for embedding.");
  }

  const emptyIndex = texts.findIndex((text) => text.trim().length === 0);

  if (emptyIndex !== -1) {
    throw new Error(`Embedding text at index ${emptyIndex} is empty.`);
  }
}

function createDeterministicVector(text: string, dimensions: number): number[] {
  const values: number[] = [];
  let seed = createHash("sha256").update(text).digest();

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
