import { describe, expect, it } from "vitest";
import type { LlmGenerateRequest, LlmGenerateResponse } from "../llm/llm.types";
import { MockLlmClient } from "../llm/mock-llm.client";
import type {
  CheckoutActionResult,
  CheckoutIntentDetection,
  PendingCheckoutDraft,
} from "../orders/checkout.types";
import { CheckoutResponseService } from "./checkout-response.service";

describe("CheckoutResponseService", () => {
  it("formats draft totals from cents instead of asking the LLM to read raw cents", async () => {
    let called = false;
    const service = new CheckoutResponseService({
      llmClient: new MockLlmClient({
        handler: () => {
          called = true;
          return createLlmResponse(JSON.stringify({
            answer: "错误：26900 元",
          }));
        },
      }),
    });

    const answer = await service.generate({
      question: "下单第一个",
      intent: createIntent("start_checkout"),
      checkoutAction: createCheckoutAction("draft_created", 26900),
      draft: createDraft(26900),
    });

    expect(called).toBe(false);
    expect(answer).toContain("合计 ¥269");
    expect(answer).not.toContain("26900 元");
  });

  it("passes formatted money text to the LLM prompt for non-deterministic checkout replies", async () => {
    let request: LlmGenerateRequest | undefined;
    const service = new CheckoutResponseService({
      llmClient: new MockLlmClient({
        handler: (input) => {
          request = input;
          return createLlmResponse(JSON.stringify({
            answer: "配送方式已更新，合计 ¥269。",
          }));
        },
      }),
    });

    const answer = await service.generate({
      question: "配送改成加急",
      intent: createIntent("update_checkout"),
      checkoutAction: {
        ...createCheckoutAction("draft_updated", 26900),
        changedFields: ["delivery_method", "summary"],
      },
      draft: createDraft(26900),
    });
    const promptPayload = JSON.parse(request?.messages[1]?.content ?? "{}") as {
      checkoutAction?: Record<string, unknown>;
      draft?: {
        summary?: Record<string, unknown>;
        items?: Array<Record<string, unknown>>;
      };
    };
    const promptText = request?.messages.map((message) => message.content).join("\n")
      ?? "";

    expect(answer).toBe("配送方式已更新，合计 ¥269。");
    expect(promptPayload.checkoutAction?.totalText).toBe("¥269");
    expect(promptPayload.draft?.summary?.totalText).toBe("¥269");
    expect(promptPayload.draft?.items?.[0]?.subtotalText).toBe("¥269");
    expect(promptText).not.toContain("totalCents");
    expect(promptText).not.toContain("26900 元");
  });
});

function createIntent(
  action: Extract<CheckoutIntentDetection, { isCheckoutIntent: true }>["action"],
): Extract<CheckoutIntentDetection, { isCheckoutIntent: true }> {
  return {
    isCheckoutIntent: true,
    action,
    targetScope: "selected_cart_items",
    confidence: "high",
    needsConfirmation: false,
  };
}

function createCheckoutAction(
  status: CheckoutActionResult["status"],
  totalCents: number,
): CheckoutActionResult {
  return {
    type: "start_checkout",
    status,
    draftId: "draft_1",
    selectedCount: 1,
    totalCents,
    address: {
      label: "本次收货信息",
      recipient: "ShopMate 用户",
      phoneMasked: "138****0000",
      fullAddress: "ShopMate 收货点",
    },
    cartRefreshRequired: false,
  };
}

function createDraft(totalCents: number): PendingCheckoutDraft {
  return {
    id: "draft_1",
    conversationId: "checkout-demo-1",
    userKey: "demo-user",
    source: "buy_now",
    status: "pending",
    address: {
      id: "saved-address-default",
      label: "本次收货信息",
      recipient: "ShopMate 用户",
      phoneMasked: "138****0000",
      fullAddress: "ShopMate 收货点",
    },
    items: [{
      cartItemId: "buy-now-product_001",
      productId: "product_001",
      productName: "小熊多功能早餐机",
      brand: "小熊",
      category: "家用电器",
      unitPriceCents: totalCents,
      quantity: 1,
      subtotalCents: totalCents,
      imagePath: null,
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
      type: "wechat_pay",
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
      type: "wechat_pay",
      label: "微信支付",
    }],
    expiresAt: "2026-06-06T00:30:00.000Z",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
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
