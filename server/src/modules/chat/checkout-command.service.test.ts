import { describe, expect, it } from "vitest";
import type { CartDto, CartItemDto } from "../cart/cart.types";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateResponse } from "../llm/llm.types";
import type {
  CheckoutIntentAction,
  CheckoutIntentDetection,
} from "../orders/checkout.types";
import type { CheckoutCartItemGuard } from "../orders/order.repository";
import { OrderService, type OrderServiceDependencies } from "../orders/order.service";
import type { CreateOrderInput, OrderRecord } from "../orders/order.types";
import type { Product } from "../products/product.types";
import { CheckoutCommandService } from "./checkout-command.service";
import { CheckoutResponseService } from "./checkout-response.service";
import { PendingCheckoutStore } from "./pending-checkout.store";

describe("CheckoutCommandService", () => {
  it("creates pending draft for start_checkout without creating an order", async () => {
    const harness = createCommandHarness();

    const result = await harness.service.execute({
      question: "帮我结算购物车",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("start_checkout"),
      pendingCheckout: { status: "missing" },
    });

    expect(result).toMatchObject({
      answer: "请确认本次订单。",
      productCards: [],
      checkoutAction: {
        type: "start_checkout",
        status: "draft_created",
        draftId: "draft_1",
        selectedCount: 1,
        totalCents: 19900,
        cartRefreshRequired: false,
      },
    });
    expect(harness.store.get({
      conversationId: "checkout-demo-1",
      userKey: "demo-user",
    })).toMatchObject({
      status: "found",
      draft: { id: "draft_1" },
    });
    expect(harness.persistCalls).toHaveLength(0);
  });

  it("updates address on an existing draft without creating an order", async () => {
    const harness = createCommandHarness();
    await harness.service.execute({
      question: "帮我结算购物车",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("start_checkout"),
      pendingCheckout: { status: "missing" },
    });
    const pending = harness.service.getPendingCheckout({
      conversationId: "checkout-demo-1",
    });

    const result = await harness.service.execute({
      question: "地址改成 UNSW 学生宿舍",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("update_address", {
        addressText: "UNSW 学生宿舍",
      }),
      pendingCheckout: pending,
    });

    expect(result.checkoutAction).toMatchObject({
      type: "update_address",
      status: "address_updated",
      draftId: "draft_1",
      address: {
        label: "本次收货信息",
        fullAddress: "UNSW 学生宿舍",
      },
      cartRefreshRequired: false,
    });
    expect(harness.service.getPendingCheckout({
      conversationId: "checkout-demo-1",
    })).toMatchObject({
      status: "found",
      draft: {
        address: { fullAddress: "UNSW 学生宿舍" },
      },
    });
    expect(harness.persistCalls).toHaveLength(0);
  });

  it("updates checkout draft with structured shipping, delivery, and payment patch", async () => {
    const harness = createCommandHarness();
    await harness.service.execute({
      question: "帮我结算购物车",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("start_checkout"),
      pendingCheckout: { status: "missing" },
    });
    const pending = harness.service.getPendingCheckout({
      conversationId: "checkout-demo-1",
    });

    const result = await harness.service.execute({
      question: "收货人改成张三，电话 13800000000，配送选加急，支付用支付宝",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("update_checkout", {
        checkoutPatch: {
          shipping: {
            recipient: "张三",
            phone: "13800000000",
          },
          deliveryMethodType: "express",
          paymentMethodType: "alipay",
        },
      }),
      pendingCheckout: pending,
    });

    expect(result.checkoutAction).toMatchObject({
      type: "update_checkout",
      status: "draft_updated",
      draftId: "draft_1",
      selectedCount: 1,
      totalCents: 21100,
      address: {
        label: "本次收货信息",
        recipient: "张三",
        phoneMasked: "138****0000",
      },
      changedFields: [
        "shipping",
        "delivery_method",
        "summary",
        "payment_method",
      ],
      draft: {
        id: "draft_1",
        selectedDeliveryMethod: {
          type: "express",
          feeCents: 1200,
        },
        selectedPaymentMethod: {
          type: "alipay",
          status: "not_charged",
        },
        summary: {
          shippingFeeCents: 1200,
          totalCents: 21100,
        },
      },
      cartRefreshRequired: false,
    });
    expect(harness.service.getPendingCheckout({
      conversationId: "checkout-demo-1",
    })).toMatchObject({
      status: "found",
      draft: {
        selectedDeliveryMethod: { type: "express" },
        selectedPaymentMethod: { type: "alipay" },
        summary: { totalCents: 21100 },
      },
    });
    expect(harness.persistCalls).toHaveLength(0);
  });

  it("confirms an existing draft into an order and clears pending checkout", async () => {
    const harness = createCommandHarness();
    await harness.service.execute({
      question: "帮我结算购物车",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("start_checkout"),
      pendingCheckout: { status: "missing" },
    });
    const pending = harness.service.getPendingCheckout({
      conversationId: "checkout-demo-1",
    });

    const result = await harness.service.execute({
      question: "确认下单",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("confirm_checkout"),
      pendingCheckout: pending,
    });

    expect(result.checkoutAction).toMatchObject({
      type: "confirm_checkout",
      status: "order_created",
      draftId: "draft_1",
      orderId: "order_1",
      orderNumber: "MOCK-20260606000000-TEST",
      cartRefreshRequired: true,
    });
    expect(harness.persistCalls).toHaveLength(1);
    expect(harness.service.getPendingCheckout({
      conversationId: "checkout-demo-1",
    })).toEqual({ status: "missing" });
  });

  it("summarizes and cancels pending checkout without creating an order", async () => {
    const harness = createCommandHarness();
    await harness.service.execute({
      question: "帮我结算购物车",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("start_checkout"),
      pendingCheckout: { status: "missing" },
    });
    const pending = harness.service.getPendingCheckout({
      conversationId: "checkout-demo-1",
    });

    const summarizeResult = await harness.service.execute({
      question: "重新汇总一下",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("summarize_checkout"),
      pendingCheckout: pending,
    });

    expect(summarizeResult.checkoutAction).toMatchObject({
      type: "summarize_checkout",
      status: "needs_confirmation",
      draftId: "draft_1",
      cartRefreshRequired: false,
    });

    const cancelResult = await harness.service.execute({
      question: "取消下单",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("cancel_checkout"),
      pendingCheckout: harness.service.getPendingCheckout({
        conversationId: "checkout-demo-1",
      }),
    });

    expect(cancelResult.checkoutAction).toEqual({
      type: "cancel_checkout",
      status: "cancelled",
    });
    expect(harness.service.getPendingCheckout({
      conversationId: "checkout-demo-1",
    })).toEqual({ status: "missing" });
    expect(harness.persistCalls).toHaveLength(0);
  });

  it("does not create an order when confirm_checkout has no pending draft", async () => {
    const harness = createCommandHarness();

    const result = await harness.service.execute({
      question: "确认下单",
      conversationId: "checkout-demo-1",
      cartSnapshot: createCartDto([createCartItem()]),
      intent: createIntent("confirm_checkout"),
      pendingCheckout: { status: "missing" },
    });

    expect(result.checkoutAction).toEqual({
      type: "confirm_checkout",
      status: "failed",
    });
    expect(harness.persistCalls).toHaveLength(0);
  });
});

