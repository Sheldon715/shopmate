import { getDatabasePool } from "../../lib/db/pool";
import { getEnv } from "../../lib/env";
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

export interface RagChatServiceOptions {
  vectorSearch?: RagVectorSearchClient;
  productReader?: RagProductReader;
  llmClient?: LlmClient;
  now?: () => Date;
  contextMemoryService?: ChatContextMemoryService;
  clarificationService?: ClarificationService;
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
  private readonly llmClient: LlmClient;
  private readonly now: () => Date;
  private readonly contextMemoryService: ChatContextMemoryService;
  private readonly clarificationService: ClarificationService;
  private readonly maxSnippetsPerProduct: number;
  private readonly defaultMaxRecommendedProducts: number;
  private readonly publicImageBaseUrl?: string;

  constructor(options: RagChatServiceOptions = {}) {
    this.vectorSearch = options.vectorSearch ?? new VectorSearchService();
    this.productReader = options.productReader ?? createDefaultProductReader();
    this.llmClient = options.llmClient ?? createLlmClient();
    this.now = options.now ?? (() => new Date());
    this.contextMemoryService =
      options.contextMemoryService
      ?? new ChatContextMemoryService({ now: this.now });
    this.clarificationService =
      options.clarificationService ?? new ClarificationService();
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
