export type ChatStabilitySplit = "seed" | "paraphrase" | "holdout";
export type ChatStabilityPriority = "p0" | "p1" | "p2";

export interface ChatStabilityVariant {
  id: string;
  split: ChatStabilitySplit;
  text: string;
}

export interface ChatStabilityRegressionCase {
  caseId: string;
  priority: ChatStabilityPriority;
  layers: string[];
  sourceBugRefs: string[];
  invariant: string;
  expectedOutcome: string;
  automatedCheck: string;
  variants: ChatStabilityVariant[];
}

export interface ChatStabilityRegressionFile {
  schemaVersion: 1;
  purpose: string;
  cases: ChatStabilityRegressionCase[];
}

const CASE_ID_PATTERN = /^[a-z0-9_]+$/u;
const VARIANT_ID_PATTERN = /^[a-z0-9_]+$/u;
const ALLOWED_PRIORITIES = new Set(["p0", "p1", "p2"]);
const REQUIRED_VARIANT_SPLITS: readonly ChatStabilitySplit[] = [
  "seed",
  "paraphrase",
  "holdout",
];
const ALLOWED_SPLITS = new Set<string>(REQUIRED_VARIANT_SPLITS);

export function validateChatStabilityRegressionCases(
  value: unknown,
): ChatStabilityRegressionFile {
  const record = requireRecord(value, "chat stability regression file");
  const schemaVersion = requireNumber(record.schemaVersion, "schemaVersion");

  if (schemaVersion !== 1) {
    throw new Error("chat stability schemaVersion must be 1.");
  }

  const purpose = requireString(record.purpose, "purpose");
  const cases = requireArray(record.cases, "cases")
    .map((item, index) => readCase(item, `cases[${index}]`));

  if (cases.length < 10) {
    throw new Error("chat stability regression cases must include at least 10 cases.");
  }

  const caseIds = new Set<string>();
  for (const regressionCase of cases) {
    if (caseIds.has(regressionCase.caseId)) {
      throw new Error(`Duplicate chat stability caseId: ${regressionCase.caseId}.`);
    }
    caseIds.add(regressionCase.caseId);
    validateCoverage(regressionCase);
  }

  return {
    schemaVersion: 1,
    purpose,
    cases,
  };
}

function readCase(
  value: unknown,
  label: string,
): ChatStabilityRegressionCase {
  const record = requireRecord(value, label);
  const caseId = requirePattern(
    requireString(record.caseId, `${label}.caseId`),
    CASE_ID_PATTERN,
    `${label}.caseId must use snake_case lowercase.`,
  );
  const priority = readPriority(record.priority, `${caseId}.priority`);
  const layers = requireNonEmptyStringArray(record.layers, `${caseId}.layers`);
  const sourceBugRefs = requireNonEmptyStringArray(
    record.sourceBugRefs,
    `${caseId}.sourceBugRefs`,
  );
  const invariant = requireString(record.invariant, `${caseId}.invariant`, {
    minLength: 20,
  });
  const expectedOutcome = requireString(
    record.expectedOutcome,
    `${caseId}.expectedOutcome`,
  );
  const automatedCheck = requireString(
    record.automatedCheck,
    `${caseId}.automatedCheck`,
  );
  const variants = requireArray(record.variants, `${caseId}.variants`)
    .map((item, index) => readVariant(item, `${caseId}.variants[${index}]`));
  const variantIds = new Set<string>();

  for (const variant of variants) {
    if (variantIds.has(variant.id)) {
      throw new Error(`Duplicate variant id ${variant.id} in ${caseId}.`);
    }
    variantIds.add(variant.id);
  }

  return {
    caseId,
    priority,
    layers,
    sourceBugRefs,
    invariant,
    expectedOutcome,
    automatedCheck,
    variants,
  };
}

function readVariant(value: unknown, label: string): ChatStabilityVariant {
  const record = requireRecord(value, label);

  return {
    id: requirePattern(
      requireString(record.id, `${label}.id`),
      VARIANT_ID_PATTERN,
      `${label}.id must use snake_case lowercase.`,
    ),
    split: readSplit(record.split, `${label}.split`),
    text: requireString(record.text, `${label}.text`, { minLength: 2 }),
  };
}

function validateCoverage(regressionCase: ChatStabilityRegressionCase): void {
  if (regressionCase.priority !== "p2" && regressionCase.variants.length < 3) {
    throw new Error(
      `${regressionCase.caseId} must include at least 3 variants.`,
    );
  }

  if (regressionCase.priority === "p2") {
    return;
  }

  const splits = new Set(regressionCase.variants.map((variant) => variant.split));
  for (const split of REQUIRED_VARIANT_SPLITS) {
    if (!splits.has(split)) {
      throw new Error(
        `${regressionCase.caseId} must include a ${split} variant.`,
      );
    }
  }
}

function readPriority(value: unknown, label: string): ChatStabilityPriority {
  const text = requireString(value, label);

  if (ALLOWED_PRIORITIES.has(text)) {
    return text as ChatStabilityPriority;
  }

  throw new Error(`${label} must be p0, p1, or p2.`);
}

function readSplit(value: unknown, label: string): ChatStabilitySplit {
  const text = requireString(value, label);

  if (ALLOWED_SPLITS.has(text)) {
    return text as ChatStabilitySplit;
  }

  throw new Error(`${label} must be seed, paraphrase, or holdout.`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new Error(`${label} must be an object.`);
}

function requireArray(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  throw new Error(`${label} must be an array.`);
}

function requireString(
  value: unknown,
  label: string,
  options: { minLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const text = value.trim();
  const minLength = options.minLength ?? 1;

  if (text.length < minLength) {
    throw new Error(`${label} must be at least ${minLength} characters.`);
  }

  return text;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`${label} must be a number.`);
}

function requirePattern(
  value: string,
  pattern: RegExp,
  message: string,
): string {
  if (pattern.test(value)) {
    return value;
  }

  throw new Error(message);
}

function requireNonEmptyStringArray(value: unknown, label: string): string[] {
  const items = requireArray(value, label).map((item, index) =>
    requireString(item, `${label}[${index}]`)
  );

  if (items.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  return items;
}