function createCommandHarness(): {
  service: CheckoutCommandService;
  store: PendingCheckoutStore;
  persistCalls: Array<{ input: CreateOrderInput; cartItems: CheckoutCartItemGuard[] }>;
} {
  const store = new PendingCheckoutStore(
    { now: () => new Date("2026-06-06T00:01:00.000Z") },
    new Map(),
  );
  const persistCalls: Array<{ input: CreateOrderInput; cartItems: CheckoutCartItemGuard[] }> = [];
  const ids = ["draft_1", "order_1", "order_item_1"];
  const dependencies: OrderServiceDependencies = {
    now: () => new Date("2026-06-06T00:00:00.000Z"),
    createId: () => ids.shift() ?? "generated_id",
    createOrderNumber: () => "MOCK-20260606000000-TEST",
    getCart: async () => createCartDto([createCartItem()]),
    findActiveProductsByIds: async (productIds) =>
      productIds.map((productId) => createProduct({ id: productId })),
    persistOrder: async (orderInput, cartItems) => {
      persistCalls.push({ input: orderInput, cartItems });
      return createOrderRecord(orderInput);
    },
    findOrderById: async () => null,
  };
  const checkoutResponseService = new CheckoutResponseService({
    llmClient: new MockLlmClient({
      response: createLlmResponse(JSON.stringify({
        answer: "请确认本次订单。",
      })),
    }),
  });
  const service = new CheckoutCommandService({
    orderService: new OrderService(dependencies, "demo-user"),
    pendingCheckoutStore: store,
    checkoutResponseService,
    userKey: "demo-user",
  });

  return { service, store, persistCalls };
}

function createIntent(
  action: CheckoutIntentAction,
  overrides: Partial<Extract<CheckoutIntentDetection, { isCheckoutIntent: true }>> = {},
): Extract<CheckoutIntentDetection, { isCheckoutIntent: true }> {
  return {
    isCheckoutIntent: true,
    action,
    targetScope: "selected_cart_items",
    confidence: "high",
    needsConfirmation: false,
    ...overrides,
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
  return {
    id: "item_001",
    productId: "product_001",
    name: "通勤蓝牙耳机",
    brand: "示例品牌",
    category: "数码电子",
    priceCents: 19900,
    priceText: "¥199",
    quantity: 1,
    selected: true,
    subtotalCents: 19900,
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

function createLlmResponse(text: string): LlmGenerateResponse {
  return {
    text,
    model: "mock-llm",
    provider: "mock",
    finishReason: "stop",
    latencyMs: 0,
  };
}
