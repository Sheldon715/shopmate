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
import { CartCommandService } from "./cart-command.service";
import { CartCommandIntentService } from "./cart-command-intent.service";
import type {
  CartActionResult,
  CartCommandDetection,
} from "./cart-command.types";
import { ChatContextMemoryService } from "./chat-context-memory.service";
import { ClarificationService } from "./clarification.service";
import type {
  ClarificationDecision,
  PendingClarification,
} from "./clarification.types";
import { buildRagPrompt, normalizeChatHistory } from "./prompt.builder";
import {
  RagLlmOutputParseError,
  parseRagLlmOutput,
} from "./rag-llm-output.parser";

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

export interface RagChatServiceOptions {
  vectorSearch?: RagVectorSearchClient;
  productReader?: RagProductReader;
  cartWriter?: RagCartWriter;
  llmClient?: LlmClient;
  now?: () => Date;
  contextMemoryService?: ChatContextMemoryService;
  clarificationService?: ClarificationService;
  cartCommandService?: CartCommandService;
  cartCommandIntentService?: RagCartCommandIntentDetector;
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
  private readonly cartCommandService: CartCommandService;
  private readonly cartCommandIntentService: RagCartCommandIntentDetector;
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
    this.cartCommandService =
      options.cartCommandService ?? new CartCommandService();
    this.cartCommandIntentService =
      options.cartCommandIntentService
      ?? new CartCommandIntentService({
        llmClient: this.llmClient,
        cartCommandService: this.cartCommandService,
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
    const memoryResolution = this.contextMemoryService.resolve({
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

    if (cartCommandDetection.isCartCommand) {
      return this.withContextMemory(
        memoryResolution,
        await this.answerCartCommand(
          cartCommandDetection,
          memoryResolution.contextMemory?.lastRecommendedProductIds ?? [],
        ),
      );
    }

    const clarificationDecision = this.clarificationService.decide({
      question,
      contextMemory: memoryResolution.contextMemory,
      filters: memoryResolution.filters,
    });

    if (clarificationDecision.needsClarification) {
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

    const hits = await this.vectorSearch.search({
      query: memoryResolution.retrievalQuery,
      filters: memoryResolution.filters,
      topK: input.topK,
      abortSignal: input.abortSignal,
    });
    const candidates = dedupeVectorHits(hits, this.maxSnippetsPerProduct);

    if (candidates.length === 0) {
      return this.withContextMemory(
        memoryResolution,
        createNoCandidatesResult(),
      );
    }

    const products = await this.productReader.findActiveByIds(
      candidates.map((candidate) => candidate.productId),
    );
    const contexts = createRetrievedContexts(candidates, products);

    if (contexts.length === 0) {
      return this.withContextMemory(
        memoryResolution,
        createNoCandidatesResult(),
      );
    }

    try {
      const response = await this.llmClient.generate({
        messages: buildRagPrompt({
          question,
          shortHistory: normalizeChatHistory(input.shortHistory ?? []),
          contextMemory: memoryResolution.contextMemory,
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
      const recommendedProductIds = parsed.recommendedProductIds.slice(
        0,
        maxRecommendedProducts,
      );

      if (recommendedProductIds.length === 0) {
        return this.withContextMemory(
          memoryResolution,
          createRetrievedFallbackResult(
            contexts,
            maxRecommendedProducts,
            "NO_VALID_PRODUCT_IDS",
            this.publicImageBaseUrl,
          ),
        );
      }

      return this.withContextMemory(
        memoryResolution,
        createSuccessResult(
          compactAnswer(parsed.answer),
          recommendedProductIds,
          contexts,
          this.publicImageBaseUrl,
        ),
      );
    } catch (error) {
      return this.withContextMemory(
        memoryResolution,
        createRetrievedFallbackResult(
          contexts,
          maxRecommendedProducts,
          error instanceof RagLlmOutputParseError
            ? "LLM_INVALID_OUTPUT"
            : "LLM_ERROR",
          this.publicImageBaseUrl,
        ),
      );
    }
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
  ): Promise<RagChatResult> {
    const products = orderProductsByIds(
      await this.productReader.findActiveByIds(recentProductIds),
      recentProductIds,
    );
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
      return createCartCommandResult({
        answer: "我还没有可加购的推荐商品。你可以先让我推荐几款，再说加第几个。",
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_TARGET_MISSING",
        retrieval: baseRetrieval,
        cartAction: {
          type: "add",
          status: "needs_target",
          quantity: detection.quantity,
          message: "缺少可加购的推荐商品",
        },
      });
    }

    if (resolvedTarget.status === "ambiguous") {
      return createCartCommandResult({
        answer: "你想加哪一款？可以说“加第二个”，或直接点商品卡片加购。",
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_TARGET_AMBIGUOUS",
        retrieval: baseRetrieval,
        cartAction: {
          type: "add",
          status: "needs_target",
          quantity: detection.quantity,
          message: "需要确认要加入购物车的商品",
        },
      });
    }

    if (resolvedTarget.status === "not_found" || !resolvedTarget.product) {
      return createCartCommandResult({
        answer: "我没能在最近推荐里找到你说的那款商品。你可以说“加第一个”或点商品卡片加购。",
        productCards,
        recommendedProductIds,
        fallbackReason: "CART_TARGET_MISSING",
        retrieval: baseRetrieval,
        cartAction: {
          type: "add",
          status: "not_found",
          quantity: detection.quantity,
          message: "最近推荐里没有匹配商品",
        },
      });
    }

    try {
      await this.cartWriter.addItem({
        productId: resolvedTarget.product.id,
        quantity: detection.quantity,
      });

      return createCartCommandResult({
        answer: "已把这款商品加入购物车，你可以点右上角购物车查看。",
        productCards,
        recommendedProductIds,
        fallbackUsed: false,
        retrieval: baseRetrieval,
        cartAction: {
          type: "add",
          status: "success",
          productId: resolvedTarget.product.id,
          productName: resolvedTarget.product.name,
          quantity: detection.quantity,
          message: "已加入购物车",
        },
      });
    } catch (error) {
      const cartAction = mapCartAddErrorToAction(
        error,
        resolvedTarget.product,
        detection.quantity,
      );

      return createCartCommandResult({
        answer: cartAction.message,
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
    answer: decision.question ?? "你能补充一下预算、使用场景或偏好吗？我再帮你筛。",
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

function createNoCandidatesResult(): RagChatResult {
  return {
    answer: "暂时没有找到匹配商品。你可以换一个更具体的需求，比如品类、预算或使用场景。",
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
    answer: "先给你几款候选商品，更多优势和参数可以点进商品详情慢慢看。",
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
