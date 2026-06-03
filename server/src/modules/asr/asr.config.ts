import { AsrError } from "./asr.types";

export interface AsrConfig {
  enabled: boolean;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
  maxCompletionTokens: number;
  maxAudioBytes: number;
  language: string;
  missing: string[];
}

export function loadAsrConfig(env: NodeJS.ProcessEnv = process.env): AsrConfig {
  const provider = readOptionalString(env, "ASR_PROVIDER") ?? "llm-audio";
  const baseUrl = readOptionalString(env, "ASR_BASE_URL")
    ?? readOptionalString(env, "LLM_BASE_URL");
  const apiKey = readOptionalString(env, "ASR_API_KEY")
    ?? readOptionalString(env, "LLM_API_KEY");
  const model = readOptionalString(env, "ASR_MODEL")
    ?? readOptionalString(env, "LLM_MODEL");
  const timeoutMs = readIntegerInRange(
    env,
    "ASR_TIMEOUT_MS",
    20000,
    1000,
    60000,
  );
  const maxCompletionTokens = readIntegerInRange(
    env,
    "ASR_MAX_COMPLETION_TOKENS",
    800,
    160,
    2000,
  );
  const maxAudioBytes = readIntegerInRange(
    env,
    "ASR_MAX_AUDIO_BYTES",
    5 * 1024 * 1024,
    1024,
    25 * 1024 * 1024,
  );
  const language = readOptionalString(env, "ASR_LANGUAGE") ?? "zh-CN";
  const normalizedBaseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : undefined;
  const missing: string[] = [];

  if (!apiKey) {
    missing.push("ASR_API_KEY or LLM_API_KEY");
  }

  if (!normalizedBaseUrl) {
    missing.push("ASR_BASE_URL or LLM_BASE_URL");
  }

  if (!model) {
    missing.push("ASR_MODEL or LLM_MODEL");
  }

  return {
    enabled: missing.length === 0,
    provider,
    baseUrl: normalizedBaseUrl,
    apiKey,
    model,
    timeoutMs,
    maxCompletionTokens,
    maxAudioBytes,
    language,
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
    throw new AsrError(`${name} must be an integer between ${min} and ${max}.`, {
      code: "ASR_REQUEST_FAILED",
      statusCode: 400,
    });
  }

  return value;
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch (error) {
    throw new AsrError("ASR_BASE_URL must be a valid URL.", {
      code: "ASR_REQUEST_FAILED",
      statusCode: 400,
      cause: error,
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AsrError("ASR_BASE_URL must use http or https.", {
      code: "ASR_REQUEST_FAILED",
      statusCode: 400,
    });
  }

  return parsed.href.replace(/\/+$/, "");
}
