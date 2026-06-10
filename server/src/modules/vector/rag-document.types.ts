import type { JsonValue } from "../products/product.types";
import type { RagWearingStyle } from "./rag-negative-fact-metadata";

export type RagDocumentType =
  | "product_profile"
  | "product_specs"
  | "selling_points"
  | "use_cases"
  | "reviews_summary"
  | "constraints"
  | "faq";

export interface RagDocumentMetadata {
  productName: string;
  brand: string;
  category: string;
  subCategory: string | null;
  status: string;
  available: boolean;
  priceMinCents: number;
  priceMaxCents: number;
  currency: string;
  tags: string[];
  recommendWhen: string[];
  avoidWhen: string[];
  freeFromTerms: string[];
  riskTerms: string[];
  wearingStyles: RagWearingStyle[];
  pros: string[];
  cons: string[];
  sourceDataset: string;
  sourceVersion: string;
  sourceType: string;
  dataVersion: string;
  isDesensitized: boolean;
  ingestBatchId: string;
  sourcePath: string;
  docType: RagDocumentType;
  blockId?: string;
  blockType?: string;
  faqIndex?: number;
  documentHash: string;
}

export interface RagDocument {
  docId: string;
  productId: string;
  docType: RagDocumentType;
  text: string;
  snippet: string;
  metadata: RagDocumentMetadata;
}

export interface RagDocumentManifest {
  source: "postgres" | "processed";
  ingest_batch_id: string;
  product_count: number;
  document_count: number;
  generated_at: string;
  output_path: string;
  document_types: RagDocumentType[];
  source_dataset?: string;
  source_version?: string;
  data_version?: string;
}

export type JsonRecord = Record<string, JsonValue>;
