import type {
  NegativeConstraintKind,
  NegativeConstraintMatchPolicy,
} from "./negative-constraint.types";

export type NegativeConstraintEvidenceReason =
  | "brand_match"
  | "product_match"
  | "category_match"
  | "strict_risk_fact"
  | "explicit_conflict_fact"
  | "explicit_safe_free_from"
  | "structured_attribute_conflict"
  | "no_conflict_evidence";

export interface NegativeConstraintProductFacts {
  id: string;
  name: string;
  brand: string;
  category: string;
  subCategory: string | null;
  tags: string[];
  recommendWhen: string[];
  avoidWhen: string[];
  pros: string[];
  cons: string[];
  attributes: Record<string, string[]>;
  marketingDescription: string;
  knowledgeText: string;
  snippets: string[];
  reviewSummary?: unknown;
  contentBlocks?: unknown;
  officialFaq?: unknown;
  userReviews?: unknown;
}

export interface NegativeConstraintEvidenceInput {
  term: string;
  kind: NegativeConstraintKind;
  matchPolicy: NegativeConstraintMatchPolicy;
  productFacts: NegativeConstraintProductFacts;
}

export interface NegativeConstraintEvidenceResult {
  conflicts: boolean;
  reason: NegativeConstraintEvidenceReason;
  evidence: string[];
}

type WearingStyle = "入耳式" | "半入耳式" | "开放式" | "头戴式";

interface LabeledFact {
  label: string;
  value: string;
}

const MAX_EVIDENCE_ITEMS = 3;

export function evaluateNegativeConstraintEvidence(
  input: NegativeConstraintEvidenceInput,
): NegativeConstraintEvidenceResult {
  const term = normalizeText(input.term);

  if (!term) {
    return noConflict();
  }

  switch (input.matchPolicy) {
    case "exclude_brand":
      return matchIdentity(
        [[input.productFacts.brand, "brand"]],
        term,
        "brand_match",
      );
    case "exclude_product":
      return matchIdentity(
        [
          [input.productFacts.id, "product_id"],
          [input.productFacts.name, "name"],
          [input.productFacts.brand, "brand"],
        ],
        term,
        "product_match",
      );
    case "exclude_category":
      return matchIdentity(
        [
          [input.productFacts.category, "category"],
          [input.productFacts.subCategory ?? "", "subCategory"],
        ],
        term,
        "category_match",
      );
    case "exclude_if_product_facts_conflict":
      return evaluateProductFactConflict(input.productFacts, term);
    case "needs_clarification":
      return noConflict();
  }
}

function evaluateProductFactConflict(
  facts: NegativeConstraintProductFacts,
  term: string,
): NegativeConstraintEvidenceResult {
  const structuredConflict = findStructuredAttributeConflict(facts, term);

  if (structuredConflict) {
    return structuredConflict;
  }

  const strictRiskEvidence = findFirstMatchingFacts(
    [
      ...labelFacts("avoidWhen", facts.avoidWhen),
      ...labelFacts("cons", facts.cons),
    ],
    term,
  );

  if (strictRiskEvidence.length > 0) {
    return {
      conflicts: true,
      reason: "strict_risk_fact",
      evidence: strictRiskEvidence,
    };
  }

  const explicitConflictEvidence = findFirstMatchingFacts(
    buildGeneralFacts(facts, term),
    term,
  );

  if (explicitConflictEvidence.length > 0) {
    return {
      conflicts: true,
      reason: "explicit_conflict_fact",
      evidence: explicitConflictEvidence,
    };
  }

  const safeEvidence = findSafeFreeEvidence(facts, term);

  if (safeEvidence.length > 0) {
    return {
      conflicts: false,
      reason: "explicit_safe_free_from",
      evidence: safeEvidence,
    };
  }

  return noConflict();
}

function matchIdentity(
  values: Array<[string, string]>,
  term: string,
  reason: NegativeConstraintEvidenceReason,
): NegativeConstraintEvidenceResult {
  const match = values.find(([value]) => textMatchesTerm(value, term));

  if (!match) {
    return noConflict();
  }

  return {
    conflicts: true,
    reason,
    evidence: [`${match[1]}: ${match[0]}`],
  };
}

function findStructuredAttributeConflict(
  facts: NegativeConstraintProductFacts,
  term: string,
): NegativeConstraintEvidenceResult | undefined {
  const requestedStyle = canonicalizeWearingStyle(term);

  if (!requestedStyle) {
    return undefined;
  }

  for (const fact of getStructuredWearingFacts(facts)) {
    const actualStyle = canonicalizeWearingStyle(fact.value);

    if (actualStyle && actualStyle === requestedStyle) {
      return {
        conflicts: true,
        reason: "structured_attribute_conflict",
        evidence: [`${fact.label}: ${fact.value}`],
      };
    }
  }

  return undefined;
}

function getStructuredWearingFacts(
  facts: NegativeConstraintProductFacts,
): LabeledFact[] {
  const result: LabeledFact[] = [];

  for (const [key, values] of Object.entries(facts.attributes)) {
    if (!isWearingAttributeKey(key)) {
      continue;
    }

    for (const value of values) {
      result.push({ label: `attributes.${key}`, value });
    }
  }

  for (const tag of facts.tags) {
    if (canonicalizeWearingStyle(tag)) {
      result.push({ label: "tag", value: tag });
    }
  }

  return result;
}

