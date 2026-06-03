import { rethrowIfAborted } from "../../lib/abort";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type { VectorSearchFilters } from "../vector/vector-search.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";
import type { ChatHistoryMessage } from "./chat.types";
import {
  normalizeLlmText,
  parseJsonObject,
  stripCodeFence,
  tryParseJsonObject,
} from "./llm-output-utils";
import { normalizeChatHistory } from "./prompt.builder";

export type ComparisonIntentConfidence = "high" | "medium" | "low";
export type ComparisonTargetKind =
  | "recent_recommendations"
  | "names"
  | "category_search"
  | "unknown";

export interface ComparisonIntentTarget {
  kind: ComparisonTargetKind;
  ordinals: number[];
  names: string[];
}

export interface ComparisonIntentResult {
  isComparison: boolean;
  confidence: ComparisonIntentConfidence;
  target: ComparisonIntentTarget;
  userPriority?: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
}

export interface ComparisonIntentDetectInput {
  question: string;
  shortHistory?: ChatHistoryMessage[];
  contextMemory?: ChatContextMemorySummary;
  filters?: VectorSearchFilters;
  recentProductIds?: string[];
  requestId?: string;
  abortSignal?: AbortSignal;
}

export type ComparisonClarificationReason =
  | "too_few_targets"
  | "too_many_targets"
  | "ambiguous_targets"
  | "invalid_targets";

export interface ComparisonClarificationQuestionInput {
  question: string;
  reason: ComparisonClarificationReason;
  target: ComparisonIntentTarget;
  shortHistory?: ChatHistoryMessage[];
  contextMemory?: ChatContextMemorySummary;
  filters?: VectorSearchFilters;
  recentProductIds?: string[];
  candidateCount?: number;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface ComparisonIntentServiceOptions {
  llmClient: LlmClient;
}

const COMPARISON_INTENT_MAX_COMPLETION_TOKENS = 360;
const COMPARISON_PRODUCT_COUNT = 2;
const MAX_COMPARISON_TARGET_HINTS = 6;
const MAX_COMPARISON_NAME_CHARS = 80;
const MAX_COMPARISON_PRIORITY_CHARS = 80;
const MAX_COMPARISON_CLARIFICATION_CHARS = 90;
const VALID_CONFIDENCE: readonly ComparisonIntentConfidence[] = [
  "high",
  "medium",
  "low",
];
const VALID_TARGET_KINDS: readonly ComparisonTargetKind[] = [
  "recent_recommendations",
  "names",
  "category_search",
  "unknown",
];

const NO_COMPARISON_INTENT: ComparisonIntentResult = {
  isComparison: false,
  confidence: "low",
  target: {
    kind: "unknown",
    ordinals: [],
    names: [],
  },
  needsClarification: false,
};

export class ComparisonIntentService {
  private readonly llmClient: LlmClient;

  constructor(options: ComparisonIntentServiceOptions) {
    this.llmClient = options.llmClient;
  }

