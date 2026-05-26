import type {
  NormalizedProduct,
  NormalizedSku,
} from "../../lib/catalog/types";
import type {
  JsonValue,
  Product,
  ProductCardDto,
  ProductDetailDto,
  ProductRow,
  ProductSku,
  ProductSkuRow,
  ProductSkuUpsertInput,
  ProductWithSkusUpsertInput,
} from "./product.types";

function toJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function toRecordOfStringArrays(value: JsonValue): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string[]> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (Array.isArray(rawValue)) {
      result[key] = rawValue.filter(
        (item): item is string => typeof item === "string",
      );
      continue;
    }

    if (typeof rawValue === "string") {
      result[key] = [rawValue];
    }
  }

  return result;
}

function toStringArray(value: JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toStringRecord(value: JsonValue): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
    ) {
      result[key] = String(rawValue);
    }
  }

  return result;
}

function parseRating(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function optionalText(value: string | undefined): string | null {
  return value ?? null;
}

export function moneyToCents(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative finite number.`);
  }

  return Math.round((value + Number.EPSILON) * 100);
}

function mapPriceRangeToCents(product: NormalizedProduct): {
  min: number;
  max: number;
} {
  const basePriceCents = moneyToCents(product.base_price, "base_price");
  const range = product.price_range
    .filter((price) => Number.isFinite(price) && price >= 0)
    .map((price) => moneyToCents(price, "price_range"));

  if (range.length === 0) {
    return { min: basePriceCents, max: basePriceCents };
  }

  return {
    min: Math.min(...range),
    max: Math.max(...range),
  };
}

function mapNormalizedSkuToUpsertInput(
  product: NormalizedProduct,
  sku: NormalizedSku,
  index: number,
): ProductSkuUpsertInput {
  return {
    id: sku.sku_id,
    productId: product.product_id,
    properties: toJsonValue(sku.properties),
    priceCents: moneyToCents(sku.price, `skus[${index}].price`),
    currency: product.currency,
    available: sku.available ?? true,
    stockLevel: sku.stock_level ?? null,
    sortOrder: index,
  };
}

export function mapNormalizedProductToUpsertInput(
  product: NormalizedProduct,
): ProductWithSkusUpsertInput {
  const priceRange = mapPriceRangeToCents(product);

  return {
    product: {
      id: product.product_id,
      status: product.status,
      name: product.name,
      brand: product.brand,
      category: product.category,
      subCategory: optionalText(product.sub_category),
      imagePath: optionalText(product.image_path),
      imageCaption: optionalText(product.image_caption),
      currency: product.currency,
      basePriceCents: moneyToCents(product.base_price, "base_price"),
      priceMinCents: priceRange.min,
      priceMaxCents: priceRange.max,
      marketingDescription: product.marketing_description,
      knowledgeText: product.knowledge_text,
      ratingAvg: product.review_summary.rating_avg ?? null,
      categoryPath: toJsonValue(product.category_path),
      visualTags: toJsonValue(product.visual_tags),
      attributes: toJsonValue(product.attributes),
      pros: toJsonValue(product.pros),
      cons: toJsonValue(product.cons),
      recommendWhen: toJsonValue(product.recommend_when),
      avoidWhen: toJsonValue(product.avoid_when),
      compareWith: toJsonValue(product.compare_with),
      reviewSummary: toJsonValue(product.review_summary),
      contentBlocks: toJsonValue(product.content_blocks),
      officialFaq: toJsonValue(product.official_faq),
      userReviews: toJsonValue(product.user_reviews),
      normalizedPayload: toJsonValue(product),
      sourceDataset: product.source.source_dataset,
      sourceVersion: product.source.source_version,
      sourceType: product.source.source_type,
      dataVersion: product.source.data_version,
      isDesensitized: product.source.is_desensitized,
      ingestBatchId: product.source.ingest_batch_id,
      sourcePath: product.source.source_path,
    },
    skus: product.skus.map((sku, index) =>
      mapNormalizedSkuToUpsertInput(product, sku, index),
    ),
  };
}

export function mapNormalizedProductsToUpsertInputs(
  products: NormalizedProduct[],
): ProductWithSkusUpsertInput[] {
  return products.map((product) => mapNormalizedProductToUpsertInput(product));
}

export function mapProductSkuRowToProductSku(row: ProductSkuRow): ProductSku {
  return {
    id: row.id,
    productId: row.product_id,
    properties: toStringRecord(row.properties),
    priceCents: row.price_cents,
    currency: row.currency,
    available: row.available,
    stockLevel: row.stock_level,
    sortOrder: row.sort_order,
  };
}

export function mapProductRowToProduct(
  row: ProductRow,
  skus: ProductSku[] = [],
): Product {
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subCategory: row.sub_category,
    imagePath: row.image_path,
    imageCaption: row.image_caption,
    currency: row.currency,
    basePriceCents: row.base_price_cents,
    priceMinCents: row.price_min_cents,
    priceMaxCents: row.price_max_cents,
    marketingDescription: row.marketing_description,
    knowledgeText: row.knowledge_text,
    ratingAvg: parseRating(row.rating_avg),
    categoryPath: toStringArray(row.category_path),
    visualTags: toStringArray(row.visual_tags),
    attributes: toRecordOfStringArrays(row.attributes),
    pros: toStringArray(row.pros),
    cons: toStringArray(row.cons),
    recommendWhen: toStringArray(row.recommend_when),
    avoidWhen: toStringArray(row.avoid_when),
    compareWith: toStringArray(row.compare_with),
    reviewSummary: row.review_summary,
    contentBlocks: row.content_blocks,
    officialFaq: row.official_faq,
    userReviews: row.user_reviews,
    normalizedPayload: row.normalized_payload,
    sourceDataset: row.source_dataset,
    sourceVersion: row.source_version,
    sourceType: row.source_type,
    dataVersion: row.data_version,
    isDesensitized: row.is_desensitized,
    ingestBatchId: row.ingest_batch_id,
    sourcePath: row.source_path,
    skus,
  };
}

export function mapProductToCardDto(product: Product): ProductCardDto {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    subCategory: product.subCategory,
    priceCents: product.basePriceCents,
    priceRangeCents: {
      min: product.priceMinCents,
      max: product.priceMaxCents,
    },
    currency: product.currency,
    imagePath: product.imagePath,
    ratingAvg: product.ratingAvg,
    tags: product.visualTags,
    available: product.skus.length === 0
      ? product.status === "active"
      : product.skus.some((sku) => sku.available),
  };
}

export function mapProductToDetailDto(product: Product): ProductDetailDto {
  return {
    ...mapProductToCardDto(product),
    marketingDescription: product.marketingDescription,
    skus: product.skus,
    attributes: product.attributes,
    pros: product.pros,
    cons: product.cons,
    recommendWhen: product.recommendWhen,
    avoidWhen: product.avoidWhen,
    reviewSummary: product.reviewSummary,
    officialFaq: product.officialFaq,
    contentBlocks: product.contentBlocks,
  };
}