function buildGeneralFacts(
  facts: NegativeConstraintProductFacts,
  term: string,
): LabeledFact[] {
  const wearingTerm = Boolean(canonicalizeWearingStyle(term));

  return [
    { label: "name", value: facts.name },
    { label: "brand", value: facts.brand },
    { label: "marketingDescription", value: facts.marketingDescription },
    ...labelFacts("tag", facts.tags),
    ...labelFacts("pros", facts.pros),
    ...labelFacts("recommendWhen", facts.recommendWhen),
    ...labelFacts("snippet", facts.snippets),
    ...labelAttributeFacts(facts.attributes, wearingTerm),
    ...labelFlattenedFacts("reviewSummary", facts.reviewSummary),
    ...labelFlattenedFacts("contentBlocks", facts.contentBlocks),
    ...labelFlattenedFacts("officialFaq", facts.officialFaq),
    ...labelFlattenedFacts("userReviews", facts.userReviews),
    { label: "knowledgeText", value: facts.knowledgeText },
  ].filter((fact) => fact.value.trim().length > 0);
}

function labelFacts(label: string, values: string[]): LabeledFact[] {
  return values.map((value) => ({ label, value }));
}

function labelAttributeFacts(
  attributes: Record<string, string[]>,
  skipWearingAttributes: boolean,
): LabeledFact[] {
  return Object.entries(attributes).flatMap(([key, values]) => {
    if (skipWearingAttributes && isWearingAttributeKey(key)) {
      return [];
    }

    return values.map((value) => ({
      label: `attributes.${key}`,
      value,
    }));
  });
}

function labelFlattenedFacts(label: string, value: unknown): LabeledFact[] {
  return flattenFactValues(label, value);
}

function findFirstMatchingFacts(
  facts: LabeledFact[],
  term: string,
): string[] {
  const evidence: string[] = [];

  for (const fact of facts) {
    if (isQuestionLikeFact(fact.label)) {
      continue;
    }

    if (factMentionsConflict(fact.value, term)) {
      evidence.push(`${fact.label}: ${fact.value}`);
    }

    if (evidence.length >= MAX_EVIDENCE_ITEMS) {
      break;
    }
  }

  return evidence;
}

function findSafeFreeEvidence(
  facts: NegativeConstraintProductFacts,
  term: string,
): string[] {
  const evidence: string[] = [];

  for (const fact of buildGeneralFacts(facts, term)) {
    if (isQuestionLikeFact(fact.label)) {
      continue;
    }

    if (hasSafeFreeStatement(normalizeText(fact.value), term)) {
      evidence.push(`${fact.label}: ${fact.value}`);
    }

    if (evidence.length >= MAX_EVIDENCE_ITEMS) {
      break;
    }
  }

  return evidence;
}

function factMentionsConflict(value: string, term: string): boolean {
  const text = normalizeText(value);

  if (!text.includes(term) || hasSafeFreeStatement(text, term)) {
    return false;
  }

  const requestedStyle = canonicalizeWearingStyle(term);

  if (requestedStyle) {
    const actualStyle = canonicalizeWearingStyle(text);

    if (actualStyle && actualStyle !== requestedStyle) {
      return false;
    }
  }

  return true;
}

function hasSafeFreeStatement(text: string, term: string): boolean {
  const escapedTerm = escapeRegExp(term);
  const patterns = [
    new RegExp(`(?:不含|无|没有|未添加|没有添加|不添加|零添加|0添加)[^。；;.!?！？]{0,20}${escapedTerm}`, "u"),
    new RegExp(`${escapedTerm}(?:free|0添加|零添加)`, "iu"),
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function isWearingAttributeKey(value: string): boolean {
  const text = normalizeText(value);

  return [
    "佩戴",
    "形态",
    "方式",
    "耳机类型",
  ].some((keyword) => text.includes(normalizeText(keyword)));
}

function canonicalizeWearingStyle(value: string): WearingStyle | undefined {
  const text = normalizeText(value);

  if (
    text.includes("半入耳") ||
    text.includes("半开放") ||
    text.includes("半开倾耳")
  ) {
    return "半入耳式";
  }

  if (
    text.includes("不入耳") ||
    text.includes("非入耳") ||
    text.includes("开放式") ||
    text.includes("开放耳")
  ) {
    return "开放式";
  }

  if (text.includes("头戴") || text.includes("包耳")) {
    return "头戴式";
  }

  if (
    text.includes("入耳") ||
    text.includes("耳腔") ||
    text.includes("耳道")
  ) {
    return "入耳式";
  }

  return undefined;
}

function textMatchesTerm(value: string, normalizedTerm: string): boolean {
  return normalizeText(value).includes(normalizedTerm);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .toLocaleLowerCase("zh-CN");
}

function flattenFactValues(label: string, value: unknown): LabeledFact[] {
  if (typeof value === "string") {
    return [{ label, value }];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [{ label, value: String(value) }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenFactValues(label, item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      flattenFactValues(`${label}.${key}`, item)
    );
  }

  return [];
}

function isQuestionLikeFact(label: string): boolean {
  return /(?:^|\.)question$/u.test(label);
}

function noConflict(): NegativeConstraintEvidenceResult {
  return {
    conflicts: false,
    reason: "no_conflict_evidence",
    evidence: [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
