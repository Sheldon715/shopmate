import { setTimeout as sleep } from "node:timers/promises";
import { loadLlmConfig } from "./llm.config";
import type { LlmConfig } from "./llm.config";
import { LlmError, mapHttpStatusToLlmError } from "./llm.error";
import type {
  LlmClient,
  LlmFinishReason,
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmMessage,
  LlmUsage,
} from "./llm.types";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface OpenAiCompatibleChoice {
  finish_reason?: unknown;
  message?: {
    content?: unknown;
  };
}

interface OpenAiCompatibleResponse {
  id?: unknown;
  model?: unknown;
  choices?: unknown;
  usage?: unknown;
}

export interface OpenAiCompatibleChatClientOptions {
  config?: LlmConfig;
  fetchImpl?: FetchLike;
  retryDelayMs?: number;
}

export class OpenAiCompatibleChatClient implements LlmClient {
  private readonly config: LlmConfig;
  private readonly fetchImpl: FetchLike;
  private readonly retryDelayMs: number;

  constructor(options: OpenAiCompatibleChatClientOptions = {}) {
    this.config = options.config ?? loadLlmConfig();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retryDelayMs = options.retryDelayMs ?? 250;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    if (!this.config.enabled) {
      throw new LlmError("LLM provider config is missing.", {
        code: "LLM_CONFIG_MISSING",
      });
    }

    if (request.messages.length === 0) {
      throw new LlmError("At least one LLM message is required.", {
        code: "LLM_BAD_REQUEST",
      });
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await this.requestCompletion(request);
      } catch (error) {
        lastError = error;

        if (!shouldRetry(error) || attempt === this.config.maxRetries) {
          throw error;
        }

        if (this.retryDelayMs > 0) {
          await sleep(this.retryDelayMs * 2 ** attempt);
        }
      }
    }

    throw new LlmError("LLM request failed after retries.", {
      code: "LLM_REQUEST_FAILED",
      retryable: true,
      cause: lastError,
    });
  }

  private async requestCompletion(
    request: LlmGenerateRequest,
  ): Promise<LlmGenerateResponse> {
    if (!this.config.enabled) {
      throw new LlmError("LLM provider config is missing.", {
        code: "LLM_CONFIG_MISSING",
      });
    }

    const startTime = Date.now();
    const endpoint = `${this.config.baseUrl}/chat/completions`;
    const timeoutMs = request.timeoutMs ?? this.config.timeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const removeAbortListener = pipeAbortSignal(
      request.abortSignal,
      controller,
    );

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: createHeaders(this.config.apiKey, request.requestId),
        body: JSON.stringify(createRequestBody(request, this.config)),
        signal: controller.signal,
      });
      const providerRequestId = getProviderRequestId(response.headers);

      if (!response.ok) {
        throw mapHttpStatusToLlmError(
          response.status,
          response.statusText,
          await safeReadText(response),
          providerRequestId,
        );
      }

      const payload = await readJson(response, providerRequestId);

      return parseCompletionResponse(
        payload,
        this.config,
        Date.now() - startTime,
        providerRequestId,
      );
    } catch (error) {
      if (error instanceof LlmError) {
        throw error;
      }

      if (timedOut || isAbortError(error)) {
        throw new LlmError("LLM provider request timed out.", {
          code: "LLM_TIMEOUT",
          retryable: timedOut,
          cause: error,
        });
      }

      throw new LlmError("LLM provider request failed.", {
        code: "LLM_REQUEST_FAILED",
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      removeAbortListener();
    }
  }
}

export function createLlmClient(config: LlmConfig = loadLlmConfig()): LlmClient {
  return new OpenAiCompatibleChatClient({ config });
}

function createHeaders(apiKey: string, requestId?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (requestId) {
    headers["X-Request-Id"] = requestId;
  }

  return headers;
}

