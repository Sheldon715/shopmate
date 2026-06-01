import { rethrowIfAborted } from "../../lib/abort";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type { VectorSearchFilters } from "../vector/vector-search.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";
import type { ChatHistoryMessage } from "./chat.types";
import {
  normalizeLlmText,
  parseJsonObject,
  stripCodeFence,
} from "./llm-output-utils";
import type {
  NegativeConstraint,
  NegativeConstraintConfidence,
  NegativeConstraintIntentResult,
  NegativeConstraintKind,
  NegativeConstraintMatchPolicy,
  NegativeConstraintScope,
} from "./negative-constraint.types";
import { NO_NEGATIVE_CONSTRAINTS } from "./negative-constraint.types";
import { normalizeChatHistory } from "./prompt.builder";

export interface NegativeConstraintIntentDetectInput {
  question: string;
  shortHistory?: ChatHistoryMessage[];
  contextMemory?: ChatContextMemorySummary;
  filters?: VectorSearchFilters;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface NegativeConstraintIntentServiceOptions {
  llmClient: LlmClient;
}

interface ParsedNegativeConstraintIntent {
  hasNegativeConstraints: boolean;
  confidence: NegativeConstraintConfidence;
  constraints: NegativeConstraint[];
  needsClarification: boolean;
  clarificationQuestion?: string;
}

const NEGATIVE_INTENT_MAX_COMPLETION_TOKENS = 420;
const MAX_NEGATIVE_CONSTRAINTS = 5;
const MAX_NEGATIVE_TERM_CHARS = 80;
const MAX_NEGATIVE_RAW_TEXT_CHARS = 120;
const MAX_NEGATIVE_CLARIFICATION_CHARS = 90;
const VALID_CONFIDENCE: readonly NegativeConstraintConfidence[] = [
  "high",
  "medium",
  "low",
];
const VALID_KINDS: readonly NegativeConstraintKind[] = [
  "ingredient",
  "brand",
  "feature",
  "category",
  "price",
  "product",
  "unknown",
];
const VALID_SCOPES: readonly NegativeConstraintScope[] = [
  "product",
  "sku",
  "recommendation_set",
  "unknown",
];
const VALID_MATCH_POLICIES: readonly NegativeConstraintMatchPolicy[] = [
  "exclude_brand",
  "exclude_product",
  "exclude_category",
  "exclude_if_product_facts_conflict",
  "needs_clarification",
];

export class NegativeConstraintIntentService {
  private readonly llmClient: LlmClient;

  constructor(options: NegativeConstraintIntentServiceOptions) {
    this.llmClient = options.llmClient;
  }

  async detect(
    input: NegativeConstraintIntentDetectInput,
  ): Promise<NegativeConstraintIntentResult> {
    try {
      const response = await this.llmClient.generate({
        messages: buildNegativeConstraintPrompt(input),
        temperature: 0,
        maxCompletionTokens: NEGATIVE_INTENT_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });
      const parsed = parseNegativeConstraintIntentOutput(response.text);

      if (
        !parsed.hasNegativeConstraints
        || parsed.confidence === "low"
        || (parsed.constraints.length === 0 && !parsed.needsClarification)
      ) {
        return NO_NEGATIVE_CONSTRAINTS;
      }

      return parsed;
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return NO_NEGATIVE_CONSTRAINTS;
    }
  }
}

function buildNegativeConstraintPrompt(
  input: NegativeConstraintIntentDetectInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的否定约束意图判断器。",
        "只判断用户当前问题是否包含否定、排除或反选约束，并抽取结构化 constraints。",
        "不要推荐商品，不要生成商品卡片，不要决定 productId。",
        "不要根据关键词机械截取；必须判断用户是否真的表达了排除意图。",
        "不含酒精表示要排除含酒精或酒精风险不明确的商品，不能简单把出现酒精字样等同于含酒精。",
        "除了某品牌表示排除该品牌并推荐同类替代，不等于排除整个类目。",
        "不要太贵、便宜一点这类价格表达输出 kind=price，不能硬塞进普通 avoid term。",
        "如果排除对象不明确，输出 needs_clarification=true，并生成一句自然的中文 clarification_question。",
        "confidence 只能是 high、medium、low；不确定时用 low。",
        "constraints 最多 5 个。",
        "kind 只能是 ingredient、brand、feature、category、price、product、unknown。",
        "scope 只能是 product、sku、recommendation_set、unknown。",
        "match_policy 只能是 exclude_brand、exclude_product、exclude_category、exclude_if_product_facts_conflict、needs_clarification。",
        '只输出 JSON object，例如 {"has_negative_constraints":true,"confidence":"high","constraints":[{"raw_text":"不要含酒精","term":"酒精","kind":"ingredient","scope":"product","match_policy":"exclude_if_product_facts_conflict"}],"needs_clarification":false,"clarification_question":null}。',
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        shortHistory: normalizeChatHistory(input.shortHistory ?? []),
        contextMemory: summarizeContextMemory(input.contextMemory),
        filters: input.filters ?? {},
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
    pendingClarification: contextMemory.pendingClarification,
  };
}

