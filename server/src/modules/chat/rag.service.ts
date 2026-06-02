import { throwIfAborted, rethrowIfAborted } from "../../lib/abort";
import { getDatabasePool } from "../../lib/db/pool";
import { getEnv } from "../../lib/env";
import {
  CartItemNotFoundError,
  CartProductNotFoundError,
  CartProductUnavailableError,
  CartRequestError,
  CartService,
  MIN_CART_QUANTITY,
} from "../cart/cart.service";
import type { CartDto, CartItemDto } from "../cart/cart.types";
import type { LlmClient } from "../llm/llm.types";
import { createLlmClient } from "../llm/openai-compatible-chat.client";
import { mapProductToCardDto } from "../products/product.mapper";
import {
  findActiveProductsByIds,
  findProducts,
} from "../products/product.repository";
import type { Product } from "../products/product.types";
import { VectorSearchService } from "../vector/vector-search.service";
import type {
  VectorSearchFilters,
  VectorSearchHit,
  VectorSearchHitMetadata,
} from "../vector/vector-search.types";
import type {
  ChatComparisonResultPayload,
  ChatHistoryMessage,
  RagChatFallbackReason,
  RagChatRequest,
  RagChatResult,
  RetrievedProductContext,
} from "./chat.types";
import { CartActionResponseService } from "./cart-action-response.service";
import { CartCommandService } from "./cart-command.service";
import { CartCommandIntentService } from "./cart-command-intent.service";
import type {
  CartActionResult,
  CartCommandDetection,
} from "./cart-command.types";
import { ChatContextMemoryService } from "./chat-context-memory.service";
import { ClarificationIntentService } from "./clarification-intent.service";
import { ClarificationService } from "./clarification.service";
import type {
  ClarificationDecision,
  PendingClarification,
} from "./clarification.types";
import {
  ComparisonGenerationOutputError,
  ComparisonGenerationService,
  type ComparisonGenerationProductContext,
  type GeneratedComparisonOutput,
} from "./comparison-generation.service";
import {
  ComparisonIntentService,
  type ComparisonIntentResult,
} from "./comparison-intent.service";
import { filterContextsByNegativeConstraints } from "./negative-constraint-filter";
import { NegativeConstraintIntentService } from "./negative-constraint-intent.service";
import type {
  NegativeConstraint,
  NegativeConstraintIntentResult,
} from "./negative-constraint.types";
import { buildRagPrompt, normalizeChatHistory } from "./prompt.builder";
import {
  RagLlmOutputParseError,
  parseRagLlmOutput,
} from "./rag-llm-output.parser";
import {
  RagResponseGenerationService,
  createMinimalRagFallbackAnswer,
} from "./rag-response-generation.service";
import {
  createCacheHitResult,
  type PopularQueryCacheReadInput,
} from "./popular-query-cache.service";
import { PopularQueryCacheCoordinator } from "./popular-query-cache.coordinator";
import type { PopularQueryCache } from "./popular-query-cache.service";
import type {
  PopularQueryCacheVersionReader,
} from "./popular-query-cache-version.service";

export interface RagVectorSearchClient {
  search(input: {
    query: string;
    filters?: VectorSearchFilters;
    topK?: number;
    abortSignal?: AbortSignal;
  }): Promise<VectorSearchHit[]>;
}

export interface RagProductReader {
  findActiveByIds(productIds: string[]): Promise<Product[]>;
  findActiveByText?(text: string, limit: number): Promise<Product[]>;
}

export interface RagCartWriter {
  getCart?(): Promise<CartDto>;
  addItem(input: { productId: string; quantity: number }): Promise<CartDto>;
  updateItem?(
    itemId: string,
    input: { quantity?: number; selected?: boolean },
  ): Promise<CartDto>;
  deleteItem?(itemId: string): Promise<CartDto>;
  selectAll?(selected: boolean): Promise<CartDto>;
}

export type RagCartCommandIntentDetector = Pick<
  CartCommandIntentService,
  "detect"
>;
export type RagCartActionResponder = Pick<
  CartActionResponseService,
  "generate"
>;
export type RagClarificationIntentDetector = Pick<
  ClarificationIntentService,
  "decide"
>;
export type RagNegativeConstraintIntentDetector = Pick<
  NegativeConstraintIntentService,
  "detect"
>;
export type RagComparisonIntentDetector = Pick<
  ComparisonIntentService,
  "detect"
>;
export type RagComparisonGenerator = Pick<
  ComparisonGenerationService,
  "generate"
>;
export type RagResponseGenerator = Pick<
  RagResponseGenerationService,
  "generateNoCandidatesResponse"
>;

export interface RagChatServiceOptions {
  vectorSearch?: RagVectorSearchClient;
  productReader?: RagProductReader;
  cartWriter?: RagCartWriter;
  llmClient?: LlmClient;
  now?: () => Date;
  contextMemoryService?: ChatContextMemoryService;
  clarificationService?: ClarificationService;
  clarificationIntentService?: RagClarificationIntentDetector;
  negativeConstraintIntentService?: RagNegativeConstraintIntentDetector;
  comparisonIntentService?: RagComparisonIntentDetector;
  comparisonGenerationService?: RagComparisonGenerator;
  cartCommandService?: CartCommandService;
  cartCommandIntentService?: RagCartCommandIntentDetector;
  cartActionResponseService?: RagCartActionResponder;
  ragResponseGenerationService?: RagResponseGenerator;
  popularQueryCacheCoordinator?: PopularQueryCacheCoordinator;
  popularQueryCache?: PopularQueryCache;
  popularQueryCacheVersionReader?: PopularQueryCacheVersionReader;
  maxSnippetsPerProduct?: number;
  defaultMaxRecommendedProducts?: number;
  publicImageBaseUrl?: string;
}

interface RetrievedProductCandidate {
  productId: string;
  score: number;
  snippets: string[];
  metadata: VectorSearchHitMetadata;
}

type ComparisonTargetResolution =
  | {
      status: "ready";
      contexts: RetrievedProductContext[];
    }
  | {
      status: "needs_clarification";
      question: string;
      candidateCount?: number;
    };

const DEFAULT_MAX_RECOMMENDED_PRODUCTS = 3;
const DEFAULT_MAX_SNIPPETS_PER_PRODUCT = 3;
const DEFAULT_NEGATIVE_CONSTRAINT_TOP_K = 20;
const RAG_LLM_MAX_COMPLETION_TOKENS = 2000;
const MAX_CHAT_ANSWER_CHARS = 72;
const CART_ACTIVE_PRODUCT_LOOKUP_LIMIT = 8;
const COMPARISON_ACTIVE_PRODUCT_LOOKUP_LIMIT = 4;
const COMPARISON_CATEGORY_SEARCH_TOP_K = 8;
const COMPARISON_PRODUCT_COUNT = 2;

export class RagChatError extends Error {
  readonly code = "INVALID_RAG_CHAT_REQUEST";

  constructor(message: string) {
    super(message);
    this.name = "RagChatError";
  }
}

