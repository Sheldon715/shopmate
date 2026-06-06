import { randomUUID } from "node:crypto";
import { getDatabasePool, withTransaction } from "../../lib/db/pool";
import { getEnv } from "../../lib/env";
import { findCartItems } from "../cart/cart.repository";
import { mapCartToDto } from "../cart/cart.mapper";
import { DEMO_CART_USER_KEY } from "../cart/cart.service";
import type { CartDto, CartItemDto } from "../cart/cart.types";
import { isProductAvailable } from "../products/product-availability";
import { findActiveProductsByIds } from "../products/product.repository";
import type { Product } from "../products/product.types";
import {
  type CheckoutCartItemGuard,
  createOrder,
  deleteCartItemsForCheckout,
  findOrderById,
} from "./order.repository";
import { mapOrderToDto } from "./order.mapper";
import type {
  CheckoutSummary,
  MockShippingAddress,
  PendingCheckoutDraft,
  PendingCheckoutItem,
} from "./checkout.types";
import type {
  CreateOrderInput,
  OrderDto,
  OrderRecord,
  OrderSource,
} from "./order.types";

export const DEFAULT_CHECKOUT_TTL_MS = 15 * 60 * 1000;
export const DEFAULT_CHECKOUT_CONVERSATION_ID = "cart-button-checkout";

export class CheckoutRequestError extends Error {
  readonly code = "INVALID_CHECKOUT_REQUEST";

  constructor(message: string) {
    super(message);
    this.name = "CheckoutRequestError";
  }
}

export class CheckoutEmptyCartError extends Error {
  readonly code = "CHECKOUT_EMPTY_CART";

  constructor() {
    super("购物车没有可结算商品");
    this.name = "CheckoutEmptyCartError";
  }
}

export class CheckoutExpiredError extends Error {
  readonly code = "CHECKOUT_EXPIRED";

  constructor() {
    super("待确认订单已过期");
    this.name = "CheckoutExpiredError";
  }
}

export class CheckoutProductUnavailableError extends Error {
  readonly code = "CHECKOUT_PRODUCT_UNAVAILABLE";

  constructor(productId: string) {
    super(`商品不可结算：${productId}`);
    this.name = "CheckoutProductUnavailableError";
  }
}

export class CheckoutCartChangedError extends Error {
  readonly code = "CHECKOUT_CART_CHANGED";

  constructor() {
    super("待确认订单对应的购物车商品已变化");
    this.name = "CheckoutCartChangedError";
  }
}

export class OrderNotFoundError extends Error {
  readonly code = "ORDER_NOT_FOUND";

  constructor(orderId: string) {
    super(`订单不存在：${orderId}`);
    this.name = "OrderNotFoundError";
  }
}

export interface OrderServiceDependencies {
  now(): Date;
  createId(): string;
  createOrderNumber(now: Date): string;
  getCart(userKey: string): Promise<CartDto>;
  findActiveProductsByIds(productIds: string[]): Promise<Product[]>;
  persistOrder(
    input: CreateOrderInput,
    cartItems: CheckoutCartItemGuard[],
  ): Promise<OrderRecord>;
  findOrderById(orderId: string): Promise<OrderRecord | null>;
}

export class OrderService {
  constructor(
    private readonly dependencies: OrderServiceDependencies =
      createDefaultOrderServiceDependencies(),
    private readonly userKey = DEMO_CART_USER_KEY,
  ) {}

