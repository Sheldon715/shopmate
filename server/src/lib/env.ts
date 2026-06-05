import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { loadLlmConfig } from "../modules/llm/llm.config";
import type { LlmConfig } from "../modules/llm/llm.config";
import type { EmbeddingEndpointKind } from "../modules/vector/embedding.types";

export type NodeEnv = "development" | "test" | "production";

export interface ServerEnv {
  port: number;
  host?: string;
  nodeEnv: NodeEnv;
  logLevel: string;
  corsAllowedOrigins: string[];
  databaseUrl?: string;
  rawDataDir: string;
  processedDataDir: string;
  ragDataDir: string;
  staticImageRoot: string;
  publicImageBaseUrl?: string;
  importDryRun: boolean;
  importStrict: boolean;
  qdrantUrl: string;
  qdrantApiKey?: string;
  qdrantCollectionProducts: string;
  embeddingProvider: string;
  embeddingBaseUrl?: string;
  embeddingApiKey?: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingEndpointKind: EmbeddingEndpointKind;
  embeddingBatchSize: number;
  embeddingTimeoutMs: number;
  embeddingMaxRetries: number;
  imageEmbeddingProvider: string;
  imageEmbeddingBaseUrl?: string;
  imageEmbeddingApiKey?: string;
  imageEmbeddingModel: string;
  imageEmbeddingDimensions: number;
  imageEmbeddingBatchSize: number;
  imageEmbeddingTimeoutMs: number;
  imageEmbeddingMaxRetries: number;
  imageVectorCollection: string;
  imageVectorTopK: number;
  ragTopK: number;
  llm: LlmConfig;
}

let cachedEnv: ServerEnv | undefined;

export function resolveProjectRoot(): string {
  const cwd = process.cwd();

  if (path.basename(cwd).toLowerCase() === "server") {
    return path.resolve(cwd, "..");
  }

  if (existsSync(path.join(cwd, "server", "package.json"))) {
    return cwd;
  }

  return path.resolve(cwd, "..");
}