  async detect(
    input: ComparisonIntentDetectInput,
  ): Promise<ComparisonIntentResult> {
    const explicitRecentOrdinalIntent =
      createExplicitRecentOrdinalComparisonIntent(input);
    const explicitRecentDemonstrativeIntent =
      createExplicitRecentDemonstrativeComparisonIntent(input);
    const explicitRecentComparisonIntent =
      explicitRecentOrdinalIntent ?? explicitRecentDemonstrativeIntent;
    const shouldRunFocusedComparisonCheck =
      hasRecentRecommendationComparisonCue(input)
      || hasAmbiguousComparisonCue(input);

    try {
      const response = await this.llmClient.generate({
        messages: buildComparisonIntentPrompt(input),
        temperature: 0,
        maxCompletionTokens: COMPARISON_INTENT_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });
      const parsed = parseComparisonIntentOutput(response.text);
      const targetRepairedParsed = repairExplicitRecentComparisonTarget(
        parsed,
        explicitRecentComparisonIntent,
      );

      if (
        (!targetRepairedParsed.isComparison
          || targetRepairedParsed.confidence === "low")
        && shouldRunFocusedComparisonCheck
      ) {
        const focusedParsed =
          await this.detectFocusedComparisonIntent(input);

        if (focusedParsed?.isComparison && focusedParsed.confidence !== "low") {
          return repairExplicitRecentComparisonTarget(
            focusedParsed,
            explicitRecentComparisonIntent,
          );
        }

        if (explicitRecentComparisonIntent) {
          return explicitRecentComparisonIntent;
        }
      }

      if (
        !targetRepairedParsed.isComparison
        || targetRepairedParsed.confidence === "low"
      ) {
        return NO_COMPARISON_INTENT;
      }

      return targetRepairedParsed;
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      const focusedParsed = shouldRunFocusedComparisonCheck
        ? await this.detectFocusedComparisonIntent(input)
        : undefined;

      if (focusedParsed?.isComparison && focusedParsed.confidence !== "low") {
        return repairExplicitRecentComparisonTarget(
          focusedParsed,
          explicitRecentComparisonIntent,
        );
      }

      if (explicitRecentComparisonIntent) {
        return explicitRecentComparisonIntent;
      }

      return NO_COMPARISON_INTENT;
    }
  }

  async createClarificationQuestion(
    input: ComparisonClarificationQuestionInput,
  ): Promise<string | undefined> {
    try {
      const response = await this.llmClient.generate({
        messages: buildComparisonClarificationQuestionPrompt(input),
        temperature: 0,
        maxCompletionTokens: COMPARISON_INTENT_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });

      return parseComparisonClarificationQuestionOutput(response.text);
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return undefined;
    }
  }

  private async detectFocusedComparisonIntent(
    input: ComparisonIntentDetectInput,
  ): Promise<ComparisonIntentResult | undefined> {
    try {
      const response = await this.llmClient.generate({
        messages: buildFocusedComparisonIntentPrompt(input),
        temperature: 0,
        maxCompletionTokens: COMPARISON_INTENT_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });

      return parseComparisonIntentOutput(response.text);
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return undefined;
    }
  }
}

function buildComparisonIntentPrompt(
  input: ComparisonIntentDetectInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的商品对比意图判断器。",
        "只判断用户当前问题是否明确要求比较多个商品，并抽取目标商品线索和关注点。",
        "不要推荐商品，不要生成对比表，不要输出 productId。",
        "“推荐两款商品”不是对比请求；“把第二个加入购物车”不是对比请求。",
        "“这两款哪个好”“对比第一款和第二款”“理肤泉和安热沙怎么选”才是对比请求。",
        "当 recentRecommendationCount >= 2 且用户说“这两款”“这两个”“第一款和第二款”“哪个更适合”这类指代最近推荐商品的比较问题时，必须输出 is_comparison=true，target.kind=recent_recommendations。",
        "不要因为用户没重复商品名就输出 false；最近推荐上下文就是目标来源。",
        "示例：帮我对比这两款，哪个更适合油皮通勤 -> is_comparison=true,target.kind=recent_recommendations,ordinals=[1,2],user_priority=油皮通勤。",
        "示例：对比第一款和第二款 -> is_comparison=true,target.kind=recent_recommendations,ordinals=[1,2]。",
        "示例：对比下前两个 -> is_comparison=true,target.kind=recent_recommendations,ordinals=[1,2]。",
        "示例：对比一下第二个和第三个 -> is_comparison=true,target.kind=recent_recommendations,ordinals=[2,3]。",
        "示例：推荐两款适合通勤的防晒 -> is_comparison=false。",
        "ShopMate 当前只支持两款商品对比；如果用户要求对比三款或更多，仍输出 is_comparison=true，但 needs_clarification=true，并用 clarification_question 自然说明目前只支持两款，请用户选两款。",
        "target.kind 只能是 recent_recommendations、names、category_search、unknown。",
        "recent_recommendations 用于这两款、第一个和第二个等指向最近推荐商品的表达。",
        "names 用于用户说出了商品名、品牌名或别名。",
        "category_search 用于用户只说帮我对比两款某类商品，需要先检索候选。",
        "如果用户只说“帮我比较一下”“帮我对比一下”，但没有商品名、序号、品类或最近推荐目标，仍属于 comparison intent；输出 target.kind=unknown,needs_clarification=true，并由你生成追问要比较哪两款商品的 clarification_question。",
        "目标不足的 comparison intent 不应该变成普通推荐 intent。",
        "目标不足或歧义时输出 needs_clarification=true，并生成一句自然的中文 clarification_question。",
        "confidence 只能是 high、medium、low；不确定时用 low。",
        "ordinals 按用户说的 1-based 序号输出；如果超过两款也要保留这些线索供后端判断。",
        "names 按用户说出的商品名、品牌名或别名输出；如果超过两款也要保留这些线索供后端判断。",
        '只输出 JSON object，例如 {"is_comparison":true,"confidence":"high","target":{"kind":"recent_recommendations","ordinals":[1,2],"names":[]},"user_priority":"油皮通勤","needs_clarification":false,"clarification_question":null}。',
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        shortHistory: normalizeChatHistory(input.shortHistory ?? []),
        contextMemory: summarizeContextMemory(input.contextMemory),
        filters: input.filters ?? {},
        recentRecommendationCount: input.recentProductIds?.length ?? 0,
        explicitRecentOrdinalPair:
          extractExplicitRecentOrdinalTarget(input.question) ?? [],
      }),
    },
  ];
}

