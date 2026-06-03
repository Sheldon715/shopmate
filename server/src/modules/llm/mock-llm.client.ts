import { LlmError } from "./llm.error";
import type {
  LlmClient,
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmStreamChunk,
} from "./llm.types";

export type MockLlmHandler = (
  request: LlmGenerateRequest,
) => LlmGenerateResponse | Promise<LlmGenerateResponse>;
export type MockLlmStreamHandler = (
  request: LlmGenerateRequest,
) => AsyncIterable<LlmStreamChunk> | Iterable<LlmStreamChunk>;

export interface MockLlmClientOptions {
  response?: LlmGenerateResponse;
  handler?: MockLlmHandler;
  streamChunks?: LlmStreamChunk[];
  streamHandler?: MockLlmStreamHandler;
  error?: LlmError;
}

export class MockLlmClient implements LlmClient {
  private readonly response?: LlmGenerateResponse;
  private readonly handler?: MockLlmHandler;
  private readonly streamChunks?: LlmStreamChunk[];
  private readonly streamHandler?: MockLlmStreamHandler;
  private readonly error?: LlmError;

  constructor(options: MockLlmClientOptions = {}) {
    this.response = options.response;
    this.handler = options.handler;
    this.streamChunks = options.streamChunks;
    this.streamHandler = options.streamHandler;
    this.error = options.error;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    if (this.error) {
      throw this.error;
    }

    if (this.handler) {
      return this.handler(request);
    }

    return this.response ?? createDefaultMockResponse();
  }

  async *streamGenerate(
    request: LlmGenerateRequest,
  ): AsyncIterable<LlmStreamChunk> {
    if (this.error) {
      throw this.error;
    }

    if (this.streamHandler) {
      yield* this.streamHandler(request);
      return;
    }

    if (this.streamChunks) {
      yield* this.streamChunks;
      return;
    }

    const response = this.handler
      ? await this.handler(request)
      : this.response ?? createDefaultMockResponse();

    yield { textDelta: response.text };
    yield { finishReason: response.finishReason };
  }
}

function createDefaultMockResponse(): LlmGenerateResponse {
  return {
    text: "Mock LLM response",
    model: "mock-llm",
    provider: "mock",
    finishReason: "stop",
    latencyMs: 0,
  };
}
