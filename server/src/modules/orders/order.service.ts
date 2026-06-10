import { randomUUID } from "node:crypto";
import { getDatabasePool, withTransaction } from "../../lib/db/pool";
import { getEnv } from "../../lib/env";
import { findCartItems } from "../cart/cart.repository";
import { mapCartToDto } from "../cart/cart.mapper";
import { DEMO_CART_USER_KEY } from "../cart/cart.service";
import type { CartDto, CartItemDto } from "../cart/cart.types";
import { isProductAvailable } from "../products/product-availability";
import { buildProductDisplayName } from "../products/product-display-copy";
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
  CheckoutChangedField,
  CheckoutDeliveryOption,
  CheckoutDeliverySnapshot,
  CheckoutPatchInput,
  CheckoutPaymentOption,
  CheckoutPaymentSnapshot,
  CheckoutSummary,
  CheckoutShippingInput,
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
export const DEFAULT_CHECKOUT_DELIVERY_OPTIONS: CheckoutDeliveryOption[] = [
  {
    type: "standard",
    label: "标准配送",
    feeCents: 0,
    etaText: "预计 2-4 天送达",
  },
  {
    type: "express",
    label: "加急配送",
    feeCents: 1200,
    etaText: "预计明天送达",
  },
];
export const DEFAULT_CHECKOUT_PAYMENT_OPTIONS: CheckoutPaymentOption[] = [
  { type: "wechat", label: "微信支付" },
  { type: "alipay", label: "支付宝" },
  { type: "bank_card", label: "银行卡" },
];

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

export interface ConfirmPendingCheckoutInput {
  shipping?: CheckoutShippingInput;
  deliveryMethodType?: string;
  paymentMethodType?: string;
}

export interface UpdatePendingCheckoutDraftResult {
  draft: PendingCheckoutDraft;
  changedFields: CheckoutChangedField[];
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
    const selectedDeliveryMethod = mapDeliveryOptionToSnapshot(
      DEFAULT_CHECKOUT_DELIVERY_OPTIONS[0],
    );
    const selectedPaymentMethod = mapPaymentOptionToSnapshot(
      DEFAULT_CHECKOUT_PAYMENT_OPTIONS[0],
    );
    const selectedAddress = input.address ?? createDefaultMockShippingAddress();
    const draft: PendingCheckoutDraft = {
      id: this.dependencies.createId(),
      conversationId,
      userKey: this.userKey,
      source: "cart",
      status: "pending",
      address: selectedAddress,
      savedAddresses: createDefaultSavedShippingAddresses(selectedAddress),
      items,
      summary: createCheckoutSummary(items, selectedDeliveryMethod.feeCents),
      selectedDeliveryMethod,
      selectedPaymentMethod,
      deliveryOptions: DEFAULT_CHECKOUT_DELIVERY_OPTIONS,
      paymentOptions: DEFAULT_CHECKOUT_PAYMENT_OPTIONS,
      expiresAt: new Date(now.getTime() + DEFAULT_CHECKOUT_TTL_MS).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    return draft;
  }

