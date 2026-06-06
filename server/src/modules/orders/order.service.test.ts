import { describe, expect, it } from "vitest";
import type { CartDto, CartItemDto } from "../cart/cart.types";
import type { Product } from "../products/product.types";
import {
  CheckoutCartChangedError,
  CheckoutEmptyCartError,
  CheckoutExpiredError,
  CheckoutProductUnavailableError,
  CheckoutRequestError,
  OrderService,
  type OrderServiceDependencies,
} from "./order.service";
import type { CheckoutCartItemGuard } from "./order.repository";
import type { CreateOrderInput, OrderRecord } from "./order.types";

describe("OrderService", () => {
  it("creates pending checkout from selected cart items only", async () => {
    const harness = createOrderHarness({
      cart: createCartDto([
        createCartItem({ id: "item_001", productId: "product_001", selected: true }),
        createCartItem({ id: "item_002", productId: "product_002", selected: false }),
        createCartItem({ id: "item_003", productId: "product_003", available: false }),
      ]),
    });
    const service = new OrderService(harness.dependencies, "demo-user");

    const draft = await service.createPendingCheckout({
      conversationId: "checkout-demo-1",
    });

    expect(draft).toMatchObject({
      id: "draft_1",
      conversationId: "checkout-demo-1",
      userKey: "demo-user",
      summary: {
        itemCount: 1,
        selectedCount: 1,
        subtotalCents: 19900,
        totalCents: 19900,
      },
      address: {
        phoneMasked: "138****0000",
      },
      selectedDeliveryMethod: {
        type: "standard",
        label: "标准配送",
        feeCents: 0,
      },
      selectedPaymentMethod: {
        type: "wechat",
        label: "微信支付",
        status: "not_charged",
      },
      deliveryOptions: [
        expect.objectContaining({ type: "standard", feeCents: 0 }),
        expect.objectContaining({ type: "express", feeCents: 1200 }),
      ],
      paymentOptions: [
        expect.objectContaining({ type: "wechat" }),
        expect.objectContaining({ type: "alipay" }),
        expect.objectContaining({ type: "bank_card" }),
      ],
    });
    expect(draft.items).toEqual([
      expect.objectContaining({
        cartItemId: "item_001",
        productId: "product_001",
        productName: "通勤蓝牙耳机",
        unitPriceCents: 19900,
        subtotalCents: 19900,
      }),
    ]);
    expect(draft.expiresAt).toBe("2026-06-06T00:15:00.000Z");
  });

  it("does not create pending checkout when no selected item is checkoutable", async () => {
    const harness = createOrderHarness({
      cart: createCartDto([
        createCartItem({ selected: false }),
        createCartItem({ id: "item_002", available: false }),
      ]),
    });
    const service = new OrderService(harness.dependencies, "demo-user");

    await expect(service.createPendingCheckout())
      .rejects.toBeInstanceOf(CheckoutEmptyCartError);
  });

  it("confirms pending checkout with order snapshots and selected cart cleanup", async () => {
    const harness = createOrderHarness();
    const service = new OrderService(harness.dependencies, "demo-user");
    const draft = await service.createPendingCheckout({
      conversationId: "checkout-demo-1",
    });

    const order = await service.confirmPendingCheckout(draft, "chat_agent");

    expect(harness.persistCalls).toHaveLength(1);
    expect(harness.persistCalls[0]?.cartItems).toEqual([
      { id: "item_001", quantity: 1 },
    ]);
    expect(harness.persistCalls[0]?.input).toMatchObject({
      id: "order_1",
      orderNumber: "MOCK-20260606000000-TEST",
      userKey: "demo-user",
      status: "mock_created",
      subtotalCents: 19900,
      totalCents: 19900,
      source: "chat_agent",
      shippingAddress: {
        recipient: "ShopMate 用户",
        phoneMasked: "138****0000",
      },
      deliveryMethod: {
        type: "standard",
        label: "标准配送",
        feeCents: 0,
      },
      paymentMethod: {
        type: "wechat",
        label: "微信支付",
        status: "not_charged",
      },
      items: [
        expect.objectContaining({
          id: "order_item_1",
          orderId: "order_1",
          productId: "product_001",
          productName: "通勤蓝牙耳机",
          brand: "示例品牌",
          category: "数码电子",
          unitPriceCents: 19900,
          quantity: 1,
          subtotalCents: 19900,
        }),
      ],
    });
    expect(order).toMatchObject({
      id: "order_1",
      orderNumber: "MOCK-20260606000000-TEST",
      totalCents: 19900,
      items: [{ productId: "product_001" }],
    });
  });

  it("confirms with edited shipping, selected delivery, and payment snapshots", async () => {
    const harness = createOrderHarness();
    const service = new OrderService(harness.dependencies, "demo-user");
    const draft = await service.createPendingCheckout({
      conversationId: "checkout-demo-1",
    });

    const order = await service.confirmPendingCheckout(draft, "cart_button", {
      shipping: {
        recipient: "张三",
        phone: "13800000000",
        fullAddress: "ShopMate 演示公寓",
      },
      deliveryMethodType: "express",
      paymentMethodType: "alipay",
    });

    expect(harness.persistCalls[0]?.input).toMatchObject({
      source: "cart_button",
      shippingFeeCents: 1200,
      totalCents: 21100,
      shippingAddress: {
        label: "订单收货信息",
        recipient: "张三",
        phoneMasked: "138****0000",
        fullAddress: "ShopMate 演示公寓",
      },
      deliveryMethod: {
        type: "express",
        label: "加急配送",
        feeCents: 1200,
      },
      paymentMethod: {
        type: "alipay",
        label: "支付宝",
        status: "not_charged",
      },
    });
    expect(order.totalCents).toBe(21100);
  });

  it("updates pending draft shipping, delivery, payment, and summary without persisting order", async () => {
    const harness = createOrderHarness();
    const service = new OrderService(harness.dependencies, "demo-user");
    const draft = await service.createPendingCheckout({
      conversationId: "checkout-demo-1",
    });

    const result = service.updatePendingCheckoutDraft(draft, {
      shipping: {
        recipient: "张三",
        phone: "13800000000",
        fullAddress: "上海市浦东新区测试路 1 号",
      },
      deliveryMethodType: "express",
      paymentMethodType: "alipay",
    });

    expect(result.changedFields).toEqual([
      "shipping",
      "delivery_method",
      "summary",
      "payment_method",
    ]);
    expect(result.draft).toMatchObject({
      address: {
        label: "本次收货信息",
        recipient: "张三",
        phoneMasked: "138****0000",
        fullAddress: "上海市浦东新区测试路 1 号",
      },
      selectedDeliveryMethod: {
        type: "express",
        label: "加急配送",
        feeCents: 1200,
      },
      selectedPaymentMethod: {
        type: "alipay",
        label: "支付宝",
        status: "not_charged",
      },
      summary: {
        subtotalCents: 19900,
        shippingFeeCents: 1200,
        totalCents: 21100,
      },
      updatedAt: "2026-06-06T00:00:00.000Z",
    });
    expect(harness.persistCalls).toHaveLength(0);
  });

  it("updates partial shipping patch fields independently", async () => {
    const harness = createOrderHarness();
    const service = new OrderService(harness.dependencies, "demo-user");
    const draft = await service.createPendingCheckout({
      conversationId: "checkout-demo-1",
    });

    const addressOnlyResult = service.updatePendingCheckoutDraft(draft, {
      shipping: {
        recipient: undefined,
        phone: undefined,
        fullAddress: "上海市浦东新区测试路 1 号",
      },
    });

    expect(addressOnlyResult.changedFields).toEqual(["shipping"]);
    expect(addressOnlyResult.draft.address).toMatchObject({
      recipient: "ShopMate 用户",
      phoneMasked: "138****0000",
      fullAddress: "上海市浦东新区测试路 1 号",
    });

    const phoneOnlyResult = service.updatePendingCheckoutDraft(
      addressOnlyResult.draft,
      {
        shipping: {
          phone: "13912345678",
        },
      },
    );

    expect(phoneOnlyResult.changedFields).toEqual(["shipping"]);
    expect(phoneOnlyResult.draft.address).toMatchObject({
      recipient: "ShopMate 用户",
      phoneMasked: "139****5678",
      fullAddress: "上海市浦东新区测试路 1 号",
    });
    expect(harness.persistCalls).toHaveLength(0);
  });

  it("rejects invalid checkout snapshots before persisting order", async () => {
    const harness = createOrderHarness();
    const service = new OrderService(harness.dependencies, "demo-user");
    const draft = await service.createPendingCheckout();

    await expect(service.confirmPendingCheckout(draft, "cart_button", {
      shipping: {
        recipient: "张三",
        phone: "not-a-phone",
        fullAddress: "ShopMate 演示公寓",
      },
      deliveryMethodType: "standard",
      paymentMethodType: "wechat",
    })).rejects.toBeInstanceOf(CheckoutRequestError);
    expect(harness.persistCalls).toHaveLength(0);

    await expect(service.confirmPendingCheckout(draft, "cart_button", {
      shipping: {
        recipient: "张三",
        phone: "13800000000",
        fullAddress: "ShopMate 演示公寓",
      },
      deliveryMethodType: "standard",
      paymentMethodType: "unknown_payment",
    })).rejects.toBeInstanceOf(CheckoutRequestError);
    expect(harness.persistCalls).toHaveLength(0);

    expect(() => service.updatePendingCheckoutDraft(draft, {
      deliveryMethodType: "unknown_delivery",
    })).toThrow(CheckoutRequestError);
  });

  it("rejects stale draft when cart item selection or quantity changed", async () => {
    const harness = createOrderHarness();
    const service = new OrderService(harness.dependencies, "demo-user");
    const draft = await service.createPendingCheckout({
      conversationId: "checkout-demo-1",
    });

    harness.setCart(createCartDto([
      createCartItem({ selected: false }),
    ]));

    await expect(service.confirmPendingCheckout(draft))
      .rejects.toBeInstanceOf(CheckoutCartChangedError);
    expect(harness.persistCalls).toHaveLength(0);

    harness.setCart(createCartDto([
      createCartItem({ quantity: 2, subtotalCents: 39800 }),
    ]));

    await expect(service.confirmPendingCheckout(draft))
      .rejects.toBeInstanceOf(CheckoutCartChangedError);
    expect(harness.persistCalls).toHaveLength(0);
  });

  it("rejects expired draft and unavailable product without persisting order", async () => {
    const expiredHarness = createOrderHarness();
    const expiredService = new OrderService(expiredHarness.dependencies, "demo-user");
    const expiredDraft = await expiredService.createPendingCheckout();

    expiredHarness.setNow(new Date("2026-06-06T00:16:00.000Z"));

    await expect(expiredService.confirmPendingCheckout(expiredDraft))
      .rejects.toBeInstanceOf(CheckoutExpiredError);
    expect(expiredHarness.persistCalls).toHaveLength(0);

    const unavailableHarness = createOrderHarness({
      products: [createProduct({
        id: "product_001",
        skus: [{
          id: "sku_001",
          productId: "product_001",
          properties: {},
          priceCents: 19900,
          currency: "CNY",
          available: false,
          stockLevel: "out_of_stock",
          sortOrder: 0,
        }],
      })],
    });
    const unavailableService = new OrderService(
      unavailableHarness.dependencies,
      "demo-user",
    );
    const unavailableDraft = await unavailableService.createPendingCheckout();

    await expect(unavailableService.confirmPendingCheckout(unavailableDraft))
      .rejects.toBeInstanceOf(CheckoutProductUnavailableError);
    expect(unavailableHarness.persistCalls).toHaveLength(0);
  });
});

