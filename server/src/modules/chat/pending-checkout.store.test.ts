import { describe, expect, it } from "vitest";
import type { PendingCheckoutDraft } from "../orders/checkout.types";
import { PendingCheckoutStore } from "./pending-checkout.store";

describe("PendingCheckoutStore", () => {
  it("saves, replaces, reads, and clears a draft by conversation and user", () => {
    const store = new PendingCheckoutStore(
      { now: () => new Date("2026-06-06T00:01:00.000Z") },
      new Map(),
    );
    const firstDraft = createDraft({ id: "draft_1", totalCents: 19900 });
    const replacementDraft = createDraft({ id: "draft_2", totalCents: 29900 });

    store.save(firstDraft);
    store.save(replacementDraft);

    expect(store.get({
      conversationId: "checkout-demo-1",
      userKey: "demo-user",
    })).toMatchObject({
      status: "found",
      draft: {
        id: "draft_2",
        summary: { totalCents: 29900 },
      },
    });
    expect(store.clear({
      conversationId: "checkout-demo-1",
      userKey: "demo-user",
    })).toMatchObject({
      status: "found",
      draft: { id: "draft_2" },
    });
    expect(store.get({
      conversationId: "checkout-demo-1",
      userKey: "demo-user",
    })).toEqual({ status: "missing" });
  });

  it("returns expired once and removes stale drafts", () => {
    const store = new PendingCheckoutStore(
      { now: () => new Date("2026-06-06T00:20:00.000Z") },
      new Map(),
    );

    store.save(createDraft({
      id: "draft_expired",
      expiresAt: "2026-06-06T00:15:00.000Z",
    }));

    expect(store.get({
      conversationId: "checkout-demo-1",
      userKey: "demo-user",
    })).toMatchObject({
      status: "expired",
      draft: { id: "draft_expired" },
    });
    expect(store.get({
      conversationId: "checkout-demo-1",
      userKey: "demo-user",
    })).toEqual({ status: "missing" });
  });
});

function createDraft(input: {
  id?: string;
  totalCents?: number;
  expiresAt?: string;
} = {}): PendingCheckoutDraft {
  const totalCents = input.totalCents ?? 19900;

  return {
    id: input.id ?? "draft_1",
    conversationId: "checkout-demo-1",
    userKey: "demo-user",
    source: "cart",
    status: "pending",
    address: {
      label: "默认地址",
      recipient: "ShopMate 用户",
      phoneMasked: "138****0000",
      fullAddress: "ShopMate 收货点",
    },
    items: [{
      cartItemId: "item_001",
      productId: "product_001",
      productName: "通勤蓝牙耳机",
      brand: "示例品牌",
      category: "数码电子",
      unitPriceCents: totalCents,
      quantity: 1,
      subtotalCents: totalCents,
      imagePath: "/images/product_001.png",
    }],
    summary: {
      itemCount: 1,
      selectedCount: 1,
      subtotalCents: totalCents,
      shippingFeeCents: 0,
      totalCents,
      currency: "CNY",
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
    deliveryOptions: [{
      type: "standard",
      label: "标准配送",
      feeCents: 0,
      etaText: "预计 2-4 天送达",
    }],
    paymentOptions: [{
      type: "wechat",
      label: "微信支付",
    }],
    expiresAt: input.expiresAt ?? "2026-06-06T00:15:00.000Z",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  };
}
