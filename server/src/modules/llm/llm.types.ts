export type LlmMessageRole = "system" | "developer" | "user" | "assistant";

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export type LlmResponseFormat = { type: "json_object" };

export interface LlmGenerateRequest {
  messages: LlmMessage[];
  temperature?: number;
  maxCompletionTokens?: number;
  timeoutMs?: number;
  responseFormat?: LlmResponseFormat;
  abortSignal?: AbortSignal;
  requestId?: string;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type LlmFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "unknown";

export interface LlmGenerateResponse {
  text: string;
  model: string;
  provider: string;
  finishReason: LlmFinishReason;
  usage?: LlmUsage;
  providerRequestId?: string;
  latencyMs: number;
}

export interface LlmStreamChunk {
  textDelta?: string;
  finishReason?: LlmFinishReason;
}

export interface LlmClient {
  generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse>;
  streamGenerate?(request: LlmGenerateRequest): AsyncIterable<LlmStreamChunk>;
}
