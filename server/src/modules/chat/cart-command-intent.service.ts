import { rethrowIfAborted } from "../../lib/abort";
import { MAX_CART_QUANTITY, MIN_CART_QUANTITY } from "../cart/cart.service";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import { CartCommandService } from "./cart-command.service";
import type {
  CartCommandAction,
  CartCommandConfidence,
  CartCommandDetectInput,
  CartCommandDetection,
  CartCommandTargetInput,
} from "./cart-command.types";
import { parseJsonObject, stripCodeFence } from "./llm-output-utils";

export interface CartCommandIntentDetectInput extends CartCommandDetectInput {
  abortSignal?: AbortSignal;
  requestId?: string;
}

export interface CartCommandIntentServiceOptions {
  llmClient: LlmClient;
  cartCommandService?: CartCommandService;
}

interface ParsedCartIntent {
  isCartManagement: boolean;
  action?: CartCommandAction;
  target?: CartCommandTargetInput;
  quantity?: number;
  selected?: boolean;
  needsConfirmation?: boolean;
  confidence?: CartCommandConfidence;
  clarificationQuestion?: string | null;
}

const CART_INTENT_MAX_COMPLETION_TOKENS = 220;

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

    if (!intent.isCartManagement) {
      return { isCartCommand: false };
    }

    return this.cartCommandService.createDetection({
      question: input.question,
      action: intent.action,
      quantity: intent.quantity,
      selected: intent.selected,
      target: intent.target,
      needsConfirmation: intent.needsConfirmation,
      confidence: intent.confidence,
      clarificationQuestion: intent.clarificationQuestion,
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
      return { isCartManagement: false };
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
        "只判断当前用户消息是否明确要求查看或改变购物车，不生成用户可见回复，不执行操作。",
        "Return one JSON object only.",
        "Schema: {\"is_cart_management\":boolean,\"action\":\"inspect|add|remove|update_quantity|update_selected|clear\",\"target\":{\"kind\":\"cart_ordinal|recent_recommendation_ordinal|name|deictic|all|unknown\",\"index\":number|null,\"text\":string|null},\"quantity\":number|null,\"selected\":boolean|null,\"needs_confirmation\":boolean,\"confidence\":\"high|medium|low\",\"clarification_question\":string|null}.",
        "Cart remove, quantity changes, and selection changes must target current cart items.",
        "Cart add may target recent recommendations or an explicit active product name.",
        "Do not output itemId or productId as facts. Output only a target descriptor.",
        "Do not classify ordinary shopping language as cart management: 推荐加湿器, 预算加一点, 删掉这个条件, 换个推荐.",
        "clear or 清空购物车 must set action clear and needs_confirmation true.",
        "If cartItems is non-empty, terse cart-state edits are cart management, even when the user omits the word 购物车.",
        "Quantity edit phrases such as 把数量改成 2, 数量改成两件, 改成 2 件 mean update_quantity, not recommendation.",
        "When a quantity edit omits the target and cartItems has exactly one item, use target {\"kind\":\"unknown\",\"index\":null,\"text\":null} with confidence high; backend will resolve it from the cart snapshot.",
        "When a quantity edit omits the target and cartItems has multiple items, still return update_quantity with target unknown and confidence medium, plus a clarification_question asking which item.",
        "Positive examples:",
        "删除第二个商品 -> {\"is_cart_management\":true,\"action\":\"remove\",\"target\":{\"kind\":\"cart_ordinal\",\"index\":2,\"text\":null},\"quantity\":null,\"selected\":null,\"needs_confirmation\":false,\"confidence\":\"high\",\"clarification_question\":null}.",
        "删除购物车里的第二个商品 -> same as remove cart_ordinal 2.",
        "把数量改成 2 -> {\"is_cart_management\":true,\"action\":\"update_quantity\",\"target\":{\"kind\":\"unknown\",\"index\":null,\"text\":null},\"quantity\":2,\"selected\":null,\"needs_confirmation\":false,\"confidence\":\"high\",\"clarification_question\":null} when cartItems has exactly one item.",
        "把购物车里第一个商品数量改成 2 -> update_quantity with cart_ordinal 1 and quantity 2.",
        "取消勾选第一个 -> update_selected with cart_ordinal 1 and selected false.",
        "购物车里现在有什么 -> inspect with target all.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        hasRecentRecommendations:
          (input.contextMemory?.lastRecommendedProductIds.length ?? 0) > 0,
        recentRecommendationCount:
          input.contextMemory?.lastRecommendedProductIds.length ?? 0,
        cartItems: input.cartSnapshot?.items.map((item, index) => ({
          ordinal: index + 1,
          name: item.name,
          brand: item.brand,
          category: item.category,
          quantity: item.quantity,
          selected: item.selected,
        })) ?? [],
      }),
    },
  ];
}

function parseCartIntentOutput(rawText: string): ParsedCartIntent {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const legacyIsCartAdd = payload.is_cart_add;
  const isCartManagement = payload.is_cart_management;

  if (typeof isCartManagement === "boolean") {
    if (!isCartManagement) {
      return { isCartManagement: false };
    }

    return {
      isCartManagement: true,
      action: parseAction(payload.action),
      quantity: parseQuantity(payload.quantity),
      selected: parseSelected(payload.selected),
      target: parseTarget(payload.target),
      needsConfirmation: parseBoolean(payload.needs_confirmation),
      confidence: parseConfidence(payload.confidence),
      clarificationQuestion: parseNullableString(payload.clarification_question),
    };
  }

  if (typeof legacyIsCartAdd === "boolean") {
    if (!legacyIsCartAdd) {
      return { isCartManagement: false };
    }

    return {
      isCartManagement: true,
      action: "add",
      quantity: parseQuantity(payload.quantity),
      target: parseTarget(payload.target),
      needsConfirmation: false,
      confidence: "high",
    };
  }

  throw new Error(
    "cart intent output must include boolean is_cart_management.",
  );
}

function parseAction(value: unknown): CartCommandAction | undefined {
  return value === "inspect"
    || value === "add"
    || value === "remove"
    || value === "update_quantity"
    || value === "update_selected"
    || value === "clear"
    ? value
    : undefined;
}

function parseQuantity(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }

  if (value < MIN_CART_QUANTITY) {
    return value;
  }

  return Math.min(value, MAX_CART_QUANTITY);
}

function parseSelected(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseConfidence(value: unknown): CartCommandConfidence | undefined {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : undefined;
}

function parseNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value : undefined;
}

function parseTarget(value: unknown): CartCommandTargetInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const target = value as Record<string, unknown>;
  const kind = target.kind;

  if (
    kind === "ordinal"
    || kind === "cart_ordinal"
    || kind === "recent_recommendation_ordinal"
  ) {
    return Number.isInteger(target.index)
      ? { kind, index: target.index as number }
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

  if (kind === "all") {
    return { kind: "all" };
  }

  if (kind === "unknown") {
    return { kind: "unknown" };
  }

  return undefined;
}
