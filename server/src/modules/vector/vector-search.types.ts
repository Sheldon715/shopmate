import type { RagWearingStyle } from "./rag-negative-fact-metadata";

export interface VectorSearchFilters {
  category?: string;
  subCategory?: string;
  brand?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  availableOnly?: boolean;
  tagsAny?: string[];
  avoidTerms?: string[];
  excludeRiskTerms?: string[];
  excludeWearingStyles?: RagWearingStyle[];
  excludeBrands?: string[];
  excludeProductIds?: string[];
  excludeCategories?: string[];
}

export interface VectorSearchHitMetadata {
  docType: string;
  category: string;
  subCategory: string | null;
  brand: string;
  tags: string[];
  recommendWhen: string[];
  avoidWhen: string[];
  freeFromTerms: string[];
  riskTerms: string[];
  wearingStyles: RagWearingStyle[];
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
