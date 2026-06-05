import { readFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "../lib/env";
import {
  createImageEmbeddingClient,
  type ImageEmbeddingClient,
} from "../modules/vector/image-embedding.client";
import {
  resolveImageFilePath,
} from "../modules/vector/image-document.builder";
import type {
  ProductImageDocument,
  ProductImageDocumentManifest,
} from "../modules/vector/image-document.types";
import {
  createEmbeddedProductImageDocument,
  QdrantProductImageVectorStore,
  type EmbeddedProductImageDocument,
} from "../modules/vector/image-vector-store";
import {
  parsePositiveInteger,
  readNext,
} from "../utils/cli";
import {
  readJsonFile,
  readJsonlFile,
  writeJsonFile,
} from "../utils/json-files";

interface IndexImageDocumentsOptions {
  dryRun: boolean;
  limit?: number;
  recreate: boolean;
}

interface ImageVectorIndexReport {
  collection_name: string;
  image_embedding_model: string;
  image_embedding_dimensions: number;
  distance: "Cosine";
  source_document_path: string;
  source_document_count: number;
  indexed_document_count: number;
  ingest_batch_id: string;
  generated_at: string;
}

const DOCUMENTS_FILE = "image-documents.jsonl";
const DOCUMENT_MANIFEST_FILE = "image-document-manifest.json";
const IMAGE_VECTOR_INDEX_REPORT_FILE = "image-vector-index-report.json";
const UPSERT_BATCH_SIZE = 64;

function parseArgs(argv: string[]): IndexImageDocumentsOptions {
  const options: IndexImageDocumentsOptions = {
    dryRun: false,
    recreate: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--recreate") {
      options.recreate = true;
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

function applyLimit<T>(items: T[], limit?: number): T[] {
  return limit === undefined ? items : items.slice(0, limit);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function embedImageDocuments(input: {
  documents: ProductImageDocument[];
  staticImageRoot: string;
  imageEmbeddingClient: ImageEmbeddingClient;
  imageEmbeddingModel: string;
  imageEmbeddingDimensions: number;
  imageEmbeddingBatchSize: number;
}): Promise<EmbeddedProductImageDocument[]> {
  const embedded: EmbeddedProductImageDocument[] = [];

  for (const batch of chunk(input.documents, input.imageEmbeddingBatchSize)) {
    const images = await Promise.all(
      batch.map(async (document) => ({
        buffer: await readFile(
          resolveImageFilePath(input.staticImageRoot, document.imagePath),
        ),
        mimeType: document.imageMimeType,
        caption: document.visualCaption,
        imagePath: document.imagePath,
      })),
    );
    const result = await input.imageEmbeddingClient.embedImages(images);

    for (const [index, document] of batch.entries()) {
      embedded.push(
        createEmbeddedProductImageDocument({
          document,
          vector: result.vectors[index],
          imageEmbeddingModel: input.imageEmbeddingModel,
          imageEmbeddingDimensions: input.imageEmbeddingDimensions,
        }),
      );
    }
  }

  return embedded;
}

function createReport(input: {
  collectionName: string;
  imageEmbeddingModel: string;
  imageEmbeddingDimensions: number;
  documentPath: string;
  sourceDocumentCount: number;
  indexedDocumentCount: number;
  documentManifest: ProductImageDocumentManifest;
}): ImageVectorIndexReport {
  return {
    collection_name: input.collectionName,
    image_embedding_model: input.imageEmbeddingModel,
    image_embedding_dimensions: input.imageEmbeddingDimensions,
    distance: "Cosine",
    source_document_path: input.documentPath,
    source_document_count: input.sourceDocumentCount,
    indexed_document_count: input.indexedDocumentCount,
    ingest_batch_id: input.documentManifest.ingest_batch_id,
    generated_at: new Date().toISOString(),
  };
}

export async function indexImageDocumentsCommand(
  options = parseArgs(process.argv.slice(2)),
): Promise<void> {
  const env = getEnv();
  const documentsPath = path.join(env.ragDataDir, DOCUMENTS_FILE);
  const documentManifestPath = path.join(env.ragDataDir, DOCUMENT_MANIFEST_FILE);
  const allDocuments = await readJsonlFile<ProductImageDocument>(documentsPath);
  const documents = applyLimit(allDocuments, options.limit);
  const documentManifest = await readJsonFile<ProductImageDocumentManifest>(
    documentManifestPath,
  );

  if (options.dryRun) {
    console.log(
      `Dry-run image vector index: ${documents.length}/${allDocuments.length} image documents for ${env.imageVectorCollection}.`,
    );
    console.log(
      `Image embedding provider ${env.imageEmbeddingProvider}, model ${env.imageEmbeddingModel}, dimensions ${env.imageEmbeddingDimensions}, ingest batch ${documentManifest.ingest_batch_id}.`,
    );
    return;
  }

  const imageEmbeddingClient = createImageEmbeddingClient();
  const embeddedDocuments = await embedImageDocuments({
    documents,
    staticImageRoot: env.staticImageRoot,
    imageEmbeddingClient,
    imageEmbeddingModel: env.imageEmbeddingModel,
    imageEmbeddingDimensions: env.imageEmbeddingDimensions,
    imageEmbeddingBatchSize: env.imageEmbeddingBatchSize,
  });
  const report = createReport({
    collectionName: env.imageVectorCollection,
    imageEmbeddingModel: env.imageEmbeddingModel,
    imageEmbeddingDimensions: env.imageEmbeddingDimensions,
    documentPath: documentsPath,
    sourceDocumentCount: allDocuments.length,
    indexedDocumentCount: embeddedDocuments.length,
    documentManifest,
  });

  const vectorStore = new QdrantProductImageVectorStore();
  await vectorStore.ensureCollection({
    collectionName: env.imageVectorCollection,
    dimensions: env.imageEmbeddingDimensions,
    distance: "Cosine",
    recreate: options.recreate,
  });

  for (const batch of chunk(embeddedDocuments, UPSERT_BATCH_SIZE)) {
    await vectorStore.upsertDocuments({
      collectionName: env.imageVectorCollection,
      items: batch,
    });
  }

  await writeJsonFile(
    path.join(env.ragDataDir, IMAGE_VECTOR_INDEX_REPORT_FILE),
    report,
  );

  console.log(
    `Indexed ${embeddedDocuments.length} product image documents into ${env.imageVectorCollection}.`,
  );
  console.log(
    `Wrote ${path.join(env.ragDataDir, IMAGE_VECTOR_INDEX_REPORT_FILE)}.`,
  );
}

if (require.main === module) {
  indexImageDocumentsCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
