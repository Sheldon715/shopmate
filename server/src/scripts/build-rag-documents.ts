import { existsSync } from "node:fs";
import path from "node:path";
import { getCatalogPaths, readNormalizedProducts } from "../lib/catalog/catalog-pipeline";
import type { CatalogManifest, NormalizedProduct } from "../lib/catalog/types";
import { createDatabasePool } from "../lib/db/pool";
import { getEnv } from "../lib/env";
import { mapNormalizedProductToUpsertInput } from "../modules/products/product.mapper";
import {
  findActiveProductsForRag,
} from "../modules/products/product.repository";
import type { Product, ProductSku } from "../modules/products/product.types";
import { buildRagDocuments } from "../modules/vector/rag-document.builder";
import type {
  RagDocument,
  RagDocumentManifest,
} from "../modules/vector/rag-document.types";
import {
  parsePositiveInteger,
  readNext,
} from "../utils/cli";
import {
  readJsonFile,
  writeJsonFile,
  writeJsonlFile,
} from "../utils/json-files";

type RagSource = "postgres" | "processed";

interface BuildRagDocumentsOptions {
  source: RagSource;
  dryRun: boolean;
  limit?: number;
}

interface ProductBatchInfo {
  ingestBatchId: string;
  sourceDataset?: string;
  sourceVersion?: string;
  dataVersion?: string;
}

const OUTPUT_DOCUMENTS_FILE = "product-documents.jsonl";
const OUTPUT_MANIFEST_FILE = "document-manifest.json";

