import { rethrowIfAborted } from "../../lib/abort";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type { VectorSearchFilters } from "../vector/vector-search.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";
import type { RagChatFallbackReason } from "./chat.types";
import {
  normalizeLlmText,
  stripCodeFence,
  tryParseJsonObject,
} from "./llm-output-utils";

export interface RagResponseGenerationServiceOptions {
  llmClient: LlmClient;
}

export interface NoCandidatesResponseInput {
  question: string;
  filters?: VectorSearchFilters;
  contextMemory?: ChatContextMemorySummary;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface GeneratedNoCandidatesResponse {
  answer: string;
  generatedByLlm: boolean;
}

const RAG_RESPONSE_MAX_COMPLETION_TOKENS = 160;
const MAX_RAG_FALLBACK_ANSWER_CHARS = 90;

export class RagResponseGenerationService {
  private readonly llmClient: LlmClient;

  constructor(options: RagResponseGenerationServiceOptions) {
    this.llmClient = options.llmClient;
  }

  async generateNoCandidatesAnswer(
    input: NoCandidatesResponseInput,
  ): Promise<string> {
    return (await this.generateNoCandidatesResponse(input)).answer;
  }

  async generateNoCandidatesResponse(
    input: NoCandidatesResponseInput,
  ): Promise<GeneratedNoCandidatesResponse> {
    try {
      const response = await this.llmClient.generate({
        messages: buildNoCandidatesPrompt(input),
        temperature: 0,
        maxCompletionTokens: RAG_RESPONSE_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });
      const answer = normalizeAnswer(parseAnswerOutput(response.text)
        ?? parsePlainTextAnswer(response.text));

      return answer
        ? { answer, generatedByLlm: true }
        : {
            answer: createMinimalRagFallbackAnswer("NO_CANDIDATES"),
            generatedByLlm: false,
          };
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return {
        answer: createMinimalRagFallbackAnswer("NO_CANDIDATES"),
        generatedByLlm: false,
      };
    }
  }
}

export function createMinimalRagFallbackAnswer(
  fallbackReason: Exclude<
    RagChatFallbackReason,
    "COMPARISON_TARGET_CLARIFICATION"
  >,
): string {
  switch (fallbackReason) {
    case "NO_CANDIDATES":
      return "当前商品库没有找到匹配结果。";
    case "LLM_ERROR":
    case "LLM_INVALID_OUTPUT":
      return "这次没有生成可靠推荐说明。";
    case "NO_VALID_PRODUCT_IDS":
      return "这次没有生成可靠的商品选择。";
    case "NEEDS_CLARIFICATION":
      return "需要补充更多信息。";
    case "CART_TARGET_MISSING":
    case "CART_TARGET_AMBIGUOUS":
    case "CART_CONFIRMATION_REQUIRED":
    case "CART_INTENT_UNCLEAR":
    case "CART_SNAPSHOT_UNAVAILABLE":
    case "CART_ADD_FAILED":
    case "CART_ACTION_FAILED":
      return "购物车操作未完成。";
  }
}

function buildNoCandidatesPrompt(
  input: NoCandidatesResponseInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的无结果回复生成器。",
        "当前商品库没有检索到可推荐的库内候选商品。",
        "请像电商导购一样生成简短中文 assistant 回复，承认当前条件下库内没有完全匹配商品，并给出下一步可继续筛选的方向。",
        "优先围绕用户已经说出的预算、品类、用途、品牌或偏好继续追问或建议放宽条件。",
        "不能推荐具体商品、品牌、价格、库存、优惠、物流或库外商品。",
        "不能把无结果说成推荐结果，不能输出商品卡片、JSON 或 markdown。",
        "只输出最终要展示给用户的一到两句话，不超过 90 个中文字符。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        filters: input.filters ?? {},
        contextMemory: summarizeContextMemory(input.contextMemory),
      }),
    },
  ];
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
  };
}

function parseAnswerOutput(rawText: string): string | undefined {
  const payload = tryParseJsonObject(stripCodeFence(rawText));
  const answer = payload?.answer;

  return typeof answer === "string" ? answer : undefined;
}

function parsePlainTextAnswer(rawText: string): string | undefined {
  const text = stripCodeFence(rawText).trim();

  return text.startsWith("{") ? undefined : text;
}

function normalizeAnswer(value: string | undefined): string | undefined {
  return normalizeLlmText(value, {
    maxChars: MAX_RAG_FALLBACK_ANSWER_CHARS,
  });
}
