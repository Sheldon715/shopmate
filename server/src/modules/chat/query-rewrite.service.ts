import { rethrowIfAborted, throwIfAborted } from "../../lib/abort";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type { VectorSearchFilters } from "../vector/vector-search.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";
import type { ChatHistoryMessage } from "./chat.types";
import {
  normalizeLlmText,
  parseJsonObject,
  stripCodeFence,
} from "./llm-output-utils";
import type { NegativeConstraint } from "./negative-constraint.types";
import { normalizeChatHistory } from "./prompt.builder";

export type QueryRewriteStatus = "rewritten" | "not_needed" | "fallback";
export type QueryRewriteConfidence = "high" | "medium";
export type QueryRewriteFallbackReason =
  | "LLM_ERROR"
  | "LLM_INVALID_OUTPUT"
  | "LOW_CONFIDENCE"
  | "EMPTY_QUERY"
  | "UNSAFE_QUERY";

export interface QueryRewriteInput {
  question: string;
  baseRetrievalQuery: string;
  shortHistory?: ChatHistoryMessage[];
  contextMemory?: ChatContextMemorySummary;
  filters?: VectorSearchFilters;
  negativeConstraints?: NegativeConstraint[];
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface QueryRewriteResult {
  status: QueryRewriteStatus;
  query: string;
  baseQuery?: string;
  rewrittenQuery?: string;
  reason?: string;
  confidence?: QueryRewriteConfidence;
  fallbackReason?: QueryRewriteFallbackReason;
}

export interface QueryRewriteServiceOptions {
  llmClient: LlmClient;
}

interface ParsedQueryRewriteOutput {
  shouldRewrite: boolean;
  rewrittenQuery?: string;
  reason?: string;
  confidence: QueryRewriteConfidence | "low";
}

const QUERY_REWRITE_MAX_COMPLETION_TOKENS = 360;
const MAX_REWRITTEN_QUERY_CHARS = 160;
const MAX_REWRITE_REASON_CHARS = 120;
const VALID_CONFIDENCE: ReadonlyArray<QueryRewriteConfidence | "low"> = [
  "high",
  "medium",
  "low",
];
const GENERIC_RETRIEVAL_TERMS = new Set([
  "商品",
  "产品",
  "推荐",
  "看看",
  "还有吗",
  "还有别的吗",
  "别的",
  "其他",
  "换一个",
  "再来",
]);
const PRODUCT_ID_PATTERN = /(?:p|product)_[a-z0-9_]+/iu;

export class QueryRewriteService {
  private readonly llmClient: LlmClient;

  constructor(options: QueryRewriteServiceOptions) {
    this.llmClient = options.llmClient;
  }

  async rewrite(input: QueryRewriteInput): Promise<QueryRewriteResult> {
    const baseQuery = normalizeBaseQuery(input.baseRetrievalQuery);

    try {
      throwIfAborted(input.abortSignal);
      const response = await this.llmClient.generate({
        messages: buildQueryRewritePrompt(input, baseQuery),
        temperature: 0,
        maxCompletionTokens: QUERY_REWRITE_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });
      throwIfAborted(input.abortSignal);
      const parsed = parseQueryRewriteOutput(response.text);

      if (!parsed.shouldRewrite) {
        return {
          status: "not_needed",
          query: baseQuery,
          baseQuery,
          reason: parsed.reason,
        };
      }

      if (parsed.confidence === "low") {
        return {
          status: "fallback",
          query: baseQuery,
          baseQuery,
          reason: parsed.reason,
          fallbackReason: "LOW_CONFIDENCE",
        };
      }

      const rewrittenQuery = normalizeRewrittenQuery(parsed.rewrittenQuery);

      if (!rewrittenQuery) {
        return {
          status: "fallback",
          query: baseQuery,
          baseQuery,
          reason: parsed.reason,
          fallbackReason: "EMPTY_QUERY",
        };
      }

      if (!isSafeRetrievalQuery(rewrittenQuery)) {
        return {
          status: "fallback",
          query: baseQuery,
          baseQuery,
          reason: parsed.reason,
          fallbackReason: "UNSAFE_QUERY",
        };
      }

      return {
        status: "rewritten",
        query: rewrittenQuery,
        baseQuery,
        rewrittenQuery,
        reason: parsed.reason,
        confidence: parsed.confidence,
      };
    } catch (error) {
      throwIfAborted(input.abortSignal);
      rethrowIfAborted(input.abortSignal, error);
      return {
        status: "fallback",
        query: baseQuery,
        baseQuery,
        fallbackReason:
          error instanceof QueryRewriteOutputError
            ? error.reason
            : "LLM_ERROR",
      };
    }
  }
}

class QueryRewriteOutputError extends Error {
  constructor(readonly reason: QueryRewriteFallbackReason, message: string) {
    super(message);
    this.name = "QueryRewriteOutputError";
  }
}

function buildQueryRewritePrompt(
  input: QueryRewriteInput,
  baseQuery: string,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的 RAG 检索 query 改写器。",
        "你的目标是生成更适合向量检索的短 query，不是回答用户。",
        "只输出 JSON object，不要输出 Markdown、解释文本或商品卡片。",
        "必须保留商品类目、用途、预算、品牌、价格、适用人群、已确认偏好和上下文追问目标。",
        "对“再便宜一点”“要轻薄一点”“还有别的吗”等短追问，要结合 contextMemory.lastIntent、constraints、lastRecommendedProductIds 和 shortHistory 补全检索意图。",
        "negative constraints 只能保留中性检索语义；不要自行新增 exclude 规则，已确认排除约束由后端 filters 和 post-filter 处理。",
        "cart、comparison、clarification 请求不应改写成普通商品推荐 query。",
        "不要输出 product id、库存、优惠、库外商品名或用户可见导购文案。",
        "confidence 只能是 high、medium、low；不确定或可能改变用户原意时用 low。",
        `rewritten_query 必须不超过 ${MAX_REWRITTEN_QUERY_CHARS} 个字符。`,
        '只输出 JSON object，例如 {"should_rewrite":true,"rewritten_query":"真无线耳机 更便宜 蓝牙耳机 预算更低","reason":"短追问需要补全品类和价格偏好","confidence":"high"}。',
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        baseRetrievalQuery: baseQuery,
        shortHistory: normalizeChatHistory(input.shortHistory ?? []),
        contextMemory: summarizeContextMemory(input.contextMemory),
        filters: input.filters ?? {},
        negativeConstraints: summarizeNegativeConstraints(
          input.negativeConstraints ?? [],
        ),
      }),
    },
  ];
}

