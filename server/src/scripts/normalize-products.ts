import { getEnv } from "../lib/env";
import {
  ensureCatalogDirectory,
  getCatalogPaths,
  normalizeCanonicalDataset,
  writeJsonFile,
  writeNormalizedProducts,
} from "../lib/catalog/catalog-pipeline";

export async function normalizeProductsCommand(): Promise<void> {
  const env = getEnv();
  const paths = getCatalogPaths(env.processedDataDir);
  const result = await normalizeCanonicalDataset(
    env.rawDataDir,
    env.processedDataDir,
  );

  await ensureCatalogDirectory(paths);
  await writeNormalizedProducts(paths.normalizedProducts, result.products);
  await writeJsonFile(paths.importManifest, result.manifest);

  console.log(
    `Normalized ${result.products.length}/${result.manifest.raw_item_count} products from ecommerce_agent_dataset_v3.`,
  );
  console.log(`Wrote ${paths.normalizedProducts}`);
  console.log(`Wrote ${paths.importManifest}`);

  if (env.importStrict && result.manifest.error_count > 0) {
    throw new Error(
      `Normalization produced ${result.manifest.error_count} errors in strict mode.`,
    );
  }
}

if (require.main === module) {
  normalizeProductsCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