function parseNegativeConstraintIntentOutput(
  rawText: string,
): ParsedNegativeConstraintIntent {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const hasNegativeConstraints = payload.has_negative_constraints;
  const confidence = parseConfidence(payload.confidence);

  if (typeof hasNegativeConstraints !== "boolean") {
    throw new Error(
      "negative constraint intent output must include boolean has_negative_constraints.",
    );
  }

  if (!confidence) {
    throw new Error(
      "negative constraint intent output must include valid confidence.",
    );
  }

  if (!hasNegativeConstraints) {
    return {
      hasNegativeConstraints: false,
      confidence,
      constraints: [],
      needsClarification: false,
    };
  }

  return {
    hasNegativeConstraints: true,
    confidence,
    constraints: parseConstraints(payload.constraints),
    needsClarification: payload.needs_clarification === true,
    clarificationQuestion: normalizeLlmText(
      parseOptionalString(payload.clarification_question),
      {
        maxChars: MAX_NEGATIVE_CLARIFICATION_CHARS,
      },
    ),
  };
}

function parseConstraints(value: unknown): NegativeConstraint[] {
  if (!Array.isArray(value)) {
    throw new Error("negative constraint constraints must be an array.");
  }

  const constraints: NegativeConstraint[] = [];

  for (const item of value.slice(0, MAX_NEGATIVE_CONSTRAINTS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const rawText = normalizeLlmText(parseOptionalString(record.raw_text), {
      maxChars: MAX_NEGATIVE_RAW_TEXT_CHARS,
    });
    const term = normalizeLlmText(parseOptionalString(record.term), {
      maxChars: MAX_NEGATIVE_TERM_CHARS,
    });
    const kind = parseKind(record.kind);
    const scope = parseScope(record.scope);
    const matchPolicy = parseMatchPolicy(record.match_policy);

    if (!rawText || !term || !kind || !scope || !matchPolicy) {
      continue;
    }

    constraints.push({
      rawText,
      term,
      kind,
      scope,
      matchPolicy,
    });
  }

  return constraints;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseConfidence(
  value: unknown,
): NegativeConstraintConfidence | undefined {
  return isOneOf(value, VALID_CONFIDENCE) ? value : undefined;
}

function parseKind(value: unknown): NegativeConstraintKind | undefined {
  return isOneOf(value, VALID_KINDS) ? value : undefined;
}

function parseScope(value: unknown): NegativeConstraintScope | undefined {
  return isOneOf(value, VALID_SCOPES) ? value : undefined;
}

function parseMatchPolicy(
  value: unknown,
): NegativeConstraintMatchPolicy | undefined {
  return isOneOf(value, VALID_MATCH_POLICIES) ? value : undefined;
}

function isOneOf<T extends string>(
  value: unknown,
  candidates: readonly T[],
): value is T {
  return typeof value === "string" && candidates.includes(value as T);
}
