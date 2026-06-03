import { createHash, randomUUID } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { Schemas } from "@qdrant/js-client-rest";
import { getEnv } from "../../lib/env";
import type { RagDocument } from "./rag-document.types";
import type {
  EmbeddedRagDocument,
  QdrantDocumentPayload,
  QdrantFilter,
  QdrantPoint,
  QdrantScoredPoint,
  VectorCollectionConfig,
  VectorStore,
} from "./qdrant.types";
import {
  buildQdrantFilter,
  mapQdrantScoredPointToVectorSearchHit,
} from "./qdrant.mapper";
import type { VectorSearchFilters, VectorSearchHit } from "./vector-search.types";

const KEYWORD_PAYLOAD_FIELDS = [
  "doc_id",
  "product_id",
  "doc_type",
  "status",
  "category",
  "sub_category",
  "brand",
  "tags",
  "recommend_when",
  "avoid_when",
  "free_from_terms",
  "risk_terms",
  "wearing_styles",
  "block_type",
  "ingest_batch_id",
  "embedding_model",
] as const;

const INTEGER_PAYLOAD_FIELDS = [
  "price_min_cents",
  "price_max_cents",
] as const;

const BOOL_PAYLOAD_FIELDS = ["available"] as const;

export function createQdrantClient(): QdrantClient {
  const env = getEnv();

  return new QdrantClient({
    url: env.qdrantUrl,
    apiKey: env.qdrantApiKey,
  });
}

export class QdrantVectorStore implements VectorStore {
  private readonly client: QdrantClient;

  constructor(client = createQdrantClient()) {
    this.client = client;
  }

  async ensureCollection(config: VectorCollectionConfig): Promise<void> {
    if (config.recreate) {
      await this.client.recreateCollection(config.collectionName, {
        vectors: {
          size: config.dimensions,
          distance: config.distance,
        },
      });
      await this.createPayloadIndexes(config.collectionName);
      return;
    }

    const exists = await this.collectionExists(config.collectionName);

    if (!exists) {
      await this.client.createCollection(config.collectionName, {
        vectors: {
          size: config.dimensions,
          distance: config.distance,
        },
      });
      await this.createPayloadIndexes(config.collectionName);
      return;
    }

    const info = await this.client.getCollection(config.collectionName);
    assertCollectionMatches(info, config);
    await this.createPayloadIndexes(config.collectionName);
  }

  async upsertDocuments(input: {
    collectionName: string;
    items: EmbeddedRagDocument[];
  }): Promise<void> {
    if (input.items.length === 0) {
      return;
    }

    const points: QdrantPoint[] = input.items.map((item) => ({
      id: item.pointId,
      vector: item.vector,
      payload: item.payload as unknown as Record<string, unknown>,
    }));

    await this.client.upsert(input.collectionName, {
      wait: true,
      points,
    });
  }

  async search(input: {
    collectionName: string;
    vector: number[];
    filters?: VectorSearchFilters;
    topK: number;
    abortSignal?: AbortSignal;
  }): Promise<VectorSearchHit[]> {
    throwIfAborted(input.abortSignal);
    const results = await this.client.search(input.collectionName, {
      vector: input.vector,
      limit: input.topK,
      filter: buildQdrantFilter(input.filters),
      with_payload: true,
      with_vector: false,
    });
    throwIfAborted(input.abortSignal);

    return results.map((point) =>
      mapQdrantScoredPointToVectorSearchHit(point as QdrantScoredPoint),
    );
  }

