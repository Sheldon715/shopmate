import { getDatabasePool } from "../../lib/db/pool";
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
  maxSnippetsPerProduct?: number;
  defaultMaxRecommendedProducts?: number;
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
  private readonly maxSnippetsPerProduct: number;
  private readonly defaultMaxRecommendedProducts: number;

  constructor(options: RagChatServiceOptions = {}) {
    this.vectorSearch = options.vectorSearch ?? new VectorSearchService();
    this.productReader = options.productReader ?? createDefaultProductReader();
    this.llmClient = options.llmClient ?? createLlmClient();
    this.now = options.now ?? (() => new Date());
    this.maxSnippetsPerProduct =
      options.maxSnippetsPerProduct ?? DEFAULT_MAX_SNIPPETS_PER_PRODUCT;
    this.defaultMaxRecommendedProducts =
      options.defaultMaxRecommendedProducts ?? DEFAULT_MAX_RECOMMENDED_PRODUCTS;
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
    const hits = await this.vectorSearch.search({
      query: question,
      filters: input.filters,
      topK: input.topK,
      abortSignal: input.abortSignal,
    });
    const candidates = dedupeVectorHits(hits, this.maxSnippetsPerProduct);

    if (candidates.length === 0) {
      return createNoCandidatesResult();
    }

    const products = await this.productReader.findActiveByIds(
      candidates.map((candidate) => candidate.productId),
    );
    const contexts = createRetrievedContexts(candidates, products);

    if (contexts.length === 0) {
      return createNoCandidatesResult();
    }

    try {
      const response = await this.llmClient.generate({
        messages: buildRagPrompt({
          question,
          shortHistory: normalizeChatHistory(input.shortHistory ?? []),
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
        return createRetrievedFallbackResult(
          contexts,
          maxRecommendedProducts,
          "NO_VALID_PRODUCT_IDS",
        );
      }

      return createSuccessResult(parsed.answer, recommendedProductIds, contexts);
    } catch (error) {
      return createRetrievedFallbackResult(
        contexts,
        maxRecommendedProducts,
        error instanceof RagLlmOutputParseError
          ? "LLM_INVALID_OUTPUT"
          : "LLM_ERROR",
      );
    }
  }
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
): RagChatResult {
  const products = contexts
    .slice(0, maxRecommendedProducts)
    .map((context) => context.product);
  const productCards = products.map((product) => mapProductToCardDto(product));
  const recommendedProductIds = products.map((product) => product.id);

  return {
    answer: "根据当前商品数据，先给你这些候选商品。你可以继续补充预算、品牌偏好或使用场景，我再帮你缩小范围。",
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
): RagChatResult {
  const productsById = new Map(
    contexts.map((context) => [context.product.id, context.product]),
  );
  const products = recommendedProductIds.flatMap((productId) => {
    const product = productsById.get(productId);

    return product ? [product] : [];
  });
  const productCards = products.map((product) => mapProductToCardDto(product));
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
