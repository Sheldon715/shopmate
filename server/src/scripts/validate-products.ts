import { getEnv } from "../lib/env";
import {
  ensureCatalogDirectory,
  getCatalogPaths,
  readNormalizedProducts,
  validateProducts,
  writeJsonFile,
} from "../lib/catalog/catalog-pipeline";

export async function validateProductsCommand(): Promise<void> {
  const env = getEnv();
  const paths = getCatalogPaths(env.processedDataDir);
  const products = await readNormalizedProducts(paths.normalizedProducts);
  const { validationReport, duplicateReport } = validateProducts(
    products,
    env.rawDataDir,
  );

  await ensureCatalogDirectory(paths);
  await writeJsonFile(paths.validationReport, validationReport);
  await writeJsonFile(paths.duplicateReport, duplicateReport);

  console.log(
    `Validated ${validationReport.item_count} products: ${validationReport.error_count} errors, ${validationReport.warning_count} warnings.`,
  );
  console.log(`Wrote ${paths.validationReport}`);
  console.log(`Wrote ${paths.duplicateReport}`);

  if (env.importStrict && validationReport.error_count > 0) {
    throw new Error(
      `Validation failed with ${validationReport.error_count} errors in strict mode.`,
    );
  }
}

if (require.main === module) {
  validateProductsCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