  private async collectionExists(collectionName: string): Promise<boolean> {
    try {
      const result = await this.client.collectionExists(collectionName);

      return result.exists;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  private async createPayloadIndexes(collectionName: string): Promise<void> {
    const jobs: Array<Promise<unknown>> = [
      ...KEYWORD_PAYLOAD_FIELDS.map((field) =>
        this.createPayloadIndex(collectionName, field, "keyword"),
      ),
      ...INTEGER_PAYLOAD_FIELDS.map((field) =>
        this.createPayloadIndex(collectionName, field, "integer"),
      ),
      ...BOOL_PAYLOAD_FIELDS.map((field) =>
        this.createPayloadIndex(collectionName, field, "bool"),
      ),
    ];

    await Promise.all(jobs);
  }

  private async createPayloadIndex(
    collectionName: string,
    fieldName: string,
    fieldSchema: Schemas["PayloadSchemaType"],
  ): Promise<void> {
    try {
      await this.client.createPayloadIndex(collectionName, {
        wait: true,
        field_name: fieldName,
        field_schema: fieldSchema,
      });
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
  }
}

export function createDeterministicPointId(input: {
  embeddingModel: string;
  dimensions: number;
  docId: string;
}): string {
  const hash = createHash("sha256")
    .update(input.embeddingModel)
    .update("|")
    .update(String(input.dimensions))
    .update("|")
    .update(input.docId)
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function mapRagDocumentToQdrantPayload(
  document: RagDocument,
  embeddingModel: string,
  embeddingDimensions: number,
): QdrantDocumentPayload {
  return {
    doc_id: document.docId,
    product_id: document.productId,
    doc_type: document.docType,
    status: document.metadata.status,
    category: document.metadata.category,
    sub_category: document.metadata.subCategory ?? undefined,
    brand: document.metadata.brand,
    tags: document.metadata.tags,
    recommend_when: document.metadata.recommendWhen,
    avoid_when: document.metadata.avoidWhen,
    free_from_terms: document.metadata.freeFromTerms,
    risk_terms: document.metadata.riskTerms,
    wearing_styles: document.metadata.wearingStyles,
    block_type: document.metadata.blockType,
    ingest_batch_id: document.metadata.ingestBatchId,
    embedding_model: embeddingModel,
    embedding_dimensions: embeddingDimensions,
    document_hash: document.metadata.documentHash,
    snippet: document.snippet,
    available: document.metadata.available,
    price_min_cents: document.metadata.priceMinCents,
    price_max_cents: document.metadata.priceMaxCents,
    source_dataset: document.metadata.sourceDataset,
    source_version: document.metadata.sourceVersion,
    data_version: document.metadata.dataVersion,
  };
}

export function createEmbeddedRagDocument(input: {
  document: RagDocument;
  vector: number[];
  embeddingModel: string;
  embeddingDimensions: number;
}): EmbeddedRagDocument {
  return {
    document: input.document,
    pointId: createDeterministicPointId({
      embeddingModel: input.embeddingModel,
      dimensions: input.embeddingDimensions,
      docId: input.document.docId,
    }),
    vector: input.vector,
    payload: mapRagDocumentToQdrantPayload(
      input.document,
      input.embeddingModel,
      input.embeddingDimensions,
    ),
  };
}

function assertCollectionMatches(
  info: Schemas["CollectionInfo"],
  config: VectorCollectionConfig,
): void {
  const vectors = info.config.params.vectors;

  if (!isVectorParams(vectors)) {
    throw new Error(
      `Qdrant collection ${config.collectionName} does not use a single default vector.`,
    );
  }

  if (vectors.size !== config.dimensions || vectors.distance !== config.distance) {
    throw new Error(
      `Qdrant collection ${config.collectionName} has vector ${vectors.size}/${vectors.distance}; expected ${config.dimensions}/${config.distance}. Recreate the collection before indexing.`,
    );
  }
}

function isVectorParams(value: unknown): value is Schemas["VectorParams"] {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && "size" in value
      && "distance" in value,
  );
}

function isNotFoundError(error: unknown): boolean {
  return getErrorMessage(error).toLowerCase().includes("not found");
}

function isAlreadyExistsError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return message.includes("already exists") || message.includes("exists");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Qdrant search was aborted.");
  }
}

export function createRandomPointIdForTest(): string {
  return randomUUID();
}
