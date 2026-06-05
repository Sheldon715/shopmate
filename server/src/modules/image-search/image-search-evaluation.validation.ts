import type { VisualIntent } from "./image-search.types";
import {
  IMAGE_SEARCH_EVALUATION_FAILURE_CATEGORIES,
  IMAGE_SEARCH_EVALUATION_OUTCOMES,
  IMAGE_SEARCH_EVALUATION_RUN_STATUSES,
} from "./image-search-evaluation.types";
import type {
  ImageSearchEvaluationCase,
  ImageSearchEvaluationFailureCategory,
  ImageSearchEvaluationFilters,
  ImageSearchEvaluationHumanScores,
  ImageSearchEvaluationOutcome,
  ImageSearchEvaluationResult,
  ImageSearchEvaluationRunStatus,
  ImageSearchEvaluationTiming,
} from "./image-search-evaluation.types";

const MIN_CASE_COUNT = 6;
const CASE_ID_PATTERN = /^image_[a-z0-9_]+$/u;
const DEMO_IMAGE_REF_PATTERN = /^(demo|manual):[a-z0-9_:-]+$/u;
const PRODUCT_ID_PATTERN = /^p_[a-z0-9_]+$/u;
const PRODUCT_ID_PREFIX_PATTERN = /^p_[a-z0-9_]+$/u;
const MAX_NOTE_CHARS = 400;