export class RagChatService {
  private readonly vectorSearch: RagVectorSearchClient;
  private readonly productReader: RagProductReader;
  private readonly cartWriter: RagCartWriter;
  private readonly llmClient: LlmClient;
  private readonly now: () => Date;
  private readonly contextMemoryService: ChatContextMemoryService;
  private readonly clarificationService: ClarificationService;
  private readonly clarificationIntentService: RagClarificationIntentDetector;
  private readonly negativeConstraintIntentService: RagNegativeConstraintIntentDetector;
  private readonly comparisonIntentService: RagComparisonIntentDetector;
  private readonly comparisonGenerationService: RagComparisonGenerator;
  private readonly cartCommandService: CartCommandService;
  private readonly cartCommandIntentService: RagCartCommandIntentDetector;
  private readonly cartActionResponseService: RagCartActionResponder;
  private readonly ragResponseGenerationService: RagResponseGenerator;
  private readonly popularQueryCacheCoordinator: PopularQueryCacheCoordinator;
  private readonly maxSnippetsPerProduct: number;
  private readonly defaultMaxRecommendedProducts: number;
  private readonly publicImageBaseUrl?: string;

  constructor(options: RagChatServiceOptions = {}) {
    this.vectorSearch = options.vectorSearch ?? new VectorSearchService();
    this.productReader = options.productReader ?? createDefaultProductReader();
    this.cartWriter = options.cartWriter ?? new CartService();
    this.llmClient = options.llmClient ?? createLlmClient();
    this.now = options.now ?? (() => new Date());
    this.contextMemoryService =
      options.contextMemoryService
      ?? new ChatContextMemoryService({ now: this.now });
    this.clarificationService =
      options.clarificationService ?? new ClarificationService();
    this.clarificationIntentService =
      options.clarificationIntentService
      ?? new ClarificationIntentService({
        llmClient: this.llmClient,
        clarificationService: this.clarificationService,
      });
    this.negativeConstraintIntentService =
      options.negativeConstraintIntentService
      ?? new NegativeConstraintIntentService({
        llmClient: this.llmClient,
      });
    this.comparisonIntentService =
      options.comparisonIntentService
      ?? new ComparisonIntentService({
        llmClient: this.llmClient,
      });
    this.comparisonGenerationService =
      options.comparisonGenerationService
      ?? new ComparisonGenerationService({
        llmClient: this.llmClient,
      });
    this.cartCommandService =
      options.cartCommandService ?? new CartCommandService();
    this.cartCommandIntentService =
      options.cartCommandIntentService
      ?? new CartCommandIntentService({
        llmClient: this.llmClient,
        cartCommandService: this.cartCommandService,
      });
    this.cartActionResponseService =
      options.cartActionResponseService
      ?? new CartActionResponseService({ llmClient: this.llmClient });
    this.ragResponseGenerationService =
      options.ragResponseGenerationService
      ?? new RagResponseGenerationService({ llmClient: this.llmClient });
    this.popularQueryCacheCoordinator =
      options.popularQueryCacheCoordinator
      ?? new PopularQueryCacheCoordinator({
        popularQueryCache: options.popularQueryCache,
        popularQueryCacheVersionReader: options.popularQueryCacheVersionReader,
      });
    this.maxSnippetsPerProduct =
      options.maxSnippetsPerProduct ?? DEFAULT_MAX_SNIPPETS_PER_PRODUCT;
    this.defaultMaxRecommendedProducts =
      options.defaultMaxRecommendedProducts ?? DEFAULT_MAX_RECOMMENDED_PRODUCTS;
    this.publicImageBaseUrl =
      options.publicImageBaseUrl ?? getEnv().publicImageBaseUrl;
  }

  async answer(input: RagChatRequest): Promise<RagChatResult> {
    const question = input.question.trim();

    if (question.length === 0) {
      throw new RagChatError("question cannot be empty.");
    }

    const maxRecommendedProducts = normalizeMaxRecommendedProducts(
      input.maxRecommendedProducts,
      this.defaultMaxRecommendedProducts,
    );
    let memoryResolution = this.contextMemoryService.resolve({
      conversationId: input.conversationId,
      question,
      filters: input.filters,
    });
    const cartSnapshot = await this.readCartSnapshot(input.abortSignal);
    const cartCommandDetection = await this.cartCommandIntentService.detect({
      question,
      contextMemory: memoryResolution.contextMemory,
      cartSnapshot,
      requestId: input.requestId,
      abortSignal: input.abortSignal,
    });
    throwIfAborted(input.abortSignal);

    if (cartCommandDetection.isCartCommand) {
      return this.withContextMemory(
        memoryResolution,
        await this.answerCartCommand(
          cartCommandDetection,
          memoryResolution.contextMemory?.lastRecommendedProductIds ?? [],
          cartSnapshot,
          {
            question,
            requestId: input.requestId,
            abortSignal: input.abortSignal,
          },
        ),
      );
    }

    const negativeConstraintIntent =
      await this.negativeConstraintIntentService.detect({
        question,
        shortHistory: input.shortHistory,
        contextMemory: memoryResolution.contextMemory,
        filters: memoryResolution.filters,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });
    throwIfAborted(input.abortSignal);
    memoryResolution = this.applyNegativeConstraintIntent(
      memoryResolution,
      negativeConstraintIntent,
    );

    if (
      negativeConstraintIntent.needsClarification
      && negativeConstraintIntent.clarificationQuestion?.trim()
    ) {
      return this.withContextMemory(
        memoryResolution,
        createClarificationResult({
          needsClarification: true,
          question: negativeConstraintIntent.clarificationQuestion,
          missingSlots: [],
        }),
        {
          pendingClarification: {
            originalQuestion: question,
            missingSlots: [],
          },
        },
      );
    }

    const comparisonIntent = await this.comparisonIntentService.detect({
      question,
      shortHistory: input.shortHistory,
      contextMemory: memoryResolution.contextMemory,
      filters: memoryResolution.filters,
      recentProductIds:
        memoryResolution.contextMemory?.lastRecommendedProductIds ?? [],
      requestId: input.requestId,
      abortSignal: input.abortSignal,
    });
    throwIfAborted(input.abortSignal);

    if (comparisonIntent.isComparison) {
      return this.withContextMemory(
        memoryResolution,
        await this.answerComparison(
          comparisonIntent,
          memoryResolution,
          {
            question,
            shortHistory: input.shortHistory,
            filters: memoryResolution.filters,
            requestId: input.requestId,
            abortSignal: input.abortSignal,
          },
        ),
        comparisonIntent.needsClarification
          ? {
              pendingClarification: {
                originalQuestion: question,
                missingSlots: [],
              },
            }
          : undefined,
      );
    }

    const clarificationDecision = await this.clarificationIntentService.decide({
      question,
      contextMemory: memoryResolution.contextMemory,
      filters: memoryResolution.filters,
      requestId: input.requestId,
      abortSignal: input.abortSignal,
    });
    throwIfAborted(input.abortSignal);

    if (
      clarificationDecision.needsClarification
      && clarificationDecision.question?.trim()
    ) {
      return this.withContextMemory(
        memoryResolution,
        createClarificationResult(clarificationDecision),
        {
          pendingClarification: {
            originalQuestion: question,
            missingSlots: clarificationDecision.missingSlots,
          },
        },
      );
    }

    const negativeConstraints = memoryResolution.negativeConstraints ?? [];
    const cacheInput = await this.popularQueryCacheCoordinator.createInput({
      question,
      request: input,
      memoryResolution,
      maxRecommendedProducts,
    });
    const cacheHit = await this.popularQueryCacheCoordinator.read(cacheInput);
    throwIfAborted(input.abortSignal);

    if (cacheHit) {
      const cacheHitProducts = orderProductsByIds(
        await this.productReader.findActiveByIds(cacheHit.recommendedProductIds),
        cacheHit.recommendedProductIds,
      );

      if (cacheHitProducts.length === cacheHit.recommendedProductIds.length) {
        return this.withContextMemory(
          memoryResolution,
          createCacheHitResult(
            cacheHit,
            cacheHitProducts,
            cacheHitProducts.map((product) =>
              mapProductToCardDto(product, {
                publicImageBaseUrl: this.publicImageBaseUrl,
              })
            ),
          ),
        );
      }

      await this.popularQueryCacheCoordinator.delete(cacheInput);
    }

    const hits = await this.vectorSearch.search({
      query: memoryResolution.retrievalQuery,
      filters: memoryResolution.filters,
      topK: resolveVectorSearchTopK(input.topK, negativeConstraints),
      abortSignal: input.abortSignal,
    });
    throwIfAborted(input.abortSignal);
    const candidates = dedupeVectorHits(hits, this.maxSnippetsPerProduct);

    if (candidates.length === 0) {
      return this.answerNoCandidates({
        cacheInput,
        memoryResolution,
        question,
        request: input,
      });
    }

    const products = await this.productReader.findActiveByIds(
      candidates.map((candidate) => candidate.productId),
    );
    const contexts = filterContextsByNegativeConstraints(
      createRetrievedContexts(candidates, products),
      negativeConstraints,
    );

    if (contexts.length === 0) {
      return this.answerNoCandidates({
        cacheInput,
        memoryResolution,
        question,
        request: input,
      });
    }

    try {
      const response = await this.llmClient.generate({
        messages: buildRagPrompt({
          question,
          shortHistory: normalizeChatHistory(input.shortHistory ?? []),
          contextMemory: memoryResolution.contextMemory,
          negativeConstraints,
          candidates: contexts,
          generatedAt: this.now(),
        }),
        maxCompletionTokens: RAG_LLM_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });
      const parsed = parseRagLlmOutput(
        response.text,
        contexts.map((context) => context.product.id),
      );
      throwIfAborted(input.abortSignal);
      const recommendedProductIds = parsed.recommendedProductIds.slice(
        0,
        maxRecommendedProducts,
      );

      if (recommendedProductIds.length === 0) {
        return this.popularQueryCacheCoordinator.write(
          cacheInput,
          this.withContextMemory(
            memoryResolution,
            createRetrievedFallbackResult(
              contexts,
              maxRecommendedProducts,
              "NO_VALID_PRODUCT_IDS",
              this.publicImageBaseUrl,
            ),
          ),
        );
      }

      return this.popularQueryCacheCoordinator.write(
        cacheInput,
        this.withContextMemory(
          memoryResolution,
          createSuccessResult(
            compactAnswer(parsed.answer),
            recommendedProductIds,
            contexts,
            this.publicImageBaseUrl,
          ),
        ),
      );
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return this.popularQueryCacheCoordinator.write(
        cacheInput,
        this.withContextMemory(
          memoryResolution,
          createRetrievedFallbackResult(
            contexts,
            maxRecommendedProducts,
            error instanceof RagLlmOutputParseError
              ? "LLM_INVALID_OUTPUT"
              : "LLM_ERROR",
            this.publicImageBaseUrl,
          ),
        ),
      );
    }
  }

