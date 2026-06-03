import type { RagChatRequest, RagChatResult } from "./chat.types";
import type { ChatContextMemoryService } from "./chat-context-memory.service";
import {
  PopularQueryCacheService,
  type PopularQueryCache,
  type PopularQueryCacheHit,
  type PopularQueryCacheReadInput,
} from "./popular-query-cache.service";
import {
  PopularQueryCacheVersionService,
  type PopularQueryCacheVersionReader,
} from "./popular-query-cache-version.service";

export interface PopularQueryCacheCoordinatorOptions {
  popularQueryCache?: PopularQueryCache;
  popularQueryCacheVersionReader?: PopularQueryCacheVersionReader;
}

export interface PopularQueryCacheInputRequest {
  question: string;
  retrievalQuery?: string;
  queryRewriteVersion?: string;
  request: RagChatRequest;
  memoryResolution: ReturnType<ChatContextMemoryService["resolve"]>;
  maxRecommendedProducts: number;
}

export class PopularQueryCacheCoordinator {
  private readonly cache: PopularQueryCache;
  private readonly versionReader: PopularQueryCacheVersionReader;

  constructor(options: PopularQueryCacheCoordinatorOptions = {}) {
    this.cache = options.popularQueryCache ?? new PopularQueryCacheService();
    this.versionReader =
      options.popularQueryCacheVersionReader
      ?? new PopularQueryCacheVersionService();
  }

  async createInput(
    input: PopularQueryCacheInputRequest,
  ): Promise<PopularQueryCacheReadInput> {
    return {
      ...(await this.versionReader.read()),
      question: input.question,
      retrievalQuery: input.retrievalQuery,
      queryRewriteVersion: input.queryRewriteVersion,
      filters: input.memoryResolution.filters,
      topK: input.request.topK,
      maxRecommendedProducts: input.maxRecommendedProducts,
      shortHistory: input.request.shortHistory,
      contextMemory:
        input.memoryResolution.memory
          && input.memoryResolution.memory.turnCount > 1
          ? input.memoryResolution.contextMemory
          : undefined,
    };
  }

  async read(
    cacheInput: PopularQueryCacheReadInput,
  ): Promise<PopularQueryCacheHit | null> {
    try {
      return await this.cache.get(cacheInput);
    } catch {
      return null;
    }
  }

  async delete(cacheInput: PopularQueryCacheReadInput): Promise<void> {
    try {
      await this.cache.delete(cacheInput);
    } catch {
      // Cache invalidation failures should not block the normal RAG path.
    }
  }

  async write(
    cacheInput: PopularQueryCacheReadInput,
    result: RagChatResult,
  ): Promise<RagChatResult> {
    try {
      await this.cache.set({
        ...cacheInput,
        result,
      });
    } catch {
      return result;
    }

    return result;
  }
}
