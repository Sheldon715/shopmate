import { rethrowIfAborted } from "../../lib/abort";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import { ClarificationService } from "./clarification.service";
import type {
  ClarificationDecision,
  ClarificationSlot,
} from "./clarification.types";
import type { ClarificationServiceInput } from "./clarification.service";

export interface ClarificationIntentDetectInput
  extends ClarificationServiceInput {
  abortSignal?: AbortSignal;
  requestId?: string;
}

export interface ClarificationIntentServiceOptions {
  llmClient: LlmClient;
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
  private readonly llmClient: LlmClient;
  private readonly clarificationService: ClarificationService;

  constructor(options: ClarificationIntentServiceOptions) {
    this.llmClient = options.llmClient;
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
      const response = await this.llmClient.generate({
        messages: buildClarificationIntentPrompt(input, candidate),
        temperature: 0,
        maxCompletionTokens: CLARIFICATION_INTENT_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });
      const intent = parseClarificationIntentOutput(response.text);

      if (!intent.needsClarification) {
        return NO_CLARIFICATION;
      }

      const question = normalizeQuestion(intent.question);

      if (!question) {
        return NO_CLARIFICATION;
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
      return NO_CLARIFICATION;
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
        "true 的例子：推荐一款手机、推荐护肤品、有什么跑鞋、鞋、手机。",
        "false 的例子：推荐 3000 元以内拍照好的手机、适合油皮的洗面奶、先给我几个看看、随便推荐一个。",
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
  const normalized = value?.replace(/\s+/gu, " ").trim();

  if (!normalized) {
    return undefined;
  }

  const chars = Array.from(normalized);

  return chars.length <= 70
    ? normalized
    : `${chars.slice(0, 70).join("").trimEnd()}？`;
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

function stripCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("clarification intent output must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}
