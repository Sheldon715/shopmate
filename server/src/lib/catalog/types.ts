export interface CatalogSourceMetadata {
  source_dataset: string;
  source_version: string;
  source_type: string;
  data_version: string;
  is_desensitized: boolean;
  ingest_batch_id: string;
  source_path: string;
}

export interface NormalizedSku {
  sku_id: string;
  properties: Record<string, string>;
  price: number;
  available?: boolean;
  stock_level?: string;
}

export interface NormalizedContentBlock {
  block_id: string;
  block_type: string;
  title: string;
  content: string;
  keywords: string[];
}

export interface NormalizedReviewSummary {
  rating_avg?: number;
  positive_points: string[];
  negative_points: string[];
  common_complaints: string[];
}

export interface ProductFaq {
  question: string;
  answer: string;
}

export interface ProductReview {
  nickname: string;
  rating: number;
  content: string;
}

export interface NormalizedProduct {
  product_id: string;
  status: string;
  name: string;
  brand: string;
  category: string;
  sub_category?: string;
  category_path: string[];
  currency: string;
  base_price: number;
  price_range: number[];
  image_path?: string;
  image_caption?: string;
  visual_tags: string[];
  skus: NormalizedSku[];
  attributes: Record<string, string[]>;
  pros: string[];
  cons: string[];
  recommend_when: string[];
  avoid_when: string[];
  compare_with: string[];
  content_blocks: NormalizedContentBlock[];
  review_summary: NormalizedReviewSummary;
  marketing_description: string;
  official_faq: ProductFaq[];
  user_reviews: ProductReview[];
  knowledge_text: string;
  source: CatalogSourceMetadata;
}

export interface CatalogManifest {
  ingest_batch_id: string;
  source_dataset: string;
  source_version: string;
  source_type: string;
  data_version: string;
  is_desensitized: boolean;
  source_path: string;
  raw_item_count: number;
  processed_item_count: number;
  error_count: number;
  generated_at: string;
  normalized_output_path: string;
  errors: string[];
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  product_id?: string;
  source_path?: string;
}

export interface ValidationReport {
  generated_at: string;
  source_dataset: string;
  source_version: string;
  data_version: string;
  item_count: number;
  valid_item_count: number;
  error_count: number;
  warning_count: number;
  status: "valid" | "invalid";
  issues: ValidationIssue[];
}

export interface DuplicateEntry {
  value: string;
  source_paths: string[];
}

export interface DuplicateReport {
  generated_at: string;
  duplicate_product_ids: DuplicateEntry[];
  duplicate_sku_ids: DuplicateEntry[];
}
