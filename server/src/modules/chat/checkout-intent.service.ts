import { rethrowIfAborted } from "../../lib/abort";
import type { CartDto } from "../cart/cart.types";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type {
  CheckoutIntentAction,
  CheckoutIntentConfidence,
  CheckoutIntentDetection,
} from "../orders/checkout.types";
import type { PendingCheckoutLookup } from "./pending-checkout.store";
import { parseJsonObject, stripCodeFence } from "./llm-output-utils";

export interface CheckoutIntentDetectInput {
  question: string;
  shortHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  cartSnapshot?: CartDto;
  pendingCheckout?: PendingCheckoutLookup;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface CheckoutIntentServiceOptions {
  llmClient: LlmClient;
}

interface ParsedCheckoutIntent {
  isCheckoutIntent: boolean;
  action?: CheckoutIntentAction;
  addressText?: string;
  confidence?: CheckoutIntentConfidence;
  needsConfirmation?: boolean;
  clarificationQuestion?: string | null;
}

const CHECKOUT_INTENT_MAX_COMPLETION_TOKENS = 512;
const CHECKOUT_CUE_PATTERN =
  /(结算|下单|订单|确认下单|就买这些|买这些|提交订单|收货地址|地址改|改地址|取消下单|重新汇总|汇总订单)/u;
const PENDING_ONLY_CUE_PATTERN =
  /^(确认|可以|好的|没问题|取消|先取消|不要了|地址|收货)/u;

export class CheckoutIntentService {
  constructor(private readonly options: CheckoutIntentServiceOptions) {}

  async detect(
    input: CheckoutIntentDetectInput,
  ): Promise<CheckoutIntentDetection> {
    if (!shouldRunCheckoutIntent(input)) {
      return { isCheckoutIntent: false };
    }

    try {
      const response = await this.options.llmClient.generate({
        messages: buildCheckoutIntentPrompt(input),
        temperature: 0,
        maxCompletionTokens: CHECKOUT_INTENT_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });
      const intent = parseCheckoutIntentOutput(response.text);

      if (!intent.isCheckoutIntent) {
        return { isCheckoutIntent: false };
      }

      return {
        isCheckoutIntent: true,
        action: intent.action ?? "unknown",
        addressText: intent.addressText,
        targetScope: "selected_cart_items",
        confidence: intent.confidence ?? "medium",
        needsConfirmation: intent.needsConfirmation ?? false,
        clarificationQuestion:
          normalizeOptionalText(intent.clarificationQuestion) ?? undefined,
      };
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return { isCheckoutIntent: false };
    }
  }
}

function shouldRunCheckoutIntent(input: CheckoutIntentDetectInput): boolean {
  const question = input.question.replace(/\s+/gu, "");

  if (CHECKOUT_CUE_PATTERN.test(question)) {
    return true;
  }

  if (
    input.pendingCheckout?.status === "found"
    && PENDING_ONLY_CUE_PATTERN.test(question)
  ) {
    return true;
  }

  return false;
}

function buildCheckoutIntentPrompt(
  input: CheckoutIntentDetectInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的模拟结算意图分类器。",
        "只判断当前用户是否明确要启动、确认、修改地址、取消或重新汇总 pending checkout。",
        "不生成用户可见回复，不输出订单号、金额或商品事实。",
        "Return one JSON object only.",
        "Schema: {\"is_checkout_intent\":boolean,\"action\":\"start_checkout|confirm_checkout|update_address|cancel_checkout|summarize_checkout|unknown\",\"address_text\":string|null,\"target_scope\":\"selected_cart_items\",\"confidence\":\"high|medium|low\",\"needs_confirmation\":boolean,\"clarification_question\":string|null}.",
        "第一版 target_scope 只能是 selected_cart_items。",
        "推荐下单前要买什么、下单流程是什么、推荐适合买的商品，不是执行 checkout。",
        "确认、可以、没问题只有在 pendingCheckout.status 为 found 时才可能是 confirm_checkout。",
        "confirm_checkout 必须表示用户明确同意创建模拟订单。",
        "修改地址只更新 pending draft，不等于确认下单。",
        "取消下单应为 cancel_checkout，不改变购物车。",
        "模型不确定时 action unknown 或 confidence low，后端不会创建订单。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        shortHistory: input.shortHistory?.slice(-4) ?? [],
        cartSummary: input.cartSnapshot?.summary,
        cartItems: input.cartSnapshot?.items.map((item, index) => ({
          ordinal: index + 1,
          quantity: item.quantity,
          selected: item.selected,
          available: item.available,
        })) ?? [],
        pendingCheckout: summarizePendingCheckout(input.pendingCheckout),
      }),
    },
  ];
}

function summarizePendingCheckout(
  lookup: PendingCheckoutLookup | undefined,
): Record<string, unknown> {
  if (!lookup || lookup.status !== "found") {
    return { status: lookup?.status ?? "missing" };
  }

  return {
    status: "found",
    draftId: lookup.draft.id,
    selectedCount: lookup.draft.summary.selectedCount,
    totalCents: lookup.draft.summary.totalCents,
    address: lookup.draft.address.fullAddress,
    expiresAt: lookup.draft.expiresAt,
  };
}

function parseCheckoutIntentOutput(rawText: string): ParsedCheckoutIntent {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const isCheckoutIntent = payload.is_checkout_intent;

  if (typeof isCheckoutIntent !== "boolean") {
    throw new Error("checkout intent output must include is_checkout_intent.");
  }

  if (!isCheckoutIntent) {
    return { isCheckoutIntent: false };
  }

  return {
    isCheckoutIntent: true,
    action: parseAction(payload.action),
    addressText: parseNullableString(payload.address_text) ?? undefined,
    confidence: parseConfidence(payload.confidence),
    needsConfirmation: parseBoolean(payload.needs_confirmation),
    clarificationQuestion: parseNullableString(payload.clarification_question),
  };
}

function parseAction(value: unknown): CheckoutIntentAction | undefined {
  return value === "start_checkout"
    || value === "confirm_checkout"
    || value === "update_address"
    || value === "cancel_checkout"
    || value === "summarize_checkout"
    || value === "unknown"
    ? value
    : undefined;
}

function parseConfidence(value: unknown): CheckoutIntentConfidence | undefined {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value : undefined;
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
