import type { PoolClient } from "pg";
import type {
  JsonValue,
  ProductSkuUpsertInput,
  ProductUpsertInput,
  ProductWithSkusUpsertInput,
} from "./product.types";

export interface ProductImportSummary {
  productCount: number;
  skuCount: number;
}

function stringifyJson(value: JsonValue): string {
  return JSON.stringify(value);
}

async function upsertProduct(
  client: PoolClient,
  product: ProductUpsertInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO products (
        id,
        status,
        name,
        brand,
        category,
        sub_category,
        image_path,
        image_caption,
        currency,
        base_price_cents,
        price_min_cents,
        price_max_cents,
        marketing_description,
        knowledge_text,
        rating_avg,
        category_path,
        visual_tags,
        attributes,
        pros,
        cons,
        recommend_when,
        avoid_when,
        compare_with,
        review_summary,
        content_blocks,
        official_faq,
        user_reviews,
        normalized_payload,
        source_dataset,
        source_version,
        source_type,
        data_version,
        is_desensitized,
        ingest_batch_id,
        source_path
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15,
        $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb,
        $21::jsonb, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb,
        $26::jsonb, $27::jsonb, $28::jsonb,
        $29, $30, $31, $32, $33, $34, $35
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        name = EXCLUDED.name,
        brand = EXCLUDED.brand,
        category = EXCLUDED.category,
        sub_category = EXCLUDED.sub_category,
        image_path = EXCLUDED.image_path,
        image_caption = EXCLUDED.image_caption,
        currency = EXCLUDED.currency,
        base_price_cents = EXCLUDED.base_price_cents,
        price_min_cents = EXCLUDED.price_min_cents,
        price_max_cents = EXCLUDED.price_max_cents,
        marketing_description = EXCLUDED.marketing_description,
        knowledge_text = EXCLUDED.knowledge_text,
        rating_avg = EXCLUDED.rating_avg,
        category_path = EXCLUDED.category_path,
        visual_tags = EXCLUDED.visual_tags,
        attributes = EXCLUDED.attributes,
        pros = EXCLUDED.pros,
        cons = EXCLUDED.cons,
        recommend_when = EXCLUDED.recommend_when,
        avoid_when = EXCLUDED.avoid_when,
        compare_with = EXCLUDED.compare_with,
        review_summary = EXCLUDED.review_summary,
        content_blocks = EXCLUDED.content_blocks,
        official_faq = EXCLUDED.official_faq,
        user_reviews = EXCLUDED.user_reviews,
        normalized_payload = EXCLUDED.normalized_payload,
        source_dataset = EXCLUDED.source_dataset,
        source_version = EXCLUDED.source_version,
        source_type = EXCLUDED.source_type,
        data_version = EXCLUDED.data_version,
        is_desensitized = EXCLUDED.is_desensitized,
        ingest_batch_id = EXCLUDED.ingest_batch_id,
        source_path = EXCLUDED.source_path,
        updated_at = NOW()
    `,
    [
      product.id,
      product.status,
      product.name,
      product.brand,
      product.category,
      product.subCategory,
      product.imagePath,
      product.imageCaption,
      product.currency,
      product.basePriceCents,
      product.priceMinCents,
      product.priceMaxCents,
      product.marketingDescription,
      product.knowledgeText,
      product.ratingAvg,
      stringifyJson(product.categoryPath),
      stringifyJson(product.visualTags),
      stringifyJson(product.attributes),
      stringifyJson(product.pros),
      stringifyJson(product.cons),
      stringifyJson(product.recommendWhen),
      stringifyJson(product.avoidWhen),
      stringifyJson(product.compareWith),
      stringifyJson(product.reviewSummary),
      stringifyJson(product.contentBlocks),
      stringifyJson(product.officialFaq),
      stringifyJson(product.userReviews),
      stringifyJson(product.normalizedPayload),
      product.sourceDataset,
      product.sourceVersion,
      product.sourceType,
      product.dataVersion,
      product.isDesensitized,
      product.ingestBatchId,
      product.sourcePath,
    ],
  );
}

async function deleteStaleSkusForProduct(
  client: PoolClient,
  productId: string,
  currentSkuIds: string[],
): Promise<void> {
  if (currentSkuIds.length === 0) {
    await client.query("DELETE FROM product_skus WHERE product_id = $1", [
      productId,
    ]);
    return;
  }

  await client.query(
    `
      DELETE FROM product_skus
      WHERE product_id = $1
        AND id <> ALL($2::text[])
    `,
    [productId, currentSkuIds],
  );
}

async function upsertSku(
  client: PoolClient,
  sku: ProductSkuUpsertInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO product_skus (
        id,
        product_id,
        properties,
        price_cents,
        currency,
        available,
        stock_level,
        sort_order
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        product_id = EXCLUDED.product_id,
        properties = EXCLUDED.properties,
        price_cents = EXCLUDED.price_cents,
        currency = EXCLUDED.currency,
        available = EXCLUDED.available,
        stock_level = EXCLUDED.stock_level,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
    `,
    [
      sku.id,
      sku.productId,
      stringifyJson(sku.properties),
      sku.priceCents,
      sku.currency,
      sku.available,
      sku.stockLevel,
      sku.sortOrder,
    ],
  );
}

export async function upsertProductsWithSkus(
  client: PoolClient,
  items: ProductWithSkusUpsertInput[],
): Promise<ProductImportSummary> {
  let skuCount = 0;

  for (const item of items) {
    await upsertProduct(client, item.product);
    await deleteStaleSkusForProduct(
      client,
      item.product.id,
      item.skus.map((sku) => sku.id),
    );

    for (const sku of item.skus) {
      await upsertSku(client, sku);
      skuCount += 1;
    }
  }

  return {
    productCount: items.length,
    skuCount,
  };
}
