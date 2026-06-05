import { ImageSearchError } from "./image-search.types";

export interface ImageSearchConfig {
  enabled: boolean;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
  maxImageBytes: number;
  maxCompletionTokens: number;
  allowedMimeTypes: string[];
  missing: string[];
}

export function loadImageSearchConfig(
  env: NodeJS.ProcessEnv = process.env,
): ImageSearchConfig {
  const provider = readOptionalString(env, "IMAGE_SEARCH_PROVIDER")
    ?? "disabled";
  const timeoutMs = readIntegerInRange(
    env,
    "IMAGE_SEARCH_TIMEOUT_MS",
    25000,
    1000,
    60000,
  );
  const maxImageBytes = readIntegerInRange(
    env,
    "IMAGE_SEARCH_MAX_IMAGE_BYTES",
    5 * 1024 * 1024,
    1024,
    25 * 1024 * 1024,
  );
  const maxCompletionTokens = readIntegerInRange(
    env,
    "IMAGE_SEARCH_MAX_COMPLETION_TOKENS",
    700,
    160,
    2000,
  );
  const allowedMimeTypes = readStringList(
    env,
    "IMAGE_SEARCH_ALLOWED_MIME_TYPES",
    ["image/jpeg", "image/png", "image/webp"],
  );

  if (provider === "disabled") {
    return {
      enabled: false,
      provider,
      timeoutMs,
      maxImageBytes,
      maxCompletionTokens,
      allowedMimeTypes,
      missing: ["IMAGE_SEARCH_PROVIDER"],
    };
  }

  const baseUrl = readOptionalString(env, "IMAGE_SEARCH_BASE_URL")
    ?? readOptionalString(env, "LLM_BASE_URL");
  const apiKey = readOptionalString(env, "IMAGE_SEARCH_API_KEY")
    ?? readOptionalString(env, "LLM_API_KEY");
  const model = readOptionalString(env, "IMAGE_SEARCH_MODEL");
  const normalizedBaseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : undefined;
  const missing: string[] = [];

  if (!apiKey) {
    missing.push("IMAGE_SEARCH_API_KEY or LLM_API_KEY");
  }

  if (!normalizedBaseUrl) {
    missing.push("IMAGE_SEARCH_BASE_URL or LLM_BASE_URL");
  }

  if (!model) {
    missing.push("IMAGE_SEARCH_MODEL");
  }

  return {
    enabled: missing.length === 0,
    provider,
    baseUrl: normalizedBaseUrl,
    apiKey,
    model,
    timeoutMs,
    maxImageBytes,
    maxCompletionTokens,
    allowedMimeTypes,
    missing,
  };
}

function readOptionalString(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function readStringList(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string[],
): string[] {
  const value = readOptionalString(env, name);

  if (!value) {
    return fallback;
  }

  const items = value
    .split(",")
    .map((item) => normalizeMimeType(item))
    .filter((item) => item.length > 0);

  return items.length > 0 ? Array.from(new Set(items)) : fallback;
}

function readIntegerInRange(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const rawValue = readOptionalString(env, name);
  const value = rawValue === undefined ? fallback : Number(rawValue);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ImageSearchError(
      `${name} must be an integer between ${min} and ${max}.`,
      {
        code: "IMAGE_REQUEST_FAILED",
        statusCode: 400,
      },
    );
  }

  return value;
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch (error) {
    throw new ImageSearchError("IMAGE_SEARCH_BASE_URL must be a valid URL.", {
      code: "IMAGE_REQUEST_FAILED",
      statusCode: 400,
      cause: error,
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ImageSearchError(
      "IMAGE_SEARCH_BASE_URL must use http or https.",
      {
        code: "IMAGE_REQUEST_FAILED",
        statusCode: 400,
      },
    );
  }

  return parsed.href.replace(/\/+$/, "");
}

function normalizeMimeType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}
