import type { Schemas } from "@qdrant/js-client-rest";
import type { RagDocument } from "./rag-document.types";
import type { RagWearingStyle } from "./rag-negative-fact-metadata";
import type { VectorSearchFilters, VectorSearchHit } from "./vector-search.types";

export type QdrantDistance = "Cosine";
export type QdrantCondition = Schemas["Condition"];
export type QdrantFilter = Schemas["Filter"];
export type QdrantPoint = Schemas["PointStruct"];
export type QdrantScoredPoint = Schemas["ScoredPoint"];

export interface VectorCollectionConfig {
  collectionName: string;
  dimensions: number;
  distance: QdrantDistance;
  recreate: boolean;
}

export interface QdrantDocumentPayload {
  doc_id: string;
  product_id: string;
  doc_type: string;
  status: string;
  category: string;
  sub_category?: string;
  brand: string;
  tags: string[];
  recommend_when: string[];
  avoid_when: string[];
  free_from_terms: string[];
  risk_terms: string[];
  wearing_styles: RagWearingStyle[];
  block_type?: string;
  ingest_batch_id: string;
  embedding_model: string;
  embedding_dimensions: number;
  document_hash: string;
  snippet: string;
  available: boolean;
  price_min_cents: number;
  price_max_cents: number;
  source_dataset: string;
  source_version: string;
  data_version: string;
}

export interface EmbeddedRagDocument {
  document: RagDocument;
  pointId: string;
  vector: number[];
  payload: QdrantDocumentPayload;
}

export interface VectorStore {
  ensureCollection(config: VectorCollectionConfig): Promise<void>;
  upsertDocuments(input: {
    collectionName: string;
    items: EmbeddedRagDocument[];
  }): Promise<void>;
  search(input: {
    collectionName: string;
    vector: number[];
    filters?: VectorSearchFilters;
    topK: number;
    abortSignal?: AbortSignal;
  }): Promise<VectorSearchHit[]>;
}
