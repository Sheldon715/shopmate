export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ProductRow {
  id: string;
  status: string;
  name: string;
  brand: string;
  category: string;
  sub_category: string | null;
  image_path: string | null;
  image_caption: string | null;
  currency: string;
  base_price_cents: number;
  price_min_cents: number;
  price_max_cents: number;
  marketing_description: string;
  knowledge_text: string;
  rating_avg: string | number | null;
  category_path: JsonValue;
  visual_tags: JsonValue;
  attributes: JsonValue;
  pros: JsonValue;
  cons: JsonValue;
  recommend_when: JsonValue;
  avoid_when: JsonValue;
  compare_with: JsonValue;
  review_summary: JsonValue;
  content_blocks: JsonValue;
  official_faq: JsonValue;
  user_reviews: JsonValue;
  normalized_payload: JsonValue;
  source_dataset: string;
  source_version: string;
  source_type: string;
  data_version: string;
  is_desensitized: boolean;
  ingest_batch_id: string;
  source_path: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProductSkuRow {
  id: string;
  product_id: string;
  properties: JsonValue;
  price_cents: number;
  currency: string;
  available: boolean;
  stock_level: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface ProductSku {
  id: string;
  productId: string;
  properties: Record<string, string>;
  priceCents: number;
  currency: string;
  available: boolean;
  stockLevel: string | null;
  sortOrder: number;
}

export interface Product {
  id: string;
  status: string;
  name: string;
  brand: string;
  category: string;
  subCategory: string | null;
  imagePath: string | null;
  imageCaption: string | null;
  currency: string;
  basePriceCents: number;
  priceMinCents: number;
  priceMaxCents: number;
  marketingDescription: string;
  knowledgeText: string;
  ratingAvg: number | null;
  categoryPath: string[];
  visualTags: string[];
  attributes: Record<string, string[]>;
  pros: string[];
  cons: string[];
  recommendWhen: string[];
  avoidWhen: string[];
  compareWith: string[];
  reviewSummary: JsonValue;
  contentBlocks: JsonValue;
  officialFaq: JsonValue;
  userReviews: JsonValue;
  normalizedPayload: JsonValue;
  skus: ProductSku[];
}

export interface ProductPriceRangeCents {
  min: number;
  max: number;
}

export interface ProductCardDto {
  id: string;
  name: string;
  brand: string;
  category: string;
  subCategory: string | null;
  priceCents: number;
  priceRangeCents: ProductPriceRangeCents;
  currency: string;
  imagePath: string | null;
  ratingAvg: number | null;
  tags: string[];
  available: boolean;
}

export interface ProductDetailDto extends ProductCardDto {
  marketingDescription: string;
  skus: ProductSku[];
  attributes: Record<string, string[]>;
  pros: string[];
  cons: string[];
  recommendWhen: string[];
  avoidWhen: string[];
  reviewSummary: JsonValue;
  officialFaq: JsonValue;
  contentBlocks: JsonValue;
}

export interface ProductListQuery {
  q?: string;
  category?: string;
  subCategory?: string;
  brand?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  limit: number;
  offset: number;
}

export interface ProductSkuUpsertInput {
  id: string;
  productId: string;
  properties: JsonValue;
  priceCents: number;
  currency: string;
  available: boolean;
  stockLevel: string | null;
  sortOrder: number;
}

export interface ProductUpsertInput {
  id: string;
  status: string;
  name: string;
  brand: string;
  category: string;
  subCategory: string | null;
  imagePath: string | null;
  imageCaption: string | null;
  currency: string;
  basePriceCents: number;
  priceMinCents: number;
  priceMaxCents: number;
  marketingDescription: string;
  knowledgeText: string;
  ratingAvg: number | null;
  categoryPath: JsonValue;
  visualTags: JsonValue;
  attributes: JsonValue;
  pros: JsonValue;
  cons: JsonValue;
  recommendWhen: JsonValue;
  avoidWhen: JsonValue;
  compareWith: JsonValue;
  reviewSummary: JsonValue;
  contentBlocks: JsonValue;
  officialFaq: JsonValue;
  userReviews: JsonValue;
  normalizedPayload: JsonValue;
  sourceDataset: string;
  sourceVersion: string;
  sourceType: string;
  dataVersion: string;
  isDesensitized: boolean;
  ingestBatchId: string;
  sourcePath: string;
}

export interface ProductWithSkusUpsertInput {
  product: ProductUpsertInput;
  skus: ProductSkuUpsertInput[];
}
