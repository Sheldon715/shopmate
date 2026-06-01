export interface NormalizeLlmTextOptions {
  maxChars: number;
  truncateSuffix?: string;
}

export function stripCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenced ? fenced[1].trim() : trimmed;
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM output must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

export function tryParseJsonObject(
  text: string,
): Record<string, unknown> | undefined {
  try {
    return parseJsonObject(text);
  } catch {
    return undefined;
  }
}

export function normalizeLlmText(
  value: string | undefined,
  options: NormalizeLlmTextOptions,
): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim();

  if (!normalized) {
    return undefined;
  }

  const chars = Array.from(normalized);

  if (chars.length <= options.maxChars) {
    return normalized;
  }

  const truncated = chars.slice(0, options.maxChars).join("").trimEnd();

  return options.truncateSuffix
    ? `${truncated}${options.truncateSuffix}`
    : truncated;
}
