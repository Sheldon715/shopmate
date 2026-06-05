import { existsSync } from "node:fs";
import path from "node:path";
import { getCatalogPaths } from "../lib/catalog/catalog-pipeline";
import type { CatalogManifest } from "../lib/catalog/types";
import { getEnv } from "../lib/env";
import {
  applyLimit,
  getProductBatchInfo,
  parseSource,
  readProductsFromPostgres,
  readProductsFromProcessed,
  type RagSource,
} from "./build-rag-documents";
import {
  buildProductImageDocuments,
} from "../modules/vector/image-document.builder";
import type {
  ProductImageDocument,
  ProductImageDocumentManifest,
  SkippedProductImageDocument,
} from "../modules/vector/image-document.types";
import {
  parsePositiveInteger,
  readNext,
} from "../utils/cli";
import {
  readJsonFile,
  writeJsonFile,
  writeJsonlFile,
} from "../utils/json-files";

interface BuildImageDocumentsOptions {
  source: RagSource;
  dryRun: boolean;
  limit?: number;
}

const OUTPUT_DOCUMENTS_FILE = "image-documents.jsonl";
const OUTPUT_MANIFEST_FILE = "image-document-manifest.json";

function parseArgs(argv: string[]): BuildImageDocumentsOptions {
  const options: BuildImageDocumentsOptions = {
    source: "postgres",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--source=")) {
      options.source = parseSource(arg.slice("--source=".length));
      continue;
    }

    if (arg === "--source") {
      options.source = parseSource(
        readNext(argv, index, "--source", {
          missingMessage: "--source requires postgres or processed.",
          trim: false,
        }),
      );
      index += 1;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = parsePositiveInteger(
        arg.slice("--limit=".length),
        "--limit",
      );
      continue;
    }

    if (arg === "--limit") {
      options.limit = parsePositiveInteger(
        readNext(argv, index, "--limit", {
          missingMessage: "--limit requires a positive integer.",
          trim: false,
        }),
        "--limit",
      );
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function readOptionalCatalogManifest(
  filePath: string,
): Promise<CatalogManifest | undefined> {
  if (!existsSync(filePath)) {
    return undefined;
  }

  return readJsonFile<CatalogManifest>(filePath);
}

function createManifest(input: {
  source: RagSource;
  productsCount: number;
  documents: ProductImageDocument[];
  skipped: SkippedProductImageDocument[];
  catalogManifest?: CatalogManifest;
  products: Parameters<typeof getProductBatchInfo>[0];
}): ProductImageDocumentManifest {
  const batchInfo = getProductBatchInfo(input.products, input.catalogManifest);

  return {
    source: input.source,
    ingest_batch_id: batchInfo.ingestBatchId,
    product_count: input.productsCount,
    document_count: input.documents.length,
    skipped_missing_image_count: input.skipped.length,
    generated_at: new Date().toISOString(),
    output_path: `rag/${OUTPUT_DOCUMENTS_FILE}`,
    document_types: ["image_main"],
    source_dataset: batchInfo.sourceDataset,
    source_version: batchInfo.sourceVersion,
    data_version: batchInfo.dataVersion,
  };
}

async function writeImageDocuments(
  ragDataDir: string,
  documents: ProductImageDocument[],
  manifest: ProductImageDocumentManifest,
): Promise<void> {
  await writeJsonlFile(path.join(ragDataDir, OUTPUT_DOCUMENTS_FILE), documents);
  await writeJsonFile(path.join(ragDataDir, OUTPUT_MANIFEST_FILE), manifest);
}

export async function buildImageDocumentsCommand(
  options = parseArgs(process.argv.slice(2)),
): Promise<void> {
  const env = getEnv();
  const catalogPaths = getCatalogPaths(env.processedDataDir);
  const catalogManifest = await readOptionalCatalogManifest(
    catalogPaths.importManifest,
  );
  const products = applyLimit(
    options.source === "postgres"
      ? await readProductsFromPostgres()
      : await readProductsFromProcessed(env.processedDataDir),
    options.limit,
  );
  const { documents, skipped } = await buildProductImageDocuments(products, {
    staticImageRoot: env.staticImageRoot,
  });
  const manifest = createManifest({
    source: options.source,
    productsCount: products.length,
    products,
    documents,
    skipped,
    catalogManifest,
  });

  if (options.dryRun) {
    console.log(
      `Dry-run image documents (${options.source}): ${products.length} products, ${documents.length} image documents, ${skipped.length} skipped.`,
    );
    return;
  }

  await writeImageDocuments(env.ragDataDir, documents, manifest);

  console.log(
    `Generated image documents from ${options.source}: ${products.length} products, ${documents.length} image documents, ${skipped.length} skipped.`,
  );
  console.log(`Wrote ${path.join(env.ragDataDir, OUTPUT_DOCUMENTS_FILE)}.`);
  console.log(`Wrote ${path.join(env.ragDataDir, OUTPUT_MANIFEST_FILE)}.`);
}

if (require.main === module) {
  buildImageDocumentsCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
