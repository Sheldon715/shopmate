import { loadImageSearchConfig } from "./image-search.config";
import type { ImageSearchConfig } from "./image-search.config";
import type {
  VisualIntent,
  VisualIntentClient,
} from "./image-search.types";
import { ImageSearchError } from "./image-search.types";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenAiVisualIntentClientOptions {
  config?: ImageSearchConfig;
  fetchImpl?: FetchLike;
}

interface OpenAiCompatibleChoice {
  message?: {
    content?: unknown;
  };
}

interface OpenAiCompatibleResponse {
  id?: unknown;
  model?: unknown;
  choices?: unknown;
}

export class OpenAiVisualIntentClient implements VisualIntentClient {
  private readonly config: ImageSearchConfig;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAiVisualIntentClientOptions = {}) {
    this.config = options.config ?? loadImageSearchConfig();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async interpret(input: {
    image: { buffer: Buffer; mimeType: string };
    userText?: string;
    requestId?: string;
    abortSignal?: AbortSignal;
  }): Promise<VisualIntent> {
    if (
      !this.config.enabled
      || !this.config.baseUrl
      || !this.config.apiKey
      || !this.config.model
    ) {
      throw new ImageSearchError("Image search provider config is missing.", {
        code: "IMAGE_CONFIG_MISSING",
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
    const removeAbortListener = pipeAbortSignal(input.abortSignal, controller);

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: createHeaders(this.config.apiKey, input.requestId),
        body: JSON.stringify(createRequestBody(input, this.config)),
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

      const payload = await readJson(response, providerRequestId);
      const content = getMessageContent(payload.choices, providerRequestId);
      const parsed = parseVisualIntentJson(content, providerRequestId);

      return parsed as VisualIntent;
    } catch (error) {
      if (error instanceof ImageSearchError) {
        throw error;
      }

      if (timedOut || isAbortError(error)) {
        throw new ImageSearchError("Image search provider request timed out.", {
          code: "IMAGE_TIMEOUT",
          statusCode: 504,
          retryable: timedOut,
          cause: error,
        });
      }

      throw new ImageSearchError("Image search provider request failed.", {
        code: "IMAGE_REQUEST_FAILED",
        statusCode: 502,
        retryable: true,
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
  input: {
    image: { buffer: Buffer; mimeType: string };
    userText?: string;
  },
  config: ImageSearchConfig,
): Record<string, unknown> {
  return {
    model: config.model,
    temperature: 0,
    max_completion_tokens: config.maxCompletionTokens,
    messages: [
      {
        role: "system",
        content: createSystemPrompt(),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: createUserPrompt(input.userText),
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${input.image.mimeType};base64,${
                input.image.buffer.toString("base64")
              }`,
              detail: "low",
            },
          },
        ],
      },
    ],
  };
}

function createSystemPrompt(): string {
  return [
    "你是 ShopMate 的图片找货视觉理解模块，只负责把用户上传图片理解为导购检索意图。",
    "不要生成最终导购回复，不要推荐具体商品，不要执行购物车、下单、删除或对比动作。",
    "只基于图片可见内容和用户补充文字抽取视觉属性、颜色、材质、用途、约束和检索 query。",
    "品牌文字只能作为 detected_brand_text 弱信号；最终品牌事实以后续商品库为准。",
    "如果图片不是商品主体图、商品不可识别、置信度低，confidence 必须为 low，search_query 返回空字符串。",
    "如果图片包含人脸、证件、地址、订单、二维码、支付码、条形码或隐私风险，is_product_search=false，confidence=low，并要求用户换商品主体图。",
    "detected_category 只能在这些类目中选择：美妆护肤、数码电子、服饰运动、食品生活、家居日用、宠物用品、母婴用品、学生宿舍用品；无法判断时返回 null。",
    "只返回 JSON 对象，字段必须完全符合 schema，不要 Markdown，不要解释。",
    '{"is_product_search":true,"detected_category":null,"detected_brand_text":null,"visual_attributes":[],"colors":[],"materials":[],"use_case":null,"constraints":[],"search_query":"","confidence":"low","clarification_question":null}',
  ].join("\n");
}

function createUserPrompt(userText: string | undefined): string {
  return [
    "请分析这张图片是否适合用于电商图片找货，并输出固定 JSON。",
    userText ? `用户补充文字：${userText}` : "用户没有补充文字。",
  ].join("\n");
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
    throw new ImageSearchError("Image provider response is not valid JSON.", {
      code: "IMAGE_INVALID_OUTPUT",
      statusCode: 502,
      providerRequestId,
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

function getMessageContent(
  choices: unknown,
  providerRequestId?: string,
): string {
  const firstChoice = getFirstChoice(choices, providerRequestId);
  const content = firstChoice.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .flatMap((part) => {
        if (!part || typeof part !== "object" || Array.isArray(part)) {
          return [];
        }

        const record = part as Record<string, unknown>;
        return typeof record.text === "string" ? [record.text] : [];
      })
      .join("");

    if (text.length > 0) {
      return text;
    }
  }

  throw invalidProviderOutput(providerRequestId);
}

function getFirstChoice(
  choices: unknown,
  providerRequestId?: string,
): OpenAiCompatibleChoice {
  if (!Array.isArray(choices) || choices.length === 0) {
    throw invalidProviderOutput(providerRequestId);
  }

  const choice = choices[0];

  if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
    throw invalidProviderOutput(providerRequestId);
  }

  return choice as OpenAiCompatibleChoice;
}

function parseVisualIntentJson(
  text: string,
  providerRequestId?: string,
): unknown {
  try {
    return JSON.parse(stripCodeFence(text));
  } catch (error) {
    throw new ImageSearchError("Image provider output is not valid JSON.", {
      code: "IMAGE_INVALID_OUTPUT",
      statusCode: 502,
      providerRequestId,
      cause: error,
    });
  }
}

function stripCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenced ? fenced[1].trim() : trimmed;
}

function mapProviderHttpError(
  statusCode: number,
  body?: string,
  providerRequestId?: string,
): ImageSearchError {
  const providerErrorCode = parseProviderErrorCode(body);

  if (statusCode === 408) {
    return new ImageSearchError("Image search provider request timed out.", {
      code: "IMAGE_TIMEOUT",
      statusCode: 504,
      retryable: true,
      providerStatusCode: statusCode,
      providerErrorCode,
      providerRequestId,
    });
  }

  if (statusCode >= 500 || statusCode === 429) {
    return new ImageSearchError("Image search provider is unavailable.", {
      code: "IMAGE_PROVIDER_UNAVAILABLE",
      statusCode: 502,
      retryable: true,
      providerStatusCode: statusCode,
      providerErrorCode,
      providerRequestId,
    });
  }

  return new ImageSearchError("Image search provider request failed.", {
    code: "IMAGE_REQUEST_FAILED",
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

function getProviderRequestId(headers: Headers): string | undefined {
  const requestId = headers.get("x-request-id")
    ?? headers.get("x-requestid")
    ?? headers.get("x-tt-logid")
    ?? undefined;

  return requestId ? sanitizeProviderMetadata(requestId) : undefined;
}

function sanitizeProviderMetadata(value: string): string {
  return value.replace(/[^\w.:-]/g, "").slice(0, 120);
}

function invalidProviderOutput(providerRequestId?: string): ImageSearchError {
  return new ImageSearchError("Image provider output schema is invalid.", {
    code: "IMAGE_INVALID_OUTPUT",
    statusCode: 502,
    providerRequestId,
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
