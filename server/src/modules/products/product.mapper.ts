import type {
  NormalizedProduct,
  NormalizedSku,
} from "../../lib/catalog/types";
import type {
  JsonValue,
  ProductSkuUpsertInput,
  ProductWithSkusUpsertInput,
} from "./product.types";

function toJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
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
