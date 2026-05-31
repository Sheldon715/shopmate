import { describe, expect, it } from "vitest";
import { CartProductUnavailableError } from "../cart/cart.service";
import type { CartDto } from "../cart/cart.types";
import { LlmError } from "../llm/llm.error";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateRequest, LlmGenerateResponse } from "../llm/llm.types";
import type { Product } from "../products/product.types";
import type { VectorSearchHit } from "../vector/vector-search.types";
import { ChatContextMemoryStore } from "./chat-context-memory.store";
import { ChatContextMemoryService } from "./chat-context-memory.service";
import type {
  RagCartWriter,
  RagChatServiceOptions,
  RagProductReader,
  RagVectorSearchClient,
} from "./rag.service";
import { RagChatService } from "./rag.service";

describe("RagChatService", () => {
  it("runs vector search, PostgreSQL lookup, LLM JSON parsing, and product card mapping", async () => {
    const products = [
      createProduct({ id: "product_001", name: "PostgreSQL Product 1" }),
      createProduct({
        id: "product_002",
        name: "PostgreSQL Product 2",
        basePriceCents: 3200,
      }),
    ];
    const productReaderCalls: string[][] = [];
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([
        createHit("product_001", { score: 0.91, snippet: "first snippet" }),
        createHit("product_001", { score: 0.72, snippet: "second snippet" }),
        createHit("product_002", { score: 0.82, snippet: "third snippet" }),
      ]),
      productReader: {
        findActiveByIds: async (productIds) => {
          productReaderCalls.push(productIds);
          return products;
        },
      },
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(
            JSON.stringify({
              answer: "Product 2 is the best match.",
              recommended_product_ids: ["product_002"],
            }),
          );
        },
      }),
      now: () => new Date("2026-05-27T00:00:00.000Z"),
    }));

    const result = await service.answer({
      question: " recommend headphones ",
      shortHistory: [{ role: "user", content: "I like light products." }],
    });

    expect(productReaderCalls).toEqual([["product_001", "product_002"]]);
    expect(llmRequest?.responseFormat).toBeUndefined();
    expect(llmRequest?.maxCompletionTokens).toBe(2000);
    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("first snippet");
    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("second snippet");
    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("只输出 JSON object");
    expect(result).toMatchObject({
      answer: "Product 2 is the best match.",
      recommendedProductIds: ["product_002"],
      fallbackUsed: false,
      retrieval: {
        candidateCount: 2,
        returnedProductIds: ["product_002"],
      },
    });
    expect(result.productCards).toHaveLength(1);
    expect(result.productCards[0]).toMatchObject({
      id: "product_002",
      name: "PostgreSQL Product 2",
      priceCents: 3200,
    });
  });

  it("drops LLM product ids outside the retrieved allowlist", async () => {
    const service = createServiceWithProducts({
      llmText: JSON.stringify({
        answer: "Use product 1.",
        recommended_product_ids: ["product_999", "product_001"],
      }),
    });

    const result = await service.answer({ question: "recommend one" });

    expect(result.fallbackUsed).toBe(false);
    expect(result.recommendedProductIds).toEqual(["product_001"]);
    expect(result.productCards.map((card) => card.id)).toEqual(["product_001"]);
  });

  it("falls back to retrieval order when all LLM product ids are invalid", async () => {
    const service = createServiceWithProducts({
      llmText: JSON.stringify({
        answer: "Use another product.",
        recommended_product_ids: ["product_999"],
      }),
    });

    const result = await service.answer({ question: "recommend one" });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("NO_VALID_PRODUCT_IDS");
    expect(result.recommendedProductIds).toEqual([
      "product_001",
      "product_002",
    ]);
  });

  it("falls back to the first retrieved products when the LLM fails", async () => {
    const service = createServiceWithProducts({
      llmClient: new MockLlmClient({
        error: new LlmError("provider down", {
          code: "LLM_REQUEST_FAILED",
        }),
      }),
    });

    const result = await service.answer({
      question: "recommend one",
      maxRecommendedProducts: 1,
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("LLM_ERROR");
    expect(result.recommendedProductIds).toEqual(["product_001"]);
    expect(result.productCards).toHaveLength(1);
  });

  it("does not call product lookup or LLM when vector search has no candidates", async () => {
    let productLookupCalled = false;
    let llmCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: {
        findActiveByIds: async () => {
          productLookupCalled = true;
          return [];
        },
      },
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse("{}");
        },
      }),
    }));

    const result = await service.answer({ question: "unknown request" });

    expect(productLookupCalled).toBe(false);
    expect(llmCalled).toBe(false);
    expect(result).toMatchObject({
      recommendedProductIds: [],
      productCards: [],
      fallbackUsed: true,
      fallbackReason: "NO_CANDIDATES",
    });
  });

  it("returns clarification for a broad product request before vector search or LLM", async () => {
    let vectorSearchCalled = false;
    let productLookupCalled = false;
    let llmCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [];
        },
      },
      productReader: {
        findActiveByIds: async () => {
          productLookupCalled = true;
          return [];
        },
      },
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse("{}");
        },
      }),
      contextMemoryService: new ChatContextMemoryService({
        store: new ChatContextMemoryStore(),
      }),
    }));

    const result = await service.answer({
      conversationId: "clarify-demo-1",
      question: "推荐一款手机",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(productLookupCalled).toBe(false);
    expect(llmCalled).toBe(false);
    expect(result).toMatchObject({
      answer: "你更看重拍照、续航、预算还是性价比？告诉我一两个重点，我再帮你筛。",
      recommendedProductIds: [],
      productCards: [],
      fallbackUsed: true,
      fallbackReason: "NEEDS_CLARIFICATION",
      clarification: {
        missingSlots: ["budget", "priority"],
      },
      retrieval: {
        candidateCount: 0,
        returnedProductIds: [],
      },
      contextMemory: {
        conversationId: "clarify-demo-1",
        lastIntent: "推荐一款手机",
        pendingClarification: {
          originalQuestion: "推荐一款手机",
          missingSlots: ["budget", "priority"],
        },
      },
    });
  });

  it("uses the original intent after the user answers a clarification question", async () => {
    const vectorCalls: Array<Parameters<RagVectorSearchClient["search"]>[0]> = [];
    const contextMemoryService = new ChatContextMemoryService({
      store: new ChatContextMemoryStore(),
    });
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async (input) => {
          vectorCalls.push(input);
          return [createHit("product_001")];
        },
      },
      productReader: createProductReader(),
      contextMemoryService,
      llmClient: new MockLlmClient({
        response: createLlmResponse(
          JSON.stringify({
            answer: "Use product 1.",
            recommended_product_ids: ["product_001"],
          }),
        ),
      }),
    }));

    await service.answer({
      conversationId: "clarify-demo-1",
      question: "推荐一款手机",
    });
    const result = await service.answer({
      conversationId: "clarify-demo-1",
      question: "预算 3000 左右，拍照好一点",
    });

    expect(vectorCalls).toHaveLength(1);
    expect(vectorCalls[0]).toMatchObject({
      query: expect.stringContaining("推荐一款手机") as unknown as string,
      filters: {
        category: "数码电子",
        subCategory: "智能手机",
        maxPriceCents: 330000,
      },
    });
    expect(vectorCalls[0]?.query).toContain("拍照");
    expect(result.fallbackUsed).toBe(false);
    expect(result.contextMemory?.pendingClarification).toBeUndefined();
  });

  it("skips stale vector hits missing from active PostgreSQL products", async () => {
    let llmCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([createHit("stale_product")]),
      productReader: {
        findActiveByIds: async () => [],
      },
      llmClient: new MockLlmClient({
        handler: () => {
          llmCalled = true;
          return createLlmResponse("{}");
        },
      }),
    }));

    const result = await service.answer({ question: "recommend one" });

    expect(llmCalled).toBe(false);
    expect(result.fallbackReason).toBe("NO_CANDIDATES");
    expect(result.retrieval.candidateCount).toBe(0);
  });

  it("passes filters, topK, abortSignal, and requestId to downstream dependencies", async () => {
    const abortController = new AbortController();
    const vectorCalls: Array<Parameters<RagVectorSearchClient["search"]>[0]> = [];
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async (input) => {
          vectorCalls.push(input);
          return [createHit("product_001")];
        },
      },
      productReader: createProductReader(),
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;
          return createLlmResponse(
            JSON.stringify({
              answer: "Use product 1.",
              recommended_product_ids: ["product_001"],
            }),
          );
        },
      }),
    }));

    await service.answer({
      question: "recommend one",
      filters: { category: "Skin Care", maxPriceCents: 5000 },
      topK: 7,
      requestId: "request_123",
      abortSignal: abortController.signal,
    });

    expect(vectorCalls).toEqual([
      {
        query: "recommend one",
        filters: { category: "Skin Care", maxPriceCents: 5000 },
        topK: 7,
        abortSignal: abortController.signal,
      },
    ]);
    expect(llmRequest?.requestId).toBe("request_123");
    expect(llmRequest?.abortSignal).toBe(abortController.signal);
  });

  it("uses conversation memory for follow-up retrieval, prompt context, and done summary", async () => {
    const vectorCalls: Array<Parameters<RagVectorSearchClient["search"]>[0]> = [];
    const llmRequests: LlmGenerateRequest[] = [];
    const now = () => new Date("2026-05-30T00:00:00.000Z");
    const contextMemoryService = new ChatContextMemoryService({
      store: new ChatContextMemoryStore({ now }),
      now,
    });
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async (input) => {
          vectorCalls.push(input);
          return [createHit("product_001")];
        },
      },
      productReader: createProductReader(),
      contextMemoryService,
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequests.push(request);
          return createLlmResponse(
            JSON.stringify({
              answer: "Use product 1.",
              recommended_product_ids: ["product_001"],
            }),
          );
        },
      }),
    }));

    await service.answer({
      conversationId: "local-chat-session-1",
      question: "帮我推荐日常跑步用的跑鞋",
    });
    const result = await service.answer({
      conversationId: "local-chat-session-1",
      question: "要轻量的，预算 500 以内",
    });

    expect(vectorCalls[1]).toMatchObject({
      query: expect.stringContaining("帮我推荐日常跑步用的跑鞋") as unknown as string,
      filters: {
        category: "服饰运动",
        subCategory: "跑步鞋",
        maxPriceCents: 50000,
      },
    });
    expect(vectorCalls[1]?.query).toContain("轻量");
    expect(llmRequests[1]?.messages.map((message) => message.content).join("\n"))
      .toContain("当前会话记忆");
    expect(result.contextMemory).toMatchObject({
      conversationId: "local-chat-session-1",
      lastIntent: "帮我推荐日常跑步用的跑鞋",
      constraints: {
        category: "服饰运动",
        subCategory: "跑步鞋",
        maxPriceCents: 50000,
        preferenceTerms: ["轻量"],
      },
      lastRecommendedProductIds: ["product_001"],
    });
  });

  it("adds the second recent recommendation to cart after LLM intent without vector search or RAG generation", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
    ]);
    let vectorSearchCalled = false;
    const llmRequests: LlmGenerateRequest[] = [];
    const cartAdds: Array<{ productId: string; quantity: number }> = [];
    const service = new RagChatService({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [];
        },
      },
      productReader: createProductReader(),
      cartWriter: {
        addItem: async (input) => {
          cartAdds.push(input);
          return createCartDto();
        },
      },
      contextMemoryService: new ChatContextMemoryService({ store }),
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequests.push(request);
          return createCartIntentResponse({
            target: { kind: "ordinal", index: 2 },
          });
        },
      }),
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "把第二个加进去",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(llmRequests).toHaveLength(1);
    expect(llmRequests[0]?.messages.map((message) => message.content).join("\n"))
      .toContain("购物车操作意图分类器");
    expect(cartAdds).toEqual([{ productId: "product_002", quantity: 1 }]);
    expect(result).toMatchObject({
      answer: "已把这款商品加入购物车，你可以点右上角购物车查看。",
      recommendedProductIds: ["product_001", "product_002"],
      fallbackUsed: false,
      cartAction: {
        type: "add",
        status: "success",
        productId: "product_002",
        productName: "Product 2",
        quantity: 1,
      },
    });
  });

  it("adds deictic cart command when there is exactly one recent recommendation", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    const cartAdds: Array<{ productId: string; quantity: number }> = [];
    const service = createCartCommandService({
      store,
      cartWriter: {
        addItem: async (input) => {
          cartAdds.push(input);
          return createCartDto();
        },
      },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "把这个加到购物车",
    });

    expect(cartAdds).toEqual([{ productId: "product_001", quantity: 1 }]);
    expect(result.cartAction).toMatchObject({
      status: "success",
      productId: "product_001",
    });
  });

  it("asks for a target when LLM confirms cart add but the target is still unknown", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    let cartCalled = false;
    const service = createCartCommandService({
      store,
      cartWriter: {
        addItem: async () => {
          cartCalled = true;
          return createCartDto();
        },
      },
      intentTarget: { kind: "unknown" },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "加入购物车",
    });

    expect(cartCalled).toBe(false);
    expect(result).toMatchObject({
      fallbackUsed: true,
      fallbackReason: "CART_TARGET_AMBIGUOUS",
      cartAction: {
        type: "add",
        status: "needs_target",
      },
    });
  });

  it("adds ordinal also follow-up from recent recommendations after LLM intent without RAG", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
      "product_003",
    ]);
    let vectorSearchCalled = false;
    const llmRequests: LlmGenerateRequest[] = [];
    const cartAdds: Array<{ productId: string; quantity: number }> = [];
    const service = new RagChatService({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [];
        },
      },
      productReader: createProductReader(),
      cartWriter: {
        addItem: async (input) => {
          cartAdds.push(input);
          return createCartDto();
        },
      },
      contextMemoryService: new ChatContextMemoryService({ store }),
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequests.push(request);
          return createCartIntentResponse({
            target: { kind: "ordinal", index: 1 },
          });
        },
      }),
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "第一个也是",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(llmRequests).toHaveLength(1);
    expect(cartAdds).toEqual([{ productId: "product_001", quantity: 1 }]);
    expect(result.cartAction).toMatchObject({
      type: "add",
      status: "success",
      productId: "product_001",
    });
  });

  it("resolves cart ordinals by recent recommendation order when products are returned out of order", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
      "product_003",
    ]);
    const cartAdds: Array<{ productId: string; quantity: number }> = [];
    const service = createCartCommandService({
      store,
      productReader: {
        findActiveByIds: async () => [
          createProduct({ id: "product_003", name: "Product 3" }),
          createProduct({ id: "product_001", name: "Product 1" }),
          createProduct({ id: "product_002", name: "Product 2" }),
        ],
      },
      cartWriter: {
        addItem: async (input) => {
          cartAdds.push(input);
          return createCartDto();
        },
      },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "第一个也是",
    });

    expect(cartAdds).toEqual([{ productId: "product_001", quantity: 1 }]);
    expect(result.productCards.map((card) => card.id)).toEqual([
      "product_001",
      "product_002",
      "product_003",
    ]);
    expect(result.cartAction).toMatchObject({
      status: "success",
      productId: "product_001",
    });
  });

  it("asks for target when deictic cart command has multiple recent recommendations", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
    ]);
    let cartCalled = false;
    const service = createCartCommandService({
      store,
      cartWriter: {
        addItem: async () => {
          cartCalled = true;
          return createCartDto();
        },
      },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "把这个加到购物车",
    });

    expect(cartCalled).toBe(false);
    expect(result).toMatchObject({
      fallbackUsed: true,
      fallbackReason: "CART_TARGET_AMBIGUOUS",
      productCards: [
        { id: "product_001" },
        { id: "product_002" },
      ],
      cartAction: {
        type: "add",
        status: "needs_target",
      },
    });
  });

  it("returns missing target when there are no recent recommendations", async () => {
    const store = createStoreWithRecentRecommendations([]);
    let cartCalled = false;
    const service = createCartCommandService({
      store,
      cartWriter: {
        addItem: async () => {
          cartCalled = true;
          return createCartDto();
        },
      },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "把这个加购物车",
    });

    expect(cartCalled).toBe(false);
    expect(result).toMatchObject({
      fallbackUsed: true,
      fallbackReason: "CART_TARGET_MISSING",
      productCards: [],
      cartAction: {
        status: "needs_target",
      },
    });
  });

  it("does not call cart when ordinal target is outside recent recommendation range", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    let cartCalled = false;
    const service = createCartCommandService({
      store,
      cartWriter: {
        addItem: async () => {
          cartCalled = true;
          return createCartDto();
        },
      },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "把第二个加进去",
    });

    expect(cartCalled).toBe(false);
    expect(result).toMatchObject({
      fallbackUsed: true,
      fallbackReason: "CART_TARGET_MISSING",
      cartAction: {
        status: "not_found",
      },
    });
  });

  it("returns unavailable cart action when cart service rejects unavailable product", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    const service = createCartCommandService({
      store,
      cartWriter: {
        addItem: async () => {
          throw new CartProductUnavailableError("product_001");
        },
      },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "把这个加到购物车",
    });

    expect(result).toMatchObject({
      fallbackUsed: true,
      fallbackReason: "CART_ADD_FAILED",
      cartAction: {
        status: "unavailable",
        productId: "product_001",
      },
    });
  });

  it("does not treat ordinary recommendation text containing add as a cart command", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    let cartCalled = false;
    let vectorSearchCalled = false;
    const llmRequests: LlmGenerateRequest[] = [];
    const service = new RagChatService({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [createHit("product_002")];
        },
      },
      productReader: createProductReader(),
      cartWriter: {
        addItem: async () => {
          cartCalled = true;
          return createCartDto();
        },
      },
      contextMemoryService: new ChatContextMemoryService({ store }),
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequests.push(request);
          return llmRequests.length === 1
            ? createCartIntentResponse({ isCartAdd: false })
            : createLlmResponse(
                JSON.stringify({
                  answer: "Use product 2.",
                  recommended_product_ids: ["product_002"],
                }),
              );
        },
      }),
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "推荐加湿器",
    });

    expect(cartCalled).toBe(false);
    expect(vectorSearchCalled).toBe(true);
    expect(llmRequests).toHaveLength(2);
    expect(result.cartAction).toBeUndefined();
    expect(result.recommendedProductIds).toEqual(["product_002"]);
  });

  it("uses invalid-output fallback for malformed LLM JSON", async () => {
    const service = createServiceWithProducts({ llmText: "{ nope" });

    const result = await service.answer({ question: "recommend one" });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("LLM_INVALID_OUTPUT");
    expect(result.recommendedProductIds).toEqual([
      "product_001",
      "product_002",
    ]);
  });
});