function createRequestBody(
  request: LlmGenerateRequest,
  config: Extract<LlmConfig, { enabled: true }>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: request.messages.map(mapMessage),
    temperature: request.temperature ?? config.temperature,
    max_completion_tokens:
      request.maxCompletionTokens ?? config.maxCompletionTokens,
  };

  if (request.responseFormat) {
    body.response_format = request.responseFormat;
  }

  return body;
}

function mapMessage(message: LlmMessage): Record<string, string> {
  return {
    role: message.role,
    content: message.content,
  };
}

function pipeAbortSignal(
  source: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (!source) {
    return () => undefined;
  }

  if (source.aborted) {
    controller.abort();
    return () => undefined;
  }

  const onAbort = () => controller.abort();
  source.addEventListener("abort", onAbort, { once: true });

  return () => source.removeEventListener("abort", onAbort);
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();

    return text.trim().length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

async function readJson(
  response: Response,
  providerRequestId?: string,
): Promise<OpenAiCompatibleResponse> {
  try {
    const payload = await response.json();

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Expected object payload.");
    }

    return payload as OpenAiCompatibleResponse;
  } catch (error) {
    throw new LlmError("LLM provider response is not valid JSON.", {
      code: "LLM_INVALID_RESPONSE",
      providerRequestId,
      cause: error,
    });
  }
}

function parseCompletionResponse(
  payload: OpenAiCompatibleResponse,
  config: Extract<LlmConfig, { enabled: true }>,
  latencyMs: number,
  providerRequestId?: string,
): LlmGenerateResponse {
  const choice = getFirstChoice(payload.choices, providerRequestId);
  const text = getMessageContent(choice.message?.content);

  if (!text || text.trim().length === 0) {
    throw new LlmError("LLM provider returned an empty response.", {
      code: "LLM_EMPTY_RESPONSE",
      providerRequestId,
    });
  }

  return {
    text,
    model: typeof payload.model === "string" ? payload.model : config.model,
    provider: config.provider,
    finishReason: parseFinishReason(choice.finish_reason),
    usage: parseUsage(payload.usage),
    providerRequestId: providerRequestId ?? parseProviderRequestId(payload.id),
    latencyMs,
  };
}

function getFirstChoice(
  value: unknown,
  providerRequestId?: string,
): OpenAiCompatibleChoice {
  if (!Array.isArray(value) || value.length === 0) {
    throw new LlmError("LLM provider response has no choices.", {
      code: "LLM_INVALID_RESPONSE",
      providerRequestId,
    });
  }

  const choice = value[0];

  if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
    throw new LlmError("LLM provider response choice is invalid.", {
      code: "LLM_INVALID_RESPONSE",
      providerRequestId,
    });
  }

  return choice as OpenAiCompatibleChoice;
}

function getMessageContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const parts = value.flatMap((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      return [];
    }

    const record = part as Record<string, unknown>;

    return typeof record.text === "string" ? [record.text] : [];
  });

  return parts.length > 0 ? parts.join("") : undefined;
}

function parseFinishReason(value: unknown): LlmFinishReason {
  if (
    value === "stop"
    || value === "length"
    || value === "tool_calls"
    || value === "content_filter"
  ) {
    return value;
  }

  return "unknown";
}

function parseUsage(value: unknown): LlmUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const usage: LlmUsage = {};

  if (typeof record.prompt_tokens === "number") {
    usage.promptTokens = record.prompt_tokens;
  }

  if (typeof record.completion_tokens === "number") {
    usage.completionTokens = record.completion_tokens;
  }

  if (typeof record.total_tokens === "number") {
    usage.totalTokens = record.total_tokens;
  }

  return Object.keys(usage).length > 0 ? usage : undefined;
}

function parseProviderRequestId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getProviderRequestId(headers: Headers): string | undefined {
  return (
    headers.get("x-request-id")
    ?? headers.get("x-requestid")
    ?? headers.get("x-tt-logid")
    ?? undefined
  );
}

function shouldRetry(error: unknown): boolean {
  return error instanceof LlmError && error.retryable;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error
    && (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
