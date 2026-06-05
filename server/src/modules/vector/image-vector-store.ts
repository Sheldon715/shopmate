import { QdrantClient } from "@qdrant/js-client-rest";
import type { Schemas } from "@qdrant/js-client-rest";
import type { ProductImageDocument } from "./image-document.types";
import { createDeterministicPointId, createQdrantClient } from "./qdrant.client";
import type {
  QdrantCondition,
  QdrantDistance,
  QdrantFilter,
  QdrantPoint,
  QdrantScoredPoint,
} from "./qdrant.types";
import type { VectorSearchFilters } from "./vector-search.types";
import { VectorSearchError } from "./vector-search.error";

export interface ProductImageDocumentPayload {
  doc_id: string;
  product_id: string;
  doc_type: "image_main";
  image_path: string;
  visual_caption: string;
  visual_tags: string[];
  category: string;
  sub_category?: string;
  brand: string;
  status: string;
  available: boolean;
  price_min_cents: number;
  price_max_cents: number;
  image_embedding_model: string;
  image_embedding_dimensions: number;
  image_hash: string;
  ingest_batch_id: string;
  source_dataset: string;
  source_version: string;
  data_version: string;
}

export interface EmbeddedProductImageDocument {
  document: ProductImageDocument;
  pointId: string;
  vector: number[];
  payload: ProductImageDocumentPayload;
}

export interface ProductImageVectorHit {
  docId: string;
  productId: string;
  score: number;
  metadata: {
    docType: "image_main";
    imagePath: string;
    visualCaption: string;
    visualTags: string[];
    category: string;
    subCategory: string | null;
    brand: string;
    priceMinCents: number;
    priceMaxCents: number;
    available: boolean;
    imageEmbeddingModel: string;
    imageEmbeddingDimensions: number;
    imageHash: string;
    ingestBatchId: string;
  };
}

export interface ImageVectorCollectionConfig {
  collectionName: string;
  dimensions: number;
  distance: QdrantDistance;
  recreate: boolean;
}

export interface ImageVectorStore {
  ensureCollection(config: ImageVectorCollectionConfig): Promise<void>;
  upsertDocuments(input: {
    collectionName: string;
    items: EmbeddedProductImageDocument[];
  }): Promise<void>;
  search(input: {
    collectionName: string;
    vector: number[];
    filters?: VectorSearchFilters;
    topK: number;
    abortSignal?: AbortSignal;
  }): Promise<ProductImageVectorHit[]>;
}

const KEYWORD_PAYLOAD_FIELDS = [
  "doc_id",
  "product_id",
  "doc_type",
  "image_path",
  "visual_tags",
  "category",
  "sub_category",
  "brand",
  "status",
  "image_embedding_model",
  "image_hash",
  "ingest_batch_id",
] as const;

const INTEGER_PAYLOAD_FIELDS = [
  "price_min_cents",
  "price_max_cents",
  "image_embedding_dimensions",
] as const;

const BOOL_PAYLOAD_FIELDS = ["available"] as const;

export class QdrantProductImageVectorStore implements ImageVectorStore {
  private readonly client: QdrantClient;

  constructor(client = createQdrantClient()) {
    this.client = client;
  }

