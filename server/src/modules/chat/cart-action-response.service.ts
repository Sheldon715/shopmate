import { rethrowIfAborted } from "../../lib/abort";
import type { CartDto } from "../cart/cart.types";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import { buildProductDisplayName } from "../products/product-display-copy";
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
        "只根据输入事实生成用户可见的中文 assistant 回复。",
        "cartAction.status 是权威状态：只有 success 可以说操作已完成。",
        "needs_target 或 needs_confirmation 要自然地请用户补充目标或确认。",
        "not_found 只能说明当前购物车或最近推荐里没有匹配项。",
        "failed 不能假装成功。",
        "不要编造优惠、库存、订单、支付、配送或结算结果。",
        "不要输出商品卡片、markdown 或额外解释。",
        "只输出 JSON object：{\"answer\":\"...\"}。answer 为 1-2 句短中文，不超过 90 个中文字符。",
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
          name: buildProductDisplayName(product),
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