function buildFocusedComparisonIntentPrompt(
  input: ComparisonIntentDetectInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的商品对比意图复核器。",
        "代码只提供候选线索，最终仍由你判断用户是否在要求比较商品。",
        "如果用户当前消息是在问最近推荐中的多款商品哪个更适合、怎么选、有什么差异，输出 is_comparison=true。",
        "如果用户只说“帮我比较一下”“对比一下”这类明确比较请求，但没有给出商品名、序号或品类，仍输出 is_comparison=true,target.kind=unknown,needs_clarification=true，并生成一句自然中文 clarification_question 追问要比较哪两款商品。",
        "如果用户是在要求推荐新商品、加入购物车、删除购物车或普通闲聊，输出 is_comparison=false。",
        "当用户指向最近推荐商品时，target.kind 必须是 recent_recommendations；如果没有明确序号但说“这两款/这两个”，ordinals 输出 [1,2]。",
        "如果用户说“前两个”“前两款”“前俩”“前2个”，且 recentRecommendationCount >= 2，必须输出 is_comparison=true,target.kind=recent_recommendations,ordinals=[1,2]。",
        "当用户说“帮我对比两款防晒霜”“比较两款耳机”这类有品类但没有具体商品名的请求时，target.kind=category_search。",
        "如果没有最近推荐目标，也没有商品名或品类，target.kind 必须是 unknown。",
        "如果用户说“第二个和第三个”“第2个和第3个”“2和3”，且 recentRecommendationCount >= 3，必须输出 is_comparison=true,target.kind=recent_recommendations,ordinals=[2,3]。",
        "ShopMate 当前只支持两款商品对比；如果用户要求对比三款或更多，needs_clarification=true，并用 clarification_question 自然说明目前只支持两款，请用户选两款。",
        '只输出 JSON object，例如 {"is_comparison":true,"confidence":"high","target":{"kind":"recent_recommendations","ordinals":[1,2],"names":[]},"user_priority":"油皮通勤","needs_clarification":false,"clarification_question":null}。',
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        recentRecommendationCount: input.recentProductIds?.length ?? 0,
        recentProductIds: input.recentProductIds ?? [],
        explicitRecentOrdinalPair:
          extractExplicitRecentOrdinalTarget(input.question) ?? [],
        shortHistory: normalizeChatHistory(input.shortHistory ?? []),
        contextMemory: summarizeContextMemory(input.contextMemory),
      }),
    },
  ];
}