  async ensureCollection(config: ImageVectorCollectionConfig): Promise<void> {
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
    items: EmbeddedProductImageDocument[];
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
  }): Promise<ProductImageVectorHit[]> {
    throwIfAborted(input.abortSignal);
    const results = await this.client.search(input.collectionName, {
      vector: input.vector,
      limit: input.topK,
      filter: buildImageQdrantFilter(input.filters),
      with_payload: true,
      with_vector: false,
    });
    throwIfAborted(input.abortSignal);

    return results.map((point) =>
      mapQdrantPointToProductImageVectorHit(point as QdrantScoredPoint),
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

export function createEmbeddedProductImageDocument(input: {
  document: ProductImageDocument;
  vector: number[];
  imageEmbeddingModel: string;
  imageEmbeddingDimensions: number;
}): EmbeddedProductImageDocument {
  return {
    document: input.document,
    pointId: createDeterministicPointId({
      embeddingModel: input.imageEmbeddingModel,
      dimensions: input.imageEmbeddingDimensions,
      docId: input.document.docId,
    }),
    vector: input.vector,
    payload: mapProductImageDocumentToPayload(
      input.document,
      input.imageEmbeddingModel,
      input.imageEmbeddingDimensions,
    ),
  };
}

export function mapProductImageDocumentToPayload(
  document: ProductImageDocument,
  imageEmbeddingModel: string,
  imageEmbeddingDimensions: number,
): ProductImageDocumentPayload {
  return {
    doc_id: document.docId,
    product_id: document.productId,
    doc_type: document.docType,
    image_path: document.imagePath,
    visual_caption: document.visualCaption,
    visual_tags: document.visualTags,
    category: document.category,
    sub_category: document.subCategory ?? undefined,
    brand: document.brand,
    status: document.status,
    available: document.available,
    price_min_cents: document.priceMinCents,
    price_max_cents: document.priceMaxCents,
    image_embedding_model: imageEmbeddingModel,
    image_embedding_dimensions: imageEmbeddingDimensions,
    image_hash: document.imageHash,
    ingest_batch_id: document.ingestBatchId,
    source_dataset: document.sourceDataset,
    source_version: document.sourceVersion,
    data_version: document.dataVersion,
  };
}

export function buildImageQdrantFilter(
  filters: VectorSearchFilters = {},
): QdrantFilter {
  const must: QdrantCondition[] = [
    exactMatch("doc_type", "image_main"),
    exactMatch("status", "active"),
  ];
  const mustNot: QdrantCondition[] = [];

  if (filters.availableOnly !== false) {
    must.push(exactMatch("available", true));
  }

  if (filters.category) {
    must.push(exactMatch("category", filters.category));
  }

  if (filters.subCategory) {
    must.push(exactMatch("sub_category", filters.subCategory));
  }

  if (filters.brand) {
    must.push(exactMatch("brand", filters.brand));
  }

  if (filters.maxPriceCents !== undefined) {
    must.push({
      key: "price_min_cents",
      range: { lte: filters.maxPriceCents },
    });
  }

  if (filters.minPriceCents !== undefined) {
    must.push({
      key: "price_max_cents",
      range: { gte: filters.minPriceCents },
    });
  }

  const tagsAny = nonEmptyStrings(filters.tagsAny);

  if (tagsAny.length > 0) {
    must.push(matchAny("visual_tags", tagsAny));
  }

  const excludeProductIds = nonEmptyStrings(filters.excludeProductIds);

  if (excludeProductIds.length > 0) {
    mustNot.push(matchAny("product_id", excludeProductIds));
  }

  const excludeBrands = nonEmptyStrings(filters.excludeBrands);

  if (excludeBrands.length > 0) {
    mustNot.push(matchAny("brand", excludeBrands));
  }

  const excludeCategories = nonEmptyStrings(filters.excludeCategories);

  if (excludeCategories.length > 0) {
    mustNot.push(matchAny("category", excludeCategories));
    mustNot.push(matchAny("sub_category", excludeCategories));
  }

  return mustNot.length > 0 ? { must, must_not: mustNot } : { must };
}

export function mapQdrantPointToProductImageVectorHit(
  point: QdrantScoredPoint,
): ProductImageVectorHit {
  const payload = normalizePayload(point.payload);

  return {
    docId: payload.doc_id,
    productId: payload.product_id,
    score: point.score,
    metadata: {
      docType: payload.doc_type,
      imagePath: payload.image_path,
      visualCaption: payload.visual_caption,
      visualTags: payload.visual_tags,
      category: payload.category,
      subCategory: payload.sub_category ?? null,
      brand: payload.brand,
      priceMinCents: payload.price_min_cents,
      priceMaxCents: payload.price_max_cents,
      available: payload.available,
      imageEmbeddingModel: payload.image_embedding_model,
      imageEmbeddingDimensions: payload.image_embedding_dimensions,
      imageHash: payload.image_hash,
      ingestBatchId: payload.ingest_batch_id,
    },
  };
}

function exactMatch(
  key: string,
  value: string | number | boolean,
): QdrantCondition {
  return {
    key,
    match: { value },
  };
}

function matchAny(key: string, values: string[]): QdrantCondition {
  return {
    key,
    match: { any: values },
  };
}

function nonEmptyStrings(values: string[] | undefined): string[] {
  return values
    ? values.map((value) => value.trim()).filter((value) => value.length > 0)
    : [];
}

function normalizePayload(
  payload: QdrantScoredPoint["payload"],
): ProductImageDocumentPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new VectorSearchError("Qdrant image hit is missing payload.");
  }

  const record = payload as Record<string, unknown>;

  return {
    doc_id: requireString(record, "doc_id"),
    product_id: requireString(record, "product_id"),
    doc_type: requireImageDocType(record, "doc_type"),
    image_path: requireString(record, "image_path"),
    visual_caption: requireString(record, "visual_caption"),
    visual_tags: requireStringArray(record, "visual_tags"),
    category: requireString(record, "category"),
    sub_category: optionalString(record, "sub_category"),
    brand: requireString(record, "brand"),
    status: requireString(record, "status"),
    available: requireBoolean(record, "available"),
    price_min_cents: requireNumber(record, "price_min_cents"),
    price_max_cents: requireNumber(record, "price_max_cents"),
    image_embedding_model: requireString(record, "image_embedding_model"),
    image_embedding_dimensions: requireNumber(record, "image_embedding_dimensions"),
    image_hash: requireString(record, "image_hash"),
    ingest_batch_id: requireString(record, "ingest_batch_id"),
    source_dataset: requireString(record, "source_dataset"),
    source_version: requireString(record, "source_version"),
    data_version: requireString(record, "data_version"),
  };
}

function requireImageDocType(
  record: Record<string, unknown>,
  key: string,
): "image_main" {
  const value = requireString(record, key);

  if (value !== "image_main") {
    throw new VectorSearchError(`Qdrant payload field ${key} must be image_main.`);
  }

  return value;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new VectorSearchError(`Qdrant payload field ${key} must be a string.`);
  }

  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new VectorSearchError(`Qdrant payload field ${key} must be a string.`);
  }

  return value;
}

function requireNumber(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = record[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new VectorSearchError(`Qdrant payload field ${key} must be a number.`);
  }

  return value;
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean {
  const value = record[key];

  if (typeof value !== "boolean") {
    throw new VectorSearchError(`Qdrant payload field ${key} must be a boolean.`);
  }

  return value;
}

function requireStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] {
  const value = record[key];

  if (
    !Array.isArray(value)
    || !value.every((item) => typeof item === "string")
  ) {
    throw new VectorSearchError(
      `Qdrant payload field ${key} must be a string array.`,
    );
  }

  return value;
}

function assertCollectionMatches(
  info: Schemas["CollectionInfo"],
  config: ImageVectorCollectionConfig,
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
    throw new VectorSearchError("Image vector search was aborted.", {
      cause: signal.reason,
    });
  }
}