  async createProductCheckout(input: {
    productId: string;
    conversationId?: string;
    address?: MockShippingAddress;
  }): Promise<PendingCheckoutDraft> {
    const productId = normalizeRequiredText(input.productId, "productId");
    const conversationId = normalizeOptionalText(input.conversationId)
      ?? DEFAULT_CHECKOUT_CONVERSATION_ID;
    const product = (await this.dependencies.findActiveProductsByIds([productId]))
      .find((candidate) => candidate.id === productId);

    if (!product || !isProductAvailable(product)) {
      throw new CheckoutProductUnavailableError(productId);
    }

    const now = this.dependencies.now();
    const items = [mapProductToPendingCheckoutItem(product)];
    const selectedDeliveryMethod = mapDeliveryOptionToSnapshot(
      DEFAULT_CHECKOUT_DELIVERY_OPTIONS[0],
    );
    const selectedPaymentMethod = mapPaymentOptionToSnapshot(
      DEFAULT_CHECKOUT_PAYMENT_OPTIONS[0],
    );
    const selectedAddress = input.address ?? createDefaultMockShippingAddress();
    const draft: PendingCheckoutDraft = {
      id: this.dependencies.createId(),
      conversationId,
      userKey: this.userKey,
      source: "buy_now",
      status: "pending",
      address: selectedAddress,
      savedAddresses: createDefaultSavedShippingAddresses(selectedAddress),
      items,
      summary: createCheckoutSummary(items, selectedDeliveryMethod.feeCents),
      selectedDeliveryMethod,
      selectedPaymentMethod,
      deliveryOptions: DEFAULT_CHECKOUT_DELIVERY_OPTIONS,
      paymentOptions: DEFAULT_CHECKOUT_PAYMENT_OPTIONS,
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
    return this.updatePendingCheckoutDraft(draft, {
      shipping: { fullAddress: addressText },
    }).draft;
  }

  updatePendingCheckoutDraft(
    draft: PendingCheckoutDraft,
    patch: CheckoutPatchInput,
  ): UpdatePendingCheckoutDraftResult {
    if (new Date(draft.expiresAt).getTime() <= this.dependencies.now().getTime()) {
      throw new CheckoutExpiredError();
    }

    const now = this.dependencies.now().toISOString();
    const changedFields: CheckoutChangedField[] = [];
    let address = draft.address;
    let selectedDeliveryMethod = draft.selectedDeliveryMethod;
    let selectedPaymentMethod = draft.selectedPaymentMethod;
    let summary = draft.summary;

    if (patch.shipping) {
      address = applyShippingPatch(
        draft.address,
        patch.shipping,
        draft.savedAddresses ?? [],
      );
      changedFields.push("shipping");
    }

    const deliveryMethodType = normalizeOptionalText(patch.deliveryMethodType);

    if (deliveryMethodType) {
      const nextDeliveryMethod = resolveDeliveryMethod(draft, deliveryMethodType);
      const shippingFeeChanged =
        nextDeliveryMethod.feeCents !== selectedDeliveryMethod.feeCents;

      selectedDeliveryMethod = nextDeliveryMethod;
      summary = createCheckoutSummary(draft.items, selectedDeliveryMethod.feeCents);
      changedFields.push("delivery_method");

      if (shippingFeeChanged) {
        changedFields.push("summary");
      }
    }

    const paymentMethodType = normalizeOptionalText(patch.paymentMethodType);

    if (paymentMethodType) {
      selectedPaymentMethod = resolvePaymentMethod(draft, paymentMethodType);
      changedFields.push("payment_method");
    }

    if (changedFields.length === 0) {
      throw new CheckoutRequestError("checkoutPatch 至少需要一个可更新字段");
    }

    return {
      draft: {
        ...draft,
        address,
        selectedDeliveryMethod,
        selectedPaymentMethod,
        summary,
        updatedAt: now,
      },
      changedFields: dedupeChangedFields(changedFields),
    };
  }

  async confirmPendingCheckout(
    draft: PendingCheckoutDraft,
    source: OrderSource = "chat_agent",
    input: ConfirmPendingCheckoutInput = {},
  ): Promise<OrderRecord> {
    if (new Date(draft.expiresAt).getTime() <= this.dependencies.now().getTime()) {
      throw new CheckoutExpiredError();
    }

    if (draft.items.length === 0) {
      throw new CheckoutEmptyCartError();
    }

    const shouldValidateCart = draft.source === "cart";

    if (shouldValidateCart) {
      const currentCart = await this.dependencies.getCart(draft.userKey);
      assertDraftMatchesCurrentCart(draft, currentCart);
    }

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
    const deliveryMethod = input.deliveryMethodType
      ? resolveDeliveryMethod(draft, input.deliveryMethodType)
      : draft.selectedDeliveryMethod;
    const paymentMethod = input.paymentMethodType
      ? resolvePaymentMethod(draft, input.paymentMethodType)
      : draft.selectedPaymentMethod;
    const shippingAddress = input.shipping
      ? normalizeShippingInput(input.shipping)
      : draft.address;
    const totalCents = draft.summary.subtotalCents + deliveryMethod.feeCents;
    const orderInput: CreateOrderInput = {
      id: orderId,
      orderNumber: this.dependencies.createOrderNumber(now),
      userKey: draft.userKey,
      status: "mock_created",
      currency: draft.summary.currency,
      subtotalCents: draft.summary.subtotalCents,
      shippingFeeCents: deliveryMethod.feeCents,
      totalCents,
      shippingAddress,
      deliveryMethod,
      paymentMethod,
      source,
      items: draft.items.map((item) => ({
        ...item,
        id: this.dependencies.createId(),
        orderId,
      })),
    };

    return this.dependencies.persistOrder(
      orderInput,
      shouldValidateCart
        ? draft.items.map((item) => ({
          id: item.cartItemId,
          quantity: item.quantity,
        }))
        : [],
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
    id: "saved-address-default",
    label: "默认地址",
    recipient: "ShopMate 用户",
    phoneMasked: "138****0000",
    fullAddress: "ShopMate 收货点",
    region: "ShopMate 演示配送区",
    tag: "默认",
    isDefault: true,
  };
}

export function createDefaultSavedShippingAddresses(
  selectedAddress: MockShippingAddress = createDefaultMockShippingAddress(),
): MockShippingAddress[] {
  const defaultAddress = {
    ...createDefaultMockShippingAddress(),
    ...selectedAddress,
    id: selectedAddress.id ?? "saved-address-default",
    tag: selectedAddress.tag ?? "默认",
    isDefault: selectedAddress.isDefault ?? true,
  };
  const alternateAddress: MockShippingAddress = {
    id: "saved-address-campus",
    label: "学校宿舍",
    recipient: "ShopMate 用户",
    phoneMasked: "138****0000",
    fullAddress: "UNSW Village 6 栋 302",
    region: "ShopMate 演示配送区",
    tag: "宿舍",
    isDefault: false,
  };

  return [defaultAddress, alternateAddress]
    .filter((address, index, addresses) =>
      addresses.findIndex((candidate) => candidate.id === address.id) === index
    );
}

export function parseMockCheckoutBody(body: unknown): {
  conversationId?: string;
} {
  const record = parseOptionalObjectBody(body);

  return {
    conversationId: normalizeOptionalText(record.conversationId),
  };
}

export function parseProductCheckoutBody(body: unknown): {
  conversationId?: string;
  productId: string;
} {
  const record = parseOptionalObjectBody(body);

  return {
    conversationId: normalizeOptionalText(record.conversationId),
    productId: normalizeRequiredText(record.productId, "productId"),
  };
}

export function parseMockCheckoutConfirmBody(body: unknown): {
  conversationId?: string;
  draftId: string;
  shipping: CheckoutShippingInput;
  deliveryMethodType: string;
  paymentMethodType: string;
} {
  const record = parseOptionalObjectBody(body);

  return {
    conversationId: normalizeOptionalText(record.conversationId),
    draftId: normalizeRequiredText(record.draftId, "draftId"),
    shipping: parseShippingInput(record.shipping),
    deliveryMethodType: normalizeRequiredText(
      record.deliveryMethodType,
      "deliveryMethodType",
    ),
    paymentMethodType: normalizeRequiredText(
      record.paymentMethodType,
      "paymentMethodType",
    ),
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

function mapProductToPendingCheckoutItem(product: Product): PendingCheckoutItem {
  return {
    cartItemId: `buy-now:${product.id}`,
    productId: product.id,
    productName: buildProductDisplayName(product),
    brand: product.brand,
    category: product.category,
    unitPriceCents: product.priceMinCents,
    quantity: 1,
    subtotalCents: product.priceMinCents,
    imagePath: product.imagePath,
  };
}

function createCheckoutSummary(
  items: PendingCheckoutItem[],
  shippingFeeCents = 0,
): CheckoutSummary {
  const selectedCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);

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

function resolveDeliveryMethod(
  draft: PendingCheckoutDraft,
  deliveryMethodType: string | undefined,
): CheckoutDeliverySnapshot {
  const type = deliveryMethodType ?? DEFAULT_CHECKOUT_DELIVERY_OPTIONS[0]?.type;
  const option = draft.deliveryOptions.find((candidate) => candidate.type === type)
    ?? DEFAULT_CHECKOUT_DELIVERY_OPTIONS.find((candidate) => candidate.type === type);

  if (!option) {
    throw new CheckoutRequestError("deliveryMethodType 不可用");
  }

  return mapDeliveryOptionToSnapshot(option);
}

function resolvePaymentMethod(
  draft: PendingCheckoutDraft,
  paymentMethodType: string | undefined,
): CheckoutPaymentSnapshot {
  const type = paymentMethodType ?? DEFAULT_CHECKOUT_PAYMENT_OPTIONS[0]?.type;
  const option = draft.paymentOptions.find((candidate) => candidate.type === type)
    ?? DEFAULT_CHECKOUT_PAYMENT_OPTIONS.find((candidate) => candidate.type === type);

  if (!option) {
    throw new CheckoutRequestError("paymentMethodType 不可用");
  }

  return mapPaymentOptionToSnapshot(option);
}

function parseShippingInput(value: unknown): CheckoutShippingInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CheckoutRequestError("shipping 必须是 JSON object");
  }

  const record = value as Record<string, unknown>;

  return {
    recipient: normalizeRequiredText(record.recipient, "shipping.recipient"),
    phone: normalizeRequiredText(record.phone, "shipping.phone"),
    fullAddress: normalizeRequiredText(record.fullAddress, "shipping.fullAddress"),
  };
}

function normalizeShippingInput(input: CheckoutShippingInput): MockShippingAddress {
  const recipient = normalizeRequiredText(input.recipient, "shipping.recipient");
  const phone = normalizePhone(input.phone);
  const fullAddress = normalizeRequiredText(input.fullAddress, "shipping.fullAddress");

  return {
    label: "订单收货信息",
    recipient,
    phoneMasked: maskPhone(phone),
    fullAddress,
  };
}

function applyShippingPatch(
  current: MockShippingAddress,
  patch: NonNullable<CheckoutPatchInput["shipping"]>,
  savedAddresses: MockShippingAddress[] = [],
): MockShippingAddress {
  let next = current;

  if (patch.savedAddressId !== undefined) {
    const savedAddressId = normalizeRequiredText(
      patch.savedAddressId,
      "checkoutPatch.shipping.savedAddressId",
    );
    const savedAddress = savedAddresses.find((candidate) =>
      candidate.id === savedAddressId
    );

    if (!savedAddress) {
      throw new CheckoutRequestError("checkoutPatch.shipping.savedAddressId 不可用");
    }

    next = {
      ...savedAddress,
      label: savedAddress.label || "本次收货信息",
    };
  }

  if (patch.recipient !== undefined) {
    next = {
      ...next,
      label: "本次收货信息",
      recipient: normalizeRequiredText(patch.recipient, "checkoutPatch.shipping.recipient"),
    };
  }

  if (patch.phone !== undefined) {
    next = {
      ...next,
      label: "本次收货信息",
      phoneMasked: maskPhone(normalizePhone(patch.phone)),
    };
  }

  if (patch.fullAddress !== undefined) {
    next = {
      ...next,
      label: "本次收货信息",
      fullAddress: normalizeRequiredText(
        patch.fullAddress,
        "checkoutPatch.shipping.fullAddress",
      ),
    };
  }

  if (next === current) {
    throw new CheckoutRequestError("checkoutPatch.shipping 至少需要一个可更新字段");
  }

  return next;
}

function mapDeliveryOptionToSnapshot(
  option: CheckoutDeliveryOption | undefined,
): CheckoutDeliverySnapshot {
  if (!option) {
    throw new CheckoutRequestError("deliveryMethodType 不可用");
  }

  return {
    type: option.type,
    label: option.label,
    feeCents: option.feeCents,
  };
}

function mapPaymentOptionToSnapshot(
  option: CheckoutPaymentOption | undefined,
): CheckoutPaymentSnapshot {
  if (!option) {
    throw new CheckoutRequestError("paymentMethodType 不可用");
  }

  return {
    type: option.type,
    label: option.label,
    status: "not_charged",
  };
}

function dedupeChangedFields(
  fields: CheckoutChangedField[],
): CheckoutChangedField[] {
  return [...new Set(fields)];
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

function parseOptionalObjectBody(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) {
    return {};
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    throw new CheckoutRequestError("请求体必须是 JSON object");
  }

  return body as Record<string, unknown>;
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

function normalizePhone(value: unknown): string {
  const phone = normalizeRequiredText(value, "shipping.phone");

  if (!/^[0-9]{7,15}$/.test(phone)) {
    throw new CheckoutRequestError("shipping.phone 格式不正确");
  }

  return phone;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function maskPhone(phone: string): string {
  if (phone.length <= 7) {
    return `${phone.slice(0, 3)}****`;
  }

  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
