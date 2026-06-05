import { describe, expect, it, vi } from "vitest";
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
  ComparisonGenerationOutputError,
  ComparisonGenerationService,
} from "./comparison-generation.service";
import {
  PopularQueryCacheService,
  type PopularQueryCache,
  type PopularQueryCacheHit,
  type PopularQueryCacheReadInput,
  type PopularQueryCacheWriteInput,
} from "./popular-query-cache.service";
import { NO_NEGATIVE_CONSTRAINTS } from "./negative-constraint.types";
import type {
  ChatStreamContractEvent,
  ChatStreamWriter,
  RagCartWriter,
  RagChatServiceOptions,
  RagProductReader,
  RagQueryRewriter,
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
    expect(llmRequest?.maxCompletionTokens).toBe(320);
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

  it("streams real RAG answer text before final product cards and done", async () => {
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([createHit("product_001")]),
      productReader: createProductReader(),
      cartWriter: {
        addItem: async () => createCartDto(),
      },
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      llmClient: new MockLlmClient({
        streamHandler: function* () {
          yield { textDelta: "{\"answer\":\"先推荐 Product" };
          yield {
            textDelta:
              " 1。\",\"recommended_product_ids\":[\"product_001\"]}",
          };
          yield { finishReason: "stop" };
        },
      }),
    }));
    let resolveFirstDelta: (() => void) | undefined;
    const firstDeltaWritten = new Promise<void>((resolve) => {
      resolveFirstDelta = resolve;
    });
    const { events, writer } = createCollectingStreamWriter(() => {
      resolveFirstDelta?.();
    });
    const timingMarks: string[] = [];
    const streamPromise = service.answerStream(
      {
        question: "recommend one",
        timing: {
          mark: (name) => {
            timingMarks.push(name);
          },
          toSafeMetadata: () => [],
        },
      },
      writer,
    );

    await firstDeltaWritten;

    expect(events).toEqual([{
      eventName: "message_delta",
      payload: {
        text: "先推荐 Product",
        index: 0,
      },
    }]);
    expect(timingMarks).toContain("llm_first_delta");

    await streamPromise;

    expect(events.map((event) => event.eventName)).toEqual([
      "message_delta",
      "message_delta",
      "product_cards",
      "done",
    ]);
    expect(events[1]).toMatchObject({
      eventName: "message_delta",
      payload: {
        text: " 1。",
        index: 1,
      },
    });
    expect(events[2]).toMatchObject({
      eventName: "product_cards",
      payload: {
        items: [expect.objectContaining({ id: "product_001" })],
      },
    });
    expect(events[3]).toMatchObject({
      eventName: "done",
      payload: {
        recommendedProductIds: ["product_001"],
        fallbackUsed: false,
      },
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
    expect(llmRequests[1]?.messages.map((message) => message.content).join("\n"))
      .toContain("只输出 JSON object");
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

  it("keeps fact-based negative constraints out of vector avoidTerms", async () => {
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
      excludeRiskTerms: ["酒精"],
    });
    expect(vectorCalls[0]?.filters?.avoidTerms).toBeUndefined();
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
      comparisonIntentService: createNoComparisonIntentService(),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      queryRewriteService: createNoopQueryRewriter(),
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

  it("uses explicit avoidTerms as fact constraints without vector avoidTerms", async () => {
    const vectorCalls: Array<Parameters<RagVectorSearchClient["search"]>[0]> = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async (input) => {
          vectorCalls.push(input);
          return [
            createHit("product_001"),
            createHit("product_002"),
          ];
        },
      },
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
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          answer: "Use alcohol-free product 2.",
          recommended_product_ids: ["product_001", "product_002"],
        })),
      }),
    }));

    const result = await service.answer({
      question: "推荐防晒霜",
      filters: {
        category: "美妆护肤",
        subCategory: "防晒",
        avoidTerms: ["酒精"],
      },
    });

    expect(vectorCalls).toHaveLength(1);
    expect(vectorCalls[0]?.filters).toEqual({
      category: "美妆护肤",
      subCategory: "防晒",
      excludeRiskTerms: ["酒精"],
    });
    expect(result.recommendedProductIds).toEqual(["product_002"]);
  });

  it("uses rewritten query for vector search while keeping original question in RAG prompt", async () => {
    const vectorCalls: Array<Parameters<RagVectorSearchClient["search"]>[0]> = [];
    let resolveOriginalSearchStarted: (() => void) | undefined;
    const originalSearchStarted = new Promise<void>((resolve) => {
      resolveOriginalSearchStarted = resolve;
    });
    let ragPrompt = "";
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async (input) => {
          vectorCalls.push(input);
          if (input.query === "再便宜一点的有吗？") {
            resolveOriginalSearchStarted?.();
          }
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
      queryRewriteService: {
        rewrite: async (input) => {
          await originalSearchStarted;

          return {
            status: "rewritten",
            query: "真无线耳机 更便宜 蓝牙耳机 预算更低",
            baseQuery: input.baseRetrievalQuery,
            rewrittenQuery: "真无线耳机 更便宜 蓝牙耳机 预算更低",
            reason: "短追问补全检索目标",
            confidence: "high",
          };
        },
      },
      llmClient: new MockLlmClient({
        handler: (request) => {
          ragPrompt = request.messages.map((message) => message.content).join("\n");
          return createLlmResponse(JSON.stringify({
            answer: "Use product 1.",
            recommended_product_ids: ["product_001"],
          }));
        },
      }),
    }));

    const result = await service.answer({
      question: "再便宜一点的有吗？",
    });

    expect(vectorCalls.map((call) => call.query)).toEqual(
      expect.arrayContaining([
        "再便宜一点的有吗？",
        "真无线耳机 更便宜 蓝牙耳机 预算更低",
      ]),
    );
    expect(ragPrompt).toContain("再便宜一点的有吗？");
    expect(ragPrompt).not.toContain("真无线耳机 更便宜 蓝牙耳机 预算更低");
    expect(result.retrieval).toMatchObject({
      query: "真无线耳机 更便宜 蓝牙耳机 预算更低",
      baseQuery: "再便宜一点的有吗？",
      rewrittenQuery: "真无线耳机 更便宜 蓝牙耳机 预算更低",
      queryRewriteStatus: "rewritten",
      queryRewriteReason: "短追问补全检索目标",
      retrievalStrategy: "rewritten_query",
    });
  });

  it("falls back to original query search when rewrite times out", async () => {
    vi.useFakeTimers();
    try {
      const vectorCalls: Array<Parameters<RagVectorSearchClient["search"]>[0]> =
        [];
      let resolveOriginalSearch: (() => void) | undefined;
      const originalSearchStarted = new Promise<void>((resolve) => {
        resolveOriginalSearch = resolve;
      });
      let rewriteAbortSignal: AbortSignal | undefined;
      let rewriteAbortObserved = false;
      const service = new RagChatService(withNoCartIntent({
        vectorSearch: {
          search: async (input) => {
            vectorCalls.push(input);
            resolveOriginalSearch?.();
            return [createHit("product_001")];
          },
        },
        productReader: createProductReader(),
        popularQueryCacheVersionReader: createCacheVersionReader(),
        clarificationIntentService: {
          decide: async () => ({
            needsClarification: false,
            missingSlots: [],
          }),
        },
        queryRewriteService: {
          rewrite: async (input) => {
            rewriteAbortSignal = input.abortSignal;

            return new Promise<never>((_, reject) => {
              input.abortSignal?.addEventListener("abort", () => {
                rewriteAbortObserved = true;
                reject(
                  input.abortSignal?.reason ?? new Error("rewrite aborted"),
                );
              });
            });
          },
        },
        llmClient: new MockLlmClient({
          response: createLlmResponse(JSON.stringify({
            answer: "Use product 1.",
            recommended_product_ids: ["product_001"],
          })),
        }),
      }));

      const answerPromise = service.answer({ question: "recommend one" });

      await originalSearchStarted;
      await vi.advanceTimersByTimeAsync(901);
      const result = await answerPromise;

      expect(rewriteAbortSignal?.aborted).toBe(true);
      expect(rewriteAbortObserved).toBe(true);
      expect(vectorCalls.map((call) => call.query)).toEqual(["recommend one"]);
      expect(result.retrieval).toMatchObject({
        query: "recommend one",
        queryRewriteStatus: "fallback",
        queryRewriteReason: "TIMEOUT",
        retrievalStrategy: "original_query",
        queryRewriteTimedOut: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let rewrite add negative avoidTerms", async () => {
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
      queryRewriteService: {
        rewrite: async () => ({
          status: "rewritten",
          query: "美妆护肤 防晒 通勤 不含酒精",
          baseQuery: "推荐防晒霜，不要酒精",
          rewrittenQuery: "美妆护肤 防晒 通勤 不含酒精",
          confidence: "medium",
        }),
      },
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          answer: "Use product 1.",
          recommended_product_ids: ["product_001"],
        })),
      }),
    }));

    await service.answer({
      conversationId: "rewrite-negative-demo",
      question: "推荐防晒霜，不要酒精",
    });

    const rewrittenCall = vectorCalls.find((call) =>
      call.query === "美妆护肤 防晒 通勤 不含酒精"
    );

    expect(rewrittenCall).toBeDefined();
    expect(rewrittenCall?.filters).toMatchObject({
      category: "美妆护肤",
      subCategory: "防晒",
      excludeRiskTerms: ["酒精"],
    });
    expect(rewrittenCall?.filters?.avoidTerms).toBeUndefined();
  });

  it("builds cache input with rewritten retrieval query and rewrite version", async () => {
    let cacheReadInput: PopularQueryCacheReadInput | undefined;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([createHit("product_001")]),
      productReader: createProductReader(),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      queryRewriteService: {
        rewrite: async (input) => ({
          status: "rewritten",
          query: "真无线耳机 更便宜",
          baseQuery: input.baseRetrievalQuery,
          rewrittenQuery: "真无线耳机 更便宜",
          confidence: "high",
        }),
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
      popularQueryCache: createFakeCache({
        onGet: (input) => {
          cacheReadInput = input;
        },
      }),
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          answer: "Use product 1.",
          recommended_product_ids: ["product_001"],
        })),
      }),
    }));

    await service.answer({ question: "再便宜一点的有吗？" });

    expect(cacheReadInput).toMatchObject({
      question: "再便宜一点的有吗？",
      retrievalQuery: "真无线耳机 更便宜",
      queryRewriteVersion: "query-rewrite-v1",
    });
  });

  it("does not call query rewrite for cart, comparison, or clarification early returns", async () => {
    let rewriteCallCount = 0;
    const queryRewriteService: RagQueryRewriter = {
      rewrite: async (input) => {
        rewriteCallCount += 1;
        return {
          status: "not_needed",
          query: input.baseRetrievalQuery,
          baseQuery: input.baseRetrievalQuery,
        };
      },
    };

    await new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      queryRewriteService,
      cartActionResponseService: {
        generate: async () => "需要你告诉我要加哪款商品。",
      },
      cartCommandIntentService: {
        detect: async () => ({
          isCartCommand: true,
          action: "add",
          target: { kind: "unknown" },
          quantity: 1,
          needsConfirmation: false,
          confidence: "high",
        }),
      },
    })).answer({
      conversationId: "cart-demo-1",
      question: "把这个加入购物车",
    });

    await new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      queryRewriteService,
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "unknown",
            ordinals: [],
            names: [],
          },
          needsClarification: true,
          clarificationQuestion: "你想对比哪两款商品？",
        }),
      },
    })).answer({ question: "对比一下" });

    await new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      queryRewriteService,
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: true,
          question: "你要什么预算和用途？",
          missingSlots: ["budget", "use_case"],
        }),
      },
    })).answer({ question: "推荐一款手机" });

    expect(rewriteCallCount).toBe(0);
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

  it("streams the real answer text without a fixed pre-response", async () => {
    let cachedResult: RagChatResult | undefined;
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
        streamHandler: function* () {
          yield {
            textDelta: JSON.stringify({
              answer: "Use product 1.",
              recommended_product_ids: ["product_001"],
            }),
          };
          yield { finishReason: "stop" };
        },
      }),
    }));
    const { events, writer } = createCollectingStreamWriter();

    await service.answerStream({ question: "推荐一款防晒" }, writer);

    expect(events[0]).toMatchObject({
      eventName: "message_delta",
      payload: {
        text: "Use product 1.",
        index: 0,
      },
    });
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
      comparisonIntentService: createNoComparisonIntentService(),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      queryRewriteService: createNoopQueryRewriter(),
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
      comparisonIntentService: createNoComparisonIntentService(),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
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
      comparisonIntentService: createNoComparisonIntentService(),
      clarificationIntentService: {
        decide: async () => ({
          needsClarification: false,
          missingSlots: [],
        }),
      },
      queryRewriteService: createNoopQueryRewriter(),
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequests.push(request);
          const promptText = request.messages
            .map((message) => message.content)
            .join("\n");

          return promptText.includes("购物车操作意图分类器")
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
    expect(llmRequests).toHaveLength(1);
    expect(result.cartAction).toBeUndefined();
    expect(result.recommendedProductIds).toEqual(["product_002"]);
  });

  it("uses exactly two recent recommendations when comparison target is unknown", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
    ]);
    let vectorSearchCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [];
        },
      },
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "unknown",
            ordinals: [],
            names: [],
          },
          needsClarification: false,
        }),
      },
      comparisonGenerationService: {
        generate: async (input) => {
          expect(input.products.map((context) => context.product.id)).toEqual([
            "product_001",
            "product_002",
          ]);

          return createGeneratedComparison(["product_001", "product_002"]);
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "帮我对比一下",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(result.fallbackUsed).toBe(false);
    expect(result.recommendedProductIds).toEqual(["product_001", "product_002"]);
    expect(result.comparisonResult?.productIds).toEqual([
      "product_001",
      "product_002",
    ]);
  });

  it("returns comparison result for the first two products when three were recently recommended", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
      "product_003",
    ]);
    let vectorSearchCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [];
        },
      },
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "recent_recommendations",
            ordinals: [1, 2],
            names: [],
          },
          needsClarification: false,
        }),
      },
      comparisonGenerationService: {
        generate: async (input) => {
          expect(input.products.map((context) => context.product.id)).toEqual([
            "product_001",
            "product_002",
          ]);

          return createGeneratedComparison(["product_001", "product_002"]);
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "对比下前两个",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(result.fallbackUsed).toBe(false);
    expect(result.recommendedProductIds).toEqual(["product_001", "product_002"]);
    expect(result.comparisonResult?.productIds).toEqual([
      "product_001",
      "product_002",
    ]);
  });

  it("uses request recent product ids before memory for explicit ordinal comparison", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
    ]);
    const requestRecentProductIds = [
      "product_003",
      "product_002",
      "product_001",
    ];
    const productLookupCalls: string[][] = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: {
        findActiveByIds: async (productIds) => {
          productLookupCalls.push(productIds);

          return createProductReader().findActiveByIds(productIds);
        },
      },
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async (input) => {
          expect(input.recentProductIds).toEqual(requestRecentProductIds);

          return {
            isComparison: true,
            confidence: "high",
            target: {
              kind: "recent_recommendations",
              ordinals: [1, 3],
              names: [],
            },
            needsClarification: false,
          };
        },
      },
      comparisonGenerationService: {
        generate: async (input) => {
          expect(input.products.map((context) => context.product.id)).toEqual([
            "product_003",
            "product_001",
          ]);

          return createGeneratedComparison(["product_003", "product_001"]);
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "对比一下第一个和第三个",
      recentProductIds: requestRecentProductIds,
    });

    expect(productLookupCalls).toEqual([requestRecentProductIds]);
    expect(result.fallbackUsed).toBe(false);
    expect(result.recommendedProductIds).toEqual([
      "product_003",
      "product_001",
    ]);
    expect(result.comparisonResult?.productIds).toEqual([
      "product_003",
      "product_001",
    ]);
  });

  it("asks comparison clarification when request ordinals exceed visible products", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
      "product_003",
    ]);
    let generationCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async (input) => {
          expect(input.recentProductIds).toEqual([
            "product_001",
            "product_002",
          ]);

          return {
            isComparison: true,
            confidence: "high",
            target: {
              kind: "recent_recommendations",
              ordinals: [1, 3],
              names: [],
            },
            needsClarification: false,
            clarificationQuestion: "我现在只看到两款商品，请再选一款来对比。",
          };
        },
      },
      comparisonGenerationService: {
        generate: async () => {
          generationCalled = true;
          throw new Error("comparison generation should not run");
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "对比一下第一个和第三个",
      recentProductIds: ["product_001", "product_002"],
    });

    expect(generationCalled).toBe(false);
    expect(result.answer).toBe("我现在只看到两款商品，请再选一款来对比。");
    expect(result.fallbackReason).toBe("COMPARISON_TARGET_CLARIFICATION");
    expect(result.productCards).toEqual([]);
    expect(result.comparisonResult).toBeUndefined();
  });

  it("keeps leading-pair comparison successful when generation returns four dimensions", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
    ]);
    const comparisonGenerationService = new ComparisonGenerationService({
      llmClient: new MockLlmClient({
        response: createLlmResponse(JSON.stringify({
          answer: "已为你对比两款美妆护肤产品。",
          comparison: {
            title: "前两款产品对比",
            products: [
              { product_id: "product_001", display_label: "Product 1" },
              { product_id: "product_002", display_label: "Product 2" },
            ],
            dimensions: [
              {
                id: "category_fit",
                label: "品类定位",
                cells: [
                  { product_id: "product_001", value: "更偏精华护理。" },
                  { product_id: "product_002", value: "更偏面霜保湿。" },
                ],
              },
              {
                id: "use_case",
                label: "适用场景",
                cells: [
                  { product_id: "product_001", value: "适合想加强精华护理时。" },
                  { product_id: "product_002", value: "适合想要基础保湿时。" },
                ],
              },
              {
                id: "price",
                label: "价格",
                cells: [
                  { product_id: "product_001", value: "价格更低，适合预算敏感。" },
                  { product_id: "product_002", value: "价格更高，适合看重质地。" },
                ],
              },
              {
                id: "limits",
                label: "注意点",
                cells: [
                  { product_id: "product_001", value: "需要搭配后续保湿。" },
                  { product_id: "product_002", value: "厚涂时肤感更明显。" },
                ],
              },
            ],
            recommended_product_id: null,
            conclusion: "两款定位不同，可按当前护肤步骤选择。",
            highlights: [],
          },
        })),
      }),
    });
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "recent_recommendations",
            ordinals: [1, 2],
            names: [],
          },
          needsClarification: false,
        }),
      },
      comparisonGenerationService,
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "对比一下前两个",
    });

    expect(result.fallbackUsed).toBe(false);
    expect(result.fallbackReason).toBeUndefined();
    expect(result.answer).toBe("已为你对比两款美妆护肤产品。");
    expect(result.comparisonResult?.productIds).toEqual([
      "product_001",
      "product_002",
    ]);
    expect(result.comparisonResult?.dimensions).toHaveLength(4);
  });

  it("streams a preset comparison delta before structured comparison generation", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
    ]);
    let generationCalled = false;
    const timingMarks: string[] = [];
    const { events, writer } = createCollectingStreamWriter();
    const comparisonGenerationService = {
      generate: async () => {
        generationCalled = true;
        expect(events.map((event) => event.eventName)).toEqual([
          "message_delta",
        ]);
        expect(events[0]).toMatchObject({
          eventName: "message_delta",
          payload: {
            text: "我先帮你核对这两款商品的关键信息。",
            index: 0,
          },
        });

        return createGeneratedComparison(["product_001", "product_002"]);
      },
    };
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "recent_recommendations",
            ordinals: [1, 2],
            names: [],
          },
          needsClarification: false,
        }),
      },
      comparisonGenerationService,
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    await service.answerStream(
      {
        conversationId: "cart-demo-1",
        question: "对比一下前两个",
        timing: {
          mark: (name) => {
            timingMarks.push(name);
          },
          toSafeMetadata: () => [],
        },
      },
      writer,
    );

    expect(events.map((event) => event.eventName)).toEqual([
      "message_delta",
      "product_cards",
      "comparison_result",
      "done",
    ]);
    expect(events[0]).toMatchObject({
      eventName: "message_delta",
      payload: {
        text: "我先帮你核对这两款商品的关键信息。",
        index: 0,
      },
    });
    expect(events.filter((event) => event.eventName === "message_delta"))
      .toHaveLength(1);
    expect(events[2]).toMatchObject({
      eventName: "comparison_result",
      payload: {
        productIds: ["product_001", "product_002"],
      },
    });
    expect(events[3]).toMatchObject({
      eventName: "done",
      payload: {
        recommendedProductIds: ["product_001", "product_002"],
        fallbackUsed: false,
      },
    });
    expect(generationCalled).toBe(true);
    expect(timingMarks).toEqual(
      expect.arrayContaining([
        "comparison_preset_delta_sent",
        "comparison_generation_started",
        "comparison_generation_done",
      ]),
    );
    expect(timingMarks.indexOf("comparison_preset_delta_sent"))
      .toBeLessThan(timingMarks.indexOf("comparison_generation_started"));
  });

  it("asks comparison clarification when target is unknown and only one recent product exists", async () => {
    const store = createStoreWithRecentRecommendations(["product_001"]);
    let vectorSearchCalled = false;
    let generationCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [];
        },
      },
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "unknown",
            ordinals: [],
            names: [],
          },
          needsClarification: false,
          clarificationQuestion: "我现在只看到一款商品。你想拿它和哪款对比？",
        }),
      },
      comparisonGenerationService: {
        generate: async () => {
          generationCalled = true;
          throw new Error("comparison generation should not run");
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "帮我对比一下",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(generationCalled).toBe(false);
    expect(result.answer).toBe(
      "我现在只看到一款商品。你想拿它和哪款对比？",
    );
    expect(result.fallbackReason).toBe("COMPARISON_TARGET_CLARIFICATION");
    expect(result.recommendedProductIds).toEqual([]);
    expect(result.productCards).toEqual([]);
    expect(result.comparisonResult).toBeUndefined();
  });

  it("generates comparison clarification and preserves recent product anchors", async () => {
    const recentProductIds = [
      "product_001",
      "product_002",
      "product_003",
    ];
    const store = createStoreWithRecentRecommendations(recentProductIds);
    let generationCalled = false;
    let clarificationInput:
      | Parameters<NonNullable<RagChatServiceOptions["comparisonIntentService"]>["createClarificationQuestion"]>[0]
      | undefined;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "unknown",
            ordinals: [],
            names: [],
          },
          needsClarification: false,
        }),
        createClarificationQuestion: async (input) => {
          clarificationInput = input;

          return "你想从刚才推荐里选哪两款来比较？";
        },
      },
      comparisonGenerationService: {
        generate: async () => {
          generationCalled = true;
          throw new Error("comparison generation should not run");
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "帮我对比一下",
    });

    expect(generationCalled).toBe(false);
    expect(clarificationInput).toMatchObject({
      question: "帮我对比一下",
      reason: "too_many_targets",
      recentProductIds,
    });
    expect(result.answer).toBe("你想从刚才推荐里选哪两款来比较？");
    expect(result.fallbackReason).toBe("COMPARISON_TARGET_CLARIFICATION");
    expect(result.recommendedProductIds).toEqual([]);
    expect(result.productCards).toEqual([]);
    expect(result.comparisonResult).toBeUndefined();
    expect(result.contextMemory?.lastRecommendedProductIds).toEqual(
      recentProductIds,
    );
  });

  it("returns comparison result from recent recommendations before RAG and cache", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
    ]);
    let vectorSearchCalled = false;
    let clarificationCalled = false;
    let cacheGetCalled = false;
    let cacheSetCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [];
        },
      },
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "recent_recommendations",
            ordinals: [1, 2],
            names: [],
          },
          userPriority: "通勤",
          needsClarification: false,
        }),
      },
      comparisonGenerationService: {
        generate: async (input) => {
          expect(input.products.map((context) => context.product.id)).toEqual([
            "product_001",
            "product_002",
          ]);
          return {
            answer: "我按通勤佩戴、预算和续航做了对比。",
            title: "通勤耳机对比",
            products: [
              { productId: "product_001", displayLabel: "Product 1" },
              { productId: "product_002", displayLabel: "Product 2" },
            ],
            dimensions: [
              {
                id: "commute",
                label: "通勤",
                cells: [
                  {
                    productId: "product_001",
                    value: "更轻便。",
                    highlight: true,
                  },
                  {
                    productId: "product_002",
                    value: "续航更长。",
                  },
                ],
              },
            ],
            recommendedProductId: "product_001",
            conclusion: "日常通勤优先看 Product 1。",
            highlights: [
              {
                productId: "product_001",
                label: "通勤",
                text: "更轻便。",
              },
            ],
          };
        },
      },
      clarificationIntentService: {
        decide: async () => {
          clarificationCalled = true;
          return {
            needsClarification: false,
            missingSlots: [],
          };
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
      popularQueryCache: createFakeCache({
        onGet: () => {
          cacheGetCalled = true;
        },
        onSet: () => {
          cacheSetCalled = true;
        },
      }),
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "帮我对比这两款，哪个更适合通勤",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(clarificationCalled).toBe(false);
    expect(cacheGetCalled).toBe(false);
    expect(cacheSetCalled).toBe(false);
    expect(result.fallbackUsed).toBe(false);
    expect(result.recommendedProductIds).toEqual(["product_001", "product_002"]);
    expect(result.comparisonResult).toMatchObject({
      title: "通勤耳机对比",
      query: "帮我对比这两款，哪个更适合通勤",
      productIds: ["product_001", "product_002"],
      recommendedProductId: "product_001",
    });
    expect(result.comparisonResult?.dimensions[0]?.cells).toHaveLength(2);
  });

  it("prefetches recent comparison products while comparison intent is running", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
    ]);
    const productLookupCalls: string[][] = [];
    let resolveProductLookup: ((products: Product[]) => void) | undefined;
    const productLookupPromise = new Promise<Product[]>((resolve) => {
      resolveProductLookup = resolve;
    });
    let intentSawPrefetch = false;
    const timingMarks: string[] = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      cartWriter: {
        addItem: async () => createCartDto(),
      },
      productReader: {
        findActiveByIds: async (productIds) => {
          productLookupCalls.push(productIds);

          return productLookupPromise;
        },
      },
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => {
          intentSawPrefetch = productLookupCalls.length === 1;

          return {
            isComparison: true,
            confidence: "high",
            target: {
              kind: "recent_recommendations",
              ordinals: [1, 2],
              names: [],
            },
            userPriority: "通勤",
            needsClarification: false,
          };
        },
      },
      comparisonGenerationService: {
        generate: async (input) => {
          expect(input.products.map((context) => context.product.id)).toEqual([
            "product_001",
            "product_002",
          ]);

          return createGeneratedComparison(["product_001", "product_002"]);
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const answerPromise = service.answer({
      conversationId: "cart-demo-1",
      question: "帮我对比这两款，哪个更适合通勤",
      timing: {
        mark: (name) => {
          timingMarks.push(name);
        },
        toSafeMetadata: () => [],
      },
    });

    await waitForCondition(() => intentSawPrefetch);
    resolveProductLookup?.([
      createProduct({ id: "product_001" }),
      createProduct({ id: "product_002" }),
    ]);
    const result = await answerPromise;

    expect(productLookupCalls).toEqual([["product_001", "product_002"]]);
    expect(result.fallbackUsed).toBe(false);
    expect(timingMarks).toEqual(
      expect.arrayContaining([
        "comparison_prefetch_started",
        "comparison_prefetch_done",
        "comparison_targets_started",
        "comparison_targets_done",
        "comparison_generation_started",
        "comparison_generation_done",
      ]),
    );
  });

  it("returns comparison result from two explicit active product names", async () => {
    let vectorSearchCalled = false;
    const textLookups: Array<{ text: string; limit: number }> = [];
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [];
        },
      },
      productReader: {
        findActiveByIds: async () => [],
        findActiveByText: async (text, limit) => {
          textLookups.push({ text, limit });

          return text === "理肤泉"
            ? [createProduct({ id: "p_beauty_006", name: "理肤泉特护清盈防晒乳" })]
            : [createProduct({ id: "p_beauty_023", name: "巴黎欧莱雅新多重防护隔离露" })];
        },
      },
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "names",
            ordinals: [],
            names: ["理肤泉", "欧莱雅"],
          },
          needsClarification: false,
        }),
      },
      comparisonGenerationService: {
        generate: async (input) => {
          expect(input.products.map((context) => context.product.id)).toEqual([
            "p_beauty_006",
            "p_beauty_023",
          ]);

          return createGeneratedComparison(["p_beauty_006", "p_beauty_023"]);
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      question: "对比理肤泉和欧莱雅",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(textLookups).toEqual([
      { text: "理肤泉", limit: 4 },
      { text: "欧莱雅", limit: 4 },
    ]);
    expect(result.fallbackUsed).toBe(false);
    expect(result.comparisonResult?.productIds).toEqual([
      "p_beauty_006",
      "p_beauty_023",
    ]);
  });

  it("looks up named comparison targets in parallel", async () => {
    const textLookups: Array<{ text: string; limit: number }> = [];
    let resolveLaRoche: ((products: Product[]) => void) | undefined;
    let resolveLoreal: ((products: Product[]) => void) | undefined;
    const laRocheLookup = new Promise<Product[]>((resolve) => {
      resolveLaRoche = resolve;
    });
    const lorealLookup = new Promise<Product[]>((resolve) => {
      resolveLoreal = resolve;
    });
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      cartWriter: {
        addItem: async () => createCartDto(),
      },
      productReader: {
        findActiveByIds: async () => [],
        findActiveByText: async (text, limit) => {
          textLookups.push({ text, limit });

          return text === "理肤泉" ? laRocheLookup : lorealLookup;
        },
      },
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "names",
            ordinals: [],
            names: ["理肤泉", "欧莱雅"],
          },
          needsClarification: false,
        }),
      },
      comparisonGenerationService: {
        generate: async () =>
          createGeneratedComparison(["p_beauty_006", "p_beauty_023"]),
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const answerPromise = service.answer({
      question: "对比理肤泉和欧莱雅",
    });

    await waitForCondition(() => textLookups.length === 2);
    expect(textLookups).toEqual([
      { text: "理肤泉", limit: 4 },
      { text: "欧莱雅", limit: 4 },
    ]);

    resolveLaRoche?.([
      createProduct({ id: "p_beauty_006", name: "理肤泉特护清盈防晒乳" }),
    ]);
    resolveLoreal?.([
      createProduct({ id: "p_beauty_023", name: "巴黎欧莱雅新多重防护隔离露" }),
    ]);
    const result = await answerPromise;

    expect(result.fallbackUsed).toBe(false);
    expect(result.comparisonResult?.productIds).toEqual([
      "p_beauty_006",
      "p_beauty_023",
    ]);
  });

  it("asks comparison clarification when an explicit product name is ambiguous", async () => {
    let vectorSearchCalled = false;
    let generationCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [];
        },
      },
      productReader: {
        findActiveByIds: async () => [],
        findActiveByText: async () => [
          createProduct({ id: "p_beauty_006", name: "理肤泉特护清盈防晒乳" }),
          createProduct({ id: "p_beauty_007", name: "理肤泉每日防晒乳" }),
        ],
      },
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "names",
            ordinals: [],
            names: ["理肤泉", "欧莱雅"],
          },
          needsClarification: false,
          clarificationQuestion: "理肤泉匹配到多款商品，你想比较哪一款？",
        }),
      },
      comparisonGenerationService: {
        generate: async () => {
          generationCalled = true;
          throw new Error("comparison generation should not run");
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      question: "对比理肤泉和欧莱雅",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(generationCalled).toBe(false);
    expect(result.answer).toBe("理肤泉匹配到多款商品，你想比较哪一款？");
    expect(result.fallbackReason).toBe("COMPARISON_TARGET_CLARIFICATION");
    expect(result.productCards).toEqual([]);
    expect(result.comparisonResult).toBeUndefined();
  });

  it("asks the user to choose two products when comparison targets exceed two", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
      "product_003",
    ]);
    let vectorSearchCalled = false;
    let generationCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: {
        search: async () => {
          vectorSearchCalled = true;
          return [];
        },
      },
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "recent_recommendations",
            ordinals: [1, 2, 3],
            names: [],
          },
          userPriority: "油皮通勤",
          needsClarification: true,
          clarificationQuestion: "目前只支持两款商品对比，请从这三款里选两款。",
        }),
      },
      comparisonGenerationService: {
        generate: async () => {
          generationCalled = true;
          throw new Error("comparison generation should not run");
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      conversationId: "comparison-demo-3",
      question: "对比一下这三款，哪个更适合油皮通勤",
    });

    expect(vectorSearchCalled).toBe(false);
    expect(generationCalled).toBe(false);
    expect(result.answer).toBe("目前只支持两款商品对比，请从这三款里选两款。");
    expect(result.fallbackReason).toBe("COMPARISON_TARGET_CLARIFICATION");
    expect(result.productCards).toEqual([]);
    expect(result.comparisonResult).toBeUndefined();
  });

  it("asks the user to choose two products when recent comparison has more than two candidates without ordinals", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
      "product_003",
    ]);
    let generationCalled = false;
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "recent_recommendations",
            ordinals: [],
            names: [],
          },
          userPriority: "油皮通勤",
          needsClarification: false,
          clarificationQuestion: "你想比较刚才推荐里的哪两款？",
        }),
      },
      comparisonGenerationService: {
        generate: async () => {
          generationCalled = true;
          throw new Error("comparison generation should not run");
        },
      },
      popularQueryCacheVersionReader: createCacheVersionReader(),
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "对比一下这几款，哪个更适合油皮通勤",
    });

    expect(generationCalled).toBe(false);
    expect(result.answer).toBe("你想比较刚才推荐里的哪两款？");
    expect(result.fallbackReason).toBe("COMPARISON_TARGET_CLARIFICATION");
    expect(result.comparisonResult).toBeUndefined();
  });

  it("returns safe fact comparison result when comparison generation is invalid", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
    ]);
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "recent_recommendations",
            ordinals: [1, 2],
            names: [],
          },
          needsClarification: false,
        }),
      },
      comparisonGenerationService: {
        generate: async () => {
          throw new ComparisonGenerationOutputError("invalid comparison");
        },
      },
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "帮我对比这两款",
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("LLM_INVALID_OUTPUT");
    expect(result.comparisonResult).toMatchObject({
      title: "基础事实对比",
      query: "帮我对比这两款",
      productIds: ["product_001", "product_002"],
      recommendedProductId: null,
      highlights: [],
    });
    expect(result.comparisonResult?.dimensions.map((dimension) => dimension.id))
      .toEqual(["brand_category", "price", "facts"]);
    expect(result.answer).toBe(
      "对比结论生成不稳定，先展示两款商品的库内基础事实。",
    );
    expect(result.productCards.map((card) => card.id)).toEqual([
      "product_001",
      "product_002",
    ]);
  });

  it("classifies malformed comparison generation JSON as invalid output fallback", async () => {
    const store = createStoreWithRecentRecommendations([
      "product_001",
      "product_002",
    ]);
    const service = new RagChatService(withNoCartIntent({
      vectorSearch: createVectorSearch([]),
      productReader: createProductReader(),
      contextMemoryService: new ChatContextMemoryService({ store }),
      llmClient: new MockLlmClient({
        response: createLlmResponse("{\"answer\":\"截断"),
      }),
      comparisonIntentService: {
        detect: async () => ({
          isComparison: true,
          confidence: "high",
          target: {
            kind: "recent_recommendations",
            ordinals: [1, 2],
            names: [],
          },
          needsClarification: false,
        }),
      },
    }));

    const result = await service.answer({
      conversationId: "cart-demo-1",
      question: "帮我对比这两款",
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("LLM_INVALID_OUTPUT");
    expect(result.answer).toBe(
      "对比结论生成不稳定，先展示两款商品的库内基础事实。",
    );
    expect(result.comparisonResult?.productIds).toEqual([
      "product_001",
      "product_002",
    ]);
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

function createCollectingStreamWriter(onMessageDelta?: () => void): {
  events: ChatStreamContractEvent[];
  writer: ChatStreamWriter;
} {
  const events: ChatStreamContractEvent[] = [];
  let messageIndex = 0;
  const writer: ChatStreamWriter = {
    writeMessageDelta: async (text) => {
      events.push({
        eventName: "message_delta",
        payload: {
          text,
          index: messageIndex,
        },
      });
      messageIndex += 1;
      onMessageDelta?.();
      return true;
    },
    writeProductCards: async (items) => {
      events.push({
        eventName: "product_cards",
        payload: { items },
      });
      return true;
    },
    writeComparisonResult: async (payload) => {
      events.push({
        eventName: "comparison_result",
        payload,
      });
      return true;
    },
    writeDone: async (payload) => {
      events.push({
        eventName: "done",
        payload,
      });
      return true;
    },
    isClosed: () => false,
  };

  return { events, writer };
}

function flushPromises(): Promise<void> {
  return Promise.resolve();
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }

    await flushPromises();
  }

  throw new Error("Timed out waiting for condition.");
}

function withNoCartIntent(
  options: RagChatServiceOptions,
): RagChatServiceOptions {
  return {
    ...options,
    cartCommandIntentService:
      options.cartCommandIntentService
      ?? {
        detect: async () => ({ isCartCommand: false }),
      },
    negativeConstraintIntentService:
      options.negativeConstraintIntentService
      ?? {
        detect: async () => NO_NEGATIVE_CONSTRAINTS,
      },
    comparisonIntentService:
      options.comparisonIntentService
      ?? createNoComparisonIntentService(),
    queryRewriteService:
      options.queryRewriteService
      ?? createNoopQueryRewriter(),
  };
}

function createNoopQueryRewriter(): RagQueryRewriter {
  return {
    rewrite: async (input) => ({
      status: "not_needed",
      query: input.baseRetrievalQuery.trim(),
      baseQuery: input.baseRetrievalQuery.trim(),
    }),
  };
}

function createNoComparisonIntentService() {
  return {
    detect: async () => ({
      isComparison: false,
      confidence: "low" as const,
      target: {
        kind: "unknown" as const,
        ordinals: [],
        names: [],
      },
      needsClarification: false,
    }),
  };
}

function createGeneratedComparison(productIds: [string, string]) {
  return {
    answer: "我按你关心的点做了对比。",
    title: "商品对比",
    products: [
      { productId: productIds[0], displayLabel: "Product 1" },
      { productId: productIds[1], displayLabel: "Product 2" },
    ],
    dimensions: [
      {
        id: "fit",
        label: "适配度",
        cells: [
          {
            productId: productIds[0],
            value: "更适合日常使用。",
            highlight: true,
          },
          {
            productId: productIds[1],
            value: "配置更均衡。",
          },
        ],
      },
    ],
    recommendedProductId: productIds[0],
    conclusion: "优先考虑 Product 1。",
    highlights: [
      {
        productId: productIds[0],
        label: "适配度",
        text: "更适合日常使用。",
      },
    ],
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
  onGet?: (cacheInput: PopularQueryCacheReadInput) => void;
  onSet?: (cacheInput: PopularQueryCacheWriteInput) => void;
  onDelete?: () => void;
}): PopularQueryCache {
  return {
    get: async (cacheInput) => {
      input.onGet?.(cacheInput);
      return input.hit ?? null;
    },
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
      freeFromTerms: [],
      riskTerms: [],
      wearingStyles: [],
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
