import { rethrowIfAborted } from "../../lib/abort";
import type { CartDto } from "../cart/cart.types";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type {
  CheckoutActionResult,
  CheckoutIntentDetection,
  PendingCheckoutDraft,
} from "../orders/checkout.types";
import type { OrderRecord } from "../orders/order.types";
import {
  normalizeLlmText,
  parseJsonObject,
  stripCodeFence,
} from "./llm-output-utils";

export interface CheckoutResponseServiceOptions {
  llmClient: LlmClient;
}

export interface CheckoutResponseInput {
  question: string;
  intent: Extract<CheckoutIntentDetection, { isCheckoutIntent: true }>;
  checkoutAction: CheckoutActionResult;
  cartSnapshot?: CartDto;
  draft?: PendingCheckoutDraft;
  order?: OrderRecord;
  requestId?: string;
  abortSignal?: AbortSignal;
}

const CHECKOUT_RESPONSE_MAX_COMPLETION_TOKENS = 512;
const CHECKOUT_RESPONSE_MAX_CHARS = 180;

export class CheckoutResponseService {
  constructor(private readonly options: CheckoutResponseServiceOptions) {}

  async generate(input: CheckoutResponseInput): Promise<string> {
    try {
      const response = await this.options.llmClient.generate({
        messages: buildCheckoutResponsePrompt(input),
        temperature: 0,
        maxCompletionTokens: CHECKOUT_RESPONSE_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });

      return normalizeAnswer(parseCheckoutResponseOutput(response.text)) ?? "";
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return "";
    }
  }
}

function buildCheckoutResponsePrompt(
  input: CheckoutResponseInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的模拟结算回复生成器。",
        "Generate the user-visible Chinese assistant reply from backend facts only.",
        "checkoutAction.status is authoritative.",
        "Only status order_created may say 模拟订单已生成 or 已完成下单.",
        "draft_created, needs_confirmation, address_updated, and summarize_checkout must ask the user to confirm, update address, or cancel.",
        "empty_cart may only say the cart has no selected checkout items.",
        "expired must ask the user to重新汇总/重新结算.",
        "failed must not pretend success.",
        "Do not invent discounts, payment, real shipping, logistics, invoice, stock lock, or real phone numbers.",
        "Do not output markdown, product cards, or JSON except the required object.",
        "Return one JSON object only: {\"answer\":\"...\"}. The answer must be 1-3 short sentences and at most 180 Chinese characters.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        intent: {
          action: input.intent.action,
          confidence: input.intent.confidence,
          addressText: input.intent.addressText,
        },
        checkoutAction: input.checkoutAction,
        cartSummary: input.cartSnapshot?.summary,
        draft: input.draft
          ? {
              id: input.draft.id,
              items: input.draft.items.map((item, index) => ({
                ordinal: index + 1,
                name: item.productName,
                brand: item.brand,
                category: item.category,
                unitPriceCents: item.unitPriceCents,
                quantity: item.quantity,
                subtotalCents: item.subtotalCents,
              })),
              summary: input.draft.summary,
              address: input.draft.address,
              expiresAt: input.draft.expiresAt,
            }
          : undefined,
        order: input.order
          ? {
              id: input.order.id,
              orderNumber: input.order.orderNumber,
              totalCents: input.order.totalCents,
              itemCount: input.order.items.length,
              address: {
                recipient: input.order.shippingName,
                phoneMasked: input.order.shippingPhoneMasked,
                fullAddress: input.order.shippingAddress,
              },
            }
          : undefined,
      }),
    },
  ];
}

function parseCheckoutResponseOutput(rawText: string): string | undefined {
  const payload = parseJsonObject(stripCodeFence(rawText));
  return typeof payload.answer === "string" ? payload.answer : undefined;
}

function normalizeAnswer(value: string | undefined): string | undefined {
  return normalizeLlmText(value, {
    maxChars: CHECKOUT_RESPONSE_MAX_CHARS,
  });
}