  async createPendingCheckout(input: {
    conversationId?: string;
    address?: MockShippingAddress;
  } = {}): Promise<PendingCheckoutDraft> {
    const conversationId = normalizeOptionalText(input.conversationId)
      ?? DEFAULT_CHECKOUT_CONVERSATION_ID;
    const cart = await this.dependencies.getCart(this.userKey);
    const selectedItems = cart.items.filter((item) =>
      item.selected && item.available && item.quantity > 0
    );

    if (selectedItems.length === 0) {
      throw new CheckoutEmptyCartError();
    }

    const now = this.dependencies.now();
    const items = selectedItems.map(mapCartItemToPendingCheckoutItem);
    const draft: PendingCheckoutDraft = {
      id: this.dependencies.createId(),
      conversationId,
      userKey: this.userKey,
      status: "pending",
      address: input.address ?? createDefaultMockShippingAddress(),
      items,
      summary: createCheckoutSummary(items),
      expiresAt: new Date(now.getTime() + DEFAULT_CHECKOUT_TTL_MS).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    return draft;
  }

  updateDraftAddress(
    draft: PendingCheckoutDraft,
    addressText: string,
  ): PendingCheckoutDraft {
    const fullAddress = normalizeRequiredText(addressText, "addressText");
    const now = this.dependencies.now().toISOString();

    return {
      ...draft,
      address: {
        ...draft.address,
        label: "本次模拟地址",
        fullAddress,
      },
      updatedAt: now,
    };
  }

  async confirmPendingCheckout(
    draft: PendingCheckoutDraft,
    source: OrderSource = "chat_agent",
  ): Promise<OrderRecord> {
    if (new Date(draft.expiresAt).getTime() <= this.dependencies.now().getTime()) {
      throw new CheckoutExpiredError();
    }

    if (draft.items.length === 0) {
      throw new CheckoutEmptyCartError();
    }

    const currentCart = await this.dependencies.getCart(draft.userKey);
    assertDraftMatchesCurrentCart(draft, currentCart);

    const activeProducts = await this.dependencies.findActiveProductsByIds(
      draft.items.map((item) => item.productId),
    );
    const activeProductsById = new Map(
      activeProducts.map((product) => [product.id, product]),
    );

    for (const item of draft.items) {
      const product = activeProductsById.get(item.productId);

      if (!product || !isProductAvailable(product)) {
        throw new CheckoutProductUnavailableError(item.productId);
      }
    }

    const now = this.dependencies.now();
    const orderId = this.dependencies.createId();
    const orderInput: CreateOrderInput = {
      id: orderId,
      orderNumber: this.dependencies.createOrderNumber(now),
      userKey: draft.userKey,
      status: "mock_created",
      currency: draft.summary.currency,
      subtotalCents: draft.summary.subtotalCents,
      shippingFeeCents: draft.summary.shippingFeeCents,
      totalCents: draft.summary.totalCents,
      shippingAddress: draft.address,
      source,
      items: draft.items.map((item) => ({
        ...item,
        id: this.dependencies.createId(),
        orderId,
      })),
    };

    return this.dependencies.persistOrder(
      orderInput,
      draft.items.map((item) => ({
        id: item.cartItemId,
        quantity: item.quantity,
      })),
    );
  }

  async getOrder(orderId: string): Promise<OrderDto> {
    const normalizedOrderId = normalizeRequiredText(orderId, "orderId");
    const order = await this.dependencies.findOrderById(normalizedOrderId);

    if (!order) {
      throw new OrderNotFoundError(normalizedOrderId);
    }

    return mapOrderToDto(order);
  }
}

export function createDefaultMockShippingAddress(): MockShippingAddress {
  return {
    label: "默认模拟地址",
    recipient: "ShopMate Demo 用户",
    phoneMasked: "138****0000",
    fullAddress: "ShopMate Demo 收货点",
  };
}

export function parseMockCheckoutBody(body: unknown): {
  conversationId?: string;
} {
  if (body === undefined || body === null) {
    return {};
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    throw new CheckoutRequestError("请求体必须是 JSON object");
  }

  const record = body as Record<string, unknown>;

  return {
    conversationId: normalizeOptionalText(record.conversationId),
  };
}

export function parseOrderIdParam(value: unknown): string {
  return normalizeRequiredText(value, "orderId");
}

function createDefaultOrderServiceDependencies(): OrderServiceDependencies {
  const pool = getDatabasePool();

  return {
    now: () => new Date(),
    createId: () => randomUUID(),
    createOrderNumber: createMockOrderNumber,
    getCart: async (userKey) => {
      const { publicImageBaseUrl } = getEnv();
      const items = await findCartItems(pool, userKey);
      const products = await findActiveProductsByIds(
        pool,
        items.map((item) => item.productId),
      );

      return mapCartToDto(items, products, { publicImageBaseUrl });
    },
    findActiveProductsByIds: (productIds) =>
      findActiveProductsByIds(pool, productIds),
    persistOrder: (input, cartItemIds) =>
      withTransaction(pool, async (client) => {
        const order = await createOrder(client, input);
        const deletedCount = await deleteCartItemsForCheckout(
          client,
          input.userKey,
          cartItemIds,
        );

        if (deletedCount !== cartItemIds.length) {
          throw new CheckoutCartChangedError();
        }

        return order;
      }),
    findOrderById: (orderId) => findOrderById(pool, orderId),
  };
}

function mapCartItemToPendingCheckoutItem(item: CartItemDto): PendingCheckoutItem {
  return {
    cartItemId: item.id,
    productId: item.productId,
    productName: item.name,
    brand: item.brand ?? "",
    category: item.category ?? "",
    unitPriceCents: item.priceCents,
    quantity: item.quantity,
    subtotalCents: item.subtotalCents,
    imagePath: item.imagePath,
  };
}

function createCheckoutSummary(items: PendingCheckoutItem[]): CheckoutSummary {
  const selectedCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);
  const shippingFeeCents = 0;

  return {
    itemCount: items.length,
    selectedCount,
    subtotalCents,
    shippingFeeCents,
    totalCents: subtotalCents + shippingFeeCents,
    currency: "CNY",
  };
}

function assertDraftMatchesCurrentCart(
  draft: PendingCheckoutDraft,
  currentCart: CartDto,
): void {
  const currentItemsById = new Map(
    currentCart.items.map((item) => [item.id, item]),
  );

  for (const draftItem of draft.items) {
    const currentItem = currentItemsById.get(draftItem.cartItemId);

    if (
      !currentItem
      || !currentItem.selected
      || currentItem.quantity !== draftItem.quantity
    ) {
      throw new CheckoutCartChangedError();
    }
  }
}

function createMockOrderNumber(now: Date): string {
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();

  return `MOCK-${timestamp}-${suffix}`;
}

function normalizeRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new CheckoutRequestError(`${fieldName} 必须是字符串`);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new CheckoutRequestError(`${fieldName} 不能为空`);
  }

  return trimmed;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}
