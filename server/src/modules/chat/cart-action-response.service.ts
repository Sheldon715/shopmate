import { rethrowIfAborted } from "../../lib/abort";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type { Product } from "../products/product.types";
import type {
  CartActionResult,
  CartCommandFallbackReason,
} from "./cart-command.types";

export interface CartActionResponseServiceOptions {
  llmClient: LlmClient;
}

export interface CartActionResponseInput {
  question: string;
  cartAction: CartActionResult;
  fallbackReason?: CartCommandFallbackReason;
  recentProducts: Product[];
  requestId?: string;
  abortSignal?: AbortSignal;
}

const CART_ACTION_RESPONSE_MAX_COMPLETION_TOKENS = 160;
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
      const answer = normalizeAnswer(parseCartActionResponseOutput(response.text));

      return answer ?? createMinimalCartActionAnswer(input.cartAction);
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return createMinimalCartActionAnswer(input.cartAction);
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
        "根据结构化 cartAction 生成用户可见的中文 assistant 回复。",
        "cartAction.status 是事实来源：只有 success 才能说已加入购物车。",
        "needs_target 要请用户确认商品；not_found 只能说明最近推荐中没有匹配商品。",
        "unavailable 只能说明该商品当前不可加购；failed 只能说明本次加购未完成。",
        "不能编造商品、价格、库存、优惠、物流、结算或订单结果。",
        "不要输出商品卡片，不要输出 markdown，不要输出多余解释。",
        "answer 必须是一到两句话，不超过 90 个中文字符。",
        '只输出 JSON object，例如 {"answer":"已经把这款商品加入购物车。"}。',
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        cartAction: summarizeCartAction(input.cartAction),
        fallbackReason: input.fallbackReason,
        recentProducts: input.recentProducts.map((product, index) => ({
          ordinal: index + 1,
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
        })),
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
    productId: cartAction.productId,
    productName: cartAction.productName,
    quantity: cartAction.quantity,
  };
}

function parseCartActionResponseOutput(rawText: string): string | undefined {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const answer = payload.answer;

  return typeof answer === "string" ? answer : undefined;
}

function normalizeAnswer(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim();

  if (!normalized) {
    return undefined;
  }

  const chars = Array.from(normalized);

  return chars.length <= MAX_CART_ACTION_ANSWER_CHARS
    ? normalized
    : chars.slice(0, MAX_CART_ACTION_ANSWER_CHARS).join("").trimEnd();
}

function createMinimalCartActionAnswer(cartAction: CartActionResult): string {
  switch (cartAction.status) {
    case "success":
      return "加购已完成。";
    case "needs_target":
      return "需要先确认要加入购物车的商品。";
    case "not_found":
      return "最近推荐中没有找到匹配商品。";
    case "unavailable":
      return "该商品当前不可加购。";
    case "failed":
      return "加购未完成。";
  }
}

function stripCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("cart action response output must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}