  private async answerNoCandidates(input: {
    cacheInput: PopularQueryCacheReadInput;
    memoryResolution: ReturnType<ChatContextMemoryService["resolve"]>;
    question: string;
    request: Pick<RagChatRequest, "requestId" | "abortSignal">;
  }): Promise<RagChatResult> {
    const noCandidatesResponse =
      await this.ragResponseGenerationService.generateNoCandidatesResponse({
        question: input.question,
        filters: input.memoryResolution.filters,
        contextMemory: input.memoryResolution.contextMemory,
        requestId: input.request.requestId,
        abortSignal: input.request.abortSignal,
      });
    throwIfAborted(input.request.abortSignal);
    const result = this.withContextMemory(
      input.memoryResolution,
      createNoCandidatesResult(noCandidatesResponse.answer),
    );

    return noCandidatesResponse.generatedByLlm
      ? this.popularQueryCacheCoordinator.write(input.cacheInput, result)
      : result;
  }

  private async readCartSnapshot(
    abortSignal?: AbortSignal,
  ): Promise<CartDto | undefined> {
    if (!this.cartWriter.getCart) {
      return undefined;
    }

    try {
      throwIfAborted(abortSignal);
      const cart = await this.cartWriter.getCart();
      throwIfAborted(abortSignal);
      return cart;
    } catch (error) {
      rethrowIfAborted(abortSignal, error);
      return undefined;
    }
  }

  private applyNegativeConstraintIntent(
    memoryResolution: ReturnType<ChatContextMemoryService["resolve"]>,
    intent: NegativeConstraintIntentResult,
  ): ReturnType<ChatContextMemoryService["resolve"]> {
    if (!intent.hasNegativeConstraints) {
      return memoryResolution;
    }

    return this.contextMemoryService.applyNegativeConstraints(
      memoryResolution,
      intent.constraints,
    );
  }

  private withContextMemory(
    memoryResolution: ReturnType<ChatContextMemoryService["resolve"]>,
    result: RagChatResult,
    options: { pendingClarification?: PendingClarification } = {},
  ): RagChatResult {
    const contextMemory = this.contextMemoryService.commit(
      memoryResolution,
      result.recommendedProductIds,
      options,
    );

    return contextMemory
      ? { ...result, contextMemory }
      : result;
  }

  private async answerComparison(
    intent: ComparisonIntentResult,
    memoryResolution: ReturnType<ChatContextMemoryService["resolve"]>,
    request: Pick<
      RagChatRequest,
      "question" | "shortHistory" | "filters" | "requestId" | "abortSignal"
    >,
  ): Promise<RagChatResult> {
    if (intent.needsClarification && intent.clarificationQuestion?.trim()) {
      return createClarificationResult({
        needsClarification: true,
        question: intent.clarificationQuestion,
        missingSlots: [],
      });
    }

    const targetResolution = await this.resolveComparisonTargets(
      intent,
      memoryResolution,
      request,
    );
    throwIfAborted(request.abortSignal);

    if (targetResolution.status === "needs_clarification") {
      return createClarificationResult({
        needsClarification: true,
        question: targetResolution.question,
        missingSlots: [],
      });
    }

    const contexts = targetResolution.contexts.slice(0, COMPARISON_PRODUCT_COUNT);
    const productCards = this.mapProductsToCards(
      contexts.map((context) => context.product),
    );
    const recommendedProductIds = productCards.map((card) => card.id);
    const baseRetrieval = {
      candidateCount: targetResolution.contexts.length,
      returnedProductIds: recommendedProductIds,
    };

    try {
      const generated = await this.comparisonGenerationService.generate({
        question: request.question,
        shortHistory: request.shortHistory,
        contextMemory: memoryResolution.contextMemory,
        userPriority: intent.userPriority,
        products: contexts.map(toComparisonGenerationProductContext),
        generatedAt: this.now(),
        requestId: request.requestId,
        abortSignal: request.abortSignal,
      });
      throwIfAborted(request.abortSignal);

      return createComparisonSuccessResult({
        generated,
        query: request.question,
        contexts,
        publicImageBaseUrl: this.publicImageBaseUrl,
      });
    } catch (error) {
      rethrowIfAborted(request.abortSignal, error);
      return {
        answer: error instanceof ComparisonGenerationOutputError
          ? createMinimalRagFallbackAnswer("LLM_INVALID_OUTPUT")
          : createMinimalRagFallbackAnswer("LLM_ERROR"),
        recommendedProductIds,
        productCards,
        fallbackUsed: true,
        fallbackReason: error instanceof ComparisonGenerationOutputError
          ? "LLM_INVALID_OUTPUT"
          : "LLM_ERROR",
        retrieval: baseRetrieval,
      };
    }
  }

