import { describe, expect, it } from "vitest";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateRequest, LlmGenerateResponse } from "../llm/llm.types";
import type { PendingCheckoutDraft } from "../orders/checkout.types";
import { CheckoutIntentService } from "./checkout-intent.service";

describe("CheckoutIntentService", () => {
  it("uses LLM intent to classify checkout start requests", async () => {
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(JSON.stringify({
            is_checkout_intent: true,
            action: "start_checkout",
            address_text: null,
            target_scope: "selected_cart_items",
            confidence: "high",
            needs_confirmation: false,
            clarification_question: null,
          }));
        },
      }),
    });

    const result = await service.detect({
      question: "帮我结算购物车",
      cartSnapshot: {
        items: [{
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
        }],
        summary: {
          totalCount: 1,
          selectedCount: 1,
          selectedTotalCents: 19900,
          currency: "CNY",
        },
      },
    });

    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("结算意图分类器");
    expect(llmRequest?.maxCompletionTokens).toBe(512);
    expect(llmRequest?.messages[1]?.content).not.toContain("通勤蓝牙耳机");
    expect(result).toMatchObject({
      isCheckoutIntent: true,
      action: "start_checkout",
      targetScope: "selected_cart_items",
      confidence: "high",
      needsConfirmation: false,
    });
  });

  it("allows terse confirmation only when pending checkout exists", async () => {
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          is_checkout_intent: true,
          action: "confirm_checkout",
          address_text: null,
          target_scope: "selected_cart_items",
          confidence: "high",
          needs_confirmation: false,
          clarification_question: null,
        })),
      }),
    });

    await expect(service.detect({
      question: "确认",
      pendingCheckout: { status: "missing" },
    })).resolves.toEqual({ isCheckoutIntent: false });

    await expect(service.detect({
      question: "确认",
      pendingCheckout: { status: "found", draft: createDraft() },
    })).resolves.toMatchObject({
      isCheckoutIntent: true,
      action: "confirm_checkout",
      confidence: "high",
    });
  });

  it("parses structured checkout patch for pending draft updates", async () => {
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(JSON.stringify({
            is_checkout_intent: true,
            action: "update_checkout",
            address_text: null,
            checkout_patch: {
              shipping: {
                recipient: "张三",
                phone: "13800000000",
                full_address: "上海市浦东新区测试路 1 号",
              },
              delivery_method_type: "express",
              payment_method_type: "alipay",
            },
            target_scope: "selected_cart_items",
            confidence: "high",
            needs_confirmation: false,
            clarification_question: null,
          }));
        },
      }),
    });

    const result = await service.detect({
      question: "收货人改成张三，电话 13800000000，地址改成上海市浦东新区测试路 1 号，配送选加急，支付用支付宝",
      pendingCheckout: { status: "found", draft: createDraft() },
    });

    expect(llmRequest?.messages[0]?.content).toContain("checkout_patch");
    expect(llmRequest?.messages[1]?.content).toContain("\"deliveryOptions\"");
    expect(llmRequest?.messages[1]?.content).toContain("\"paymentOptions\"");
    expect(result).toMatchObject({
      isCheckoutIntent: true,
      action: "update_checkout",
      checkoutPatch: {
        shipping: {
          recipient: "张三",
          phone: "13800000000",
          fullAddress: "上海市浦东新区测试路 1 号",
        },
        deliveryMethodType: "express",
        paymentMethodType: "alipay",
      },
      confidence: "high",
      needsConfirmation: false,
    });
  });

  it("parses LLM recent recommendation checkout target when ordinal wording is indirect", async () => {
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(JSON.stringify({
            is_checkout_intent: true,
            action: "start_checkout",
            address_text: null,
            checkout_patch: null,
            target_scope: "recent_recommendation",
            target_ordinal: 1,
            confidence: "high",
            needs_confirmation: false,
            clarification_question: null,
          }));
        },
      }),
    });

    const result = await service.detect({
      question: "把刚才推荐里排在最前面的拿去结算",
      recentProductIds: ["product_001", "product_002"],
    });

    expect(llmRequest?.messages[0]?.content).toContain("recent_recommendation");
    expect(llmRequest?.messages[1]?.content).toContain("\"recentRecommendations\"");
    expect(result).toMatchObject({
      isCheckoutIntent: true,
      action: "start_checkout",
      targetScope: "recent_recommendation",
      targetOrdinal: 1,
      confidence: "high",
      needsConfirmation: false,
    });
  });

  it.each([
    "下单第一款商品",
    "就买第一个",
    "把刚才第一款拿去结算",
  ])("uses deterministic recent checkout ordinal without LLM: %s", async (question) => {
    let llmCalled = false;
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse(JSON.stringify({
            is_checkout_intent: false,
          }));
        },
      }),
    });

    const result = await service.detect({
      question,
      recentProductIds: ["product_001", "product_002"],
    });

    expect(llmCalled).toBe(false);
    expect(result).toMatchObject({
      isCheckoutIntent: true,
      action: "start_checkout",
      targetScope: "recent_recommendation",
      targetOrdinal: 1,
      confidence: "high",
      needsConfirmation: false,
    });
  });

  it.each([
    "帮我下单一下",
    "下单这个",
    "直接买这款",
  ])("uses the only recent recommendation as checkout target: %s", async (question) => {
    let llmCalled = false;
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse(JSON.stringify({
            is_checkout_intent: false,
          }));
        },
      }),
    });

    const result = await service.detect({
      question,
      recentProductIds: ["product_001"],
    });

    expect(llmCalled).toBe(false);
    expect(result).toMatchObject({
      isCheckoutIntent: true,
      action: "start_checkout",
      targetScope: "recent_recommendation",
      targetOrdinal: 1,
      confidence: "high",
      needsConfirmation: false,
    });
  });

  it("does not auto-target vague checkout wording when multiple recommendations are visible", async () => {
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          is_checkout_intent: true,
          action: "start_checkout",
          address_text: null,
          checkout_patch: null,
          target_scope: "recent_recommendation",
          target_ordinal: null,
          confidence: "low",
          needs_confirmation: true,
          clarification_question: "你想下单哪一款？",
        })),
      }),
    });

    await expect(service.detect({
      question: "帮我下单一下",
      recentProductIds: ["product_001", "product_002"],
    })).resolves.toMatchObject({
      isCheckoutIntent: true,
      action: "start_checkout",
      targetScope: "recent_recommendation",
      confidence: "low",
      needsConfirmation: true,
      clarificationQuestion: "你想下单哪一款？",
    });
  });

  it("does not auto-target single recommendations for checkout questions", async () => {
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          is_checkout_intent: false,
        })),
      }),
    });

    await expect(service.detect({
      question: "下单流程是什么？",
      recentProductIds: ["product_001"],
    })).resolves.toEqual({ isCheckoutIntent: false });
  });

  it("does not treat quantity purchase wording as a deterministic ordinal checkout", async () => {
    let llmCalled = false;
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse(JSON.stringify({
            is_checkout_intent: false,
          }));
        },
      }),
    });

    await expect(service.detect({
      question: "买一台手机",
      recentProductIds: ["product_001"],
    })).resolves.toEqual({ isCheckoutIntent: false });
    expect(llmCalled).toBe(false);
  });

  it("omits absent shipping fields when parsing partial checkout patches", async () => {
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          is_checkout_intent: true,
          action: "update_checkout",
          address_text: null,
          checkout_patch: {
            shipping: {
              full_address: "上海市浦东新区测试路 1 号",
            },
            delivery_method_type: null,
            payment_method_type: null,
          },
          target_scope: "selected_cart_items",
          confidence: "high",
          needs_confirmation: false,
          clarification_question: null,
        })),
      }),
    });

    const result = await service.detect({
      question: "地址改成上海市浦东新区测试路 1 号",
      pendingCheckout: { status: "found", draft: createDraft() },
    });

    expect(result).toMatchObject({
      isCheckoutIntent: true,
      action: "update_checkout",
      checkoutPatch: {
        shipping: {
          fullAddress: "上海市浦东新区测试路 1 号",
        },
      },
    });

    if (!result.isCheckoutIntent) {
      throw new Error("Expected checkout intent.");
    }

    const shippingPatch = result.checkoutPatch?.shipping ?? {};
    expect(Object.hasOwn(shippingPatch, "recipient")).toBe(false);
    expect(Object.hasOwn(shippingPatch, "phone")).toBe(false);
  });

  it("treats an 11 digit phone follow-up as a checkout shipping update", async () => {
    let llmCalled = false;
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse(JSON.stringify({
            is_checkout_intent: false,
          }));
        },
      }),
    });

    const result = await service.detect({
      question: "13623411345",
      shortHistory: [{
        role: "assistant",
        content: "可以，直接把新的手机号发我，我会更新这张订单草稿。",
      }],
      pendingCheckout: { status: "found", draft: createDraft() },
    });

    expect(llmCalled).toBe(false);
    expect(result).toMatchObject({
      isCheckoutIntent: true,
      action: "update_checkout",
      checkoutPatch: {
        shipping: {
          phone: "13623411345",
        },
      },
      confidence: "high",
      needsConfirmation: false,
    });
  });

  it("treats a standalone 11 digit phone as checkout update when a draft is pending", async () => {
    let llmCalled = false;
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse(JSON.stringify({
            is_checkout_intent: false,
          }));
        },
      }),
    });

    const result = await service.detect({
      question: "13623411345",
      pendingCheckout: { status: "found", draft: createDraft() },
    });

    expect(llmCalled).toBe(false);
    expect(result).toMatchObject({
      isCheckoutIntent: true,
      action: "update_checkout",
      checkoutPatch: {
        shipping: {
          phone: "13623411345",
        },
      },
      confidence: "high",
      needsConfirmation: false,
    });
  });

  it("keeps invalid numeric phone follow-ups inside checkout clarification", async () => {
    let llmCalled = false;
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse(JSON.stringify({
            is_checkout_intent: false,
          }));
        },
      }),
    });

    const result = await service.detect({
      question: "1391231231331",
      shortHistory: [{
        role: "assistant",
        content: "可以，直接把新的手机号发我，我会更新这张订单草稿。",
      }],
      pendingCheckout: { status: "found", draft: createDraft() },
    });

    expect(llmCalled).toBe(false);
    expect(result).toMatchObject({
      isCheckoutIntent: true,
      action: "update_checkout",
      confidence: "high",
      needsConfirmation: true,
      clarificationQuestion: "这个号码不是 11 位手机号，请直接发新的 11 位手机号。",
    });
  });

  it("uses a saved address id when user accepts the saved address prompt", async () => {
    let llmCalled = false;
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse(JSON.stringify({
            is_checkout_intent: false,
          }));
        },
      }),
    });

    const result = await service.detect({
      question: "可以",
      shortHistory: [{
        role: "assistant",
        content: "可以，你还有一个已保存地址「宿舍：UNSW Village 6 栋 302」，要把这张订单草稿改到这个地址吗？",
      }],
      pendingCheckout: { status: "found", draft: createDraft() },
    });

    expect(llmCalled).toBe(false);
    expect(result).toMatchObject({
      isCheckoutIntent: true,
      action: "update_checkout",
      checkoutPatch: {
        shipping: {
          savedAddressId: "saved-address-campus",
        },
      },
      confidence: "high",
      needsConfirmation: false,
    });
  });

  it("does not call LLM for ordinary recommendation requests", async () => {
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        handler: () => {
          throw new Error("checkout intent should not run");
        },
      }),
    });

    await expect(service.detect({
      question: "推荐一款适合通勤的蓝牙耳机",
    })).resolves.toEqual({ isCheckoutIntent: false });
  });

  it("does not treat invalid LLM output as checkout intent", async () => {
    const service = new CheckoutIntentService({
      llmClient: new MockLlmClient({
        response: createLlmResponse("{ nope"),
      }),
    });

    await expect(service.detect({
      question: "确认下单",
    })).resolves.toEqual({ isCheckoutIntent: false });
  });
});