function parseArgs(argv: string[]): BuildRagDocumentsOptions {
  const options: BuildRagDocumentsOptions = {
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

function parseSource(value: string): RagSource {
  if (value === "postgres" || value === "processed") {
    return value;
  }

  throw new Error("--source must be postgres or processed.");
}

async function readOptionalCatalogManifest(
  filePath: string,
): Promise<CatalogManifest | undefined> {
  if (!existsSync(filePath)) {
    return undefined;
  }

  return readJsonFile<CatalogManifest>(filePath);
}

function mapNormalizedProductToProduct(product: NormalizedProduct): Product {
  const input = mapNormalizedProductToUpsertInput(product);
  const mappedProduct = input.product;
  const skus: ProductSku[] = input.skus.map((sku, index) => ({
    id: sku.id,
    productId: sku.productId,
    properties: product.skus[index]?.properties ?? {},
    priceCents: sku.priceCents,
    currency: sku.currency,
    available: sku.available,
    stockLevel: sku.stockLevel,
    sortOrder: sku.sortOrder,
  }));

  return {
    id: mappedProduct.id,
    status: mappedProduct.status,
    name: mappedProduct.name,
    brand: mappedProduct.brand,
    category: mappedProduct.category,
    subCategory: mappedProduct.subCategory,
    imagePath: mappedProduct.imagePath,
    imageCaption: mappedProduct.imageCaption,
    currency: mappedProduct.currency,
    basePriceCents: mappedProduct.basePriceCents,
    priceMinCents: mappedProduct.priceMinCents,
    priceMaxCents: mappedProduct.priceMaxCents,
    marketingDescription: mappedProduct.marketingDescription,
    knowledgeText: mappedProduct.knowledgeText,
    ratingAvg: mappedProduct.ratingAvg,
    categoryPath: product.category_path,
    visualTags: product.visual_tags,
    attributes: product.attributes,
    pros: product.pros,
    cons: product.cons,
    recommendWhen: product.recommend_when,
    avoidWhen: product.avoid_when,
    compareWith: product.compare_with,
    reviewSummary: mappedProduct.reviewSummary,
    contentBlocks: mappedProduct.contentBlocks,
    officialFaq: mappedProduct.officialFaq,
    userReviews: mappedProduct.userReviews,
    normalizedPayload: mappedProduct.normalizedPayload,
    sourceDataset: mappedProduct.sourceDataset,
    sourceVersion: mappedProduct.sourceVersion,
    sourceType: mappedProduct.sourceType,
    dataVersion: mappedProduct.dataVersion,
    isDesensitized: mappedProduct.isDesensitized,
    ingestBatchId: mappedProduct.ingestBatchId,
    sourcePath: mappedProduct.sourcePath,
    skus,
  };
}

async function readProductsFromPostgres(): Promise<Product[]> {
  const pool = createDatabasePool({ allowExitOnIdle: true });

  try {
    return await findActiveProductsForRag(pool);
  } finally {
    await pool.end();
  }
}

async function readProductsFromProcessed(
  processedDataDir: string,
): Promise<Product[]> {
  const paths = getCatalogPaths(processedDataDir);
  const normalizedProducts = await readNormalizedProducts(paths.normalizedProducts);

  return normalizedProducts
    .filter((product) => product.status === "active")
    .sort((left, right) =>
      [
        left.category.localeCompare(right.category),
        (left.sub_category ?? "").localeCompare(right.sub_category ?? ""),
        left.name.localeCompare(right.name),
        left.product_id.localeCompare(right.product_id),
      ].find((comparison) => comparison !== 0) ?? 0,
    )
    .map((product) => mapNormalizedProductToProduct(product));
}

function applyLimit(products: Product[], limit?: number): Product[] {
  return limit === undefined ? products : products.slice(0, limit);
}

function getProductBatchInfo(
  products: Product[],
  fallback?: CatalogManifest,
): ProductBatchInfo {
  if (products.length === 0) {
    return {
      ingestBatchId: fallback?.ingest_batch_id ?? "empty",
      sourceDataset: fallback?.source_dataset,
      sourceVersion: fallback?.source_version,
      dataVersion: fallback?.data_version,
    };
  }

  const batchIds = [...new Set(products.map((product) => product.ingestBatchId))];
  const sourceDatasets = [...new Set(products.map((product) => product.sourceDataset))];
  const sourceVersions = [...new Set(products.map((product) => product.sourceVersion))];
  const dataVersions = [...new Set(products.map((product) => product.dataVersion))];

  return {
    ingestBatchId: batchIds.length === 1 ? batchIds[0] : batchIds.join(","),
    sourceDataset: sourceDatasets.length === 1 ? sourceDatasets[0] : undefined,
    sourceVersion: sourceVersions.length === 1 ? sourceVersions[0] : undefined,
    dataVersion: dataVersions.length === 1 ? dataVersions[0] : undefined,
  };
}

function warnIfPostgresBatchDiffersFromProcessedManifest(
  products: Product[],
  catalogManifest?: CatalogManifest,
): void {
  if (!catalogManifest || products.length === 0) {
    return;
  }

  const productBatchIds = [...new Set(products.map((product) => product.ingestBatchId))];

  if (
    productBatchIds.length === 1 &&
    productBatchIds[0] === catalogManifest.ingest_batch_id
  ) {
    return;
  }

  console.warn(
    `Warning: PostgreSQL product batch (${productBatchIds.join(", ")}) differs from processed manifest (${catalogManifest.ingest_batch_id}). Using PostgreSQL as source of truth.`,
  );
}

function createManifest(input: {
  source: RagSource;
  products: Product[];
  documents: RagDocument[];
  catalogManifest?: CatalogManifest;
}): RagDocumentManifest {
  const batchInfo = getProductBatchInfo(input.products, input.catalogManifest);

  return {
    source: input.source,
    ingest_batch_id: batchInfo.ingestBatchId,
    product_count: input.products.length,
    document_count: input.documents.length,
    generated_at: new Date().toISOString(),
    output_path: `rag/${OUTPUT_DOCUMENTS_FILE}`,
    document_types: [
      "content_block",
      "faq",
      "description",
      "review_summary",
    ],
    source_dataset: batchInfo.sourceDataset,
    source_version: batchInfo.sourceVersion,
    data_version: batchInfo.dataVersion,
  };
}

async function writeRagDocuments(
  ragDataDir: string,
  documents: RagDocument[],
  manifest: RagDocumentManifest,
): Promise<void> {
  await writeJsonlFile(path.join(ragDataDir, OUTPUT_DOCUMENTS_FILE), documents);
  await writeJsonFile(path.join(ragDataDir, OUTPUT_MANIFEST_FILE), manifest);
}

export async function buildRagDocumentsCommand(
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

  if (options.source === "postgres") {
    warnIfPostgresBatchDiffersFromProcessedManifest(products, catalogManifest);
  }

  const documents = buildRagDocuments(products);
  const manifest = createManifest({
    source: options.source,
    products,
    documents,
    catalogManifest,
  });

  if (options.dryRun) {
    console.log(
      `Dry-run RAG documents (${options.source}): ${products.length} products, ${documents.length} documents.`,
    );
    return;
  }

  await writeRagDocuments(env.ragDataDir, documents, manifest);

  console.log(
    `Generated RAG documents from ${options.source}: ${products.length} products, ${documents.length} documents.`,
  );
  console.log(`Wrote ${path.join(env.ragDataDir, OUTPUT_DOCUMENTS_FILE)}.`);
  console.log(`Wrote ${path.join(env.ragDataDir, OUTPUT_MANIFEST_FILE)}.`);
}

if (require.main === module) {
  buildRagDocumentsCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
