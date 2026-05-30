import { randomUUID } from "node:crypto";
import { getDatabasePool } from "../../lib/db/pool";
import { getEnv } from "../../lib/env";
import {
  findActiveProductsByIds,
  findProductById,
} from "../products/product.repository";
import type { Product } from "../products/product.types";
import { isProductAvailable, mapCartToDto } from "./cart.mapper";
import {
  deleteCartItem,
  findCartItems,
  selectAllCartItems,
  updateCartItem,
  upsertCartItem,
} from "./cart.repository";
import type {
  CartDto,
  CartItemRecord,
  CartItemUpdateInput,
  CartItemUpsertInput,
} from "./cart.types";

export const DEMO_CART_USER_KEY = "demo-user";
export const MIN_CART_QUANTITY = 1;
export const MAX_CART_QUANTITY = 99;

export interface AddCartItemInput {
  productId: string;
  quantity: number;
}

export interface PatchCartItemInput {
  quantity?: number;
  selected?: boolean;
}

export interface CartServiceDependencies {
  publicImageBaseUrl?: string;
  findCartItems(userKey: string): Promise<CartItemRecord[]>;
  findProductsByIds(productIds: string[]): Promise<Product[]>;
  findProductById(productId: string): Promise<Product | null>;
  upsertCartItem(input: CartItemUpsertInput): Promise<CartItemRecord>;
  updateCartItem(input: CartItemUpdateInput): Promise<CartItemRecord | null>;
  deleteCartItem(userKey: string, itemId: string): Promise<boolean>;
  selectAllCartItems(userKey: string, selected: boolean): Promise<void>;
}

export class CartRequestError extends Error {
  readonly code = "INVALID_CART_REQUEST";

  constructor(message: string) {
    super(message);
    this.name = "CartRequestError";
  }
}

export class CartItemNotFoundError extends Error {
  readonly code = "CART_ITEM_NOT_FOUND";

  constructor(itemId: string) {
    super(`购物车项不存在：${itemId}`);
    this.name = "CartItemNotFoundError";
  }
}

export class CartProductNotFoundError extends Error {
  readonly code = "PRODUCT_NOT_FOUND";

  constructor(productId: string) {
    super(`商品不存在：${productId}`);
    this.name = "CartProductNotFoundError";
  }
}

export class CartProductUnavailableError extends Error {
  readonly code = "PRODUCT_UNAVAILABLE";

  constructor(productId: string) {
    super(`商品当前不可加购：${productId}`);
    this.name = "CartProductUnavailableError";
  }
}

export class CartService {
  constructor(
    private readonly dependencies: CartServiceDependencies =
      createDefaultCartServiceDependencies(),
    private readonly userKey = DEMO_CART_USER_KEY,
  ) {}

  async getCart(): Promise<CartDto> {
    return this.loadCart();
  }

  async addItem(input: AddCartItemInput): Promise<CartDto> {
    const productId = normalizeRequiredString(input.productId, "productId");
    const quantity = normalizeQuantity(input.quantity, "quantity");
    const product = await this.dependencies.findProductById(productId);

    if (!product) {
      throw new CartProductNotFoundError(productId);
    }

    if (!isProductAvailable(product)) {
      throw new CartProductUnavailableError(productId);
    }

    await this.dependencies.upsertCartItem({
      id: randomUUID(),
      userKey: this.userKey,
      productId,
      quantity,
    });

    return this.loadCart();
  }

  async updateItem(itemId: string, input: PatchCartItemInput): Promise<CartDto> {
    const normalizedItemId = normalizeRequiredString(itemId, "itemId");

    if (input.quantity === undefined && input.selected === undefined) {
      throw new CartRequestError("quantity 和 selected 至少需要传一个");
    }

    const quantity = input.quantity === undefined
      ? undefined
      : normalizeQuantity(input.quantity, "quantity");
    const selected = input.selected === undefined
      ? undefined
      : normalizeBoolean(input.selected, "selected");
    const updated = await this.dependencies.updateCartItem({
      userKey: this.userKey,
      itemId: normalizedItemId,
      quantity,
      selected,
    });

    if (!updated) {
      throw new CartItemNotFoundError(normalizedItemId);
    }

    return this.loadCart();
  }