function buildComparisonClarificationQuestionPrompt(
  input: ComparisonClarificationQuestionInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的商品对比澄清问题生成器。",
        "用户已经被 LLM 判断为商品对比请求，但当前目标商品不足、过多、无效或歧义。",
        "只生成一句自然中文追问，让用户补充或选择要对比的两款商品。",
        "不要推荐商品，不要生成对比表，不要输出 productId，不要解释规则细节。",
        "如果最近推荐不足两款，询问还想和哪款商品对比。",
        "如果最近推荐超过两款或目标超过两款，询问用户选择哪两款。",
        "如果商品名歧义或无效，询问更完整的商品名或明确具体商品。",
        "只输出 JSON object，例如 {\"clarification_question\":\"你想比较刚才推荐里的哪两款？\"}。",
        "clarification_question 必须是一句话，不超过 90 个中文字符。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        reason: input.reason,
        target: input.target,
        candidateCount: input.candidateCount,
        filters: input.filters ?? {},
        recentRecommendationCount: input.recentProductIds?.length ?? 0,
        recentProductIds: input.recentProductIds ?? [],
        shortHistory: normalizeChatHistory(input.shortHistory ?? []),
        contextMemory: summarizeContextMemory(input.contextMemory),
      }),
    },
  ];
}

function parseComparisonClarificationQuestionOutput(
  rawText: string,
): string | undefined {
  const payload = tryParseJsonObject(stripCodeFence(rawText));

  return normalizeLlmText(
    parseOptionalString(
      payload?.clarification_question
        ?? payload?.clarificationQuestion
        ?? payload?.question,
    ),
    { maxChars: MAX_COMPARISON_CLARIFICATION_CHARS },
  );
}

export function parseComparisonIntentOutput(
  rawText: string,
): ComparisonIntentResult {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const isComparison = payload.is_comparison ?? payload.isComparison;
  const confidence = parseConfidence(payload.confidence);

  if (typeof isComparison !== "boolean") {
    throw new Error("comparison intent output must include boolean is_comparison.");
  }

  if (!confidence) {
    throw new Error("comparison intent output must include valid confidence.");
  }

  if (!isComparison) {
    return {
      ...NO_COMPARISON_INTENT,
      confidence,
    };
  }

  const target = parseTarget(payload.target);
  const clarificationQuestion = normalizeLlmText(
    parseOptionalString(
      payload.clarification_question ?? payload.clarificationQuestion,
    ),
    {
      maxChars: MAX_COMPARISON_CLARIFICATION_CHARS,
    },
  );
  const exceedsSupportedProductCount =
    target.ordinals.length > COMPARISON_PRODUCT_COUNT
    || target.names.length > COMPARISON_PRODUCT_COUNT;

  return {
    isComparison: true,
    confidence,
    target,
    userPriority: normalizeLlmText(
      parseOptionalString(payload.user_priority ?? payload.userPriority),
      {
        maxChars: MAX_COMPARISON_PRIORITY_CHARS,
      },
    ),
    needsClarification:
      (payload.needs_clarification ?? payload.needsClarification) === true
      || exceedsSupportedProductCount,
    clarificationQuestion,
  };
}

function hasRecentRecommendationComparisonCue(
  input: ComparisonIntentDetectInput,
): boolean {
  if ((input.recentProductIds?.length ?? 0) < 2) {
    return false;
  }

  const normalized = input.question.replace(/\s+/gu, "");
  const hasComparisonCue = [
    "对比",
    "比较",
    "哪个更",
    "哪款更",
    "怎么选",
    "差异",
    "区别",
  ].some((term) => normalized.includes(term));
  const hasRecentCue = [
    "这两款",
    "这两个",
    "这几款",
    "第一个",
    "第二个",
    "第三个",
    "第一款",
    "第二款",
    "第三款",
    "前两个",
    "前两款",
    "前俩",
    "前2个",
    "前2款",
    "1和2",
    "2和3",
    "一和二",
    "二和三",
  ].some((term) => normalized.includes(term));
  const hasOrdinalPairCue =
    /第?[一二两三四五六七八九十0-9]{1,3}(?:个|款)?(?:和|跟|与|及|、|,|，)第?[一二两三四五六七八九十0-9]{1,3}(?:个|款)?/u
      .test(normalized);

  return hasComparisonCue && (hasRecentCue || hasOrdinalPairCue);
}

