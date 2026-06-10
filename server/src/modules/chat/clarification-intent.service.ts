import { rethrowIfAborted } from "../../lib/abort";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import { ClarificationService } from "./clarification.service";
import type {
  ClarificationDecision,
  ClarificationSlot,
} from "./clarification.types";
import type { ClarificationServiceInput } from "./clarification.service";
import {
  normalizeLlmText,
  parseJsonObject,
  stripCodeFence,
  tryParseJsonObject,
} from "./llm-output-utils";

export interface ClarificationIntentDetectInput
  extends ClarificationServiceInput {
  abortSignal?: AbortSignal;
  requestId?: string;
}

export interface ClarificationIntentServiceOptions {
  llmClient?: LlmClient;
  decisionLlmClient?: LlmClient;
  answerLlmClient?: LlmClient;
  clarificationService?: ClarificationService;
}

interface ParsedClarificationIntent {
  needsClarification: boolean;
  question?: string;
  missingSlots?: ClarificationSlot[];
}

const CLARIFICATION_INTENT_MAX_COMPLETION_TOKENS = 160;
const VALID_CLARIFICATION_SLOTS: readonly ClarificationSlot[] = [
  "budget",
  "use_case",
  "priority",
  "audience",
];
const NO_CLARIFICATION: ClarificationDecision = {
  needsClarification: false,
  missingSlots: [],
};

export class ClarificationIntentService {
  private readonly decisionLlmClient: LlmClient;
  private readonly answerLlmClient: LlmClient;
  private readonly clarificationService: ClarificationService;

  constructor(options: ClarificationIntentServiceOptions) {
    const llmClient = options.llmClient
      ?? options.decisionLlmClient
      ?? options.answerLlmClient;

    if (!llmClient) {
      throw new Error("ClarificationIntentService requires an LLM client.");
    }

    this.decisionLlmClient = options.decisionLlmClient ?? llmClient;
    this.answerLlmClient = options.answerLlmClient ?? llmClient;
    this.clarificationService =
      options.clarificationService ?? new ClarificationService();
  }

  async decide(
    input: ClarificationIntentDetectInput,
  ): Promise<ClarificationDecision> {
    const candidate = this.clarificationService.decide(input);

    if (!candidate.needsClarification) {
      return NO_CLARIFICATION;
    }

    try {
      const response = await this.decisionLlmClient.generate({
        messages: buildClarificationIntentPrompt(input, candidate),
        temperature: 0,
        maxCompletionTokens: CLARIFICATION_INTENT_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });
      const intent = parseClarificationIntentOutput(response.text);

      if (!intent.needsClarification) {
        return this.createRequiredClarificationDecision(input, candidate);
      }

      const question = normalizeQuestion(intent.question);

      if (!question) {
        return this.createRequiredClarificationDecision(input, candidate);
      }

      return {
        needsClarification: true,
        question,
        missingSlots: normalizeMissingSlots(
          intent.missingSlots,
          candidate.missingSlots,
        ),
      };
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      const fallbackQuestion = createSlotFallbackQuestion(
        candidate.missingSlots,
      );

      return fallbackQuestion
        ? {
            needsClarification: true,
            question: fallbackQuestion,
            missingSlots: candidate.missingSlots,
          }
        : NO_CLARIFICATION;
    }
  }

  private async createRequiredClarificationDecision(
    input: ClarificationIntentDetectInput,
    candidate: ClarificationDecision,
  ): Promise<ClarificationDecision> {
    const forcedQuestion = await this.generateRequiredClarificationQuestion(
      input,
      candidate,
    );
    const question = forcedQuestion
      ?? createSlotFallbackQuestion(candidate.missingSlots);

    return question
      ? {
          needsClarification: true,
          question,
          missingSlots: candidate.missingSlots,
        }
      : NO_CLARIFICATION;
  }

  private async generateRequiredClarificationQuestion(
    input: ClarificationIntentDetectInput,
    candidate: ClarificationDecision,
  ): Promise<string | undefined> {
    try {
      const response = await this.answerLlmClient.generate({
        messages: buildRequiredClarificationQuestionPrompt(input, candidate),
        temperature: 0,
        maxCompletionTokens: CLARIFICATION_INTENT_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });

      return normalizeQuestion(parseQuestionOutput(response.text));
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return undefined;
    }
  }
}

