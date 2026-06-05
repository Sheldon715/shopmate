import { getDatabasePool } from "../../lib/db/pool";
import { getEnv } from "../../lib/env";
import { mapProductToCardDto } from "../products/product.mapper";
import { findActiveProductsByIds } from "../products/product.repository";
import type { Product, ProductCardDto } from "../products/product.types";
import { isProductAvailable } from "../products/product-availability";
import type {
  ImageEmbeddingClient,
  ImageEmbeddingInput,
} from "./image-embedding.client";
import {
  createImageEmbeddingClient,
  validateImageEmbeddingResult,
} from "./image-embedding.client";
import {
  QdrantProductImageVectorStore,
  type ImageVectorStore,
  type ProductImageVectorHit,
} from "./image-vector-store";
import type { VectorSearchFilters } from "./vector-search.types";
import { VectorSearchError } from "./vector-search.error";

export interface ImageVectorSearchResultHit {
  productId: string;
  score: number;
  imagePath: string;
  imageHash: string;
  product: ProductCardDto;
}

export interface ImageVectorSearchResult {
  mode: "image_vector";
  hits: ImageVectorSearchResultHit[];
  droppedProductIds: string[];
}

export interface ImageVectorSearchServiceOptions {
  imageEmbeddingClient?: ImageEmbeddingClient;
  imageVectorStore?: ImageVectorStore;
  collectionName?: string;
  topK?: number;
  imageEmbeddingDimensions?: number;
  productLookup?: (productIds: string[]) => Promise<Product[]>;
  publicImageBaseUrl?: string;
}

export class ImageVectorSearchService {
  private readonly imageEmbeddingClient: ImageEmbeddingClient;
  private readonly imageVectorStore: ImageVectorStore;
  private readonly collectionName: string;
  private readonly topK: number;
  private readonly imageEmbeddingDimensions: number;
  private readonly productLookup: (productIds: string[]) => Promise<Product[]>;
  private readonly publicImageBaseUrl?: string;

  constructor(options: ImageVectorSearchServiceOptions = {}) {
    const env = getEnv();

    this.imageEmbeddingClient =
      options.imageEmbeddingClient ?? createImageEmbeddingClient();
    this.imageVectorStore =
      options.imageVectorStore ?? new QdrantProductImageVectorStore();
    this.collectionName = options.collectionName ?? env.imageVectorCollection;
    this.topK = options.topK ?? env.imageVectorTopK;
    this.imageEmbeddingDimensions =
      options.imageEmbeddingDimensions ?? env.imageEmbeddingDimensions;
    this.productLookup = options.productLookup ?? ((productIds) =>
      findActiveProductsByIds(getDatabasePool(), productIds)
    );
    this.publicImageBaseUrl = options.publicImageBaseUrl ?? env.publicImageBaseUrl;
  }

  async search(input: {
    image: ImageEmbeddingInput;
    filters?: VectorSearchFilters;
    topK?: number;
    abortSignal?: AbortSignal;
  }): Promise<ImageVectorSearchResult> {
    if (input.image.buffer.length === 0) {
      throw new VectorSearchError("Image vector search image cannot be empty.");
    }

    try {
      throwIfAborted(input.abortSignal);
      const embedding = validateImageEmbeddingResult(
        await this.imageEmbeddingClient.embedImage(input.image, {
          abortSignal: input.abortSignal,
        }),
        1,
        this.imageEmbeddingDimensions,
      );
      throwIfAborted(input.abortSignal);
      const vectorHits = await this.imageVectorStore.search({
        collectionName: this.collectionName,
        vector: embedding.vectors[0],
        filters: input.filters,
        topK: input.topK ?? this.topK,
        abortSignal: input.abortSignal,
      });

      return this.hydrateHits(vectorHits);
    } catch (error) {
      if (error instanceof VectorSearchError) {
        throw error;
      }

      throw new VectorSearchError("Image vector search failed.", {
        cause: error,
      });
    }
  }

  private async hydrateHits(
    vectorHits: ProductImageVectorHit[],
  ): Promise<ImageVectorSearchResult> {
    const productIds = vectorHits.map((hit) => hit.productId);
    const products = await this.productLookup(productIds);
    const productsById = new Map(products.map((product) => [product.id, product]));
    const hydrated: ImageVectorSearchResultHit[] = [];
    const droppedProductIds: string[] = [];

    for (const hit of vectorHits) {
      const product = productsById.get(hit.productId);

      if (!product || !isProductAvailable(product)) {
        droppedProductIds.push(hit.productId);
        continue;
      }

      hydrated.push({
        productId: hit.productId,
        score: hit.score,
        imagePath: hit.metadata.imagePath,
        imageHash: hit.metadata.imageHash,
        product: mapProductToCardDto(product, {
          publicImageBaseUrl: this.publicImageBaseUrl,
        }),
      });
    }

    return {
      mode: "image_vector",
      hits: hydrated,
      droppedProductIds,
    };
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new VectorSearchError("Image vector search was aborted.", {
      cause: signal.reason,
    });
  }
}
