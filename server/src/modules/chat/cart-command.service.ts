import { MAX_CART_QUANTITY, MIN_CART_QUANTITY } from "../cart/cart.service";
import type { Product } from "../products/product.types";
import type {
  CartCommandDetection,
  CartCommandTarget,
  CartCommandTargetInput,
} from "./cart-command.types";

export interface CartCommandResolvedTarget {
  status: "found" | "missing" | "ambiguous" | "not_found";
  product?: Product;
}

const DEICTIC_TARGET_PATTERN = /这个|这款|它|刚才那(?:个|款)?|推荐的/u;
const CART_CONTEXT_PATTERN = /购物车|车里/gu;
const ORDINAL_TARGET_FRAGMENT_PATTERN =
  /第\s*(?:\d{1,2}|[一二两三四五六七八九十])\s*(?:个|款|件|号)?|(?:\d{1,2}|[一二两三四五六七八九十])\s*(?:个|款|号)/gu;
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
  resolveTarget(input: {
    detection: Extract<CartCommandDetection, { isCartCommand: true }>;
    products: Product[];
  }): CartCommandResolvedTarget {
    if (input.products.length === 0) {
      return { status: "missing" };
    }

    const target = input.detection.target;

    if (target.kind === "ordinal") {
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

    return resolveNameTarget(target, input.products);
  }

  createDetection(input: {
    question: string;
    quantity?: number;
    target?: CartCommandTargetInput;
  }): Extract<CartCommandDetection, { isCartCommand: true }> {
    return {
      isCartCommand: true,
      quantity: normalizeQuantity(
        input.quantity ?? extractQuantity(normalizeQuestion(input.question)),
      ),
      target:
        normalizeTarget(input.target)
        ?? extractExplicitTarget(normalizeQuestion(input.question))
        ?? { kind: "unknown" },
    };
  }
}

function extractExplicitTarget(question: string): CartCommandTarget | undefined {
  const ordinalTarget = extractOrdinalTarget(question);

  if (ordinalTarget) {
    return ordinalTarget;
  }

  if (DEICTIC_TARGET_PATTERN.test(question)) {
    return { kind: "deictic" };
  }

  const nameTarget = extractNameTarget(question);
  return nameTarget ? { kind: "name", text: nameTarget } : undefined;
}

function extractOrdinalTarget(question: string): CartCommandTarget | undefined {
  const ordinalValue = [
    /第(\d{1,2}|[一二两三四五六七八九十])(?:个|款|件|号)?/u,
    /(?:把|加入|加|放|我要)(\d{1,2}|[一二两三四五六七八九十])(?:个|款|号)?(?:加入|加|放|进去|到|$)/u,
    /(\d{1,2}|[一二两三四五六七八九十])(?:个|款|号)(?:加入|加|放|进去|到|$)/u,
  ].map((pattern) => pattern.exec(question)?.[1]).find(Boolean);
  const value = ordinalValue ? parseSmallNumber(ordinalValue) : undefined;

  return value ? { kind: "ordinal", index: value } : undefined;
}

function extractQuantity(question: string): number {
  const quantityQuestion = stripOrdinalTargetFragments(question);
  const suffixQuantity = /(?:加入|加|放|我要).{0,20}?(\d{1,3})\s*(?:件|个|份|台|双|瓶|盒|包)/u.exec(quantityQuestion)?.[1]
    ?? /(\d{1,3})\s*(?:件|个|份|台|双|瓶|盒|包)/u.exec(quantityQuestion)?.[1];
  const prefixQuantityWord = /加\s*([一二两三四五六七八九十])\s*(?:件|个|份|台|双|瓶|盒|包)/u.exec(quantityQuestion)?.[1];
  const parsed = suffixQuantity
    ? Number.parseInt(suffixQuantity, 10)
    : prefixQuantityWord
      ? parseSmallNumber(prefixQuantityWord)
      : undefined;

  if (!parsed || parsed < MIN_CART_QUANTITY) {
    return MIN_CART_QUANTITY;
  }

  return Math.min(parsed, MAX_CART_QUANTITY);
}

function normalizeQuantity(quantity: number | undefined): number {
  if (
    typeof quantity !== "number"
    || !Number.isInteger(quantity)
    || quantity < MIN_CART_QUANTITY
  ) {
    return MIN_CART_QUANTITY;
  }

  return Math.min(quantity, MAX_CART_QUANTITY);
}

function normalizeTarget(
  target: CartCommandTargetInput | undefined,
): CartCommandTarget | undefined {
  if (!target || target.kind === "unknown") {
    return undefined;
  }

  if (target.kind === "ordinal") {
    return target.index > 0 ? target : undefined;
  }

  if (target.kind === "name") {
    const cleaned = cleanNameTarget(target.text);
    return cleaned ? { kind: "name", text: cleaned } : undefined;
  }

  return target;
}

function extractNameTarget(question: string): string | undefined {
  const patterns = [
    /把\s*(.+?)\s*(?:加入|加|放)/u,
    /(?:加入|加|放)\s*(.+?)\s*(?:到|进)(?:购物车|车里)$/u,
    /我要\s*(.+?)$/u,
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
    .replace(/第?\s*(?:\d{1,2}|[一二两三四五六七八九十])\s*(?:个|款|件|号)?/gu, "")
    .replace(/\d{1,2}\s*(?:件|个|份|台|双|瓶|盒|包)/gu, "")
    .replace(/[，。！？!,;；]/gu, " ")
    .trim();

  return cleaned.length > 0
    ? Array.from(cleaned).slice(0, MAX_NAME_TARGET_LENGTH).join("")
    : undefined;
}

function resolveNameTarget(
  target: Extract<CartCommandTarget, { kind: "name" }>,
  products: Product[],
): CartCommandResolvedTarget {
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

function productMatchesName(product: Product, target: string): boolean {
  const candidates = [
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
