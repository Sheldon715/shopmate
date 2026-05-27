import type { Pool, PoolClient } from "pg";
import {
  mapProductRowToProduct,
  mapProductSkuRowToProductSku,
} from "./product.mapper";
import type {
  JsonValue,
  Product,
  ProductListQuery,
  ProductRow,
  ProductSku,
  ProductSkuRow,
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

type ProductQueryClient = Pool | PoolClient;

function buildProductFilters(query: ProductListQuery): {
  whereSql: string;
  values: (string | number)[];
} {
  const clauses = ["status = 'active'"];
  const values: (string | number)[] = [];

  function addValue(value: string | number): string {
    values.push(value);
    return `$${values.length}`;
  }

  if (query.q) {
    const placeholder = addValue(`%${query.q.toLowerCase()}%`);
    clauses.push(`
      (
        LOWER(name) LIKE ${placeholder}
        OR LOWER(brand) LIKE ${placeholder}
        OR LOWER(category) LIKE ${placeholder}
        OR LOWER(COALESCE(sub_category, '')) LIKE ${placeholder}
        OR LOWER(marketing_description) LIKE ${placeholder}
      )
    `);
  }

  if (query.category) {
    clauses.push(`category = ${addValue(query.category)}`);
  }

  if (query.subCategory) {
    clauses.push(`sub_category = ${addValue(query.subCategory)}`);
  }

  if (query.brand) {
    clauses.push(`brand = ${addValue(query.brand)}`);
  }

  if (query.minPriceCents !== undefined) {
    clauses.push(`price_max_cents >= ${addValue(query.minPriceCents)}`);
  }

  if (query.maxPriceCents !== undefined) {
    clauses.push(`price_min_cents <= ${addValue(query.maxPriceCents)}`);
  }

  return {
    whereSql: clauses.join(" AND "),
    values,
  };
}

async function findSkusByProductIds(
  client: ProductQueryClient,
  productIds: string[],
): Promise<Map<string, ProductSku[]>> {
  const skusByProductId = new Map<string, ProductSku[]>();

  if (productIds.length === 0) {
    return skusByProductId;
  }

  const result = await client.query<ProductSkuRow>(
    `
      SELECT *
      FROM product_skus
      WHERE product_id = ANY($1::text[])
      ORDER BY product_id ASC, sort_order ASC, id ASC
    `,
    [productIds],
  );

  for (const row of result.rows) {
    const sku = mapProductSkuRowToProductSku(row);
    const existing = skusByProductId.get(sku.productId) ?? [];
    existing.push(sku);
    skusByProductId.set(sku.productId, existing);
  }

  return skusByProductId;
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

export async function findProducts(
  client: ProductQueryClient,
  query: ProductListQuery,
): Promise<Product[]> {
  const filters = buildProductFilters(query);
  const limitPlaceholder = `$${filters.values.length + 1}`;
  const offsetPlaceholder = `$${filters.values.length + 2}`;

  const result = await client.query<ProductRow>(
    `
      SELECT *
      FROM products
      WHERE ${filters.whereSql}
      ORDER BY name ASC, id ASC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `,
    [...filters.values, query.limit, query.offset],
  );

  const skusByProductId = await findSkusByProductIds(
    client,
    result.rows.map((row) => row.id),
  );

  return result.rows.map((row) =>
    mapProductRowToProduct(row, skusByProductId.get(row.id) ?? []),
  );
}

export async function findActiveProductsForRag(
  client: ProductQueryClient,
): Promise<Product[]> {
  const result = await client.query<ProductRow>(
    `
      SELECT *
      FROM products
      WHERE status = 'active'
      ORDER BY category ASC, sub_category ASC, name ASC, id ASC
    `,
  );

  const skusByProductId = await findSkusByProductIds(
    client,
    result.rows.map((row) => row.id),
  );

  return result.rows.map((row) =>
    mapProductRowToProduct(row, skusByProductId.get(row.id) ?? []),
  );
}

export async function findActiveProductsByIds(
  client: ProductQueryClient,
  productIds: string[],
): Promise<Product[]> {
  const uniqueIds = uniqueNonEmptyProductIds(productIds);

  if (uniqueIds.length === 0) {
    return [];
  }

  const result = await client.query<ProductRow>(
    `
      SELECT *
      FROM products
      WHERE id = ANY($1::text[])
        AND status = 'active'
    `,
    [uniqueIds],
  );

  const skusByProductId = await findSkusByProductIds(
    client,
    result.rows.map((row) => row.id),
  );
  const productsById = new Map(
    result.rows.map((row) => [
      row.id,
      mapProductRowToProduct(row, skusByProductId.get(row.id) ?? []),
    ]),
  );

  return uniqueIds.flatMap((productId) => {
    const product = productsById.get(productId);

    return product ? [product] : [];
  });
}

export async function findProductById(
  client: ProductQueryClient,
  productId: string,
): Promise<Product | null> {
  const result = await client.query<ProductRow>(
    `
      SELECT *
      FROM products
      WHERE id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [productId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const skusByProductId = await findSkusByProductIds(client, [productId]);

  return mapProductRowToProduct(row, skusByProductId.get(productId) ?? []);
}

function uniqueNonEmptyProductIds(productIds: string[]): string[] {
  const seen = new Set<string>();
  const uniqueIds: string[] = [];

  for (const rawId of productIds) {
    const productId = rawId.trim();

    if (productId.length === 0 || seen.has(productId)) {
      continue;
    }

    seen.add(productId);
    uniqueIds.push(productId);
  }

  return uniqueIds;
}
