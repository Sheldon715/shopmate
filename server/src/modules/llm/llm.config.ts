import { LlmError } from "./llm.error";

export interface LlmBaseConfig {
  provider: string;
  timeoutMs: number;
  maxRetries: number;
  maxCompletionTokens: number;
  temperature: number;
}

export interface LlmEnabledConfig extends LlmBaseConfig {
  enabled: true;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmDisabledConfig extends LlmBaseConfig {
  enabled: false;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  missing: Array<"LLM_API_KEY" | "LLM_BASE_URL" | "LLM_MODEL">;
}

export type LlmConfig = LlmEnabledConfig | LlmDisabledConfig;

export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const provider = readOptionalString(env, "LLM_PROVIDER") ?? "volcengine-ark";
  const baseUrl = readOptionalString(env, "LLM_BASE_URL");
  const apiKey = readOptionalString(env, "LLM_API_KEY");
  const model = readOptionalString(env, "LLM_MODEL");
  const timeoutMs = readNumberInRange(env, "LLM_TIMEOUT_MS", 20000, 1000, 60000);
  const maxRetries = readIntegerInRange(env, "LLM_MAX_RETRIES", 1, 0, 3);
  const maxCompletionTokens = readIntegerInRange(
    env,
    "LLM_MAX_COMPLETION_TOKENS",
    700,
    64,
    2000,
  );
  const temperature = readNumberInRange(env, "LLM_TEMPERATURE", 0.2, 0, 1);
  const normalizedBaseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : undefined;

  const missing: LlmDisabledConfig["missing"] = [];

  if (!apiKey) {
    missing.push("LLM_API_KEY");
  }

  if (!normalizedBaseUrl) {
    missing.push("LLM_BASE_URL");
  }

  if (!model) {
    missing.push("LLM_MODEL");
  }

  const baseConfig = {
    provider,
    timeoutMs,
    maxRetries,
    maxCompletionTokens,
    temperature,
  };

  if (missing.length > 0) {
    return {
      ...baseConfig,
      enabled: false,
      baseUrl: normalizedBaseUrl,
      apiKey,
      model,
      missing,
    };
  }

  return {
    ...baseConfig,
    enabled: true,
    baseUrl: normalizedBaseUrl!,
    apiKey: apiKey!,
    model: model!,
  };
}

function readOptionalString(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function readNumberInRange(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const rawValue = readOptionalString(env, name);
  const value = rawValue === undefined ? fallback : Number(rawValue);

  if (!Number.isFinite(value) || value < min || value > max) {
    throw new LlmError(`${name} must be between ${min} and ${max}.`, {
      code: "LLM_BAD_REQUEST",
    });
  }

  return value;
}

function readIntegerInRange(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = readNumberInRange(env, name, fallback, min, max);

  if (!Number.isInteger(value)) {
    throw new LlmError(`${name} must be an integer.`, {
      code: "LLM_BAD_REQUEST",
    });
  }

  return value;
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch (error) {
    throw new LlmError("LLM_BASE_URL must be a valid URL.", {
      code: "LLM_BAD_BASE_URL",
      cause: error,
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LlmError("LLM_BASE_URL must use http or https.", {
      code: "LLM_BAD_BASE_URL",
    });
  }

  return parsed.href.replace(/\/+$/, "");
}
