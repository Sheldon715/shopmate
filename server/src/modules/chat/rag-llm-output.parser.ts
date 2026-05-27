export interface ParsedRagLlmOutput {
  answer: string;
  recommendedProductIds: string[];
}

export class RagLlmOutputParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RagLlmOutputParseError";
  }
}

export function parseRagLlmOutput(
  rawText: string,
  allowedProductIds: string[],
): ParsedRagLlmOutput {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const answer = payload.answer;
  const recommendedProductIds = payload.recommended_product_ids;

  if (typeof answer !== "string" || answer.trim().length === 0) {
    throw new RagLlmOutputParseError("LLM answer must be a non-empty string.");
  }

  if (
    !Array.isArray(recommendedProductIds)
    || !recommendedProductIds.every((item) => typeof item === "string")
  ) {
    throw new RagLlmOutputParseError(
      "recommended_product_ids must be a string array.",
    );
  }

  const allowlist = new Set(allowedProductIds);
  const seen = new Set<string>();
  const filteredIds: string[] = [];

  for (const rawId of recommendedProductIds) {
    const productId = rawId.trim();

    if (
      productId.length === 0
      || seen.has(productId)
      || !allowlist.has(productId)
    ) {
      continue;
    }

    seen.add(productId);
    filteredIds.push(productId);
  }

  return {
    answer: answer.trim(),
    recommendedProductIds: filteredIds,
  };
}

function stripCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new RagLlmOutputParseError("LLM output must be a JSON object.");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RagLlmOutputParseError) {
      throw error;
    }

    throw new RagLlmOutputParseError("LLM output must be valid JSON.");
  }
}
