import { rethrowIfAborted } from "../../lib/abort";
import type { CartDto } from "../cart/cart.types";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type {
  CheckoutIntentAction,
  CheckoutIntentConfidence,
  CheckoutIntentDetection,
  CheckoutTargetScope,
  CheckoutPatchInput,
} from "../orders/checkout.types";
import type { PendingCheckoutLookup } from "./pending-checkout.store";
import { parseJsonObject, stripCodeFence } from "./llm-output-utils";

export interface CheckoutIntentDetectInput {
  question: string;
  shortHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  cartSnapshot?: CartDto;
  pendingCheckout?: PendingCheckoutLookup;
  recentProductIds?: string[];
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
  checkoutPatch?: CheckoutPatchInput;
  targetScope?: CheckoutTargetScope;
  targetOrdinal?: number;
  confidence?: CheckoutIntentConfidence;
  needsConfirmation?: boolean;
  clarificationQuestion?: string | null;
}

const CHECKOUT_INTENT_MAX_COMPLETION_TOKENS = 512;
const CHECKOUT_CUE_PATTERN =
  /(结算|下单|订单|确认下单|就买|直接买|立即买|买下|买这些|买第|拿去结算|去结算|提交订单|收货地址|地址改|改地址|取消下单|重新汇总|汇总订单)/u;
const PENDING_ONLY_CUE_PATTERN =
  /(确认|可以|好的|没问题|取消|先取消|不要了|地址|收货|收货人|电话|手机号|配送|快递|加急|标准|支付|支付宝|微信|银行卡)/u;
const SINGLE_RECENT_RECOMMENDATION_BUY_PATTERN =
  /^(?:帮我|给我|替我|麻烦)?(?:下单|结算|去结算|拿去结算|买下|买了|就买|立即买|直接买)(?:一下|这个|这款|它|吧|了)?$/u;

export class CheckoutIntentService {
  constructor(private readonly options: CheckoutIntentServiceOptions) {}