  async deleteItem(itemId: string): Promise<CartDto> {
    const normalizedItemId = normalizeRequiredString(itemId, "itemId");
    const deleted = await this.dependencies.deleteCartItem(
      this.userKey,
      normalizedItemId,
    );

    if (!deleted) {
      throw new CartItemNotFoundError(normalizedItemId);
    }

    return this.loadCart();
  }

  async selectAll(selected: boolean): Promise<CartDto> {
    const normalizedSelected = normalizeBoolean(selected, "selected");
    await this.dependencies.selectAllCartItems(
      this.userKey,
      normalizedSelected,
    );

    return this.loadCart();
  }

  private async loadCart(): Promise<CartDto> {
    const items = await this.dependencies.findCartItems(this.userKey);
    const products = await this.dependencies.findProductsByIds(
      items.map((item) => item.productId),
    );

    return mapCartToDto(items, products, {
      publicImageBaseUrl: this.dependencies.publicImageBaseUrl,
    });
  }
}

export function parseAddCartItemBody(body: unknown): AddCartItemInput {
  const record = readRecord(body);

  return {
    productId: normalizeRequiredString(record.productId, "productId"),
    quantity: record.quantity === undefined
      ? MIN_CART_QUANTITY
      : normalizeQuantity(record.quantity, "quantity"),
  };
}

export function parsePatchCartItemBody(body: unknown): PatchCartItemInput {
  const record = readRecord(body);
  const input: PatchCartItemInput = {};

  if (record.quantity !== undefined) {
    input.quantity = normalizeQuantity(record.quantity, "quantity");
  }

  if (record.selected !== undefined) {
    input.selected = normalizeBoolean(record.selected, "selected");
  }

  if (input.quantity === undefined && input.selected === undefined) {
    throw new CartRequestError("quantity 和 selected 至少需要传一个");
  }

  return input;
}

export function parseSelectAllBody(body: unknown): boolean {
  const record = readRecord(body);

  return normalizeBoolean(record.selected, "selected");
}

export function parseCartItemIdParam(value: unknown): string {
  return normalizeRequiredString(value, "itemId");
}

function createDefaultCartServiceDependencies(): CartServiceDependencies {
  const { publicImageBaseUrl } = getEnv();

  return {
    publicImageBaseUrl,
    findCartItems: (userKey) => findCartItems(getDatabasePool(), userKey),
    findProductsByIds: (productIds) =>
      findActiveProductsByIds(getDatabasePool(), productIds),
    findProductById: (productId) => findProductById(getDatabasePool(), productId),
    upsertCartItem: (input) => upsertCartItem(getDatabasePool(), input),
    updateCartItem: (input) => updateCartItem(getDatabasePool(), input),
    deleteCartItem: (userKey, itemId) =>
      deleteCartItem(getDatabasePool(), userKey, itemId),
    selectAllCartItems: (userKey, selected) =>
      selectAllCartItems(getDatabasePool(), userKey, selected),
  };
}

function readRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CartRequestError("请求体必须是 JSON object");
  }

  return body as Record<string, unknown>;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new CartRequestError(`${fieldName} 必须是字符串`);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new CartRequestError(`${fieldName} 不能为空`);
  }

  return trimmed;
}

function normalizeQuantity(value: unknown, fieldName: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_CART_QUANTITY ||
    value > MAX_CART_QUANTITY
  ) {
    throw new CartRequestError(
      `${fieldName} 必须是 ${MIN_CART_QUANTITY} 到 ${MAX_CART_QUANTITY} 之间的整数`,
    );
  }

  return value;
}

function normalizeBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new CartRequestError(`${fieldName} 必须是布尔值`);
  }

  return value;
}