function createDraft(): PendingCheckoutDraft {
  return {
    id: "draft_1",
    conversationId: "checkout-demo-1",
    userKey: "demo-user",
    source: "cart",
    status: "pending",
    address: {
      id: "saved-address-default",
      label: "默认地址",
      recipient: "ShopMate 用户",
      phoneMasked: "138****0000",
      fullAddress: "ShopMate 收货点",
      region: "ShopMate 演示配送区",
      tag: "默认",
      isDefault: true,
    },
    savedAddresses: [{
      id: "saved-address-default",
      label: "默认地址",
      recipient: "ShopMate 用户",
      phoneMasked: "138****0000",
      fullAddress: "ShopMate 收货点",
      region: "ShopMate 演示配送区",
      tag: "默认",
      isDefault: true,
    }, {
      id: "saved-address-campus",
      label: "学校宿舍",
      recipient: "ShopMate 用户",
      phoneMasked: "138****0000",
      fullAddress: "UNSW Village 6 栋 302",
      region: "ShopMate 演示配送区",
      tag: "宿舍",
      isDefault: false,
    }],
    items: [],
    summary: {
      itemCount: 0,
      selectedCount: 0,
      subtotalCents: 0,
      shippingFeeCents: 0,
      totalCents: 0,
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
    }, {
      type: "express",
      label: "加急配送",
      feeCents: 1200,
      etaText: "预计明天送达",
    }],
    paymentOptions: [{
      type: "wechat",
      label: "微信支付",
    }, {
      type: "alipay",
      label: "支付宝",
    }],
    expiresAt: "2026-06-06T00:15:00.000Z",
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