function loadEnvironmentFiles(): void {
  const projectRoot = resolveProjectRoot();
  const candidates = [
    path.join(projectRoot, ".env"),
    path.join(process.cwd(), ".env"),
  ];

  for (const filePath of [...new Set(candidates)]) {
    if (existsSync(filePath)) {
      loadDotenv({ path: filePath });
    }
  }
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }

  return parsed;
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = readNumber(name, fallback);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  if (["true", "1", "yes", "y"].includes(value.toLowerCase())) {
    return true;
  }

  if (["false", "0", "no", "n"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${name} must be a boolean.`);
}

function readNodeEnv(): NodeEnv {
  const value = process.env.NODE_ENV ?? "development";

  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  throw new Error("NODE_ENV must be development, test, or production.");
}

function readOptionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function readStringList(name: string): string[] {
  const value = process.env[name];

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readEmbeddingEndpointKind(): EmbeddingEndpointKind {
  const value = process.env.EMBEDDING_ENDPOINT_KIND ?? "multimodal_embeddings";

  if (value === "embeddings" || value === "multimodal_embeddings") {
    return value;
  }

  throw new Error(
    "EMBEDDING_ENDPOINT_KIND must be embeddings or multimodal_embeddings.",
  );
}

function resolveProjectPath(
  value: string | undefined,
  fallback: string,
  projectRoot: string,
): string {
  const selectedPath = value ?? fallback;
  return path.isAbsolute(selectedPath)
    ? selectedPath
    : path.resolve(projectRoot, selectedPath);
}

export function getEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  loadEnvironmentFiles();

  const projectRoot = resolveProjectRoot();
  const rawDataDir = resolveProjectPath(
    process.env.SHOPMATE_RAW_DATA_DIR,
    path.join(projectRoot, "data", "raw"),
    projectRoot,
  );
  const processedDataDir = resolveProjectPath(
    process.env.SHOPMATE_PROCESSED_DATA_DIR,
    path.join(projectRoot, "data", "processed"),
    projectRoot,
  );
  const ragDataDir = resolveProjectPath(
    process.env.SHOPMATE_RAG_DATA_DIR,
    path.join(processedDataDir, "rag"),
    projectRoot,
  );
  const staticImageRoot = resolveProjectPath(
    process.env.SHOPMATE_STATIC_IMAGE_ROOT,
    path.join(projectRoot, "data", "raw", "ecommerce_agent_dataset_v3"),
    projectRoot,
  );

  cachedEnv = {
    port: readNumber("PORT", 3000),
    host: readOptionalString("HOST"),
    nodeEnv: readNodeEnv(),
    logLevel: process.env.LOG_LEVEL ?? "info",
    corsAllowedOrigins: readStringList("CORS_ALLOWED_ORIGINS"),
    databaseUrl: process.env.DATABASE_URL,
    rawDataDir,
    processedDataDir,
    ragDataDir,
    staticImageRoot,
    publicImageBaseUrl: readOptionalString("PUBLIC_IMAGE_BASE_URL"),
    importDryRun: readBoolean("IMPORT_DRY_RUN", true),
    importStrict: readBoolean("IMPORT_STRICT", false),
    qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
    qdrantApiKey: readOptionalString("QDRANT_API_KEY"),
    qdrantCollectionProducts:
      process.env.QDRANT_COLLECTION_PRODUCTS ?? "shopmate_product_documents",
    embeddingProvider: process.env.EMBEDDING_PROVIDER ?? "volcengine-ark",
    embeddingBaseUrl: readOptionalString("EMBEDDING_BASE_URL"),
    embeddingApiKey: readOptionalString("EMBEDDING_API_KEY"),
    embeddingModel:
      process.env.EMBEDDING_MODEL ?? "doubao-embedding-vision-250615",
    embeddingDimensions: readPositiveInteger("EMBEDDING_DIMENSIONS", 2048),
    embeddingEndpointKind: readEmbeddingEndpointKind(),
    embeddingBatchSize: readPositiveInteger("EMBEDDING_BATCH_SIZE", 64),
    embeddingTimeoutMs: readPositiveInteger("EMBEDDING_TIMEOUT_MS", 30000),
    embeddingMaxRetries: readPositiveInteger("EMBEDDING_MAX_RETRIES", 3),
    imageEmbeddingProvider:
      process.env.IMAGE_EMBEDDING_PROVIDER ?? "disabled",
    imageEmbeddingBaseUrl: readOptionalString("IMAGE_EMBEDDING_BASE_URL"),
    imageEmbeddingApiKey: readOptionalString("IMAGE_EMBEDDING_API_KEY"),
    imageEmbeddingModel:
      process.env.IMAGE_EMBEDDING_MODEL
      ?? process.env.EMBEDDING_MODEL
      ?? "doubao-embedding-vision-250615",
    imageEmbeddingDimensions: readPositiveInteger(
      "IMAGE_EMBEDDING_DIMENSIONS",
      readPositiveInteger("EMBEDDING_DIMENSIONS", 2048),
    ),
    imageEmbeddingBatchSize: readPositiveInteger(
      "IMAGE_EMBEDDING_BATCH_SIZE",
      16,
    ),
    imageEmbeddingTimeoutMs: readPositiveInteger(
      "IMAGE_EMBEDDING_TIMEOUT_MS",
      30000,
    ),
    imageEmbeddingMaxRetries: readPositiveInteger(
      "IMAGE_EMBEDDING_MAX_RETRIES",
      3,
    ),
    imageVectorCollection:
      process.env.IMAGE_VECTOR_COLLECTION
      ?? "shopmate_product_image_documents",
    imageVectorTopK: readPositiveInteger("IMAGE_VECTOR_TOP_K", 12),
    ragTopK: readPositiveInteger("RAG_TOP_K", 12),
    llm: loadLlmConfig(process.env),
  };

  return cachedEnv;
}

export function requireDatabaseUrl(): string {
  const databaseUrl = getEnv().databaseUrl;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for database commands. Create a local PostgreSQL database and set DATABASE_URL in .env.",
    );
  }

  return databaseUrl;
}
