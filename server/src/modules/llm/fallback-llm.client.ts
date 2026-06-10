import { LlmError } from "./llm.error";
import type {
  LlmClient,
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmStreamChunk,
} from "./llm.types";

export interface FallbackLlmClientOptions {
  primary: LlmClient;
  fallback: LlmClient;
  shouldFallback?: (response: LlmGenerateResponse) => boolean;
}

export class FallbackLlmClient implements LlmClient {
  private readonly primary: LlmClient;
  private readonly fallback: LlmClient;
  private readonly shouldFallback?: (response: LlmGenerateResponse) => boolean;

  constructor(options: FallbackLlmClientOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.shouldFallback = options.shouldFallback;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    try {
      const response = await this.primary.generate(request);

      if (this.shouldFallback?.(response)) {
        return this.fallback.generate(request);
      }

      return response;
    } catch (error) {
      rethrowIfClientAbort(error, request.abortSignal);
      return this.fallback.generate(request);
    }
  }

  async *streamGenerate(
    request: LlmGenerateRequest,
  ): AsyncIterable<LlmStreamChunk> {
    if (!this.primary.streamGenerate) {
      const response = await this.generate(request);
      yield { textDelta: response.text };
      yield { finishReason: response.finishReason };
      return;
    }

    yield* this.primary.streamGenerate(request);
  }
}

function rethrowIfClientAbort(error: unknown, abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted) {
    throw error;
  }

  if (error instanceof LlmError && error.code === "LLM_TIMEOUT") {
    return;
  }
}
