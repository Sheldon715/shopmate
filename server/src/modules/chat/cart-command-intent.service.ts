import { rethrowIfAborted } from "../../lib/abort";
import { MAX_CART_QUANTITY, MIN_CART_QUANTITY } from "../cart/cart.service";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import { CartCommandService } from "./cart-command.service";
import type {
  CartCommandDetectInput,
  CartCommandDetection,
  CartCommandTargetInput,
} from "./cart-command.types";

export interface CartCommandIntentDetectInput extends CartCommandDetectInput {
  abortSignal?: AbortSignal;
  requestId?: string;
}

export interface CartCommandIntentServiceOptions {
  llmClient: LlmClient;
  cartCommandService?: CartCommandService;
}

interface ParsedCartIntent {
  isCartAdd: boolean;
  target?: CartCommandTargetInput;
  quantity?: number;
}

const CART_INTENT_MAX_COMPLETION_TOKENS = 160;

export class CartCommandIntentService {
  private readonly llmClient: LlmClient;
  private readonly cartCommandService: CartCommandService;

  constructor(options: CartCommandIntentServiceOptions) {
    this.llmClient = options.llmClient;
    this.cartCommandService =
      options.cartCommandService ?? new CartCommandService();
  }

  async detect(
    input: CartCommandIntentDetectInput,
  ): Promise<CartCommandDetection> {
    const intent = await this.detectIntent(input);

    if (!intent.isCartAdd) {
      return { isCartCommand: false };
    }

    return this.cartCommandService.createDetection({
      question: input.question,
      quantity: intent.quantity,
      target: intent.target,
    });
  }

  private async detectIntent(
    input: CartCommandIntentDetectInput,
  ): Promise<ParsedCartIntent> {
    try {
      const response = await this.llmClient.generate({
        messages: buildCartIntentPrompt(input),
        temperature: 0,
        maxCompletionTokens: CART_INTENT_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });

      return parseCartIntentOutput(response.text);
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return { isCartAdd: false };
    }
  }
}

function buildCartIntentPrompt(
  input: CartCommandIntentDetectInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的购物车操作意图分类器。",
        "判断用户当前这句话是否明确要求把最近推荐商品加入购物车，并抽取目标。",
        "true 的例子：把第二个加进去、把这个加入购物车、第一个也是、我要第一款、把小米那款加进去。",
        "false 的例子：推荐加湿器、预算加一点、加拿大品牌、加个筛选条件、继续推荐。",
        "不要决定 productId，不要执行购物车动作。",
        "target.kind 只能是 ordinal、deictic、name、unknown。",
        '只输出 JSON object，例如 {"is_cart_add":true,"target":{"kind":"ordinal","index":2},"quantity":1}。',
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        hasRecentRecommendations:
          (input.contextMemory?.lastRecommendedProductIds.length ?? 0) > 0,
      }),
    },
  ];
}

function parseCartIntentOutput(rawText: string): ParsedCartIntent {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const isCartAdd = payload.is_cart_add;

  if (typeof isCartAdd !== "boolean") {
    throw new Error("cart intent output must include boolean is_cart_add.");
  }

  if (!isCartAdd) {
    return { isCartAdd: false };
  }

  return {
    isCartAdd: true,
    quantity: parseQuantity(payload.quantity),
    target: parseTarget(payload.target),
  };
}

function parseQuantity(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }

  return Math.min(Math.max(value, MIN_CART_QUANTITY), MAX_CART_QUANTITY);
}

function parseTarget(value: unknown): CartCommandTargetInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const target = value as Record<string, unknown>;
  const kind = target.kind;

  if (kind === "ordinal") {
    return Number.isInteger(target.index)
      ? { kind: "ordinal", index: target.index as number }
      : { kind: "unknown" };
  }

  if (kind === "deictic") {
    return { kind: "deictic" };
  }

  if (kind === "name") {
    return typeof target.text === "string"
      ? { kind: "name", text: target.text }
      : { kind: "unknown" };
  }

  if (kind === "unknown") {
    return { kind: "unknown" };
  }

  return undefined;
}

function stripCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("cart intent output must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}