function createServiceWithProducts(input: {
  llmText?: string;
  llmClient?: MockLlmClient;
}): RagChatService {
  return new RagChatService(withNoCartIntent({
    vectorSearch: createVectorSearch([
      createHit("product_001", { score: 0.91 }),
      createHit("product_002", { score: 0.82 }),
    ]),
    productReader: createProductReader(),
    llmClient: input.llmClient ?? new MockLlmClient({
      response: createLlmResponse(
        input.llmText
          ?? JSON.stringify({
            answer: "Use product 1.",
            recommended_product_ids: ["product_001"],
          }),
      ),
    }),
  }));
}

function withNoCartIntent(
  options: RagChatServiceOptions,
): RagChatServiceOptions {
  return {
    ...options,
    cartCommandIntentService: {
      detect: async () => ({ isCartCommand: false }),
    },
  };
}

function createCartCommandService(input: {
  store: ChatContextMemoryStore;
  cartWriter: RagCartWriter;
  productReader?: RagProductReader;
  intentTarget?:
    | { kind: "ordinal"; index: number }
    | { kind: "deictic" }
    | { kind: "name"; text: string }
    | { kind: "unknown" };
}): RagChatService {
  return new RagChatService({
    vectorSearch: createVectorSearch([]),
    productReader: input.productReader ?? createProductReader(),
    cartWriter: input.cartWriter,
    contextMemoryService: new ChatContextMemoryService({ store: input.store }),
    llmClient: new MockLlmClient({
      response: createCartIntentResponse({
        target: input.intentTarget ?? { kind: "unknown" },
      }),
    }),
  });
}

