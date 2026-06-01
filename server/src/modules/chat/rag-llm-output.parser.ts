import {
  parseJsonObject as parseLlmJsonObject,
  stripCodeFence,
} from "./llm-output-utils";

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

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    return parseLlmJsonObject(text);
  } catch (error) {
    if (error instanceof RagLlmOutputParseError) {
      throw error;
    }

    throw new RagLlmOutputParseError(
      error instanceof SyntaxError
        ? "LLM output must be valid JSON."
        : "LLM output must be a JSON object.",
    );
  }
}
