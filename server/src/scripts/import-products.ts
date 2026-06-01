import { existsSync } from "node:fs";
import type { PoolClient } from "pg";
import {
  createDatabasePool,
  withTransaction,
} from "../lib/db/pool";
import { getEnv } from "../lib/env";
import {
  getCatalogPaths,
  readNormalizedProducts,
} from "../lib/catalog/catalog-pipeline";
import type {
  CatalogManifest,
  NormalizedProduct,
  ValidationReport,
} from "../lib/catalog/types";
import { mapNormalizedProductsToUpsertInputs } from "../modules/products/product.mapper";
import {
  upsertProductsWithSkus,
  type ProductImportSummary,
} from "../modules/products/product.repository";
import { readJsonFile } from "../utils/json-files";

async function readOptionalValidationReport(
  filePath: string,
): Promise<ValidationReport | undefined> {
  if (!existsSync(filePath)) {
    return undefined;
  }

  return readJsonFile<ValidationReport>(filePath);
}

async function recordImportBatch(
  client: PoolClient,
  manifest: CatalogManifest,
  processedItemCount: number,
  errorCount: number,
): Promise<void> {
  await client.query(
    `
      INSERT INTO catalog_import_batches (
        id,
        source_dataset,
        source_version,
        source_type,
        data_version,
        is_desensitized,
        source_path,
        dry_run,
        status,
        raw_item_count,
        processed_item_count,
        error_count,
        started_at,
        finished_at,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, 'completed', $8, $9, $10, NOW(), NOW(), $11)
      ON CONFLICT (id) DO UPDATE SET
        source_dataset = EXCLUDED.source_dataset,
        source_version = EXCLUDED.source_version,
        source_type = EXCLUDED.source_type,
        data_version = EXCLUDED.data_version,
        is_desensitized = EXCLUDED.is_desensitized,
        source_path = EXCLUDED.source_path,
        dry_run = EXCLUDED.dry_run,
        status = EXCLUDED.status,
        raw_item_count = EXCLUDED.raw_item_count,
        processed_item_count = EXCLUDED.processed_item_count,
        error_count = EXCLUDED.error_count,
        finished_at = EXCLUDED.finished_at,
        notes = EXCLUDED.notes
    `,
    [
      manifest.ingest_batch_id,
      manifest.source_dataset,
      manifest.source_version,
      manifest.source_type,
      manifest.data_version,
      manifest.is_desensitized,
      manifest.source_path,
      manifest.raw_item_count,
      processedItemCount,
      errorCount,
      "Imported product schema records from processed catalog artifacts.",
    ],
  );
}

function assertProductBatchMatchesManifest(
  manifest: CatalogManifest,
  products: NormalizedProduct[],
): void {
  const mismatchedProduct = products.find(
    (product) => product.source.ingest_batch_id !== manifest.ingest_batch_id,
  );

  if (!mismatchedProduct) {
    return;
  }

  throw new Error(
    `Product ${mismatchedProduct.product_id} uses ingest_batch_id ${mismatchedProduct.source.ingest_batch_id}, expected ${manifest.ingest_batch_id}.`,
  );
}

export async function importProductsCommand(): Promise<void> {
  const env = getEnv();
  const paths = getCatalogPaths(env.processedDataDir);
  const products = await readNormalizedProducts(paths.normalizedProducts);
  const manifest = await readJsonFile<CatalogManifest>(paths.importManifest);
  const validationReport = await readOptionalValidationReport(
    paths.validationReport,
  );
  const errorCount =
    validationReport?.error_count ?? manifest.error_count;

  if (env.importStrict && errorCount > 0) {
    throw new Error(
      `Import blocked by ${errorCount} validation errors in strict mode.`,
    );
  }

  assertProductBatchMatchesManifest(manifest, products);

  if (env.importDryRun) {
    console.log(
      `Dry-run import: ${products.length} products would be upserted as batch ${manifest.ingest_batch_id}.`,
    );
    console.log("No PostgreSQL connection was opened because IMPORT_DRY_RUN=true.");
    return;
  }

  const pool = createDatabasePool({ allowExitOnIdle: true });

  try {
    const summary = await withTransaction(
      pool,
      async (client): Promise<ProductImportSummary> => {
        await recordImportBatch(client, manifest, products.length, errorCount);
        return upsertProductsWithSkus(
          client,
          mapNormalizedProductsToUpsertInputs(products),
        );
      },
    );

    console.log(
      `Imported catalog batch ${manifest.ingest_batch_id}: ${summary.productCount} products, ${summary.skuCount} SKUs.`,
    );
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  importProductsCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