function createStoreWithRecentRecommendations(
  productIds: string[],
): ChatContextMemoryStore {
  const now = () => new Date("2026-05-30T00:00:00.000Z");
  const store = new ChatContextMemoryStore({ now });

  store.set({
    conversationId: "cart-demo-1",
    lastIntent: "推荐通勤耳机",
    constraints: {
      category: "数码电子",
      subCategory: "真无线耳机",
      preferenceTerms: [],
      avoidTerms: [],
    },
    lastRecommendedProductIds: productIds,
    updatedAt: now().toISOString(),
    turnCount: 1,
  });

  return store;
}

function createCartDto(): CartDto {
  return {
    items: [],
    summary: {
      totalCount: 0,
      selectedCount: 0,
      selectedTotalCents: 0,
      currency: "CNY",
    },
  };
}

function createVectorSearch(hits: VectorSearchHit[]): RagVectorSearchClient {
  return {
    search: async () => hits,
  };
}

function createProductReader(): RagProductReader {
  const products = [
    createProduct({ id: "product_001", name: "Product 1" }),
    createProduct({ id: "product_002", name: "Product 2" }),
    createProduct({ id: "product_003", name: "Product 3" }),
  ];

  return {
    findActiveByIds: async (productIds) =>
      productIds.flatMap((productId) => {
        const product = products.find((item) => item.id === productId);

        return product ? [product] : [];
      }),
  };
}

