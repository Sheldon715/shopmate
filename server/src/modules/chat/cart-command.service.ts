import { MAX_CART_QUANTITY, MIN_CART_QUANTITY } from "../cart/cart.service";
import type { CartDto, CartItemDto } from "../cart/cart.types";
import type { Product } from "../products/product.types";
import type {
  CartCommandAction,
  CartCommandConfidence,
  CartCommandDetection,
  CartCommandTarget,
  CartCommandTargetInput,
} from "./cart-command.types";

export interface CartCommandResolvedProductTarget {
  status: "found" | "missing" | "ambiguous" | "not_found";
  product?: Product;
}

export interface CartCommandResolvedCartTarget {
  status: "found" | "all" | "missing" | "ambiguous" | "not_found";
  item?: CartItemDto;
  items?: CartItemDto[];
}

const DEICTIC_TARGET_PATTERN = /这个|这款|刚才那个|刚刚那个|它/u;
const CART_CONTEXT_PATTERN = /购物车|车里/gu;
const ORDINAL_TARGET_FRAGMENT_PATTERN =
  /第\s*(?:\d{1,2}|[一二两三四五六七八九十])\s*(?:个|款|件|项|号)?/gu;
const MAX_NAME_TARGET_LENGTH = 40;
const ORDINAL_NUMBER_WORDS = new Map<string, number>([
  ["一", 1],
  ["二", 2],
  ["两", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["七", 7],
  ["八", 8],
  ["九", 9],
  ["十", 10],
]);

export class CartCommandService {
  resolveProductTarget(input: {
    detection: Extract<CartCommandDetection, { isCartCommand: true }>;
    products: Product[];
  }): CartCommandResolvedProductTarget {
    if (input.products.length === 0) {
      return { status: "missing" };
    }

    const target = input.detection.target;

    if (
      target.kind === "ordinal"
      || target.kind === "recent_recommendation_ordinal"
    ) {
      const product = input.products[target.index - 1];
      return product ? { status: "found", product } : { status: "not_found" };
    }

    if (target.kind === "deictic") {
      return input.products.length === 1
        ? { status: "found", product: input.products[0] }
        : { status: "ambiguous" };
    }

    if (target.kind === "unknown") {
      return { status: "ambiguous" };
    }

    if (target.kind === "name") {
      return resolveProductNameTarget(target, input.products);
    }

    return { status: "not_found" };
  }

  resolveTarget(input: {
    detection: Extract<CartCommandDetection, { isCartCommand: true }>;
    products: Product[];
  }): CartCommandResolvedProductTarget {
    return this.resolveProductTarget(input);
  }

  resolveCartTarget(input: {
    detection: Extract<CartCommandDetection, { isCartCommand: true }>;
    cart: CartDto;
  }): CartCommandResolvedCartTarget {
    const items = input.cart.items;

    if (items.length === 0) {
      return { status: "missing" };
    }

    const target = input.detection.target;

    if (target.kind === "all") {
      return { status: "all", items };
    }

    if (target.kind === "cart_ordinal" || target.kind === "ordinal") {
      const item = items[target.index - 1];
      return item ? { status: "found", item } : { status: "not_found" };
    }

    if (target.kind === "deictic" || target.kind === "unknown") {
      return items.length === 1
        ? { status: "found", item: items[0] }
        : { status: "ambiguous" };
    }

    if (target.kind === "name") {
      return resolveCartNameTarget(target, items);
    }

    return { status: "not_found" };
  }

  createDetection(input: {
    question: string;
    action?: CartCommandAction;
    quantity?: number;
    selected?: boolean;
    target?: CartCommandTargetInput;
    needsConfirmation?: boolean;
    confidence?: CartCommandConfidence;
    clarificationQuestion?: string | null;
  }): Extract<CartCommandDetection, { isCartCommand: true }> {
    const question = normalizeQuestion(input.question);
    const action = normalizeAction(input.action);
    const quantity = normalizeQuantityForAction(
      action,
      input.quantity ?? extractQuantity(question),
    );
    const selected = input.selected ?? (
      action === "update_selected" ? extractSelected(question) : undefined
    );

    return {
      isCartCommand: true,
      action,
      quantity,
      selected,
      target:
        normalizeTarget(input.target, action)
        ?? extractExplicitTarget(question, action)
        ?? defaultTargetForAction(action),
      needsConfirmation: input.needsConfirmation ?? action === "clear",
      confidence: input.confidence ?? "high",
      clarificationQuestion: normalizeOptionalText(input.clarificationQuestion),
    };
  }
}

function normalizeAction(action: CartCommandAction | undefined): CartCommandAction {
  return action ?? "add";
}

function defaultTargetForAction(action: CartCommandAction): CartCommandTarget {
  return action === "inspect" ? { kind: "all" } : { kind: "unknown" };
}

function extractExplicitTarget(
  question: string,
  action: CartCommandAction,
): CartCommandTarget | undefined {
  const ordinalTarget = extractOrdinalTarget(question, action);

  if (ordinalTarget) {
    return ordinalTarget;
  }

  if (DEICTIC_TARGET_PATTERN.test(question)) {
    return { kind: "deictic" };
  }

  if (/(全部|全选|全不选|都取消|全删|清空)/u.test(question)) {
    return { kind: "all" };
  }

  const nameTarget = extractNameTarget(question);
  return nameTarget ? { kind: "name", text: nameTarget } : undefined;
}

function extractOrdinalTarget(
  question: string,
  action: CartCommandAction,
): CartCommandTarget | undefined {
  const ordinalValue =
    /第\s*(\d{1,2}|[一二两三四五六七八九十])\s*(?:个|款|件|项|号)?/u
      .exec(question)?.[1]
    ?? /(?:把|加|删|删除|改|勾选|取消)\s*(\d{1,2}|[一二两三四五六七八九十])\s*(?:个|款|件|项|号)/u
      .exec(question)?.[1];
  const value = ordinalValue ? parseSmallNumber(ordinalValue) : undefined;

  if (!value) {
    return undefined;
  }

  return action === "add"
    ? { kind: "recent_recommendation_ordinal", index: value }
    : { kind: "cart_ordinal", index: value };
}

function extractQuantity(question: string): number | undefined {
  const quantityQuestion = stripOrdinalTargetFragments(question);
  const numericQuantity =
    /(\d{1,3})\s*(?:件|个|份|只|条|瓶|盒)/u.exec(quantityQuestion)?.[1];
  const wordQuantity =
    /([一二两三四五六七八九十])\s*(?:件|个|份|只|条|瓶|盒)/u
      .exec(quantityQuestion)?.[1];

  if (numericQuantity) {
    return Number.parseInt(numericQuantity, 10);
  }

  return wordQuantity ? parseSmallNumber(wordQuantity) : undefined;
}

function normalizeQuantityForAction(
  action: CartCommandAction,
  quantity: number | undefined,
): number | undefined {
  if (action !== "add" && action !== "update_quantity") {
    return undefined;
  }

  if (
    typeof quantity !== "number"
    || !Number.isInteger(quantity)
    || quantity < MIN_CART_QUANTITY
  ) {
    return action === "add" ? MIN_CART_QUANTITY : undefined;
  }

  return Math.min(quantity, MAX_CART_QUANTITY);
}

function extractSelected(question: string): boolean | undefined {
  if (/(取消勾选|取消选中|不要勾选|不选|全不选)/u.test(question)) {
    return false;
  }

  if (/(勾选|选中|全选)/u.test(question)) {
    return true;
  }

  return undefined;
}

function normalizeTarget(
  target: CartCommandTargetInput | undefined,
  action: CartCommandAction,
): CartCommandTarget | undefined {
  if (!target || target.kind === "unknown") {
    return undefined;
  }

  if (target.kind === "ordinal") {
    return normalizeOrdinalTarget(target.index, action);
  }

  if (
    target.kind === "cart_ordinal"
    || target.kind === "recent_recommendation_ordinal"
  ) {
    return target.index > 0 ? target : undefined;
  }

  if (target.kind === "name") {
    const cleaned = cleanNameTarget(target.text);
    return cleaned ? { kind: "name", text: cleaned } : undefined;
  }

  return target;
}

function normalizeOrdinalTarget(
  index: number,
  action: CartCommandAction,
): CartCommandTarget | undefined {
  if (!Number.isInteger(index) || index < 1) {
    return undefined;
  }

  return action === "add"
    ? { kind: "recent_recommendation_ordinal", index }
    : { kind: "cart_ordinal", index };
}

function extractNameTarget(question: string): string | undefined {
  const patterns = [
    /把\s*(.+?)\s*(?:加入|加到|加进|删除|删掉|移除|改成|改为|取消勾选|勾选)/u,
    /(?:加入|加到|加进|删除|删掉|移除|改成|改为|取消勾选|勾选)\s*(.+?)\s*(?:到|进)?(?:购物车|车里)?$/u,
    /我想要\s*(.+?)$/u,
  ];

  for (const pattern of patterns) {
    const value = pattern.exec(question)?.[1];
    const cleaned = cleanNameTarget(value);

    if (cleaned) {
      return cleaned;
    }
  }

  return undefined;
}

function cleanNameTarget(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value
    .replace(DEICTIC_TARGET_PATTERN, "")
    .replace(CART_CONTEXT_PATTERN, "")
    .replace(ORDINAL_TARGET_FRAGMENT_PATTERN, "")
    .replace(/\d{1,3}\s*(?:件|个|份|只|条|瓶|盒)/gu, "")
    .replace(/[，。！？!?、,.；;：:]/gu, " ")
    .trim();

  if (
    /^(数量|个数|件数|商品|这个商品|这件商品)$/u.test(cleaned)
    || /^[\d一二两三四五六七八九十]+(?:件|个|份|只|条|瓶|盒)?$/u.test(cleaned)
  ) {
    return undefined;
  }

  return cleaned.length > 0
    ? Array.from(cleaned).slice(0, MAX_NAME_TARGET_LENGTH).join("")
    : undefined;
}

function resolveProductNameTarget(
  target: Extract<CartCommandTarget, { kind: "name" }>,
  products: Product[],
): CartCommandResolvedProductTarget {
  const normalizedTarget = normalizeForMatch(target.text);

  if (!normalizedTarget) {
    return products.length === 1
      ? { status: "found", product: products[0] }
      : { status: "ambiguous" };
  }

  const matches = products.filter((product) =>
    productMatchesName(product, normalizedTarget)
  );

  if (matches.length === 1) {
    return { status: "found", product: matches[0] };
  }

  if (matches.length > 1) {
    return { status: "ambiguous" };
  }

  return { status: "not_found" };
}

function resolveCartNameTarget(
  target: Extract<CartCommandTarget, { kind: "name" }>,
  items: CartItemDto[],
): CartCommandResolvedCartTarget {
  const normalizedTarget = normalizeForMatch(target.text);

  if (!normalizedTarget) {
    return items.length === 1
      ? { status: "found", item: items[0] }
      : { status: "ambiguous" };
  }

  const matches = items.filter((item) =>
    cartItemMatchesName(item, normalizedTarget)
  );

  if (matches.length === 1) {
    return { status: "found", item: matches[0] };
  }

  if (matches.length > 1) {
    return { status: "ambiguous" };
  }

  return { status: "not_found" };
}

function productMatchesName(product: Product, target: string): boolean {
  const candidates = [
    product.id,
    product.name,
    product.brand,
    product.category,
    product.subCategory ?? "",
    ...product.visualTags,
  ].map(normalizeForMatch).filter((candidate) => candidate.length > 0);

  return candidates.some((candidate) =>
    candidate.includes(target) || target.includes(candidate)
  );
}

function cartItemMatchesName(item: CartItemDto, target: string): boolean {
  const candidates = [
    item.id,
    item.productId,
    item.name,
    item.brand ?? "",
    item.category ?? "",
    ...item.tags,
  ].map(normalizeForMatch).filter((candidate) => candidate.length > 0);

  return candidates.some((candidate) =>
    candidate.includes(target) || target.includes(candidate)
  );
}

function parseSmallNumber(value: string): number | undefined {
  if (/^\d{1,2}$/u.test(value)) {
    return Number.parseInt(value, 10);
  }

  return ORDINAL_NUMBER_WORDS.get(value);
}

function normalizeQuestion(question: string): string {
  return question.replace(/\s+/gu, "").trim();
}

function stripOrdinalTargetFragments(question: string): string {
  return question.replace(ORDINAL_TARGET_FRAGMENT_PATTERN, "");
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/gu, "")
    .replace(/[^\p{Script=Han}a-z0-9]/gu, "");
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