  private async resolveComparisonTargets(
    intent: ComparisonIntentResult,
    memoryResolution: ReturnType<ChatContextMemoryService["resolve"]>,
    request: Pick<
      RagChatRequest,
      "question" | "filters" | "abortSignal"
    >,
  ): Promise<ComparisonTargetResolution> {
    const negativeConstraints = memoryResolution.negativeConstraints ?? [];

    switch (intent.target.kind) {
      case "recent_recommendations":
        return this.resolveRecentComparisonTargets(
          intent,
          memoryResolution.contextMemory?.lastRecommendedProductIds ?? [],
          negativeConstraints,
          request.abortSignal,
        );
      case "names":
        return this.resolveNamedComparisonTargets(
          intent,
          negativeConstraints,
          request.abortSignal,
        );
      case "category_search":
        return this.resolveCategoryComparisonTargets(
          request.question,
          request.filters,
          negativeConstraints,
          request.abortSignal,
        );
      case "unknown":
        return {
          status: "needs_clarification",
          question: intent.clarificationQuestion
            ?? "你想对比哪几款商品？可以说“对比第一款和第二款”。",
        };
    }
  }

  private async resolveRecentComparisonTargets(
    intent: ComparisonIntentResult,
    recentProductIds: string[],
    negativeConstraints: readonly NegativeConstraint[],
    abortSignal?: AbortSignal,
  ): Promise<ComparisonTargetResolution> {
    if (intent.target.ordinals.length > COMPARISON_PRODUCT_COUNT) {
      return {
        status: "needs_clarification",
        question: intent.clarificationQuestion
          ?? "目前只支持两款商品对比，请从这些商品里选两款。",
      };
    }

    const recentIds = uniqueNonEmptyIds(recentProductIds);
    if (
      intent.target.ordinals.length === 0
      && recentIds.length > COMPARISON_PRODUCT_COUNT
    ) {
      return {
        status: "needs_clarification",
        question: intent.clarificationQuestion
          ?? "目前只支持两款商品对比，请从这些商品里选两款。",
      };
    }

    const selectedIds = intent.target.ordinals.length > 0
      ? intent.target.ordinals.flatMap((ordinal) => {
          const productId = recentProductIds[ordinal - 1];

          return productId ? [productId] : [];
        })
      : recentIds;
    const uniqueSelectedIds = uniqueNonEmptyIds(selectedIds);

    if (uniqueSelectedIds.length < 2) {
      return {
        status: "needs_clarification",
        question: intent.clarificationQuestion
          ?? "最近推荐里还不够两款可对比商品，你想对比哪几款？",
      };
    }

    const products = orderProductsByIds(
      await this.productReader.findActiveByIds(uniqueSelectedIds),
      uniqueSelectedIds,
    );
    throwIfAborted(abortSignal);
    const contexts = filterContextsByNegativeConstraints(
      createComparisonContextsFromProducts(products),
      negativeConstraints,
    );

    if (contexts.length < 2) {
      return {
        status: "needs_clarification",
        question: intent.clarificationQuestion
          ?? "这些商品里可用于对比的库内商品不足两款，请再指定要对比的商品。",
      };
    }

    return {
      status: "ready",
      contexts,
    };
  }

  private async resolveNamedComparisonTargets(
    intent: ComparisonIntentResult,
    negativeConstraints: readonly NegativeConstraint[],
    abortSignal?: AbortSignal,
  ): Promise<ComparisonTargetResolution> {
    if (!this.productReader.findActiveByText || intent.target.names.length === 0) {
      return {
        status: "needs_clarification",
        question: intent.clarificationQuestion
          ?? "你想对比哪几款具体商品？可以补充商品名或品牌名。",
      };
    }

    if (intent.target.names.length > COMPARISON_PRODUCT_COUNT) {
      return {
        status: "needs_clarification",
        question: intent.clarificationQuestion
          ?? "目前只支持两款商品对比，请从这些商品里选两款。",
      };
    }

    const products: Product[] = [];

    for (const name of intent.target.names) {
      throwIfAborted(abortSignal);
      const matches = await this.productReader.findActiveByText(
        name,
        COMPARISON_ACTIVE_PRODUCT_LOOKUP_LIMIT,
      );
      throwIfAborted(abortSignal);

      if (matches.length !== 1) {
        return {
          status: "needs_clarification",
          question: intent.clarificationQuestion
            ?? `“${name}”匹配到的商品不唯一，请说出更完整的商品名。`,
          candidateCount: matches.length,
        };
      }

      products.push(matches[0]);
    }

    const contexts = filterContextsByNegativeConstraints(
      createComparisonContextsFromProducts(dedupeProductsById(products)),
      negativeConstraints,
    );

    if (contexts.length < 2) {
      return {
        status: "needs_clarification",
        question: intent.clarificationQuestion
          ?? "可用于对比的库内商品不足两款，请再补充一个商品名。",
      };
    }

    return {
      status: "ready",
      contexts,
    };
  }

  private async resolveCategoryComparisonTargets(
    question: string,
    filters: VectorSearchFilters | undefined,
    negativeConstraints: readonly NegativeConstraint[],
    abortSignal?: AbortSignal,
  ): Promise<ComparisonTargetResolution> {
    const hits = await this.vectorSearch.search({
      query: question,
      filters,
      topK: COMPARISON_CATEGORY_SEARCH_TOP_K,
      abortSignal,
    });
    throwIfAborted(abortSignal);
    const candidates = dedupeVectorHits(hits, this.maxSnippetsPerProduct);
    const products = await this.productReader.findActiveByIds(
      candidates.map((candidate) => candidate.productId),
    );
    throwIfAborted(abortSignal);
    const contexts = filterContextsByNegativeConstraints(
      createRetrievedContexts(candidates, products),
      negativeConstraints,
    ).slice(0, COMPARISON_PRODUCT_COUNT);

    if (contexts.length < 2) {
      return {
        status: "needs_clarification",
        question: "我还需要至少两款可对比的库内商品，你想按哪几款来比？",
        candidateCount: contexts.length,
      };
    }

    return {
      status: "ready",
      contexts,
    };
  }

