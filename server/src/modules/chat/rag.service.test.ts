import { describe, expect, it } from "vitest";
import { CartProductUnavailableError } from "../cart/cart.service";
import type { CartDto, CartItemDto } from "../cart/cart.types";
import { LlmError } from "../llm/llm.error";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateRequest, LlmGenerateResponse } from "../llm/llm.types";
import type { Product } from "../products/product.types";
import type { VectorSearchHit } from "../vector/vector-search.types";
import { ChatContextMemoryStore } from "./chat-context-memory.store";
import { ChatContextMemoryService } from "./chat-context-memory.service";
import {
  PopularQueryCacheService,
  type PopularQueryCache,
  type PopularQueryCacheHit,
  type PopularQueryCacheReadInput,
  type PopularQueryCacheWriteInput,
} from "./popular-query-cache.service";
import { NO_NEGATIVE_CONSTRAINTS } from "./negative-constraint.types";
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
    expect(result.answer).toBe("这次没有生成可靠的商品选择。");
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
    expect(result.answer).toBe("这次没有生成可靠推荐说明。");
    expect(result.recommendedProductIds).toEqual(["product_001"]);
    expect(result.productCards).toHaveLength(1);
  });

  it("uses no-candidates response generation when vector search has no candidates", async () => {
    let productLookupCalled = false;
    const llmRequests: LlmGenerateRequest[] = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: {
        findActiveByIds: async () => {
          productLookupCalled = true;
          return [];
        },
      },
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequests.push(request);
          return createLlmResponse(
            "这个预算下我在库里还没找到合适的蓝牙耳机。你可以放宽预算，或告诉我更看重续航、降噪还是轻便，我再继续筛。",
          );
        },
      }),
    }));

    const result = await service.answer({ question: "unknown request" });

    expect(productLookupCalled).toBe(false);
    expect(llmRequests).toHaveLength(1);
    expect(llmRequests[0]?.messages.map((message) => message.content).join("\n"))
      .toContain("无结果回复生成器");
    expect(result).toMatchObject({
      answer: "这个预算下我在库里还没找到合适的蓝牙耳机。你可以放宽预算，或告诉我更看重续航、降噪还是轻便，我再继续筛。",
      recommendedProductIds: [],
      productCards: [],
      fallbackUsed: true,
      fallbackReason: "NO_CANDIDATES",
    });
  });

  it("uses a minimal no-candidates answer when response generation fails", async () => {
    let cacheWriteCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
      popularQueryCache: createFakeCache({
        onSet: () => {
          cacheWriteCalled = true;
        },
      }),
      llmClient: new MockLlmClient({
        error: new LlmError("provider down", {
          code: "LLM_REQUEST_FAILED",
        }),
      }),
    }));

    const result = await service.answer({ question: "unknown request" });

    expect(result).toMatchObject({
      answer: "当前商品库没有找到匹配结果。",
      recommendedProductIds: [],
      productCards: [],
      fallbackUsed: true,
      fallbackReason: "NO_CANDIDATES",
    });
    expect(cacheWriteCalled).toBe(false);
  });

  it("returns clarification for a broad product request after LLM intent before vector search", async () => {
    let vectorSearchCalled = false;
    let productLookupCalled = false;
    const llmRequests: LlmGenerateRequest[] = [];
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
        handler: (request) => {
          llmRequests.push(request);
          return createClarificationIntentResponse({
            needsClarification: true,
            question: "拍照、续航和预算里你最看重哪一项？",
            missingSlots: ["budget", "priority"],
          });
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
    expect(llmRequests).toHaveLength(1);
    expect(llmRequests[0]?.messages.map((message) => message.content).join("\n"))
      .toContain("主动澄清意图判断器");
    expect(result).toMatchObject({
      answer: "拍照、续航和预算里你最看重哪一项？",
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

  it("continues RAG when LLM rejects a broad clarification candidate", async () => {
    let vectorSearchCalled = false;
    const llmRequests: LlmGenerateRequest[] = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [createHit("product_001")];
        },
      },
      productReader: createProductReader(),
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequests.push(request);
          return llmRequests.length === 1
            ? createClarificationIntentResponse({
                needsClarification: false,
                question: "",
                missingSlots: [],
              })
            : createLlmResponse(
                JSON.stringify({
                  answer: "Use product 1.",
                  recommended_product_ids: ["product_001"],
                }),
              );
        },
      }),
    }));

    const result = await service.answer({
      conversationId: "clarify-demo-1",
      question: "推荐一款手机",
    });

    expect(vectorSearchCalled).toBe(true);
    expect(llmRequests).toHaveLength(2);
    expect(llmRequests[0]?.messages.map((message) => message.content).join("\n"))
      .toContain("主动澄清意图判断器");
    expect(result).toMatchObject({
      fallbackUsed: false,
      recommendedProductIds: ["product_001"],
    });
    expect(result.fallbackReason).toBeUndefined();
    expect(result.contextMemory?.pendingClarification).toBeUndefined();
  });

  it("returns clarification for terse broad category text after LLM intent", async () => {
    let vectorSearchCalled = false;
    const llmRequests: LlmGenerateRequest[] = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [createHit("product_001")];
        },
      },
      productReader: createProductReader(),
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequests.push(request);
          return createClarificationIntentResponse({
            needsClarification: true,
            question: "你要跑步、通勤还是日常穿？预算大概多少？",
            missingSlots: ["use_case", "priority", "budget"],
          });
        },
      }),
      contextMemoryService: new ChatContextMemoryService({
        store: new ChatContextMemoryStore(),
      }),
    }));

    const result = await service.answer({
      conversationId: "clarify-demo-2",
      question: "鞋",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(llmRequests).toHaveLength(1);
    expect(llmRequests[0]?.messages.map((message) => message.content).join("\n"))
      .toContain('"message":"鞋"');
    expect(result).toMatchObject({
      answer: "你要跑步、通勤还是日常穿？预算大概多少？",
      recommendedProductIds: [],
      fallbackUsed: true,
      fallbackReason: "NEEDS_CLARIFICATION",
      clarification: {
        missingSlots: ["use_case", "priority", "budget"],
      },
      retrieval: {
        candidateCount: 0,
        returnedProductIds: [],
      },
      contextMemory: {
        conversationId: "clarify-demo-2",
        lastIntent: "鞋",
        pendingClarification: {
          originalQuestion: "鞋",
          missingSlots: ["use_case", "priority", "budget"],
        },
      },
    });
  });

  it("uses the original intent after the user answers a clarification question", async () => {
    const vectorCalls: Array<Parameters<RagVectorSearchClient["search"]>[0]> = [];
    const llmRequests: LlmGenerateRequest[] = [];
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
        handler: (request) => {
          llmRequests.push(request);
          return llmRequests.length === 1
            ? createClarificationIntentResponse({
                needsClarification: true,
                question: "拍照、续航和预算里你最看重哪一项？",
                missingSlots: ["budget", "priority"],
              })
            : createLlmResponse(
                JSON.stringify({
                  answer: "Use product 1.",
                  recommended_product_ids: ["product_001"],
                }),
              );
        },
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

  it("passes remembered negative constraints into vector filters", async () => {
    const vectorCalls: Array<Parameters<RagVectorSearchClient["search"]>[0]> = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async (input) => {
          vectorCalls.push(input);
          return [createHit("product_001")];
        },
      },
      productReader: createProductReader(),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      negativeConstraintIntentService: {
        detect: async () => ({
          hasNegativeConstraints: true,
          confidence: "high",
          constraints: [createNegativeConstraint("酒精")],
          needsClarification: false,
        }),
      },
      contextMemoryService: new ChatContextMemoryService({
        store: new ChatContextMemoryStore(),
      }),
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          answer: "Use product 1.",
          recommended_product_ids: ["product_001"],
        })),
      }),
    }));

    await service.answer({
      conversationId: "negative-constraint-demo",
      question: "推荐防晒霜，不要酒精",
    });

    expect(vectorCalls).toHaveLength(1);
    expect(vectorCalls[0]?.filters).toMatchObject({
      category: "美妆护肤",
      subCategory: "防晒",
      avoidTerms: ["酒精"],
    });
  });

  it("does not derive current-turn negative filters from regex when LLM finds no constraint", async () => {
    const vectorCalls: Array<Parameters<RagVectorSearchClient["search"]>[0]> = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async (input) => {
          vectorCalls.push(input);
          return [createHit("product_001")];
        },
      },
      productReader: createProductReader(),
      negativeConstraintIntentService: {
        detect: async () => NO_NEGATIVE_CONSTRAINTS,
      },
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          answer: "Use product 1.",
          recommended_product_ids: ["product_001"],
        })),
      }),
    }));

    await service.answer({
      conversationId: "negative-regex-demo",
      question: "推荐防晒霜，不要酒精",
    });

    expect(vectorCalls[0]?.filters).toMatchObject({
      category: "美妆护肤",
      subCategory: "防晒",
    });
    expect(vectorCalls[0]?.filters?.avoidTerms).toBeUndefined();
  });

  it("filters conflicting products and drops excluded LLM ids from final cards", async () => {
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([
        createHit("product_001"),
        createHit("product_002"),
      ]),
      productReader: {
        findActiveByIds: async () => [
          createProduct({
            id: "product_001",
            name: "Alcohol Risk Sunscreen",
            avoidWhen: ["酒精敏感人群"],
            marketingDescription: "部分敏感肌可能对酒精敏感。",
          }),
          createProduct({
            id: "product_002",
            name: "Alcohol Free Sunscreen",
            marketingDescription: "这款隔离露不含酒精，适合日常通勤。",
          }),
        ],
      },
      negativeConstraintIntentService: {
        detect: async () => ({
          hasNegativeConstraints: true,
          confidence: "high",
          constraints: [createNegativeConstraint("酒精")],
          needsClarification: false,
        }),
      },
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;

          return createLlmResponse(JSON.stringify({
            answer: "Use alcohol-free product 2.",
            recommended_product_ids: ["product_001", "product_002"],
          }));
        },
      }),
    }));

    const result = await service.answer({
      conversationId: "negative-filter-demo",
      question: "推荐防晒霜，但不要含酒精的",
    });

    expect(llmRequest?.messages.map((message) => message.content).join("\n"))
      .toContain("当前排除约束");
    expect(result.fallbackUsed).toBe(false);
    expect(result.recommendedProductIds).toEqual(["product_002"]);
    expect(result.productCards.map((card) => card.id)).toEqual(["product_002"]);
  });

  it("returns LLM-generated negative clarification before vector search", async () => {
    let vectorSearchCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [createHit("product_001")];
        },
      },
      productReader: createProductReader(),
      negativeConstraintIntentService: {
        detect: async () => ({
          hasNegativeConstraints: true,
          confidence: "high",
          constraints: [
            {
              rawText: "不要那个",
              term: "那个",
              kind: "unknown",
              scope: "unknown",
              matchPolicy: "needs_clarification",
            },
          ],
          needsClarification: true,
          clarificationQuestion: "你想排除哪个品牌或哪类商品？",
        }),
      },
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          answer: "Use product 1.",
          recommended_product_ids: ["product_001"],
        })),
      }),
    }));

    const result = await service.answer({
      conversationId: "negative-clarification-demo",
      question: "推荐防晒霜，不要那个",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(result).toMatchObject({
      answer: "你想排除哪个品牌或哪类商品？",
      recommendedProductIds: [],
      productCards: [],
      fallbackUsed: true,
      fallbackReason: "NEEDS_CLARIFICATION",
    });
  });

  it("rethrows aborted no-candidates generation without writing cache or memory", async () => {
    const abortController = new AbortController();
    const store = new ChatContextMemoryStore();
    let cacheWriteCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      contextMemoryService: new ChatContextMemoryService({ store }),
      popularQueryCacheVersionReader: createCacheVersionReader(),
      popularQueryCache: createFakeCache({
        onSet: () => {
          cacheWriteCalled = true;
        },
      }),
      llmClient: new MockLlmClient({
        handler: () => {
          abortController.abort();
          throw new LlmError("request aborted", {
            code: "LLM_TIMEOUT",
          });
        },
      }),
    }));

    await expect(service.answer({
      conversationId: "abort-demo-1",
      question: "很冷门的需求",
      abortSignal: abortController.signal,
    })).rejects.toThrow("request aborted");

    expect(cacheWriteCalled).toBe(false);
    expect(store.get("abort-demo-1")).toBeUndefined();
  });

  it("skips stale vector hits missing from active PostgreSQL products", async () => {
    const llmRequests: LlmGenerateRequest[] = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([createHit("stale_product")]),
      productReader: {
        findActiveByIds: async () => [],
      },
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequests.push(request);
          return createLlmResponse(
            "这个条件下我在库里还没找到合适商品。你可以放宽预算或补充用途，我再继续筛。",
          );
        },
      }),
    }));

    const result = await service.answer({ question: "recommend one" });

    expect(llmRequests).toHaveLength(1);
    expect(llmRequests[0]?.messages.map((message) => message.content).join("\n"))
      .toContain("无结果回复生成器");
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

  it("uses popular query cache after cart and clarification intent checks", async () => {
    let vectorSearchCalled = false;
    let ragLlmCalled = false;
    const productReaderCalls: string[][] = [];
    const store = new ChatContextMemoryStore();
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [createHit("product_001")];
        },
      },
      productReader: {
        findActiveByIds: async (productIds) => {
          productReaderCalls.push(productIds);
          return [createProduct({ id: "product_001", name: "Cached Product" })];
        },
      },
      contextMemoryService: new ChatContextMemoryService({ store }),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
      popularQueryCache: createFakeCache({
        hit: {
          key: "popular-query:test",
          answer: "Cached LLM answer.",
          recommendedProductIds: ["product_001"],
          fallbackUsed: false,
          retrieval: {
            candidateCount: 2,
            returnedProductIds: ["product_001"],
          },
          createdAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-06-01T00:20:00.000Z",
          hitCount: 1,
          modelVersion: "mock-llm",
          promptVersion: "rag-chat-v1",
          dataVersion: "catalog-v1",
        },
      }),
      llmClient: new MockLlmClient({
        handler: (request) => {
          ragLlmCalled = request.messages
            .map((message) => message.content)
            .join("\n")
            .includes("只输出 JSON object");
          return createLlmResponse(
            JSON.stringify({
              answer: "Fresh answer.",
              recommended_product_ids: ["product_001"],
            }),
          );
        },
      }),
    }));

    const result = await service.answer({
      conversationId: "cache-demo-1",
      question: "推荐一款适合通勤的防晒",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(ragLlmCalled).toBe(false);
    expect(productReaderCalls).toEqual([["product_001"]]);
    expect(result).toMatchObject({
      answer: "Cached LLM answer.",
      recommendedProductIds: ["product_001"],
      fallbackUsed: false,
      retrieval: {
        candidateCount: 2,
        returnedProductIds: ["product_001"],
      },
      contextMemory: {
        conversationId: "cache-demo-1",
        lastRecommendedProductIds: ["product_001"],
      },
    });
    expect(result.productCards[0]).toMatchObject({
      id: "product_001",
      name: "Cached Product",
    });
  });

  it("treats cache hits with missing active products as miss and deletes the entry", async () => {
    let vectorSearchCalled = false;
    let cacheDeleted = false;
    const productReaderCalls: string[][] = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [createHit("product_001")];
        },
      },
      productReader: {
        findActiveByIds: async (productIds) => {
          productReaderCalls.push(productIds);

          return productReaderCalls.length === 1
            ? []
            : [createProduct({ id: "product_001" })];
        },
      },
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
      popularQueryCache: createFakeCache({
        hit: {
          key: "popular-query:test",
          answer: "Cached LLM answer.",
          recommendedProductIds: ["product_001"],
          fallbackUsed: false,
          retrieval: {
            candidateCount: 2,
            returnedProductIds: ["product_001"],
          },
          createdAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-06-01T00:20:00.000Z",
          hitCount: 1,
          modelVersion: "mock-llm",
          promptVersion: "rag-chat-v1",
          dataVersion: "catalog-v1",
        },
        onDelete: () => {
          cacheDeleted = true;
        },
      }),
      llmClient: new MockLlmClient({
        response: createLlmResponse(
          JSON.stringify({
            answer: "Fresh answer.",
            recommended_product_ids: ["product_001"],
          }),
        ),
      }),
    }));

    const result = await service.answer({ question: "推荐一款防晒" });

    expect(cacheDeleted).toBe(true);
    expect(vectorSearchCalled).toBe(true);
    expect(productReaderCalls).toEqual([["product_001"], ["product_001"]]);
    expect(result.answer).toBe("Fresh answer.");
    expect(result.recommendedProductIds).toEqual(["product_001"]);
  });

  it("writes safe RAG results to popular query cache", async () => {
    let cachedResult: unknown;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([createHit("product_001")]),
      productReader: createProductReader(),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
      popularQueryCache: createFakeCache({
        onSet: (input) => {
          cachedResult = input.result;
        },
      }),
      llmClient: new MockLlmClient({
        response: createLlmResponse(
          JSON.stringify({
            answer: "Use product 1.",
            recommended_product_ids: ["product_001"],
          }),
        ),
      }),
    }));

    await service.answer({ question: "推荐一款防晒" });

    expect(cachedResult).toMatchObject({
      answer: "Use product 1.",
      recommendedProductIds: ["product_001"],
      fallbackUsed: false,
    });
  });

  it("reuses first-turn conversation cache entries and keeps follow-up turns uncached", async () => {
    let vectorSearchCallCount = 0;
    let ragLlmCallCount = 0;
    const cache = new PopularQueryCacheService();
    const store = new ChatContextMemoryStore();
    const createService = () => new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCallCount += 1;
          return [createHit("product_001")];
        },
      },
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
      popularQueryCache: cache,
      llmClient: new MockLlmClient({
        handler: () => {
          ragLlmCallCount += 1;
          return createLlmResponse(
            JSON.stringify({
              answer: "Use product 1.",
              recommended_product_ids: ["product_001"],
            }),
          );
        },
      }),
    }));

    await createService().answer({
      conversationId: "cache-session-1",
      question: "推荐一款防晒",
    });
    const firstTurnCachedResult = await createService().answer({
      conversationId: "cache-session-2",
      question: "推荐一款防晒",
    });
    await createService().answer({
      conversationId: "cache-session-2",
      question: "要轻薄一点的",
    });

    expect(vectorSearchCallCount).toBe(2);
    expect(ragLlmCallCount).toBe(2);
    expect(firstTurnCachedResult.answer).toBe("Use product 1.");
    expect(firstTurnCachedResult.contextMemory).toMatchObject({
      conversationId: "cache-session-2",
      lastRecommendedProductIds: ["product_001"],
    });
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

  it("adds the second recent recommendation to cart after LLM intent and response generation without vector search or RAG generation", async () => {
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
      negativeConstraintIntentService: {
        detect: async () => NO_NEGATIVE_CONSTRAINTS,
      },
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequests.push(request);
          const promptText = request.messages
            .map((message) => message.content)
            .join("\n");

          return promptText.includes("购物车操作回复生成器")
            ? createLlmResponse(JSON.stringify({
                answer: "已经帮你把 Product 2 加进购物车。",
              }))
            : createCartIntentResponse({
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
    expect(llmRequests).toHaveLength(2);
    expect(llmRequests[0]?.messages.map((message) => message.content).join("\n"))
      .toContain("购物车操作意图分类器");
    expect(llmRequests[1]?.messages.map((message) => message.content).join("\n"))
      .toContain("购物车操作回复生成器");
    expect(llmRequests[1]?.messages.map((message) => message.content).join("\n"))
      .toContain("product_002");
    expect(cartAdds).toEqual([{ productId: "product_002", quantity: 1 }]);
    expect(result).toMatchObject({
      answer: "已经帮你把 Product 2 加进购物车。",
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

  it("uses a minimal status answer when cart action response generation fails", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    let llmCallCount = 0;
    const service = new RagChatService({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      cartWriter: {
        addItem: async () => createCartDto(),
      },
      contextMemoryService: new ChatContextMemoryService({ store }),
      negativeConstraintIntentService: {
        detect: async () => NO_NEGATIVE_CONSTRAINTS,
      },
      llmClient: new MockLlmClient({
        handler: () => {
          llmCallCount += 1;

          if (llmCallCount === 1) {
            return createCartIntentResponse({ target: { kind: "deictic" } });
          }

          throw new LlmError("response generation failed", {
            code: "LLM_REQUEST_FAILED",
          });
        },
      }),
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "把这个加到购物车",
    });

    expect(llmCallCount).toBe(2);
    expect(result).toMatchObject({
      answer: "",
      fallbackUsed: false,
      cartAction: {
        status: "success",
        productId: "product_001",
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
          const promptText = request.messages
            .map((message) => message.content)
            .join("\n");

          return promptText.includes("购物车操作回复生成器")
            ? createLlmResponse(JSON.stringify({ answer: "第一款已加购。" }))
            : createCartIntentResponse({
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
    expect(llmRequests).toHaveLength(2);
    expect(cartAdds).toEqual([{ productId: "product_001", quantity: 1 }]);
    expect(result.answer).toBe("第一款已加购。");
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

  it("adds an explicit active product by name without recent recommendations", async () => {
    const store = createStoreWithRecentRecommendations([]);
    const textLookups: Array<{ text: string; limit: number }> = [];
    const cartAdds: Array<{ productId: string; quantity: number }> = [];
    const service = createCartCommandService({
      store,
      intentTarget: { kind: "name", text: "小米通勤耳机" },
      productReader: {
        findActiveByIds: async () => [],
        findActiveByText: async (text, limit) => {
          textLookups.push({ text, limit });
          return [
            createProduct({
              id: "product_xiaomi_001",
              name: "小米通勤耳机",
              brand: "小米",
            }),
          ];
        },
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
      question: "把小米通勤耳机加到购物车",
    });

    expect(textLookups).toEqual([{ text: "小米通勤耳机", limit: 8 }]);
    expect(cartAdds).toEqual([{ productId: "product_xiaomi_001", quantity: 1 }]);
    expect(result).toMatchObject({
      fallbackUsed: false,
      recommendedProductIds: ["product_xiaomi_001"],
      productCards: [{ id: "product_xiaomi_001", name: "小米通勤耳机" }],
      cartAction: {
        type: "add",
        status: "success",
        productId: "product_xiaomi_001",
        productName: "小米通勤耳机",
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

  it("removes a cart item resolved by current cart ordinal", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    const cart = createCartDtoWithItems([
      createCartItem({ id: "item_001", productId: "product_001", name: "Product 1" }),
      createCartItem({ id: "item_002", productId: "product_002", name: "Product 2" }),
    ]);
    const deletedItemIds: string[] = [];
    const service = createCartCommandService({
      store,
      action: "remove",
      intentTarget: { kind: "cart_ordinal", index: 2 },
      cartWriter: {
        getCart: async () => cart,
        addItem: async () => createCartDto(),
        deleteItem: async (itemId) => {
          deletedItemIds.push(itemId);
          return createCartDtoWithItems([cart.items[0] as CartItemDto]);
        },
      },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "删除第二个商品",
    });

    expect(deletedItemIds).toEqual(["item_002"]);
    expect(result).toMatchObject({
      fallbackUsed: false,
      cartAction: {
        type: "remove",
        status: "success",
        itemId: "item_002",
        productId: "product_002",
      },
    });
  });

  it("updates quantity only when the cart item target resolves", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    const cart = createCartDtoWithItems([
      createCartItem({ id: "item_001", productId: "product_001", name: "Product 1" }),
    ]);
    const updates: Array<{ itemId: string; quantity?: number }> = [];
    const service = createCartCommandService({
      store,
      action: "update_quantity",
      quantity: 2,
      intentTarget: { kind: "unknown" },
      cartWriter: {
        getCart: async () => cart,
        addItem: async () => createCartDto(),
        updateItem: async (itemId, input) => {
          updates.push({ itemId, quantity: input.quantity });
          return createCartDtoWithItems([
            createCartItem({
              id: itemId,
              quantity: input.quantity ?? 1,
              subtotalCents: (input.quantity ?? 1) * 19900,
            }),
          ]);
        },
      },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "把数量改成 2",
    });

    expect(updates).toEqual([{ itemId: "item_001", quantity: 2 }]);
    expect(result.cartAction).toMatchObject({
      type: "update_quantity",
      status: "success",
      itemId: "item_001",
      quantity: 2,
    });
  });

  it("does not mutate when cart management target is ambiguous", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    const cart = createCartDtoWithItems([
      createCartItem({ id: "item_001", productId: "product_001", name: "Product 1" }),
      createCartItem({ id: "item_002", productId: "product_002", name: "Product 2" }),
    ]);
    let updateCalled = false;
    const service = createCartCommandService({
      store,
      action: "update_quantity",
      quantity: 2,
      intentTarget: { kind: "unknown" },
      cartWriter: {
        getCart: async () => cart,
        addItem: async () => createCartDto(),
        updateItem: async () => {
          updateCalled = true;
          return createCartDto();
        },
      },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "把数量改成 2",
    });

    expect(updateCalled).toBe(false);
    expect(result).toMatchObject({
      fallbackUsed: true,
      fallbackReason: "CART_TARGET_AMBIGUOUS",
      cartAction: {
        type: "update_quantity",
        status: "needs_target",
      },
    });
  });

  it("does not mutate when clear cart intent needs confirmation", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    const cart = createCartDtoWithItems([createCartItem()]);
    let deleteCalled = false;
    const service = createCartCommandService({
      store,
      action: "clear",
      intentTarget: { kind: "all" },
      cartWriter: {
        getCart: async () => cart,
        addItem: async () => createCartDto(),
        deleteItem: async () => {
          deleteCalled = true;
          return createCartDto();
        },
      },
    });

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "清空购物车",
    });

    expect(deleteCalled).toBe(false);
    expect(result.cartAction).toMatchObject({
      type: "clear",
      status: "needs_confirmation",
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
      negativeConstraintIntentService: {
        detect: async () => NO_NEGATIVE_CONSTRAINTS,
      },
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
    expect(result.answer).toBe("这次没有生成可靠推荐说明。");
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
    negativeConstraintIntentService:
      options.negativeConstraintIntentService
      ?? {
        detect: async () => NO_NEGATIVE_CONSTRAINTS,
      },
  };
}

function createCartCommandService(input: {
  store: ChatContextMemoryStore;
  cartWriter: RagCartWriter;
  productReader?: RagProductReader;
  action?: string;
  quantity?: number;
  selected?: boolean | null;
  intentTarget?:
    | { kind: "ordinal"; index: number }
    | { kind: "cart_ordinal"; index: number }
    | { kind: "recent_recommendation_ordinal"; index: number }
    | { kind: "deictic" }
    | { kind: "name"; text: string }
    | { kind: "all" }
    | { kind: "unknown" };
}): RagChatService {
  return new RagChatService({
    vectorSearch: createVectorSearch([]),
    productReader: input.productReader ?? createProductReader(),
    cartWriter: input.cartWriter,
    contextMemoryService: new ChatContextMemoryService({ store: input.store }),
    llmClient: new MockLlmClient({
      response: createCartIntentResponse({
        action: input.action,
        target: input.intentTarget ?? { kind: "unknown" },
        quantity: input.quantity,
        selected: input.selected,
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
  return createCartDtoWithItems([]);
}

function createCartDtoWithItems(items: CartItemDto[]): CartDto {
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
    name: "Product 1",
    brand: "Demo Brand",
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

function createVectorSearch(hits: VectorSearchHit[]): RagVectorSearchClient {
  return {
    search: async () => hits,
  };
}

function createCacheVersionReader() {
  return {
    read: async () => ({
      modelVersion: "mock-llm",
      promptVersion: "rag-chat-v1",
      dataVersion: "catalog-v1",
      visibleBoundary: "locale=zh-CN|currency=CNY|imageBase=relative",
    }),
  };
}

function createFakeCache(input: {
  hit?: PopularQueryCacheHit | null;
  onSet?: (cacheInput: PopularQueryCacheWriteInput) => void;
  onDelete?: () => void;
}): PopularQueryCache {
  return {
    get: async () => input.hit ?? null,
    set: async (cacheInput) => {
      input.onSet?.(cacheInput);
    },
    delete: async () => {
      input.onDelete?.();
    },
    isEligibleForRead: () => true,
    isEligibleForWrite: () => true,
    buildKey: (_cacheInput: PopularQueryCacheReadInput) => "popular-query:test",
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
  action?: string;
  target?: Record<string, unknown>;
  quantity?: number;
  selected?: boolean | null;
  needsConfirmation?: boolean;
  confidence?: string;
} = {}): LlmGenerateResponse {
  return createLlmResponse(
    JSON.stringify({
      is_cart_management: input.isCartAdd ?? true,
      action: input.action ?? "add",
      target: input.target ?? { kind: "unknown" },
      quantity: input.quantity ?? (input.action === "update_quantity" ? 2 : 1),
      selected: input.selected ?? null,
      needs_confirmation: input.needsConfirmation ?? false,
      confidence: input.confidence ?? "high",
      clarification_question: null,
    }),
  );
}

function createClarificationIntentResponse(input: {
  needsClarification: boolean;
  question: string;
  missingSlots: string[];
}): LlmGenerateResponse {
  return createLlmResponse(
    JSON.stringify({
      needs_clarification: input.needsClarification,
      clarification_question: input.question,
      missing_slots: input.missingSlots,
    }),
  );
}

function createNegativeConstraint(term: string) {
  return {
    rawText: `不要含${term}`,
    term,
    kind: "ingredient" as const,
    scope: "product" as const,
    matchPolicy: "exclude_if_product_facts_conflict" as const,
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
