export interface VectorSearchFilters {
  category?: string;
  subCategory?: string;
  brand?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  availableOnly?: boolean;
  tagsAny?: string[];
  avoidTerms?: string[];
}

export interface VectorSearchHitMetadata {
  docType: string;
  category: string;
  subCategory: string | null;
  brand: string;
  tags: string[];
  recommendWhen: string[];
  avoidWhen: string[];
  blockType: string | null;
  priceMinCents: number;
  priceMaxCents: number;
  available: boolean;
  embeddingModel: string;
  embeddingDimensions: number;
  ingestBatchId: string;
}

export interface VectorSearchHit {
  docId: string;
  productId: string;
  score: number;
  snippet: string;
  metadata: VectorSearchHitMetadata;
}