function hasAmbiguousComparisonCue(input: ComparisonIntentDetectInput): boolean {
  const normalized = input.question.replace(/\s+/gu, "");

  return [
    "帮我对比一下",
    "帮我比较一下",
    "对比一下",
    "比较一下",
    "对比下",
    "比较下",
    "帮我对比",
    "帮我比较",
  ].some((term) => normalized.includes(term));
}

function createExplicitRecentOrdinalComparisonIntent(
  input: ComparisonIntentDetectInput,
): ComparisonIntentResult | undefined {
  const recentRecommendationCount = input.recentProductIds?.length ?? 0;

  if (recentRecommendationCount < COMPARISON_PRODUCT_COUNT) {
    return undefined;
  }

  const normalized = input.question.replace(/\s+/gu, "");
  const hasComparisonCue = [
    "对比",
    "比较",
    "哪个更",
    "哪款更",
    "怎么选",
    "差异",
    "区别",
  ].some((term) => normalized.includes(term));

  if (!hasComparisonCue) {
    return undefined;
  }

  const ordinals = extractExplicitRecentOrdinalTarget(normalized);

  if (
    !ordinals
    || ordinals.length !== COMPARISON_PRODUCT_COUNT
    || new Set(ordinals).size !== COMPARISON_PRODUCT_COUNT
    || Math.max(...ordinals) > recentRecommendationCount
  ) {
    return undefined;
  }

  return {
    isComparison: true,
    confidence: "medium",
    target: {
      kind: "recent_recommendations",
      ordinals,
      names: [],
    },
    needsClarification: false,
  };
}

function createExplicitRecentDemonstrativeComparisonIntent(
  input: ComparisonIntentDetectInput,
): ComparisonIntentResult | undefined {
  if ((input.recentProductIds?.length ?? 0) !== COMPARISON_PRODUCT_COUNT) {
    return undefined;
  }

  const normalized = input.question.replace(/\s+/gu, "");
  const hasComparisonCue = [
    "对比",
    "比较",
    "哪个更",
    "哪款更",
    "怎么选",
    "差异",
    "区别",
  ].some((term) => normalized.includes(term));
  const hasTwoRecentProductsCue = [
    "这两款",
    "这两个",
    "这俩",
  ].some((term) => normalized.includes(term));

  if (!hasComparisonCue || !hasTwoRecentProductsCue) {
    return undefined;
  }

  return {
    isComparison: true,
    confidence: "medium",
    target: {
      kind: "recent_recommendations",
      ordinals: [1, 2],
      names: [],
    },
    needsClarification: false,
  };
}

function repairExplicitRecentComparisonTarget(
  parsed: ComparisonIntentResult,
  explicitRecentComparisonIntent: ComparisonIntentResult | undefined,
): ComparisonIntentResult {
  if (!explicitRecentComparisonIntent || !parsed.isComparison) {
    return parsed;
  }

  const hasSupportedRecentOrdinalTarget =
    parsed.target.kind === "recent_recommendations"
    && parsed.target.ordinals.length === COMPARISON_PRODUCT_COUNT;

  if (hasSupportedRecentOrdinalTarget) {
    return parsed;
  }

  return {
    ...parsed,
    confidence: parsed.confidence === "low"
      ? explicitRecentComparisonIntent.confidence
      : parsed.confidence,
    target: explicitRecentComparisonIntent.target,
    needsClarification: false,
    clarificationQuestion: undefined,
  };
}