  private async answerCartCommand(
    detection: Extract<CartCommandDetection, { isCartCommand: true }>,
    recentProductIds: string[],
    cartSnapshot: CartDto | undefined,
    request: Pick<RagChatRequest, "question" | "requestId" | "abortSignal">,
  ): Promise<RagChatResult> {
    let products = await this.readRecentProductsForCartAction(
      detection.action,
      recentProductIds,
      request.abortSignal,
    );
    throwIfAborted(request.abortSignal);
    let productCards = this.mapProductsToCards(products);
    let recommendedProductIds = productCards.map((card) => card.id);
    const createResult = async (input: {
      cartAction: CartActionResult;
      fallbackReason?: RagChatFallbackReason;
      fallbackUsed?: boolean;
      retrieval: RagChatResult["retrieval"];
      productCards?: ReturnType<typeof mapProductToCardDto>[];
      recommendedProductIds?: string[];
    }) => createCartCommandResult({
      answer: await this.cartActionResponseService.generate({
        question: request.question,
        intent: detection,
        cartAction: input.cartAction,
        fallbackReason: input.fallbackReason as
          | Parameters<RagCartActionResponder["generate"]>[0]["fallbackReason"]
          | undefined,
        recentProducts: products,
        cartSnapshot,
        requestId: request.requestId,
        abortSignal: request.abortSignal,
      }),
      productCards: input.productCards ?? [],
      recommendedProductIds: input.recommendedProductIds ?? recommendedProductIds,
      fallbackUsed: input.fallbackUsed,
      fallbackReason: input.fallbackReason,
      retrieval: input.retrieval,
      cartAction: input.cartAction,
    });

    if (detection.confidence === "low") {
      return createResult({
        cartAction: {
          type: detection.action,
          status: "needs_target",
          quantity: detection.quantity,
          selected: detection.selected,
          message: detection.clarificationQuestion ?? "intent_unclear",
        },
        fallbackReason: "CART_INTENT_UNCLEAR",
        retrieval: createCartRetrieval(cartSnapshot),
      });
    }

    if (detection.needsConfirmation || detection.action === "clear") {
      return createResult({
        cartAction: {
          type: detection.action,
          status: "needs_confirmation",
          quantity: detection.quantity,
          selected: detection.selected,
          cartSummary: cartSnapshot?.summary,
          message: detection.clarificationQuestion ?? "confirmation_required",
        },
        fallbackReason: "CART_CONFIRMATION_REQUIRED",
        retrieval: createCartRetrieval(cartSnapshot),
      });
    }

    let resolvedTarget = this.cartCommandService.resolveTarget({
      detection,
      products,
    });

    if (shouldLookupActiveProductForCartAdd(detection, resolvedTarget.status)) {
      const activeProducts = await this.readActiveProductsForCartAdd(
        detection.target.text,
        request.abortSignal,
      );

      if (activeProducts.length > 0) {
        products = activeProducts;
        productCards = this.mapProductsToCards(products);
        recommendedProductIds = productCards.map((card) => card.id);
        resolvedTarget = this.cartCommandService.resolveTarget({
          detection,
          products,
        });
      }
    }

    const baseRetrieval = {
      candidateCount: products.length,
      returnedProductIds: recommendedProductIds,
    };

    if (detection.action !== "add") {
      return this.answerCartManagementCommand({
        detection,
        recentProducts: products,
        recentProductIds: recommendedProductIds,
        cartSnapshot,
        request,
      });
    }

    if (resolvedTarget.status === "missing") {
      const quantity = detection.quantity ?? MIN_CART_QUANTITY;
      const cartAction: CartActionResult = {
        type: "add",
        status: "needs_target",
        quantity,
        message: "缺少可加购的推荐商品",
      };

      return createResult({
        cartAction,
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_TARGET_MISSING",
        retrieval: baseRetrieval,
      });
    }

    if (detection.quantity === undefined) {
      const cartAction: CartActionResult = {
        type: "add",
        status: "needs_target",
        message: "quantity_missing",
      };

      return createResult({
        cartAction,
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_TARGET_MISSING",
        retrieval: baseRetrieval,
      });
    }

    if (resolvedTarget.status === "ambiguous") {
      const cartAction: CartActionResult = {
        type: "add",
        status: "needs_target",
        quantity: detection.quantity,
        message: "需要确认要加入购物车的商品",
      };

      return createResult({
        cartAction,
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_TARGET_AMBIGUOUS",
        retrieval: baseRetrieval,
      });
    }

    if (resolvedTarget.status === "not_found" || !resolvedTarget.product) {
      const cartAction: CartActionResult = {
        type: "add",
        status: "not_found",
        quantity: detection.quantity,
        message: "最近推荐里没有匹配商品",
      };

      return createResult({
        cartAction,
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_TARGET_MISSING",
        retrieval: baseRetrieval,
      });
    }

    try {
      throwIfAborted(request.abortSignal);
      await this.cartWriter.addItem({
        productId: resolvedTarget.product.id,
        quantity: detection.quantity,
      });
      throwIfAborted(request.abortSignal);
      const cartAction: CartActionResult = {
        type: "add",
        status: "success",
        productId: resolvedTarget.product.id,
        productName: resolvedTarget.product.name,
        quantity: detection.quantity,
        message: "已加入购物车",
      };

      return createResult({
        cartAction,
        productCards,
        recommendedProductIds,
        fallbackUsed: false,
        retrieval: baseRetrieval,
      });
    } catch (error) {
      rethrowIfAborted(request.abortSignal, error);
      const cartAction = mapCartAddErrorToAction(
        error,
        resolvedTarget.product,
        detection.quantity,
      );

      return createResult({
        cartAction,
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_ADD_FAILED",
        retrieval: baseRetrieval,
      });
    }
  }

  private async readRecentProductsForCartAction(
    action: Extract<CartCommandDetection, { isCartCommand: true }>["action"],
    recentProductIds: string[],
    abortSignal?: AbortSignal,
  ): Promise<Product[]> {
    if (recentProductIds.length === 0) {
      return [];
    }

    try {
      return orderProductsByIds(
        await this.productReader.findActiveByIds(recentProductIds),
        recentProductIds,
      );
    } catch (error) {
      rethrowIfAborted(abortSignal, error);

      if (action === "add") {
        throw error;
      }

      return [];
    }
  }

  private async readActiveProductsForCartAdd(
    targetText: string,
    abortSignal?: AbortSignal,
  ): Promise<Product[]> {
    if (!this.productReader.findActiveByText) {
      return [];
    }

    try {
      throwIfAborted(abortSignal);
      const products = await this.productReader.findActiveByText(
        targetText,
        CART_ACTIVE_PRODUCT_LOOKUP_LIMIT,
      );
      throwIfAborted(abortSignal);
      return products;
    } catch (error) {
      rethrowIfAborted(abortSignal, error);
      return [];
    }
  }

  private mapProductsToCards(
    products: Product[],
  ): ReturnType<typeof mapProductToCardDto>[] {
    return products.map((product) =>
      mapProductToCardDto(product, { publicImageBaseUrl: this.publicImageBaseUrl })
    );
  }