  async detect(
    input: CheckoutIntentDetectInput,
  ): Promise<CheckoutIntentDetection> {
    if (!shouldRunCheckoutIntent(input)) {
      return { isCheckoutIntent: false };
    }

    const deterministicIntent = detectDeterministicCheckoutIntent(input);

    if (deterministicIntent) {
      return deterministicIntent;
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
        checkoutPatch: intent.checkoutPatch,
        targetScope: intent.targetScope ?? "selected_cart_items",
        targetOrdinal: intent.targetOrdinal,
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

function detectDeterministicCheckoutIntent(
  input: CheckoutIntentDetectInput,
): CheckoutIntentDetection | undefined {
  const question = input.question.replace(/\s+/gu, "");
  const recentOrdinal = extractRecentRecommendationCheckoutOrdinal(question);

  if (recentOrdinal !== undefined) {
    return {
      isCheckoutIntent: true,
      action: "start_checkout",
      targetScope: "recent_recommendation",
      targetOrdinal: recentOrdinal,
      confidence: "high",
      needsConfirmation: false,
    };
  }

  if (
    input.recentProductIds?.length === 1
    && isSingleRecentRecommendationCheckout(question)
  ) {
    return {
      isCheckoutIntent: true,
      action: "start_checkout",
      targetScope: "recent_recommendation",
      targetOrdinal: 1,
      confidence: "high",
      needsConfirmation: false,
    };
  }

  return undefined;
}

function isSingleRecentRecommendationCheckout(question: string): boolean {
  if (question.includes("?") || question.includes("？")) {
    return false;
  }

  return SINGLE_RECENT_RECOMMENDATION_BUY_PATTERN.test(question);
}

function extractRecentRecommendationCheckoutOrdinal(
  question: string,
): number | undefined {
  if (!/(下单|结算|去结算|拿去结算|就买|买)/u.test(question)) {
    return undefined;
  }

  const match =
    /(?:刚才|上面)?第([一二两三四五六七八九十]|\d{1,2})(?:个|款|件|项)?(?:商品)?/u
      .exec(question);
  const ordinal = match ? parseSmallOrdinal(match[1]) : undefined;

  return ordinal !== undefined && ordinal > 0 ? ordinal : undefined;
}

function parseSmallOrdinal(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  if (/^\d{1,2}$/u.test(value)) {
    return Number.parseInt(value, 10);
  }

  const normalized = value.replace(/两/gu, "二");
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (normalized === "十") {
    return 10;
  }

  if (normalized.startsWith("十")) {
    const ones = digits[normalized.slice(1)];
    return ones === undefined ? undefined : 10 + ones;
  }

  if (normalized.endsWith("十")) {
    const tens = digits[normalized.slice(0, -1)];
    return tens === undefined ? undefined : tens * 10;
  }

  if (normalized.includes("十")) {
    const [tensText, onesText] = normalized.split("十");
    const tens = digits[tensText];
    const ones = digits[onesText];

    return tens === undefined || ones === undefined
      ? undefined
      : tens * 10 + ones;
  }

  return digits[normalized];
}

function buildCheckoutIntentPrompt(
  input: CheckoutIntentDetectInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的结算意图分类器。",
        "只判断当前用户是否明确要启动、确认、修改 pending checkout、取消或重新汇总 pending checkout。",
        "不生成用户可见回复，不输出订单号、金额或商品事实。",
        "Return one JSON object only.",
        "Schema: {\"is_checkout_intent\":boolean,\"action\":\"start_checkout|summarize_checkout|update_checkout|update_address|cancel_checkout|confirm_checkout|unknown\",\"address_text\":string|null,\"checkout_patch\":{\"shipping\":{\"recipient\":string|null,\"phone\":string|null,\"full_address\":string|null},\"delivery_method_type\":string|null,\"payment_method_type\":string|null}|null,\"target_scope\":\"selected_cart_items|recent_recommendation\",\"target_ordinal\":number|null,\"confidence\":\"high|medium|low\",\"needs_confirmation\":boolean,\"clarification_question\":string|null}.",
        "购物车结算、确认购物车商品下单使用 target_scope selected_cart_items。",
        "用户说“下单第一款”“就买第一个”“把刚才第一款拿去结算”这类最近推荐商品时，使用 target_scope recent_recommendation，并把 target_ordinal 设为对应序号。",
        "recent_recommendation 必须有明确序号；没有明确目标时 confidence low 或 needs_confirmation true，并用 clarification_question 追问用户要下单哪一款。",
        "推荐下单前要买什么、下单流程是什么、推荐适合买的商品，不是执行 checkout。",
        "确认、可以、没问题只有在 pendingCheckout.status 为 found 时才可能是 confirm_checkout。",
        "confirm_checkout 必须表示用户明确同意创建订单。",
        "update_checkout 用于更新收货人、手机号、详细地址、配送方式或支付方式，不等于确认下单。",
        "旧 action update_address 只在模型只能表达整段地址时使用，并把 address_text 放入 checkout_patch.shipping.full_address。",
        "delivery_method_type 和 payment_method_type 必须来自 pendingCheckout 里的 options type；不确定时保持 null 或 needs_confirmation true。",
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
        recentRecommendations: (input.recentProductIds ?? [])
          .map((productId, index) => ({
            ordinal: index + 1,
            productId,
          })),
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
    address: lookup.draft.address,
    selectedDeliveryMethod: lookup.draft.selectedDeliveryMethod,
    selectedPaymentMethod: lookup.draft.selectedPaymentMethod,
    deliveryOptions: lookup.draft.deliveryOptions.map((option) => ({
      type: option.type,
      label: option.label,
      feeCents: option.feeCents,
      etaText: option.etaText,
    })),
    paymentOptions: lookup.draft.paymentOptions.map((option) => ({
      type: option.type,
      label: option.label,
    })),
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
    checkoutPatch: parseCheckoutPatch(payload.checkout_patch),
    targetScope: parseTargetScope(payload.target_scope),
    targetOrdinal: parseTargetOrdinal(payload.target_ordinal),
    confidence: parseConfidence(payload.confidence),
    needsConfirmation: parseBoolean(payload.needs_confirmation),
    clarificationQuestion: parseNullableString(payload.clarification_question),
  };
}

function parseAction(value: unknown): CheckoutIntentAction | undefined {
  return value === "start_checkout"
    || value === "confirm_checkout"
    || value === "update_checkout"
    || value === "update_address"
    || value === "cancel_checkout"
    || value === "summarize_checkout"
    || value === "unknown"
    ? value
    : undefined;
}

function parseTargetScope(value: unknown): CheckoutTargetScope | undefined {
  return value === "selected_cart_items" || value === "recent_recommendation"
    ? value
    : undefined;
}

function parseTargetOrdinal(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return undefined;
  }

  return value;
}

function parseCheckoutPatch(value: unknown): CheckoutPatchInput | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const shipping = parseShippingPatch(record.shipping);
  const deliveryMethodType =
    parseNullableString(record.delivery_method_type)
    ?? parseNullableString(record.deliveryMethodType)
    ?? undefined;
  const paymentMethodType =
    parseNullableString(record.payment_method_type)
    ?? parseNullableString(record.paymentMethodType)
    ?? undefined;
  const patch: CheckoutPatchInput = {
    shipping,
    deliveryMethodType: normalizeOptionalText(deliveryMethodType),
    paymentMethodType: normalizeOptionalText(paymentMethodType),
  };

  if (
    patch.shipping
    || patch.deliveryMethodType
    || patch.paymentMethodType
  ) {
    return patch;
  }

  return undefined;
}

function parseShippingPatch(
  value: unknown,
): CheckoutPatchInput["shipping"] | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const recipient =
    parseNullableString(record.recipient) ?? undefined;
  const phone =
    parseNullableString(record.phone) ?? undefined;
  const fullAddress =
    parseNullableString(record.full_address)
    ?? parseNullableString(record.fullAddress)
    ?? undefined;
  const shipping: NonNullable<CheckoutPatchInput["shipping"]> = {};
  const normalizedRecipient = normalizeOptionalText(recipient);
  const normalizedPhone = normalizeOptionalText(phone);
  const normalizedFullAddress = normalizeOptionalText(fullAddress);

  if (normalizedRecipient !== undefined) {
    shipping.recipient = normalizedRecipient;
  }

  if (normalizedPhone !== undefined) {
    shipping.phone = normalizedPhone;
  }

  if (normalizedFullAddress !== undefined) {
    shipping.fullAddress = normalizedFullAddress;
  }

  if (Object.keys(shipping).length > 0) {
    return shipping;
  }

  return undefined;
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
