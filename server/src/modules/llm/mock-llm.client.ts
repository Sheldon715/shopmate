import { LlmError } from "./llm.error";
import type {
  LlmClient,
  LlmGenerateRequest,
  LlmGenerateResponse,
} from "./llm.types";

export type MockLlmHandler = (
  request: LlmGenerateRequest,
) => LlmGenerateResponse | Promise<LlmGenerateResponse>;

export interface MockLlmClientOptions {
  response?: LlmGenerateResponse;
  handler?: MockLlmHandler;
  error?: LlmError;
}

export class MockLlmClient implements LlmClient {
  private readonly response?: LlmGenerateResponse;
  private readonly handler?: MockLlmHandler;
  private readonly error?: LlmError;

  constructor(options: MockLlmClientOptions = {}) {
    this.response = options.response;
    this.handler = options.handler;
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