function createOrderHarness(input: {
  cart?: CartDto;
  products?: Product[];
} = {}): {
  dependencies: OrderServiceDependencies;
  persistCalls: Array<{ input: CreateOrderInput; cartItems: CheckoutCartItemGuard[] }>;
  setCart(cart: CartDto): void;
  setNow(now: Date): void;
} {
  let now = new Date("2026-06-06T00:00:00.000Z");
  const ids = ["draft_1", "order_1", "order_item_1", "order_item_2"];
  const persistCalls: Array<{ input: CreateOrderInput; cartItems: CheckoutCartItemGuard[] }> = [];
  let cart = input.cart ?? createCartDto([createCartItem()]);
  const products = input.products ?? [createProduct({ id: "product_001" })];

  return {
    dependencies: {
      now: () => now,
      createId: () => ids.shift() ?? `generated_${ids.length}`,
      createOrderNumber: () => "MOCK-20260606000000-TEST",
      getCart: async () => cart,
      findActiveProductsByIds: async (productIds) =>
        products.filter((product) => productIds.includes(product.id)),
      persistOrder: async (orderInput, cartItems) => {
        persistCalls.push({ input: orderInput, cartItems });
        return createOrderRecord(orderInput);
      },
      findOrderById: async () => null,
    },
    persistCalls,
    setCart(nextCart: CartDto) {
      cart = nextCart;
    },
    setNow(nextNow: Date) {
      now = nextNow;
    },
  };
}

