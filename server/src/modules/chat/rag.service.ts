import { throwIfAborted, rethrowIfAborted } from "../../lib/abort";
import { getDatabasePool } from "../../lib/db/pool";
import { getEnv } from "../../lib/env";
import {
  CartProductNotFoundError,
  CartProductUnavailableError,
  CartService,
} from "../cart/cart.service";
import type { CartDto } from "../cart/cart.types";
import type { LlmClient } from "../llm/llm.types";
import { createLlmClient } from "../llm/openai-compatible-chat.client";
import { mapProductToCardDto } from "../products/product.mapper";
import { findActiveProductsByIds } from "../products/product.repository";
import type { Product } from "../products/product.types";
import { VectorSearchService } from "../vector/vector-search.service";
import type {
  VectorSearchFilters,
  VectorSearchHit,
  VectorSearchHitMetadata,
} from "../vector/vector-search.types";
import type {
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
}

export interface RagCartWriter {
  addItem(input: { productId: string; quantity: number }): Promise<CartDto>;
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

const DEFAULT_MAX_RECOMMENDED_PRODUCTS = 3;
const DEFAULT_MAX_SNIPPETS_PER_PRODUCT = 3;
const DEFAULT_NEGATIVE_CONSTRAINT_TOP_K = 20;
const RAG_LLM_MAX_COMPLETION_TOKENS = 2000;
const MAX_CHAT_ANSWER_CHARS = 72;

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
    const cartCommandDetection = await this.cartCommandIntentService.detect({
      question,
      contextMemory: memoryResolution.contextMemory,
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

  private async answerCartCommand(
    detection: Extract<CartCommandDetection, { isCartCommand: true }>,
    recentProductIds: string[],
    request: Pick<RagChatRequest, "question" | "requestId" | "abortSignal">,
  ): Promise<RagChatResult> {
    const products = orderProductsByIds(
      await this.productReader.findActiveByIds(recentProductIds),
      recentProductIds,
    );
    throwIfAborted(request.abortSignal);
    const productCards = products.map((product) =>
      mapProductToCardDto(product, { publicImageBaseUrl: this.publicImageBaseUrl })
    );
    const recommendedProductIds = productCards.map((card) => card.id);
    const resolvedTarget = this.cartCommandService.resolveTarget({
      detection,
      products,
    });
    const baseRetrieval = {
      candidateCount: products.length,
      returnedProductIds: recommendedProductIds,
    };

    if (resolvedTarget.status === "missing") {
      const cartAction: CartActionResult = {
        type: "add",
        status: "needs_target",
        quantity: detection.quantity,
        message: "缺少可加购的推荐商品",
      };

      return createCartCommandResult({
        answer: await this.cartActionResponseService.generate({
          question: request.question,
          cartAction,
          fallbackReason: "CART_TARGET_MISSING",
          recentProducts: products,
          requestId: request.requestId,
          abortSignal: request.abortSignal,
        }),
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_TARGET_MISSING",
        retrieval: baseRetrieval,
        cartAction,
      });
    }

    if (resolvedTarget.status === "ambiguous") {
      const cartAction: CartActionResult = {
        type: "add",
        status: "needs_target",
        quantity: detection.quantity,
        message: "需要确认要加入购物车的商品",
      };

      return createCartCommandResult({
        answer: await this.cartActionResponseService.generate({
          question: request.question,
          cartAction,
          fallbackReason: "CART_TARGET_AMBIGUOUS",
          recentProducts: products,
          requestId: request.requestId,
          abortSignal: request.abortSignal,
        }),
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_TARGET_AMBIGUOUS",
        retrieval: baseRetrieval,
        cartAction,
      });
    }

    if (resolvedTarget.status === "not_found" || !resolvedTarget.product) {
      const cartAction: CartActionResult = {
        type: "add",
        status: "not_found",
        quantity: detection.quantity,
        message: "最近推荐里没有匹配商品",
      };

      return createCartCommandResult({
        answer: await this.cartActionResponseService.generate({
          question: request.question,
          cartAction,
          fallbackReason: "CART_TARGET_MISSING",
          recentProducts: products,
          requestId: request.requestId,
          abortSignal: request.abortSignal,
        }),
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_TARGET_MISSING",
        retrieval: baseRetrieval,
        cartAction,
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

      return createCartCommandResult({
        answer: await this.cartActionResponseService.generate({
          question: request.question,
          cartAction,
          recentProducts: products,
          requestId: request.requestId,
          abortSignal: request.abortSignal,
        }),
        productCards,
        recommendedProductIds,
        fallbackUsed: false,
        retrieval: baseRetrieval,
        cartAction,
      });
    } catch (error) {
      rethrowIfAborted(request.abortSignal, error);
      const cartAction = mapCartAddErrorToAction(
        error,
        resolvedTarget.product,
        detection.quantity,
      );

      return createCartCommandResult({
        answer: await this.cartActionResponseService.generate({
          question: request.question,
          cartAction,
          fallbackReason: "CART_ADD_FAILED",
          recentProducts: products,
          requestId: request.requestId,
          abortSignal: request.abortSignal,
        }),
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_ADD_FAILED",
        retrieval: baseRetrieval,
        cartAction,
      });
    }
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
  };
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