  private async answerCartManagementCommand(input: {
    detection: Extract<CartCommandDetection, { isCartCommand: true }>;
    recentProducts: Product[];
    recentProductIds: string[];
    cartSnapshot: CartDto | undefined;
    request: Pick<RagChatRequest, "question" | "requestId" | "abortSignal">;
  }): Promise<RagChatResult> {
    const createResult = async (resultInput: {
      cartAction: CartActionResult;
      fallbackReason?: RagChatFallbackReason;
      fallbackUsed?: boolean;
      retrieval?: RagChatResult["retrieval"];
    }) => createCartCommandResult({
      answer: await this.cartActionResponseService.generate({
        question: input.request.question,
        intent: input.detection,
        cartAction: resultInput.cartAction,
        fallbackReason: resultInput.fallbackReason as
          | Parameters<RagCartActionResponder["generate"]>[0]["fallbackReason"]
          | undefined,
        recentProducts: input.recentProducts,
        cartSnapshot: input.cartSnapshot,
        requestId: input.request.requestId,
        abortSignal: input.request.abortSignal,
      }),
      productCards: [],
      recommendedProductIds: input.recentProductIds,
      fallbackUsed: resultInput.fallbackUsed,
      fallbackReason: resultInput.fallbackReason,
      retrieval: resultInput.retrieval ?? createCartRetrieval(input.cartSnapshot),
      cartAction: resultInput.cartAction,
    });

    const cartSnapshot = input.cartSnapshot;

    if (!cartSnapshot) {
      return createResult({
        cartAction: {
          type: input.detection.action,
          status: "failed",
          quantity: input.detection.quantity,
          selected: input.detection.selected,
          message: "cart_snapshot_unavailable",
        },
        fallbackReason: "CART_SNAPSHOT_UNAVAILABLE",
      });
    }

    if (input.detection.action === "inspect") {
      return createResult({
        cartAction: {
          type: "inspect",
          status: "success",
          cartSummary: cartSnapshot.summary,
          message: "cart_snapshot_ready",
        },
        fallbackUsed: false,
      });
    }

    if (
      input.detection.action === "update_quantity"
      && input.detection.quantity === undefined
    ) {
      return createResult({
        cartAction: {
          type: "update_quantity",
          status: "needs_target",
          message: "quantity_missing_or_invalid",
        },
        fallbackReason: "CART_TARGET_MISSING",
      });
    }

    if (
      input.detection.action === "update_selected"
      && input.detection.selected === undefined
    ) {
      return createResult({
        cartAction: {
          type: "update_selected",
          status: "needs_target",
          message: "selected_missing",
        },
        fallbackReason: "CART_TARGET_MISSING",
      });
    }

    const resolvedTarget = this.cartCommandService.resolveCartTarget({
      detection: input.detection,
      cart: cartSnapshot,
    });

    if (resolvedTarget.status === "missing") {
      return createResult({
        cartAction: {
          type: input.detection.action,
          status: "needs_target",
          quantity: input.detection.quantity,
          selected: input.detection.selected,
          cartSummary: cartSnapshot.summary,
          message: "cart_empty",
        },
        fallbackReason: "CART_TARGET_MISSING",
      });
    }

    if (resolvedTarget.status === "ambiguous") {
      return createResult({
        cartAction: {
          type: input.detection.action,
          status: "needs_target",
          quantity: input.detection.quantity,
          selected: input.detection.selected,
          cartSummary: cartSnapshot.summary,
          message: "target_ambiguous",
        },
        fallbackReason: "CART_TARGET_AMBIGUOUS",
      });
    }

    if (resolvedTarget.status === "not_found") {
      return createResult({
        cartAction: {
          type: input.detection.action,
          status: "not_found",
          quantity: input.detection.quantity,
          selected: input.detection.selected,
          cartSummary: cartSnapshot.summary,
          message: "target_not_found",
        },
        fallbackReason: "CART_TARGET_MISSING",
      });
    }

    if (resolvedTarget.status === "all") {
      return this.applyAllCartTarget({ ...input, cartSnapshot }, createResult);
    }

    if (!resolvedTarget.item) {
      return createResult({
        cartAction: {
          type: input.detection.action,
          status: "not_found",
          quantity: input.detection.quantity,
          selected: input.detection.selected,
          cartSummary: cartSnapshot.summary,
          message: "target_not_found",
        },
        fallbackReason: "CART_TARGET_MISSING",
      });
    }

    try {
      throwIfAborted(input.request.abortSignal);
      const cart = await this.applyCartItemMutation(
        input.detection,
        resolvedTarget.item.id,
      );
      throwIfAborted(input.request.abortSignal);

      return createResult({
        cartAction: createSuccessCartItemAction(
          input.detection,
          resolvedTarget.item,
          cart.summary,
        ),
        fallbackUsed: false,
        retrieval: createCartRetrieval(cart),
      });
    } catch (error) {
      rethrowIfAborted(input.request.abortSignal, error);
      return createResult({
        cartAction: mapCartMutationErrorToAction(
          error,
          input.detection,
          resolvedTarget.item,
          cartSnapshot.summary,
        ),
        fallbackReason: "CART_ACTION_FAILED",
      });
    }
  }

  private async applyAllCartTarget(
    input: {
      detection: Extract<CartCommandDetection, { isCartCommand: true }>;
      cartSnapshot: CartDto;
      request: Pick<RagChatRequest, "abortSignal">;
    },
    createResult: (resultInput: {
      cartAction: CartActionResult;
      fallbackReason?: RagChatFallbackReason;
      fallbackUsed?: boolean;
      retrieval?: RagChatResult["retrieval"];
    }) => Promise<RagChatResult>,
  ): Promise<RagChatResult> {
    if (input.detection.action !== "update_selected") {
      return createResult({
        cartAction: {
          type: input.detection.action,
          status: "needs_confirmation",
          cartSummary: input.cartSnapshot.summary,
          message: "all_target_requires_confirmation",
        },
        fallbackReason: "CART_CONFIRMATION_REQUIRED",
      });
    }

    if (input.detection.selected === undefined) {
      return createResult({
        cartAction: {
          type: "update_selected",
          status: "needs_target",
          cartSummary: input.cartSnapshot.summary,
          message: "selected_missing",
        },
        fallbackReason: "CART_TARGET_MISSING",
      });
    }

    if (!this.cartWriter.selectAll) {
      return createResult({
        cartAction: {
          type: "update_selected",
          status: "failed",
          selected: input.detection.selected,
          cartSummary: input.cartSnapshot.summary,
          message: "cart_select_all_unavailable",
        },
        fallbackReason: "CART_ACTION_FAILED",
      });
    }

    try {
      throwIfAborted(input.request.abortSignal);
      const cart = await this.cartWriter.selectAll(input.detection.selected);
      throwIfAborted(input.request.abortSignal);
      return createResult({
        cartAction: {
          type: "update_selected",
          status: "success",
          selected: input.detection.selected,
          cartSummary: cart.summary,
          message: "selection_updated",
        },
        fallbackUsed: false,
        retrieval: createCartRetrieval(cart),
      });
    } catch (error) {
      rethrowIfAborted(input.request.abortSignal, error);
      return createResult({
        cartAction: {
          type: "update_selected",
          status: "failed",
          selected: input.detection.selected,
          cartSummary: input.cartSnapshot.summary,
          message: "cart_action_failed",
        },
        fallbackReason: "CART_ACTION_FAILED",
      });
    }
  }

