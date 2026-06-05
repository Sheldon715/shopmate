export type ProductImageDocumentType = "image_main";

export interface ProductImageDocument {
  docId: string;
  productId: string;
  docType: ProductImageDocumentType;
  imagePath: string;
  imageMimeType: string;
  visualCaption: string;
  visualTags: string[];
  category: string;
  subCategory: string | null;
  brand: string;
  status: string;
  available: boolean;
  sourceDataset: string;
  sourceVersion: string;
  dataVersion: string;
  ingestBatchId: string;
  priceMinCents: number;
  priceMaxCents: number;
  imageHash: string;
}

export interface ProductImageDocumentManifest {
  source: "postgres" | "processed";
  ingest_batch_id: string;
  product_count: number;
  document_count: number;
  skipped_missing_image_count: number;
  generated_at: string;
  output_path: string;
  document_types: ProductImageDocumentType[];
  source_dataset?: string;
  source_version?: string;
  data_version?: string;
}

export interface SkippedProductImageDocument {
  productId: string;
  reason: "missing_image_path" | "missing_image_file" | "unsupported_image_type";
  imagePath?: string;
}
