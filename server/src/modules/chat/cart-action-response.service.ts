import { rethrowIfAborted } from "../../lib/abort";
import type { CartDto } from "../cart/cart.types";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type { Product } from "../products/product.types";
import type {
  CartActionResult,
  CartCommandDetection,
  CartCommandFallbackReason,
} from "./cart-command.types";
import {
  normalizeLlmText,
  parseJsonObject,
  stripCodeFence,
} from "./llm-output-utils";

export interface CartActionResponseServiceOptions {
  llmClient: LlmClient;
}

export interface CartActionResponseInput {
  question: string;
  cartAction: CartActionResult;
  intent?: Extract<CartCommandDetection, { isCartCommand: true }>;
  fallbackReason?: CartCommandFallbackReason;
  recentProducts: Product[];
  cartSnapshot?: CartDto;
  requestId?: string;
  abortSignal?: AbortSignal;
}

const CART_ACTION_RESPONSE_MAX_COMPLETION_TOKENS = 180;
const MAX_CART_ACTION_ANSWER_CHARS = 90;

export class CartActionResponseService {
  private readonly llmClient: LlmClient;

  constructor(options: CartActionResponseServiceOptions) {
    this.llmClient = options.llmClient;
  }

  async generate(input: CartActionResponseInput): Promise<string> {
    try {
      const response = await this.llmClient.generate({
        messages: buildCartActionResponsePrompt(input),
        temperature: 0,
        maxCompletionTokens: CART_ACTION_RESPONSE_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });

      return normalizeAnswer(parseCartActionResponseOutput(response.text)) ?? "";
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return "";
    }
  }
}

function buildCartActionResponsePrompt(
  input: CartActionResponseInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的购物车操作回复生成器。",
        "Generate the user-visible Chinese assistant reply from facts only.",
        "cartAction.status is authoritative: only success may say the operation is complete.",
        "needs_target or needs_confirmation must ask the user to clarify or confirm.",
        "not_found may only say the current cart or recent recommendations do not contain a matching item.",
        "failed must not pretend success.",
        "Do not invent discounts, inventory, orders, payment, shipping, or checkout results.",
        "Do not output product cards, markdown, or extra explanation.",
        "Return one JSON object only: {\"answer\":\"...\"}. The answer must be 1-2 short sentences and at most 90 Chinese characters.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        intent: input.intent
          ? {
              action: input.intent.action,
              target: input.intent.target,
              quantity: input.intent.quantity,
              selected: input.intent.selected,
              needsConfirmation: input.intent.needsConfirmation,
              clarificationQuestion: input.intent.clarificationQuestion,
            }
          : undefined,
        cartAction: summarizeCartAction(input.cartAction),
        fallbackReason: input.fallbackReason,
        recentProducts: input.recentProducts.map((product, index) => ({
          ordinal: index + 1,
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
        })),
        cartItems: input.cartSnapshot?.items.map((item, index) => ({
          ordinal: index + 1,
          itemId: item.id,
          productId: item.productId,
          name: item.name,
          brand: item.brand,
          category: item.category,
          quantity: item.quantity,
          selected: item.selected,
          available: item.available,
        })) ?? [],
      }),
    },
  ];
}

function summarizeCartAction(
  cartAction: CartActionResult,
): Omit<CartActionResult, "message"> {
  return {
    type: cartAction.type,
    status: cartAction.status,
    itemId: cartAction.itemId,
    productId: cartAction.productId,
    productName: cartAction.productName,
    quantity: cartAction.quantity,
    selected: cartAction.selected,
    cartSummary: cartAction.cartSummary,
  };
}

function parseCartActionResponseOutput(rawText: string): string | undefined {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const answer = payload.answer;

  return typeof answer === "string" ? answer : undefined;
}

function normalizeAnswer(value: string | undefined): string | undefined {
  return normalizeLlmText(value, {
    maxChars: MAX_CART_ACTION_ANSWER_CHARS,
  });
}