function createOrderRecord(input: CreateOrderInput): OrderRecord {
  const createdAt = new Date("2026-06-06T00:00:01.000Z");

  return {
    id: input.id,
    orderNumber: input.orderNumber,
    userKey: input.userKey,
    status: input.status,
    currency: input.currency,
    subtotalCents: input.subtotalCents,
    shippingFeeCents: input.shippingFeeCents,
    totalCents: input.totalCents,
    shippingLabel: input.shippingAddress.label,
    shippingName: input.shippingAddress.recipient,
    shippingPhoneMasked: input.shippingAddress.phoneMasked,
    shippingAddress: input.shippingAddress.fullAddress,
    deliveryMethod: input.deliveryMethod,
    paymentMethod: input.paymentMethod,
    source: input.source,
    createdAt,
    items: input.items.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      productId: item.productId,
      productNameSnapshot: item.productName,
      brandSnapshot: item.brand,
      categorySnapshot: item.category,
      unitPriceCentsSnapshot: item.unitPriceCents,
      quantity: item.quantity,
      subtotalCentsSnapshot: item.subtotalCents,
      imagePathSnapshot: item.imagePath,
      createdAt,
    })),
  };
}

function createCartDto(items: CartItemDto[]): CartDto {
  return {
    items,
    summary: {
      totalCount: items.reduce((sum, item) => sum + item.quantity, 0),
      selectedCount: items
        .filter((item) => item.selected)
        .reduce((sum, item) => sum + item.quantity, 0),
      selectedTotalCents: items
        .filter((item) => item.selected)
        .reduce((sum, item) => sum + item.subtotalCents, 0),
      currency: "CNY",
    },
  };
}

