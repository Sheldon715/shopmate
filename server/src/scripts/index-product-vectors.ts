import path from "node:path";
import { getEnv } from "../lib/env";
import {
  createEmbeddedRagDocument,
  QdrantVectorStore,
} from "../modules/vector/qdrant.client";
import { createEmbeddingClient } from "../modules/vector/embedding.service";
import type { EmbeddingClient } from "../modules/vector/embedding.types";
import type {
  RagDocument,
  RagDocumentManifest,
} from "../modules/vector/rag-document.types";
import type { EmbeddedRagDocument } from "../modules/vector/qdrant.types";
import {
  parsePositiveInteger,
  readNext,
} from "../utils/cli";
import {
  readJsonFile,
  readJsonlFile,
  writeJsonFile,
} from "../utils/json-files";

interface IndexProductVectorsOptions {
  dryRun: boolean;
  limit?: number;
  recreate: boolean;
}

interface VectorIndexManifest {
  collection_name: string;
  embedding_model: string;
  embedding_dimensions: number;
  distance: "Cosine";
  source_document_path: string;
  source_document_count: number;
  indexed_document_count: number;
  ingest_batch_id: string;
  generated_at: string;
}

const DOCUMENTS_FILE = "product-documents.jsonl";
const DOCUMENT_MANIFEST_FILE = "document-manifest.json";
const VECTOR_INDEX_MANIFEST_FILE = "vector-index-manifest.json";
const UPSERT_BATCH_SIZE = 64;

function parseArgs(argv: string[]): IndexProductVectorsOptions {
  const options: IndexProductVectorsOptions = {
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

async function readRagDocuments(filePath: string): Promise<RagDocument[]> {
  return readJsonlFile<RagDocument>(filePath);
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

async function embedDocuments(input: {
  documents: RagDocument[];
  embeddingClient: EmbeddingClient;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingBatchSize: number;
}): Promise<EmbeddedRagDocument[]> {
  const embedded: EmbeddedRagDocument[] = [];

  for (const batch of chunk(input.documents, input.embeddingBatchSize)) {
    const result = await input.embeddingClient.embedDocuments(
      batch.map((document) => document.text),
    );

    for (const [index, document] of batch.entries()) {
      embedded.push(
        createEmbeddedRagDocument({
          document,
          vector: result.vectors[index],
          embeddingModel: input.embeddingModel,
          embeddingDimensions: input.embeddingDimensions,
        }),
      );
    }
  }

  return embedded;
}

function createManifest(input: {
  collectionName: string;
  embeddingModel: string;
  embeddingDimensions: number;
  documentPath: string;
  sourceDocumentCount: number;
  indexedDocumentCount: number;
  documentManifest: RagDocumentManifest;
}): VectorIndexManifest {
  return {
    collection_name: input.collectionName,
    embedding_model: input.embeddingModel,
    embedding_dimensions: input.embeddingDimensions,
    distance: "Cosine",
    source_document_path: input.documentPath,
    source_document_count: input.sourceDocumentCount,
    indexed_document_count: input.indexedDocumentCount,
    ingest_batch_id: input.documentManifest.ingest_batch_id,
    generated_at: new Date().toISOString(),
  };
}

async function writeManifest(
  ragDataDir: string,
  manifest: VectorIndexManifest,
): Promise<void> {
  await writeJsonFile(
    path.join(ragDataDir, VECTOR_INDEX_MANIFEST_FILE),
    manifest,
  );
}

export async function indexProductVectorsCommand(
  options = parseArgs(process.argv.slice(2)),
): Promise<void> {
  const env = getEnv();
  const documentsPath = path.join(env.ragDataDir, DOCUMENTS_FILE);
  const documentManifestPath = path.join(env.ragDataDir, DOCUMENT_MANIFEST_FILE);
  const allDocuments = await readRagDocuments(documentsPath);
  const documents = applyLimit(allDocuments, options.limit);
  const documentManifest = await readJsonFile<RagDocumentManifest>(
    documentManifestPath,
  );

  if (options.dryRun) {
    console.log(
      `Dry-run vector index: ${documents.length}/${allDocuments.length} documents for ${env.qdrantCollectionProducts}.`,
    );
    console.log(
      `Embedding model ${env.embeddingModel}, dimensions ${env.embeddingDimensions}, ingest batch ${documentManifest.ingest_batch_id}.`,
    );
    return;
  }

  const embeddingClient = createEmbeddingClient();
  const embeddedDocuments = await embedDocuments({
    documents,
    embeddingClient,
    embeddingModel: env.embeddingModel,
    embeddingDimensions: env.embeddingDimensions,
    embeddingBatchSize: env.embeddingBatchSize,
  });
  const manifest = createManifest({
    collectionName: env.qdrantCollectionProducts,
    embeddingModel: env.embeddingModel,
    embeddingDimensions: env.embeddingDimensions,
    documentPath: documentsPath,
    sourceDocumentCount: allDocuments.length,
    indexedDocumentCount: embeddedDocuments.length,
    documentManifest,
  });

  const vectorStore = new QdrantVectorStore();
  await vectorStore.ensureCollection({
    collectionName: env.qdrantCollectionProducts,
    dimensions: env.embeddingDimensions,
    distance: "Cosine",
    recreate: options.recreate,
  });

  for (const batch of chunk(embeddedDocuments, UPSERT_BATCH_SIZE)) {
    await vectorStore.upsertDocuments({
      collectionName: env.qdrantCollectionProducts,
      items: batch,
    });
  }

  await writeManifest(env.ragDataDir, manifest);

  console.log(
    `Indexed ${embeddedDocuments.length} product documents into ${env.qdrantCollectionProducts}.`,
  );
  console.log(
    `Wrote ${path.join(env.ragDataDir, VECTOR_INDEX_MANIFEST_FILE)}.`,
  );
}

if (require.main === module) {
  indexProductVectorsCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