function extractExplicitRecentOrdinalTarget(question: string): number[] | undefined {
  return extractExplicitRecentOrdinalPair(question)
    ?? extractLeadingRecentPair(question);
}

function extractExplicitRecentOrdinalPair(question: string): number[] | undefined {
  const normalized = question.replace(/\s+/gu, "");
  const match =
    /第?([一二两三四五六七八九十0-9]{1,3})(?:个|款)?(?:和|跟|与|及|、|,|，)第?([一二两三四五六七八九十0-9]{1,3})(?:个|款)?/u
      .exec(normalized);

  if (!match) {
    return undefined;
  }

  const allOrdinals = Array.from(
    normalized.matchAll(/第?([一二两三四五六七八九十0-9]{1,3})(?:个|款)/gu),
  ).map((ordinalMatch) => parseOrdinalToken(ordinalMatch[1]))
    .filter((ordinal): ordinal is number => ordinal !== undefined);

  if (allOrdinals.length > COMPARISON_PRODUCT_COUNT) {
    return undefined;
  }

  const ordinals = [parseOrdinalToken(match[1]), parseOrdinalToken(match[2])];

  if (ordinals.some((ordinal) => ordinal === undefined)) {
    return undefined;
  }

  return ordinals as number[];
}

function extractLeadingRecentPair(question: string): number[] | undefined {
  const normalized = question.replace(/\s+/gu, "");
  const hasLeadingPairCue =
    /前(?:两|二|2)(?:个|款)?/u.test(normalized)
    || normalized.includes("前俩");

  return hasLeadingPairCue ? [1, 2] : undefined;
}

function parseOrdinalToken(token: string): number | undefined {
  if (/^\d{1,3}$/u.test(token)) {
    const ordinal = Number(token);

    return ordinal > 0 ? ordinal : undefined;
  }

  const digitMap: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (token === "十") {
    return 10;
  }

  if (token.includes("十")) {
    const [rawTens, rawOnes] = token.split("十");
    const tens = rawTens ? digitMap[rawTens] : 1;
    const ones = rawOnes ? digitMap[rawOnes] : 0;

    if (!tens || ones === undefined) {
      return undefined;
    }

    return tens * 10 + ones;
  }

  return digitMap[token];
}

function parseTarget(value: unknown): ComparisonIntentTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      kind: "unknown",
      ordinals: [],
      names: [],
    };
  }

  const record = value as Record<string, unknown>;
  const kind = parseTargetKind(record.kind) ?? "unknown";

  return {
    kind,
    ordinals: parseOrdinals(record.ordinals),
    names: parseNames(record.names),
  };
}

function parseOrdinals(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<number>();
  const ordinals: number[] = [];

  for (const item of value) {
    if (
      !Number.isInteger(item)
      || item < 1
      || item > 20
      || seen.has(item)
    ) {
      continue;
    }

    seen.add(item);
    ordinals.push(item);

    if (ordinals.length >= MAX_COMPARISON_TARGET_HINTS) {
      break;
    }
  }

  return ordinals;
}

function parseNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const names: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const name = normalizeLlmText(parseOptionalString(item), {
      maxChars: MAX_COMPARISON_NAME_CHARS,
    });

    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    names.push(name);

    if (names.length >= MAX_COMPARISON_TARGET_HINTS) {
      break;
    }
  }

  return names;
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
    lastRecommendedProductIds: contextMemory.lastRecommendedProductIds,
  };
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseConfidence(
  value: unknown,
): ComparisonIntentConfidence | undefined {
  return isOneOf(value, VALID_CONFIDENCE) ? value : undefined;
}

function parseTargetKind(value: unknown): ComparisonTargetKind | undefined {
  return isOneOf(value, VALID_TARGET_KINDS) ? value : undefined;
}

function isOneOf<T extends string>(
  value: unknown,
  candidates: readonly T[],
): value is T {
  return typeof value === "string" && candidates.includes(value as T);
}