function createCartItem(overrides: Partial<CartItemDto> = {}): CartItemDto {
  const quantity = overrides.quantity ?? 1;
  const priceCents = overrides.priceCents ?? 19900;

  return {
    id: "item_001",
    productId: "product_001",
    name: "通勤蓝牙耳机",
    brand: "示例品牌",
    category: "数码电子",
    priceCents,
    priceText: "¥199",
    quantity,
    selected: true,
    subtotalCents: priceCents * quantity,
    available: true,
    tags: ["通勤"],
    imagePath: "/images/product_001.png",
    ...overrides,
  };
}

function createProduct(overrides: Partial<Product> = {}): Product {
  const id = overrides.id ?? "product_001";

  return {
    id,
    status: "active",
    name: "通勤蓝牙耳机",
    brand: "示例品牌",
    category: "数码电子",
    subCategory: "真无线耳机",
    imagePath: `/images/${id}.png`,
    imageCaption: "Product image",
    currency: "CNY",
    basePriceCents: 19900,
    priceMinCents: 19900,
    priceMaxCents: 19900,
    marketingDescription: "适合通勤。",
    knowledgeText: "通勤蓝牙耳机",
    ratingAvg: 4.5,
    categoryPath: ["数码电子", "真无线耳机"],
    visualTags: ["通勤"],
    attributes: {},
    pros: [],
    cons: [],
    recommendWhen: [],
    avoidWhen: [],
    compareWith: [],
    reviewSummary: {},
    contentBlocks: [],
    officialFaq: [],
    userReviews: [],
    normalizedPayload: {},
    sourceDataset: "test",
    sourceVersion: "test",
    sourceType: "test",
    dataVersion: "test",
    isDesensitized: true,
    ingestBatchId: "test",
    sourcePath: "test",
    skus: [{
      id: `${id}-sku-1`,
      productId: id,
      properties: {},
      priceCents: 19900,
      currency: "CNY",
      available: true,
      stockLevel: "in_stock",
      sortOrder: 0,
    }],
    ...overrides,
  };
}