function parseQueryRewriteOutput(rawText: string): ParsedQueryRewriteOutput {
  let payload: Record<string, unknown>;

  try {
    payload = parseJsonObject(stripCodeFence(rawText));
  } catch (error) {
    throw new QueryRewriteOutputError(
      "LLM_INVALID_OUTPUT",
      error instanceof Error ? error.message : "Invalid query rewrite JSON.",
    );
  }

  const shouldRewrite = payload.should_rewrite ?? payload.shouldRewrite;
  const confidence = parseConfidence(payload.confidence);

  if (typeof shouldRewrite !== "boolean") {
    throw new QueryRewriteOutputError(
      "LLM_INVALID_OUTPUT",
      "query rewrite output must include boolean should_rewrite.",
    );
  }

  if (!confidence) {
    throw new QueryRewriteOutputError(
      "LLM_INVALID_OUTPUT",
      "query rewrite output must include valid confidence.",
    );
  }

  return {
    shouldRewrite,
    rewrittenQuery: parseOptionalString(
      payload.rewritten_query ?? payload.rewrittenQuery,
    ),
    reason: normalizeLlmText(
      parseOptionalString(payload.reason),
      { maxChars: MAX_REWRITE_REASON_CHARS },
    ),
    confidence,
  };
}

function summarizeContextMemory(
  contextMemory: ChatContextMemorySummary | undefined,
): Record<string, unknown> | undefined {
  if (!contextMemory) {
    return undefined;
  }

  return {
    lastIntent: contextMemory.lastIntent,
    constraints: contextMemory.constraints,
    lastRecommendedProductIds: contextMemory.lastRecommendedProductIds,
    pendingClarification: contextMemory.pendingClarification,
  };
}

function summarizeNegativeConstraints(
  constraints: readonly NegativeConstraint[],
): Array<Record<string, string>> {
  return constraints.map((constraint) => ({
    term: constraint.term,
    kind: constraint.kind,
    scope: constraint.scope,
    matchPolicy: constraint.matchPolicy,
  }));
}

function normalizeBaseQuery(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizeRewrittenQuery(value: string | undefined): string | undefined {
  const normalized = normalizeBaseQuery(value ?? "");

  if (!normalized) {
    return undefined;
  }

  return Array.from(normalized).length <= MAX_REWRITTEN_QUERY_CHARS
    ? normalized
    : undefined;
}

function isSafeRetrievalQuery(value: string): boolean {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\s，。！？!?、,.]/gu, "")
    .toLocaleLowerCase("zh-CN");

  if (!normalized) {
    return false;
  }

  if (GENERIC_RETRIEVAL_TERMS.has(normalized)) {
    return false;
  }

  return !PRODUCT_ID_PATTERN.test(value);
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseConfidence(
  value: unknown,
): QueryRewriteConfidence | "low" | undefined {
  return isOneOf(value, VALID_CONFIDENCE) ? value : undefined;
}

function isOneOf<T extends string>(
  value: unknown,
  candidates: readonly T[],
): value is T {
  return typeof value === "string" && candidates.includes(value as T);
}