const SENSITIVE_PATTERNS = [
  { name: "image data URL", pattern: /data:image\//iu },
  { name: "base64 marker", pattern: /base64,/iu },
  { name: "long base64-like payload", pattern: /[A-Za-z0-9+/]{160,}={0,2}/u },
  { name: "Windows absolute path", pattern: /[A-Za-z]:\\/u },
  { name: "Unix user path", pattern: /(?:\/Users\/|\/home\/)/u },
  { name: "provider key", pattern: /(?:sk-[A-Za-z0-9_-]{12,}|api[_-]?key\s*[:=])/iu },
] as const;

export function validateImageSearchEvaluationCases(
  value: unknown,
): ImageSearchEvaluationCase[] {
  if (!Array.isArray(value)) {
    throw new Error("image evaluation cases must be a JSON array.");
  }

  if (value.length < MIN_CASE_COUNT) {
    throw new Error(
      `image evaluation cases must include at least ${MIN_CASE_COUNT} cases.`,
    );
  }

  const cases = value.map((item, index) => readEvaluationCase(item, index));
  const seenCaseIds = new Set<string>();

  for (const evaluationCase of cases) {
    if (seenCaseIds.has(evaluationCase.caseId)) {
      throw new Error(`Duplicate image evaluation caseId: ${evaluationCase.caseId}.`);
    }
    seenCaseIds.add(evaluationCase.caseId);
    assertNoSensitiveStrings(evaluationCase, `case ${evaluationCase.caseId}`);
  }

  return cases;
}

export function validateImageSearchEvaluationResults(
  value: unknown,
  cases: readonly ImageSearchEvaluationCase[],
): ImageSearchEvaluationResult[] {
  if (!Array.isArray(value)) {
    throw new Error("image evaluation results must be JSONL records.");
  }

  const caseIds = new Set(cases.map((evaluationCase) => evaluationCase.caseId));
  const results = value.map((item, index) => readEvaluationResult(item, index));

  for (const result of results) {
    if (!caseIds.has(result.caseId)) {
      throw new Error(`Unknown image evaluation result caseId: ${result.caseId}.`);
    }
    assertNoSensitiveStrings(result, `result ${result.caseId}`);
  }

  return results;
}

function readEvaluationCase(
  value: unknown,
  index: number,
): ImageSearchEvaluationCase {
  const label = `case at index ${index}`;
  const record = requireRecord(value, label);
  const caseId = requirePattern(
    requireString(record.caseId, `${label}.caseId`),
    CASE_ID_PATTERN,
    `${label}.caseId must use image_* snake_case.`,
  );
  const imageRef = requirePattern(
    requireString(record.imageRef, `${label}.imageRef`),
    DEMO_IMAGE_REF_PATTERN,
    `${caseId}.imageRef must be a low-sensitivity demo: or manual: reference.`,
  );
  const expectedOutcome = readEnum(
    record.expectedOutcome,
    `${caseId}.expectedOutcome`,
    IMAGE_SEARCH_EVALUATION_OUTCOMES,
  );
  const expectedCategory = readNullableString(
    record.expectedCategory,
    `${caseId}.expectedCategory`,
  );
  const expectedProductIdPrefixes = readStringArray(
    record.expectedProductIdPrefixes,
    `${caseId}.expectedProductIdPrefixes`,
  );

  for (const prefix of expectedProductIdPrefixes) {
    requirePattern(
      prefix,
      PRODUCT_ID_PREFIX_PATTERN,
      `${caseId}.expectedProductIdPrefixes contains invalid prefix ${prefix}.`,
    );
  }

  if (expectedOutcome === "recommendation") {
    if (!expectedCategory) {
      throw new Error(`${caseId}.expectedCategory is required for recommendation cases.`);
    }
    if (expectedProductIdPrefixes.length === 0) {
      throw new Error(
        `${caseId}.expectedProductIdPrefixes must not be empty for recommendation cases.`,
      );
    }
  }

  const mustNot = readStringArray(record.mustNot, `${caseId}.mustNot`);
  if (mustNot.length === 0) {
    throw new Error(`${caseId}.mustNot must include at least one safety boundary.`);
  }

  return {
    caseId,
    imageRef,
    imageDescription: requireString(
      record.imageDescription,
      `${caseId}.imageDescription`,
    ),
    userText: readString(record.userText, `${caseId}.userText`, {
      allowEmpty: true,
    }),
    expectedOutcome,
    expectedBehavior: requireString(
      record.expectedBehavior,
      `${caseId}.expectedBehavior`,
    ),
    expectedCategory,
    expectedProductIdPrefixes,
    mustNot,
  };
}

function readEvaluationResult(
  value: unknown,
  index: number,
): ImageSearchEvaluationResult {
  const label = `result at index ${index}`;
  const record = requireRecord(value, label);
  const caseId = requirePattern(
    requireString(record.caseId, `${label}.caseId`),
    CASE_ID_PATTERN,
    `${label}.caseId must use image_* snake_case.`,
  );
  const runStatus = readEnum(
    record.runStatus,
    `${caseId}.runStatus`,
    IMAGE_SEARCH_EVALUATION_RUN_STATUSES,
  );
  const visualIntent = readVisualIntentOrNull(
    record.visualIntent,
    `${caseId}.visualIntent`,
  );
  const chatMessage = readNullableString(
    record.chatMessage,
    `${caseId}.chatMessage`,
  );
  const filters = readFiltersOrNull(record.filters, `${caseId}.filters`);
  const returnedProductIds = readStringArray(
    record.returnedProductIds,
    `${caseId}.returnedProductIds`,
  );
  const refusalReason = readOptionalString(
    record.refusalReason,
    `${caseId}.refusalReason`,
  );
  const humanScores = readHumanScoresOrNull(
    record.humanScores,
    `${caseId}.humanScores`,
  );
  const issues = readIssues(record.issues, `${caseId}.issues`);
  const notes = readOptionalStringArray(record.notes, `${caseId}.notes`) ?? [];

  for (const productId of returnedProductIds) {
    requirePattern(
      productId,
      PRODUCT_ID_PATTERN,
      `${caseId}.returnedProductIds contains invalid product id ${productId}.`,
    );
  }

  if (runStatus === "not_run") {
    if (!refusalReason) {
      throw new Error(`${caseId}.refusalReason is required when runStatus is not_run.`);
    }
    if (visualIntent !== null || chatMessage !== null || filters !== null) {
      throw new Error(
        `${caseId} not_run records must not include visualIntent, chatMessage, or filters.`,
      );
    }
    if (returnedProductIds.length > 0 || humanScores !== null || issues.length > 0) {
      throw new Error(
        `${caseId} not_run records must not include products, scores, or issues.`,
      );
    }
  } else if (runStatus === "needs_review") {
    if (visualIntent === null && !refusalReason) {
      throw new Error(
        `${caseId}.visualIntent or refusalReason is required for needs_review runs.`,
      );
    }
    if (returnedProductIds.length === 0 && !refusalReason) {
      throw new Error(
        `${caseId} needs_review runs must include returnedProductIds or refusalReason.`,
      );
    }
  } else {
    if (visualIntent === null) {
      throw new Error(`${caseId}.visualIntent is required for scored runs.`);
    }
    if (humanScores === null) {
      throw new Error(`${caseId}.humanScores is required for scored runs.`);
    }
    if (returnedProductIds.length === 0 && !refusalReason) {
      throw new Error(
        `${caseId} scored runs must include returnedProductIds or refusalReason.`,
      );
    }
  }

  return {
    caseId,
    runAt: readIsoDateString(record.runAt, `${caseId}.runAt`),
    runStatus,
    imageSearchMode: readImageSearchMode(record.imageSearchMode, caseId),
    visualIntent,
    chatMessage,
    filters,
    returnedProductIds,
    ...(refusalReason ? { refusalReason } : {}),
    timing: readTiming(record.timing, `${caseId}.timing`),
    humanScores,
    issues,
    notes: notes.map((note) => truncateForStorage(note)),
  };
}

function readVisualIntentOrNull(value: unknown, name: string): VisualIntent | null {
  if (value === null) {
    return null;
  }

  const record = requireRecord(value, name);
  const confidence = readEnum(
    record.confidence,
    `${name}.confidence`,
    ["high", "medium", "low"] as const,
  );
  const isProductSearch = requireBoolean(
    record.is_product_search,
    `${name}.is_product_search`,
  );
  const searchQuery = readString(record.search_query, `${name}.search_query`, {
    allowEmpty: true,
  });

  if (isProductSearch && confidence !== "low" && searchQuery.length === 0) {
    throw new Error(`${name}.search_query is required for confident product intent.`);
  }

  return {
    is_product_search: isProductSearch,
    detected_category: readNullableString(
      record.detected_category,
      `${name}.detected_category`,
    ),
    detected_brand_text: readNullableString(
      record.detected_brand_text,
      `${name}.detected_brand_text`,
    ),
    visual_attributes: readStringArray(
      record.visual_attributes,
      `${name}.visual_attributes`,
    ),
    colors: readStringArray(record.colors, `${name}.colors`),
    materials: readStringArray(record.materials, `${name}.materials`),
    use_case: readNullableString(record.use_case, `${name}.use_case`),
    constraints: readStringArray(record.constraints, `${name}.constraints`),
    search_query: searchQuery,
    confidence,
    clarification_question: readNullableString(
      record.clarification_question,
      `${name}.clarification_question`,
    ),
  };
}

function readFiltersOrNull(
  value: unknown,
  name: string,
): ImageSearchEvaluationFilters | null {
  if (value === null) {
    return null;
  }

  const record = requireRecord(value, name);
  const category = readOptionalString(record.category, `${name}.category`);

  return category ? { category } : {};
}

function readTiming(value: unknown, name: string): ImageSearchEvaluationTiming {
  const record = requireRecord(value, name);

  return {
    imageInterpretMs: requireNonNegativeInteger(
      record.imageInterpretMs,
      `${name}.imageInterpretMs`,
    ),
    chatTtftMs: requireNonNegativeInteger(record.chatTtftMs, `${name}.chatTtftMs`),
    totalMs: requireNonNegativeInteger(record.totalMs, `${name}.totalMs`),
  };
}

function readHumanScoresOrNull(
  value: unknown,
  name: string,
): ImageSearchEvaluationHumanScores | null {
  if (value === null) {
    return null;
  }

  const record = requireRecord(value, name);

  return {
    visualUnderstanding: requireScore(
      record.visualUnderstanding,
      `${name}.visualUnderstanding`,
    ),
    catalogGrounding: requireScore(record.catalogGrounding, `${name}.catalogGrounding`),
    constraintFollowing: requireScore(
      record.constraintFollowing,
      `${name}.constraintFollowing`,
    ),
    factualAccuracy: requireScore(record.factualAccuracy, `${name}.factualAccuracy`),
    privacySafety: requireScore(record.privacySafety, `${name}.privacySafety`),
    latencyExperience: requireScore(
      record.latencyExperience,
      `${name}.latencyExperience`,
    ),
  };
}

function readIssues(
  value: unknown,
  name: string,
): ImageSearchEvaluationFailureCategory[] {
  return readStringArray(value, name).map((issue) =>
    readEnum(issue, name, IMAGE_SEARCH_EVALUATION_FAILURE_CATEGORIES)
  );
}

function readImageSearchMode(value: unknown, caseId: string): "vlm_first" {
  if (value !== "vlm_first") {
    throw new Error(`${caseId}.imageSearchMode must be vlm_first.`);
  }

  return value;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  return readString(value, name);
}

function readString(
  value: unknown,
  name: string,
  options: { allowEmpty?: boolean } = {},
): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }

  const trimmed = value.trim();

  if (!options.allowEmpty && trimmed.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  if (trimmed.length > MAX_NOTE_CHARS) {
    throw new Error(`${name} is too long.`);
  }

  return trimmed;
}

function readOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readString(value, name);
}

function readNullableString(value: unknown, name: string): string | null {
  if (value === null) {
    return null;
  }

  return readString(value, name);
}

function readStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be a string array.`);
  }

  return value.map((item, index) => readString(item, `${name}[${index}]`));
}

function readOptionalStringArray(
  value: unknown,
  name: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readStringArray(value, name);
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean.`);
  }

  return value;
}

function requireNonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return value;
}

function requireScore(value: unknown, name: string): number {
  const score = requireNonNegativeInteger(value, name);

  if (score < 1 || score > 5) {
    throw new Error(`${name} must be an integer from 1 to 5.`);
  }

  return score;
}

function readIsoDateString(value: unknown, name: string): string {
  const text = requireString(value, name);
  const date = new Date(text);

  if (Number.isNaN(date.getTime()) || date.toISOString() !== text) {
    throw new Error(`${name} must be an ISO timestamp.`);
  }

  return text;
}

function readEnum<T extends readonly string[]>(
  value: unknown,
  name: string,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(", ")}.`);
  }

  return value as T[number];
}

function requirePattern(value: string, pattern: RegExp, message: string): string {
  if (!pattern.test(value)) {
    throw new Error(message);
  }

  return value;
}

function assertNoSensitiveStrings(value: unknown, name: string): void {
  if (typeof value === "string") {
    for (const sensitivePattern of SENSITIVE_PATTERNS) {
      if (sensitivePattern.pattern.test(value)) {
        throw new Error(`${name} contains ${sensitivePattern.name}.`);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveStrings(item, `${name}[${index}]`));
    return;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      assertNoSensitiveStrings(item, `${name}.${key}`);
    }
  }
}

function truncateForStorage(value: string): string {
  return Array.from(value).slice(0, MAX_NOTE_CHARS).join("");
}