function createCartIntentResponse(input: {
  isCartAdd?: boolean;
  target?: Record<string, unknown>;
  quantity?: number;
} = {}): LlmGenerateResponse {
  return createLlmResponse(
    JSON.stringify({
      is_cart_add: input.isCartAdd ?? true,
      target: input.target ?? { kind: "unknown" },
      quantity: input.quantity ?? 1,
    }),
  );
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

function createHit(
  productId: string,
  overrides: Partial<VectorSearchHit> = {},
): VectorSearchHit {
  return {
    docId: `${productId}::description`,
    productId,
    score: 0.9,
    snippet: `${productId} snippet`,
    metadata: {
      docType: "description",
      category: "Skin Care",
      subCategory: "Sunscreen",
      brand: "Demo Brand",
      tags: ["SPF"],
      recommendWhen: ["commuting"],
      avoidWhen: ["fragrance sensitive"],
      blockType: null,
      priceMinCents: 1999,
      priceMaxCents: 2599,
      available: true,
      embeddingModel: "fake",
      embeddingDimensions: 4,
      ingestBatchId: "batch_001",
    },
    ...overrides,
  };
}

function createProduct(overrides: Partial<Product> = {}): Product {
  const id = overrides.id ?? "product_001";

  return {
    id,
    status: "active",
    name: "Demo Product",
    brand: "Demo Brand",
    category: "Skin Care",
    subCategory: "Sunscreen",
    imagePath: `/images/${id}.png`,
    imageCaption: "Product image",
    currency: "CNY",
    basePriceCents: 2199,
    priceMinCents: 1999,
    priceMaxCents: 2599,
    marketingDescription: "A lightweight product for daily use.",
    knowledgeText: "Knowledge text.",
    ratingAvg: 4.5,
    categoryPath: ["Skin Care", "Sunscreen"],
    visualTags: ["SPF"],
    attributes: { skin_type: ["oily"] },
    pros: ["lightweight"],
    cons: ["small bottle"],
    recommendWhen: ["commuting"],
    avoidWhen: ["fragrance sensitive"],
    compareWith: [],
    reviewSummary: {},
    contentBlocks: [],
    officialFaq: [],
    userReviews: [],
    normalizedPayload: {},
    sourceDataset: "demo",
    sourceVersion: "v1",
    sourceType: "synthetic_desensitized",
    dataVersion: "v1",
    isDesensitized: true,
    ingestBatchId: "batch_001",
    sourcePath: "data/raw/demo.json",
    skus: [
      {
        id: `${id}_sku_001`,
        productId: id,
        properties: { size: "standard" },
        priceCents: overrides.basePriceCents ?? 2199,
        currency: "CNY",
        available: true,
        stockLevel: "in_stock",
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}