  private async applyCartItemMutation(
    detection: Extract<CartCommandDetection, { isCartCommand: true }>,
    itemId: string,
  ): Promise<CartDto> {
    if (detection.action === "remove") {
      if (!this.cartWriter.deleteItem) {
        throw new CartRequestError("deleteItem is not available");
      }

      return this.cartWriter.deleteItem(itemId);
    }

    if (detection.action === "update_quantity") {
      if (!this.cartWriter.updateItem || detection.quantity === undefined) {
        throw new CartRequestError("updateItem quantity is not available");
      }

      return this.cartWriter.updateItem(itemId, { quantity: detection.quantity });
    }

    if (detection.action === "update_selected") {
      if (!this.cartWriter.updateItem || detection.selected === undefined) {
        throw new CartRequestError("updateItem selected is not available");
      }

      return this.cartWriter.updateItem(itemId, { selected: detection.selected });
    }

    throw new CartRequestError(`Unsupported cart action: ${detection.action}`);
  }
}

function createClarificationResult(
  decision: ClarificationDecision,
): RagChatResult {
  return {
    answer: decision.question ?? "",
    recommendedProductIds: [],
    productCards: [],
    fallbackUsed: true,
    fallbackReason: "NEEDS_CLARIFICATION",
    clarification: {
      missingSlots: decision.missingSlots,
    },
    retrieval: {
      candidateCount: 0,
      returnedProductIds: [],
    },
  };
}

function createDefaultProductReader(): RagProductReader {
  return {
    findActiveByIds: (productIds) =>
      findActiveProductsByIds(getDatabasePool(), productIds),
    findActiveByText: (text, limit) =>
      findProducts(getDatabasePool(), {
        q: text,
        limit,
        offset: 0,
      }),
  };
}

function shouldLookupActiveProductForCartAdd(
  detection: Extract<CartCommandDetection, { isCartCommand: true }>,
  resolvedStatus: "found" | "missing" | "ambiguous" | "not_found",
): detection is Extract<CartCommandDetection, { isCartCommand: true }> & {
  target: { kind: "name"; text: string };
} {
  return detection.action === "add"
    && detection.target.kind === "name"
    && (resolvedStatus === "missing" || resolvedStatus === "not_found");
}

function orderProductsByIds(
  products: Product[],
  productIds: string[],
): Product[] {
  const productsById = new Map(products.map((product) => [product.id, product]));

  return productIds.flatMap((productId) => {
    const product = productsById.get(productId);

    return product ? [product] : [];
  });
}

function uniqueNonEmptyIds(productIds: string[]): string[] {
  const seen = new Set<string>();
  const uniqueIds: string[] = [];

  for (const rawProductId of productIds) {
    const productId = rawProductId.trim();

    if (!productId || seen.has(productId)) {
      continue;
    }

    seen.add(productId);
    uniqueIds.push(productId);
  }

  return uniqueIds;
}

function dedupeProductsById(products: Product[]): Product[] {
  const seen = new Set<string>();
  const deduped: Product[] = [];

  for (const product of products) {
    if (seen.has(product.id)) {
      continue;
    }

    seen.add(product.id);
    deduped.push(product);
  }

  return deduped;
}

function dedupeVectorHits(
  hits: VectorSearchHit[],
  maxSnippetsPerProduct: number,
): RetrievedProductCandidate[] {
  const candidatesById = new Map<string, RetrievedProductCandidate>();

  for (const hit of hits) {
    const existing = candidatesById.get(hit.productId);

    if (!existing) {
      candidatesById.set(hit.productId, {
        productId: hit.productId,
        score: hit.score,
        snippets: nonEmptyUniqueSnippets([], hit.snippet, maxSnippetsPerProduct),
        metadata: hit.metadata,
      });
      continue;
    }

    existing.snippets = nonEmptyUniqueSnippets(
      existing.snippets,
      hit.snippet,
      maxSnippetsPerProduct,
    );

    if (hit.score > existing.score) {
      existing.score = hit.score;
      existing.metadata = hit.metadata;
    }
  }

  return [...candidatesById.values()];
}

function nonEmptyUniqueSnippets(
  current: string[],
  nextSnippet: string,
  maxSnippets: number,
): string[] {
  const snippet = nextSnippet.trim();

  if (
    snippet.length === 0
    || current.includes(snippet)
    || current.length >= maxSnippets
  ) {
    return current;
  }

  return [...current, snippet];
}

function createRetrievedContexts(
  candidates: RetrievedProductCandidate[],
  products: Product[],
): RetrievedProductContext[] {
  const productsById = new Map(products.map((product) => [product.id, product]));

  return candidates.flatMap((candidate) => {
    const product = productsById.get(candidate.productId);

    return product
      ? [{
          product,
          score: candidate.score,
          snippets: candidate.snippets,
          metadata: candidate.metadata,
        }]
      : [];
  });
}

function createComparisonContextsFromProducts(
  products: Product[],
): RetrievedProductContext[] {
  return products.map((product, index) => ({
    product,
    score: 1 - index / 100,
    snippets: [createComparisonProductSnippet(product)],
    metadata: {
      docType: "product",
      category: product.category,
      subCategory: product.subCategory,
      brand: product.brand,
      tags: product.visualTags,
      recommendWhen: product.recommendWhen,
      avoidWhen: product.avoidWhen,
      blockType: null,
      priceMinCents: product.priceMinCents,
      priceMaxCents: product.priceMaxCents,
      available: true,
      embeddingModel: "postgresql",
      embeddingDimensions: 0,
      ingestBatchId: product.ingestBatchId,
    },
  }));
}

function toComparisonGenerationProductContext(
  context: RetrievedProductContext,
): ComparisonGenerationProductContext {
  return {
    product: context.product,
    snippets: context.snippets.length > 0
      ? context.snippets
      : [createComparisonProductSnippet(context.product)],
  };
}

function createComparisonProductSnippet(product: Product): string {
  return [
    product.knowledgeText,
    product.marketingDescription,
    product.pros.length > 0 ? `优点：${product.pros.join("、")}` : "",
    product.cons.length > 0 ? `注意：${product.cons.join("、")}` : "",
    product.recommendWhen.length > 0
      ? `适合：${product.recommendWhen.join("、")}`
      : "",
    product.avoidWhen.length > 0 ? `不适合：${product.avoidWhen.join("、")}` : "",
  ]
    .filter((value) => value.trim().length > 0)
    .join("\n");
}

function createNoCandidatesResult(answer: string): RagChatResult {
  return {
    answer,
    recommendedProductIds: [],
    productCards: [],
    fallbackUsed: true,
    fallbackReason: "NO_CANDIDATES",
    retrieval: {
      candidateCount: 0,
      returnedProductIds: [],
    },
  };
}

