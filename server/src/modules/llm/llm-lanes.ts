import { FallbackLlmClient } from "./fallback-llm.client";
import { loadLlmConfig } from "./llm.config";
import type { LlmConfig } from "./llm.config";
import { OpenAiCompatibleChatClient } from "./openai-compatible-chat.client";
import type {
  LlmClient,
  LlmGenerateResponse,
} from "./llm.types";

export interface LlmLaneConfig {
  decisionPrimary: LlmConfig;
  decisionFallback?: LlmConfig;
  answer: LlmConfig;
}

export interface LlmLaneClients {
  decision: LlmClient;
  answer: LlmClient;
}

export interface LlmLaneMetadata {
  decisionPrimary: LlmLaneModelMetadata;
  decisionFallback?: LlmLaneModelMetadata;
  answer: LlmLaneModelMetadata;
}

export interface LlmLaneModelMetadata {
  enabled: boolean;
  provider: string;
  model?: string;
}

interface LaneOverride {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: string;
  maxRetries?: string;
  maxCompletionTokens?: string;
  temperature?: string;
}

export function loadLlmLaneConfig(
  env: NodeJS.ProcessEnv = process.env,
): LlmLaneConfig {
  const baseConfig = loadLlmConfig(env);
  const decisionPrimary = loadLaneConfig(env, baseConfig, {
    provider: env.LLM_DECISION_PROVIDER,
    baseUrl: env.LLM_DECISION_BASE_URL,
    apiKey: env.LLM_DECISION_API_KEY,
    model: env.LLM_DECISION_MODEL,
    timeoutMs: env.LLM_DECISION_TIMEOUT_MS,
    maxRetries: env.LLM_DECISION_MAX_RETRIES,
    maxCompletionTokens: env.LLM_DECISION_MAX_COMPLETION_TOKENS,
    temperature: env.LLM_DECISION_TEMPERATURE,
  });

  return {
    decisionPrimary,
    decisionFallback: env.LLM_DECISION_FALLBACK_MODEL
        || env.LLM_DECISION_FALLBACK_PROVIDER
        || env.LLM_DECISION_FALLBACK_BASE_URL
        || env.LLM_DECISION_FALLBACK_API_KEY
      ? loadLaneConfig(env, decisionPrimary, {
          provider: env.LLM_DECISION_FALLBACK_PROVIDER,
          baseUrl: env.LLM_DECISION_FALLBACK_BASE_URL,
          apiKey: env.LLM_DECISION_FALLBACK_API_KEY,
          model: env.LLM_DECISION_FALLBACK_MODEL,
          timeoutMs: env.LLM_DECISION_FALLBACK_TIMEOUT_MS,
          maxRetries: env.LLM_DECISION_FALLBACK_MAX_RETRIES,
          maxCompletionTokens: env.LLM_DECISION_FALLBACK_MAX_COMPLETION_TOKENS,
          temperature: env.LLM_DECISION_FALLBACK_TEMPERATURE,
        })
      : undefined,
    answer: loadLaneConfig(
      env,
      env.LLM_ANSWER_MODEL
          || env.LLM_ANSWER_PROVIDER
          || env.LLM_ANSWER_BASE_URL
          || env.LLM_ANSWER_API_KEY
        ? decisionPrimary
        : baseConfig,
      {
      provider: env.LLM_ANSWER_PROVIDER,
      baseUrl: env.LLM_ANSWER_BASE_URL,
      apiKey: env.LLM_ANSWER_API_KEY,
      model: env.LLM_ANSWER_MODEL,
      timeoutMs: env.LLM_ANSWER_TIMEOUT_MS,
      maxRetries: env.LLM_ANSWER_MAX_RETRIES,
      maxCompletionTokens: env.LLM_ANSWER_MAX_COMPLETION_TOKENS,
      temperature: env.LLM_ANSWER_TEMPERATURE,
      },
    ),
  };
}

export function createLlmLaneClients(
  config: LlmLaneConfig = loadLlmLaneConfig(),
): LlmLaneClients {
  const decisionPrimary = createClient(config.decisionPrimary);
  const decision = config.decisionFallback
    ? new FallbackLlmClient({
        primary: decisionPrimary,
        fallback: createClient(config.decisionFallback),
        shouldFallback: isNotJsonObjectResponse,
      })
    : decisionPrimary;

  return {
    decision,
    answer: createClient(config.answer),
  };
}

export function createLlmLaneMetadata(
  config: LlmLaneConfig = loadLlmLaneConfig(),
): LlmLaneMetadata {
  return {
    decisionPrimary: toLaneModelMetadata(config.decisionPrimary),
    decisionFallback: config.decisionFallback
      ? toLaneModelMetadata(config.decisionFallback)
      : undefined,
    answer: toLaneModelMetadata(config.answer),
  };
}

function loadLaneConfig(
  env: NodeJS.ProcessEnv,
  baseConfig: LlmConfig,
  override: LaneOverride,
): LlmConfig {
  return loadLlmConfig({
    ...env,
    LLM_PROVIDER: override.provider ?? baseConfig.provider,
    LLM_BASE_URL: override.baseUrl ?? baseConfig.baseUrl,
    LLM_API_KEY: override.apiKey ?? baseConfig.apiKey,
    LLM_MODEL: override.model ?? baseConfig.model,
    LLM_TIMEOUT_MS: override.timeoutMs ?? String(baseConfig.timeoutMs),
    LLM_MAX_RETRIES: override.maxRetries ?? String(baseConfig.maxRetries),
    LLM_MAX_COMPLETION_TOKENS:
      override.maxCompletionTokens ?? String(baseConfig.maxCompletionTokens),
    LLM_TEMPERATURE: override.temperature ?? String(baseConfig.temperature),
  });
}

function createClient(config: LlmConfig): LlmClient {
  return new OpenAiCompatibleChatClient({ config });
}

function toLaneModelMetadata(config: LlmConfig): LlmLaneModelMetadata {
  return {
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
  };
}

function isNotJsonObjectResponse(response: LlmGenerateResponse): boolean {
  const text = stripCodeFence(response.text);

  try {
    const parsed = JSON.parse(text) as unknown;
    return !parsed || typeof parsed !== "object" || Array.isArray(parsed);
  } catch {
    return true;
  }
}

function stripCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenced ? fenced[1].trim() : trimmed;
}