function buildClarificationIntentPrompt(
  input: ClarificationIntentDetectInput,
  candidate: ClarificationDecision,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的主动澄清意图判断器。",
        "判断用户当前这句话是否因为信息不足，需要先追问，再进入商品检索。",
        "如果需要澄清，请生成一句自然、简短、移动端友好的中文反问。",
        "不要推荐具体商品，不要决定 productId，不要输出商品卡片。",
        "如果用户只给出宽泛品类和普通推荐意图，且没有预算、用途、人群或偏好，通常需要先澄清。",
        "不要把“推荐”“帮我推荐”“有什么”本身理解成用户接受宽泛推荐；这些只是普通购物意图。",
        "需要澄清的典型情况：推荐一款手机、跑鞋推荐、蓝牙耳机推荐、鞋子推荐。",
        "不需要澄清的典型情况：推荐 3000 元以内拍照好的手机、适合油皮的洗面奶、先给我几个看看、随便推荐一个。",
        "如果问题已有预算、使用场景、人群、品牌、功效或用户明确接受宽泛推荐，输出 false。",
        "missing_slots 只能包含 budget、use_case、priority、audience。",
        "clarification_question 必须是一句话，不超过 70 个中文字符。",
        '只输出 JSON object，例如 {"needs_clarification":true,"clarification_question":"你更看重拍照、续航、预算还是性价比？","missing_slots":["budget","priority"]}。',
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        candidateMissingSlots: candidate.missingSlots,
        contextMemory: summarizeContextMemory(input.contextMemory),
        filters: input.filters ?? {},
      }),
    },
  ];
}

function buildRequiredClarificationQuestionPrompt(
  input: ClarificationIntentDetectInput,
  candidate: ClarificationDecision,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的澄清问题生成器。",
        "上游规则已经确认：用户只给了宽泛购物品类，信息不足，必须先追问再检索。",
        "请根据缺失槽位生成一句自然、简短、移动端友好的中文反问。",
        "不要推荐具体商品，不要输出商品卡片，不要输出解释过程。",
        "clarification_question 必须是一句话，不超过 70 个中文字符。",
        '只输出 JSON object，例如 {"clarification_question":"你主要用于跑步训练、日常通勤还是比赛？预算大概多少？"}。',
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        candidateMissingSlots: candidate.missingSlots,
        contextMemory: summarizeContextMemory(input.contextMemory),
        filters: input.filters ?? {},
      }),
    },
  ];
}

function summarizeContextMemory(
  contextMemory: ClarificationServiceInput["contextMemory"],
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

function parseClarificationIntentOutput(
  rawText: string,
): ParsedClarificationIntent {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const needsClarification = payload.needs_clarification;

  if (typeof needsClarification !== "boolean") {
    throw new Error(
      "clarification intent output must include boolean needs_clarification.",
    );
  }

  if (!needsClarification) {
    return { needsClarification: false };
  }

  return {
    needsClarification: true,
    question: parseQuestion(payload.clarification_question),
    missingSlots: parseMissingSlots(payload.missing_slots),
  };
}

function parseQuestion(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseQuestionOutput(rawText: string): string | undefined {
  const text = stripCodeFence(rawText).trim();
  const payload = tryParseJsonObject(text);

  if (payload) {
    return parseQuestion(payload.clarification_question);
  }

  return text.startsWith("{") ? undefined : text;
}

function parseMissingSlots(value: unknown): ClarificationSlot[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const slots = value.filter(isClarificationSlot);

  return slots.length > 0 ? unique(slots) : undefined;
}

function normalizeMissingSlots(
  parsed: ClarificationSlot[] | undefined,
  fallback: ClarificationSlot[],
): ClarificationSlot[] {
  return parsed && parsed.length > 0 ? parsed : fallback;
}

function normalizeQuestion(value: string | undefined): string | undefined {
  return normalizeLlmText(value, {
    maxChars: 70,
    truncateSuffix: "？",
  });
}

function createSlotFallbackQuestion(
  slots: readonly ClarificationSlot[],
): string | undefined {
  const labels = slots.flatMap((slot) => {
    switch (slot) {
      case "budget":
        return ["预算"];
      case "use_case":
        return ["使用场景"];
      case "priority":
        return ["更看重的性能或特点"];
      case "audience":
        return ["使用人群"];
    }
  });
  const uniqueLabels = [...new Set(labels)];

  return uniqueLabels.length > 0
    ? `请补充${uniqueLabels.join("、")}，我再帮你筛更合适的商品。`
    : undefined;
}

function isClarificationSlot(value: unknown): value is ClarificationSlot {
  return (
    typeof value === "string"
    && VALID_CLARIFICATION_SLOTS.includes(value as ClarificationSlot)
  );
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
