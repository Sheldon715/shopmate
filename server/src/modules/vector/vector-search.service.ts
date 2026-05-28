import { getEnv } from "../../lib/env";
import type { EmbeddingClient } from "./embedding.types";
import { createEmbeddingClient, validateEmbeddingResult } from "./embedding.service";
import { QdrantVectorStore } from "./qdrant.client";
import type { VectorStore } from "./qdrant.types";
import { VectorSearchError } from "./vector-search.error";
import type { VectorSearchFilters, VectorSearchHit } from "./vector-search.types";
export {
  buildQdrantFilter,
  mapQdrantScoredPointToVectorSearchHit,
} from "./qdrant.mapper";
export { VectorSearchError } from "./vector-search.error";

export interface VectorSearchServiceOptions {
  embeddingClient?: EmbeddingClient;
  vectorStore?: VectorStore;
  collectionName?: string;
  topK?: number;
  embeddingDimensions?: number;
}

export class VectorSearchService {
  private readonly embeddingClient: EmbeddingClient;
  private readonly vectorStore: VectorStore;
  private readonly collectionName: string;
  private readonly topK: number;
  private readonly embeddingDimensions: number;

  constructor(options: VectorSearchServiceOptions = {}) {
    const env = getEnv();

    this.embeddingClient = options.embeddingClient ?? createEmbeddingClient();
    this.vectorStore = options.vectorStore ?? new QdrantVectorStore();
    this.collectionName = options.collectionName ?? env.qdrantCollectionProducts;
    this.topK = options.topK ?? env.ragTopK;
    this.embeddingDimensions = options.embeddingDimensions ?? env.embeddingDimensions;
  }

  async search(input: {
    query: string;
    filters?: VectorSearchFilters;
    topK?: number;
    abortSignal?: AbortSignal;
  }): Promise<VectorSearchHit[]> {
    const query = input.query.trim();

    if (query.length === 0) {
      throw new VectorSearchError("Search query cannot be empty.");
    }

    try {
      throwIfAborted(input.abortSignal);
      const embedding = validateEmbeddingResult(
        await this.embeddingClient.embedQuery(query, {
          abortSignal: input.abortSignal,
        }),
        1,
        this.embeddingDimensions,
      );
      throwIfAborted(input.abortSignal);

      const searchInput: Parameters<VectorStore["search"]>[0] = {
        collectionName: this.collectionName,
        vector: embedding.vectors[0],
        filters: input.filters,
        topK: input.topK ?? this.topK,
      };

      if (input.abortSignal) {
        searchInput.abortSignal = input.abortSignal;
      }

      return await this.vectorStore.search(searchInput);
    } catch (error) {
      if (error instanceof VectorSearchError) {
        throw error;
      }

      throw new VectorSearchError("Vector search failed.", { cause: error });
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new VectorSearchError("Vector search was aborted.", {
      cause: signal.reason,
    });
  }
}