function createRetrievedFallbackResult(
  contexts: RetrievedProductContext[],
  maxRecommendedProducts: number,
  fallbackReason: RagChatFallbackReason,
  publicImageBaseUrl?: string,
): RagChatResult {
  const products = contexts
    .slice(0, maxRecommendedProducts)
    .map((context) => context.product);
  const productCards = products.map((product) =>
    mapProductToCardDto(product, { publicImageBaseUrl })
  );
  const recommendedProductIds = products.map((product) => product.id);

  return {
    answer: createMinimalRagFallbackAnswer(fallbackReason),
    recommendedProductIds,
    productCards,
    fallbackUsed: true,
    fallbackReason,
    retrieval: {
      candidateCount: contexts.length,
      returnedProductIds: recommendedProductIds,
    },
  };
}

function createSuccessResult(
  answer: string,
  recommendedProductIds: string[],
  contexts: RetrievedProductContext[],
  publicImageBaseUrl?: string,
): RagChatResult {
  const productsById = new Map(
    contexts.map((context) => [context.product.id, context.product]),
  );
  const products = recommendedProductIds.flatMap((productId) => {
    const product = productsById.get(productId);

    return product ? [product] : [];
  });
  const productCards = products.map((product) =>
    mapProductToCardDto(product, { publicImageBaseUrl })
  );
  const returnedProductIds = productCards.map((card) => card.id);

  return {
    answer,
    recommendedProductIds: returnedProductIds,
    productCards,
    fallbackUsed: false,
    retrieval: {
      candidateCount: contexts.length,
      returnedProductIds,
    },
  };
}

function createComparisonSuccessResult(input: {
  generated: GeneratedComparisonOutput;
  query: string;
  contexts: RetrievedProductContext[];
  publicImageBaseUrl?: string;
}): RagChatResult {
  const productsById = new Map(
    input.contexts.map((context) => [context.product.id, context.product]),
  );
  const products = input.generated.products.flatMap((product) => {
    const found = productsById.get(product.productId);

    return found ? [found] : [];
  });
  const productCards = products.map((product) =>
    mapProductToCardDto(product, {
      publicImageBaseUrl: input.publicImageBaseUrl,
    })
  );
  const returnedProductIds = productCards.map((card) => card.id);
  const comparisonResult: ChatComparisonResultPayload = {
    id: createComparisonResultId(input.query, returnedProductIds),
    title: input.generated.title,
    query: input.query,
    productIds: returnedProductIds,
    dimensions: input.generated.dimensions.map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      cells: dimension.cells.map((cell) => ({
        productId: cell.productId,
        value: cell.value,
        highlight: cell.highlight,
      })),
    })),
    recommendedProductId: input.generated.recommendedProductId ?? null,
    conclusion: input.generated.conclusion,
    highlights: input.generated.highlights.map((highlight) => ({
      productId: highlight.productId,
      label: highlight.label,
      text: highlight.text,
    })),
  };

  return {
    answer: input.generated.answer,
    recommendedProductIds: returnedProductIds,
    productCards,
    fallbackUsed: false,
    retrieval: {
      candidateCount: input.contexts.length,
      returnedProductIds,
    },
    comparisonResult,
  };
}

function createCartCommandResult(input: {
  answer: string;
  productCards: ReturnType<typeof mapProductToCardDto>[];
  recommendedProductIds: string[];
  fallbackUsed?: boolean;
  fallbackReason?: RagChatFallbackReason;
  retrieval: RagChatResult["retrieval"];
  cartAction: CartActionResult;
}): RagChatResult {
  return {
    answer: input.answer,
    recommendedProductIds: input.recommendedProductIds,
    productCards: input.productCards,
    fallbackUsed: input.fallbackUsed ?? true,
    fallbackReason: input.fallbackReason,
    retrieval: input.retrieval,
    cartAction: input.cartAction,
  };
}

function createCartRetrieval(cart: CartDto | undefined): RagChatResult["retrieval"] {
  return {
    candidateCount: cart?.items.length ?? 0,
    returnedProductIds: cart?.items.map((item) => item.productId) ?? [],
  };
}

function createSuccessCartItemAction(
  detection: Extract<CartCommandDetection, { isCartCommand: true }>,
  item: CartItemDto,
  cartSummary: CartDto["summary"],
): CartActionResult {
  return {
    type: detection.action,
    status: "success",
    itemId: item.id,
    productId: item.productId,
    productName: item.name,
    quantity: detection.action === "update_quantity"
      ? detection.quantity
      : item.quantity,
    selected: detection.action === "update_selected"
      ? detection.selected
      : item.selected,
    cartSummary,
    message: "cart_action_success",
  };
}

function mapCartMutationErrorToAction(
  error: unknown,
  detection: Extract<CartCommandDetection, { isCartCommand: true }>,
  item: CartItemDto,
  cartSummary: CartDto["summary"],
): CartActionResult {
  if (error instanceof CartItemNotFoundError) {
    return {
      type: detection.action,
      status: "not_found",
      itemId: item.id,
      productId: item.productId,
      productName: item.name,
      quantity: detection.quantity,
      selected: detection.selected,
      cartSummary,
      message: "cart_item_not_found",
    };
  }

  return {
    type: detection.action,
    status: "failed",
    itemId: item.id,
    productId: item.productId,
    productName: item.name,
    quantity: detection.quantity,
    selected: detection.selected,
    cartSummary,
    message: "cart_action_failed",
  };
}

function mapCartAddErrorToAction(
  error: unknown,
  product: Product,
  quantity: number,
): CartActionResult {
  if (error instanceof CartProductUnavailableError) {
    return {
      type: "add",
      status: "unavailable",
      productId: product.id,
      productName: product.name,
      quantity,
      message: "这款商品当前不可加购，可以看看其他推荐商品。",
    };
  }

  if (error instanceof CartProductNotFoundError) {
    return {
      type: "add",
      status: "not_found",
      productId: product.id,
      productName: product.name,
      quantity,
      message: "这款商品不存在或已下架，可以看看其他推荐商品。",
    };
  }

  return {
    type: "add",
    status: "failed",
    productId: product.id,
    productName: product.name,
    quantity,
    message: "暂时没能加入购物车，请稍后再试。",
  };
}

function compactAnswer(answer: string): string {
  const normalized = answer.replace(/\s+/g, " ").trim();

  if (Array.from(normalized).length <= MAX_CHAT_ANSWER_CHARS) {
    return normalized;
  }

  const firstSentence = normalized.split(/[。！？!?]/u)[0]?.trim();

  if (firstSentence && Array.from(firstSentence).length <= MAX_CHAT_ANSWER_CHARS) {
    return `${firstSentence}。`;
  }

  return `${Array.from(normalized).slice(0, MAX_CHAT_ANSWER_CHARS).join("").trimEnd()}...`;
}

function createComparisonResultId(
  query: string,
  productIds: string[],
): string {
  const input = `${query.trim()}|${productIds.join("|")}`;
  let hash = 0;

  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return `comparison-${hash.toString(36)}`;
}

function normalizeMaxRecommendedProducts(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new RagChatError("maxRecommendedProducts must be a positive integer.");
  }

  return value;
}

function resolveVectorSearchTopK(
  requestedTopK: number | undefined,
  negativeConstraints: readonly NegativeConstraint[],
): number | undefined {
  if (negativeConstraints.length === 0) {
    return requestedTopK;
  }

  return Math.max(
    requestedTopK ?? 0,
    DEFAULT_NEGATIVE_CONSTRAINT_TOP_K,
  );
}
