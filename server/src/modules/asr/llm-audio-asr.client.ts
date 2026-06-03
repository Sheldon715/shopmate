import type {
  AsrProvider,
  AsrProviderTranscribeRequest,
  AsrProviderTranscribeResult,
} from "./asr.types";
import { AsrError } from "./asr.types";
import { loadAsrConfig } from "./asr.config";
import type { AsrConfig } from "./asr.config";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface LlmAudioAsrClientOptions {
  config?: AsrConfig;
  fetchImpl?: FetchLike;
}

export class LlmAudioAsrClient implements AsrProvider {
  private readonly config: AsrConfig;
  private readonly fetchImpl: FetchLike;

  constructor(options: LlmAudioAsrClientOptions = {}) {
    this.config = options.config ?? loadAsrConfig();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async transcribe(
    request: AsrProviderTranscribeRequest,
  ): Promise<AsrProviderTranscribeResult> {
    if (!this.config.enabled) {
      throw new AsrError("ASR provider config is missing.", {
        code: "ASR_CONFIG_MISSING",
        statusCode: 500,
      });
    }

    const endpoint = `${this.config.baseUrl}/chat/completions`;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);
    const removeAbortListener = pipeAbortSignal(request.abortSignal, controller);

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: createHeaders(this.config.apiKey!, request.requestId),
        body: JSON.stringify(createRequestBody(request, this.config)),
        signal: controller.signal,
      });
      const providerRequestId = getProviderRequestId(response.headers);

      if (!response.ok) {
        throw mapProviderHttpError(
          response.status,
          await safeReadText(response),
          providerRequestId,
        );
      }

      const payload = await readJson(response);
      const content = getMessageContent(payload);
      const parsed = parseAsrJson(content);

      return {
        transcript: parsed.transcript,
        language: parsed.language,
        confidence: parsed.confidence,
        provider: this.config.provider,
        model: getModel(payload) ?? this.config.model,
      };
    } catch (error) {
      if (error instanceof AsrError) {
        throw error;
      }

      if (timedOut || isAbortError(error)) {
        throw new AsrError("ASR provider request timed out.", {
          code: "ASR_TIMEOUT",
          retryable: timedOut,
          statusCode: 504,
          cause: error,
        });
      }

      throw new AsrError("ASR provider request failed.", {
        code: "ASR_REQUEST_FAILED",
        retryable: true,
        statusCode: 502,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      removeAbortListener();
    }
  }
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
  request: AsrProviderTranscribeRequest,
  config: AsrConfig,
): Record<string, unknown> {
  return {
    model: config.model,
    temperature: 0,
    thinking: {
      type: "disabled",
    },
    max_completion_tokens: config.maxCompletionTokens,
    messages: [
      {
        role: "system",
        content: [
          "你只负责把用户音频转写成中文文本。",
          "不要回答音频中的问题，不要推荐商品，不要总结，不要改写为搜索关键词。",
          "保持用户原话和口语表达。",
          `默认语言提示是 ${config.language}。`,
          "只返回 JSON：{\"transcript\":\"...\",\"language\":\"zh-CN\",\"confidence\":null}",
          "如果没有听清或没有语音，transcript 返回空字符串。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "请只转写这段音频，返回指定 JSON。",
          },
          {
            type: "input_audio",
            input_audio: {
              data: request.audio.buffer.toString("base64"),
              format: audioFormatFromMimeType(request.audio.mimeType),
            },
          },
        ],
      },
    ],
  };
}

function audioFormatFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }

  if (normalized.includes("wav")) {
    return "wav";
  }

  if (normalized.includes("webm")) {
    return "webm";
  }

  if (normalized.includes("aac")) {
    return "aac";
  }

  if (normalized.includes("mp4") || normalized.includes("m4a")) {
    return "m4a";
  }

  if (normalized.includes("ogg")) {
    return "ogg";
  }

  return "wav";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new AsrError("ASR provider response is not valid JSON.", {
      code: "ASR_INVALID_OUTPUT",
      statusCode: 502,
      cause: error,
    });
  }
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();

    return text.trim().length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function getMessageContent(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw invalidOutput();
  }

  const choices = (payload as Record<string, unknown>).choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    throw invalidOutput();
  }

  const firstChoice = choices[0];

  if (!firstChoice || typeof firstChoice !== "object" || Array.isArray(firstChoice)) {
    throw invalidOutput();
  }

  const message = (firstChoice as Record<string, unknown>).message;

  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw invalidOutput();
  }

  const content = (message as Record<string, unknown>).content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .flatMap((part) => {
        if (!part || typeof part !== "object" || Array.isArray(part)) {
          return [];
        }

        const value = (part as Record<string, unknown>).text;
        return typeof value === "string" ? [value] : [];
      })
      .join("");

    if (text.length > 0) {
      return text;
    }
  }

  throw invalidOutput();
}

function parseAsrJson(text: string): AsrProviderTranscribeResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new AsrError("ASR provider output is not valid JSON.", {
      code: "ASR_INVALID_OUTPUT",
      statusCode: 502,
      cause: error,
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalidOutput();
  }

  const record = parsed as Record<string, unknown>;

  if (typeof record.transcript !== "string") {
    throw invalidOutput();
  }

  return {
    transcript: record.transcript,
    language: typeof record.language === "string" ? record.language : undefined,
    confidence:
      typeof record.confidence === "number" || record.confidence === null
        ? record.confidence
        : undefined,
  };
}

function getModel(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const model = (payload as Record<string, unknown>).model;
  return typeof model === "string" && model.length > 0 ? model : undefined;
}

function mapProviderHttpError(
  statusCode: number,
  body?: string,
  providerRequestId?: string,
): AsrError {
  const providerErrorCode = parseProviderErrorCode(body);

  if (statusCode === 408) {
    return new AsrError("ASR provider request timed out.", {
      code: "ASR_TIMEOUT",
      statusCode: 504,
      retryable: true,
      providerStatusCode: statusCode,
      providerErrorCode,
      providerRequestId,
    });
  }

  if (statusCode >= 500 || statusCode === 429) {
    return new AsrError("ASR provider is unavailable.", {
      code: "ASR_PROVIDER_UNAVAILABLE",
      statusCode: 502,
      retryable: true,
      providerStatusCode: statusCode,
      providerErrorCode,
      providerRequestId,
    });
  }

  return new AsrError("ASR provider request failed.", {
    code: "ASR_REQUEST_FAILED",
    statusCode: 502,
    providerStatusCode: statusCode,
    providerErrorCode,
    providerRequestId,
  });
}

function parseProviderErrorCode(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(body);
    const code = readNestedString(parsed, ["error", "code"])
      ?? readNestedString(parsed, ["code"]);

    return code ? sanitizeProviderMetadata(code) : undefined;
  } catch {
    return undefined;
  }
}

function readNestedString(value: unknown, path: string[]): string | undefined {
  let cursor = value;

  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }

    cursor = (cursor as Record<string, unknown>)[key];
  }

  return typeof cursor === "string" && cursor.trim().length > 0
    ? cursor.trim()
    : undefined;
}

function sanitizeProviderMetadata(value: string): string {
  return value.replace(/[^\w.:-]/g, "").slice(0, 120);
}

function getProviderRequestId(headers: Headers): string | undefined {
  const requestId = headers.get("x-request-id")
    ?? headers.get("x-requestid")
    ?? headers.get("x-tt-logid")
    ?? undefined;

  return requestId ? sanitizeProviderMetadata(requestId) : undefined;
}

function invalidOutput(): AsrError {
  return new AsrError("ASR provider output schema is invalid.", {
    code: "ASR_INVALID_OUTPUT",
    statusCode: 502,
  });
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

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error
    && (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
