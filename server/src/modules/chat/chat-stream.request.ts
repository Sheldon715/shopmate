import type { RagChatRequest, ChatHistoryMessage } from "./chat.types";
import type { VectorSearchFilters } from "../vector/vector-search.types";

export const CHAT_STREAM_REQUEST_ERROR_CODE = "INVALID_CHAT_REQUEST";

const MESSAGE_MAX_LENGTH = 1000;
const CONVERSATION_ID_MAX_LENGTH = 80;
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;
const HISTORY_MAX_ITEMS = 4;
const HISTORY_CONTENT_MAX_LENGTH = 500;
const TOP_K_MIN = 1;
const TOP_K_MAX = 20;
const MAX_RECOMMENDED_PRODUCTS_MIN = 1;
const MAX_RECOMMENDED_PRODUCTS_MAX = 5;
const FILTER_ARRAY_MAX_ITEMS = 12;
const FILTER_ARRAY_ITEM_MAX_LENGTH = 80;
const RECENT_PRODUCT_IDS_MAX_ITEMS = 5;
const PRODUCT_ID_MAX_LENGTH = 80;

const FILTER_FIELDS = [
  "category",
  "subCategory",
  "brand",
  "minPriceCents",
  "maxPriceCents",
  "availableOnly",
  "tagsAny",
  "avoidTerms",
] as const;

type FilterField = typeof FILTER_FIELDS[number];

export class ChatStreamRequestError extends Error {
  readonly code = CHAT_STREAM_REQUEST_ERROR_CODE;

  constructor(message: string) {
    super(message);
    this.name = "ChatStreamRequestError";
  }
}

export function parseChatStreamRequestBody(body: unknown): RagChatRequest {
  if (!isRecord(body)) {
    throw new ChatStreamRequestError("request body must be a JSON object");
  }

  return {
    conversationId: readConversationId(body.conversationId),
    question: readRequiredString(body.message, "message", MESSAGE_MAX_LENGTH),
    shortHistory: readHistory(body.history),
    recentProductIds: readOptionalStringArray(
      body.recentProductIds,
      "recentProductIds",
      RECENT_PRODUCT_IDS_MAX_ITEMS,
      PRODUCT_ID_MAX_LENGTH,
    ),
    filters: readFilters(body.filters),
    topK: readOptionalInteger(body.topK, "topK", TOP_K_MIN, TOP_K_MAX),
    maxRecommendedProducts: readOptionalInteger(
      body.maxRecommendedProducts,
      "maxRecommendedProducts",
      MAX_RECOMMENDED_PRODUCTS_MIN,
      MAX_RECOMMENDED_PRODUCTS_MAX,
    ),
  };
}

function readConversationId(value: unknown): string | undefined {
  const conversationId = readOptionalString(value, "conversationId");

  if (conversationId === undefined) {
    return undefined;
  }

  if (Array.from(conversationId).length > CONVERSATION_ID_MAX_LENGTH) {
    throw new ChatStreamRequestError(
      `conversationId cannot be longer than ${CONVERSATION_ID_MAX_LENGTH} characters`,
    );
  }

  if (!CONVERSATION_ID_PATTERN.test(conversationId)) {
    throw new ChatStreamRequestError(
      "conversationId can only include letters, numbers, -, _, and .",
    );
  }

  return conversationId;
}

function readHistory(value: unknown): ChatHistoryMessage[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ChatStreamRequestError("history must be an array");
  }

  if (value.length > HISTORY_MAX_ITEMS) {
    throw new ChatStreamRequestError(
      `history can include at most ${HISTORY_MAX_ITEMS} messages`,
    );
  }

  return value.map((item, index) => {
    const fieldPrefix = `history[${index}]`;

    if (!isRecord(item)) {
      throw new ChatStreamRequestError(`${fieldPrefix} must be an object`);
    }

    if (item.role !== "user" && item.role !== "assistant") {
      throw new ChatStreamRequestError(
        `${fieldPrefix}.role must be user or assistant`,
      );
    }

    return {
      role: item.role,
      content: readRequiredString(
        item.content,
        `${fieldPrefix}.content`,
        HISTORY_CONTENT_MAX_LENGTH,
      ),
    };
  });
}

function readFilters(value: unknown): VectorSearchFilters | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new ChatStreamRequestError("filters must be an object");
  }

  for (const key of Object.keys(value)) {
    if (!isFilterField(key)) {
      throw new ChatStreamRequestError(`filters.${key} is not supported`);
    }
  }

  const minPriceCents = readOptionalInteger(
    value.minPriceCents,
    "filters.minPriceCents",
  );
  const maxPriceCents = readOptionalInteger(
    value.maxPriceCents,
    "filters.maxPriceCents",
  );

  if (
    minPriceCents !== undefined
    && maxPriceCents !== undefined
    && minPriceCents > maxPriceCents
  ) {
    throw new ChatStreamRequestError(
      "filters.minPriceCents cannot be greater than filters.maxPriceCents",
    );
  }

  return pruneUndefined({
    category: readOptionalString(value.category, "filters.category"),
    subCategory: readOptionalString(value.subCategory, "filters.subCategory"),
    brand: readOptionalString(value.brand, "filters.brand"),
    minPriceCents,
    maxPriceCents,
    availableOnly: readOptionalBoolean(
      value.availableOnly,
      "filters.availableOnly",
    ),
    tagsAny: readOptionalStringArray(value.tagsAny, "filters.tagsAny"),
    avoidTerms: readOptionalStringArray(
      value.avoidTerms,
      "filters.avoidTerms",
    ),
  });
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new ChatStreamRequestError(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ChatStreamRequestError(`${fieldName} cannot be empty`);
  }

  if (Array.from(trimmed).length > maxLength) {
    throw new ChatStreamRequestError(
      `${fieldName} cannot be longer than ${maxLength} characters`,
    );
  }

  return trimmed;
}

function readOptionalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ChatStreamRequestError(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalStringArray(
  value: unknown,
  fieldName: string,
  maxItems = FILTER_ARRAY_MAX_ITEMS,
  maxItemLength = FILTER_ARRAY_ITEM_MAX_LENGTH,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ChatStreamRequestError(`${fieldName} must be an array`);
  }

  if (value.length > maxItems) {
    throw new ChatStreamRequestError(
      `${fieldName} can include at most ${maxItems} items`,
    );
  }

  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  value.forEach((item, index) => {
    const normalizedValue = readRequiredString(
      item,
      `${fieldName}[${index}]`,
      maxItemLength,
    );

    if (!seen.has(normalizedValue)) {
      seen.add(normalizedValue);
      normalizedValues.push(normalizedValue);
    }
  });

  return normalizedValues.length > 0 ? normalizedValues : undefined;
}

function readOptionalBoolean(
  value: unknown,
  fieldName: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new ChatStreamRequestError(`${fieldName} must be a boolean`);
  }

  return value;
}

function readOptionalInteger(
  value: unknown,
  fieldName: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < min
    || value > max
  ) {
    throw new ChatStreamRequestError(
      `${fieldName} must be an integer between ${min} and ${max}`,
    );
  }

  return value;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFilterField(value: string): value is FilterField {
  return (FILTER_FIELDS as readonly string[]).includes(value);
}
