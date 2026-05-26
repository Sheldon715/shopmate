import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

export type NodeEnv = "development" | "test" | "production";

export interface ServerEnv {
  port: number;
  nodeEnv: NodeEnv;
  logLevel: string;
  databaseUrl?: string;
  rawDataDir: string;
  processedDataDir: string;
  ragDataDir: string;
  importDryRun: boolean;
  importStrict: boolean;
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

  cachedEnv = {
    port: readNumber("PORT", 3000),
    nodeEnv: readNodeEnv(),
    logLevel: process.env.LOG_LEVEL ?? "info",
    databaseUrl: process.env.DATABASE_URL,
    rawDataDir,
    processedDataDir,
    ragDataDir,
    importDryRun: readBoolean("IMPORT_DRY_RUN", true),
    importStrict: readBoolean("IMPORT_STRICT", false),
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
