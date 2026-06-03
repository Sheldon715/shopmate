import type { Product } from "../products/product.types";

export type RagWearingStyle =
  | "in_ear"
  | "semi_in_ear"
  | "open_ear"
  | "over_ear";

export interface RagNegativeFactMetadata {
  freeFromTerms: string[];
  riskTerms: string[];
  wearingStyles: RagWearingStyle[];
}

interface NegativeFactTermDefinition {
  canonical: string;
  aliases: string[];
}

interface LabeledTextFact {
  label: string;
  value: string;
}

const NEGATIVE_FACT_TERMS: NegativeFactTermDefinition[] = [
  {
    canonical: "酒精",
    aliases: ["酒精", "乙醇", "alcohol"],
  },
  {
    canonical: "香精",
    aliases: ["香精", "fragrance"],
  },
  {
    canonical: "parabens",
    aliases: ["parabens", "paraben"],
  },
  {
    canonical: "防腐剂",
    aliases: ["防腐剂"],
  },
];

const FREE_FROM_PREFIXES = [
  "不含",
  "无",
  "没有",
  "未添加",
  "没有添加",
  "不添加",
  "零添加",
  "0添加",
] as const;

export function extractRagNegativeFactMetadata(
  product: Product,
): RagNegativeFactMetadata {
  const textFacts = collectTextFacts(product);
  const freeFromTerms = new Set<string>();
  const riskTerms = new Set<string>();

  for (const fact of textFacts) {
    for (const term of NEGATIVE_FACT_TERMS) {
      const freeFromMatches = findFreeFromTerms(fact.value, term);
      const riskMatches = findRiskTerms(fact, term);

      for (const matchedTerm of freeFromMatches) {
        freeFromTerms.add(matchedTerm);
      }

      for (const matchedTerm of riskMatches) {
        riskTerms.add(matchedTerm);
      }
    }
  }

  return {
    freeFromTerms: sortTerms(freeFromTerms),
    riskTerms: sortTerms(riskTerms),
    wearingStyles: extractWearingStyles(product),
  };
}

export function buildNegativeFactVectorFilters(
  terms: readonly string[],
): {
  excludeRiskTerms: string[];
  excludeWearingStyles: RagWearingStyle[];
} {
  const excludeRiskTerms = new Set<string>();
  const excludeWearingStyles = new Set<RagWearingStyle>();

  for (const term of terms) {
    const riskTerm = canonicalizeRiskTerm(term);
    const wearingStyle = canonicalizeWearingStyle(term);

    if (riskTerm) {
      excludeRiskTerms.add(riskTerm);
    }

    if (wearingStyle) {
      excludeWearingStyles.add(wearingStyle);
    }
  }

  return {
    excludeRiskTerms: sortTerms(excludeRiskTerms),
    excludeWearingStyles: sortWearingStyles(excludeWearingStyles),
  };
}

export function canonicalizeRiskTerm(value: string): string | undefined {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return undefined;
  }

  for (const term of NEGATIVE_FACT_TERMS) {
    if (
      term.aliases.some((alias) =>
        normalizedValue.includes(normalizeText(alias))
      )
    ) {
      return term.canonical;
    }
  }

  return undefined;
}

export function canonicalizeWearingStyle(
  value: string,
): RagWearingStyle | undefined {
  const text = normalizeText(value);

  if (!text) {
    return undefined;
  }

  if (
    text.includes("半入耳")
    || text.includes("半开放")
    || text.includes("半开倾耳")
  ) {
    return "semi_in_ear";
  }

  if (
    text.includes("不入耳")
    || text.includes("非入耳")
    || text.includes("开放式")
    || text.includes("开放耳")
    || text.includes("耳夹")
    || text.includes("耳挂")
  ) {
    return "open_ear";
  }

  if (text.includes("头戴") || text.includes("包耳")) {
    return "over_ear";
  }

  if (
    text.includes("入耳")
    || text.includes("耳腔")
    || text.includes("耳道")
  ) {
    return "in_ear";
  }

  return undefined;
}

function collectTextFacts(product: Product): LabeledTextFact[] {
  return [
    { label: "name", value: product.name },
    ...labelFacts("tags", product.visualTags),
    ...labelFacts("recommendWhen", product.recommendWhen),
    ...labelFacts("avoidWhen", product.avoidWhen),
    ...labelFacts("pros", product.pros),
    ...labelFacts("cons", product.cons),
    ...labelAttributes(product.attributes),
    { label: "marketingDescription", value: product.marketingDescription },
    { label: "knowledgeText", value: product.knowledgeText },
    ...labelProductJsonFacts("reviewSummary", product.reviewSummary, {
      excludeKeys: [],
    }),
    ...labelProductJsonFacts("contentBlocks", product.contentBlocks, {
      excludeKeys: ["block_id", "block_type"],
    }),
    ...labelProductJsonFacts("officialFaq", product.officialFaq, {
      excludeKeys: ["question"],
    }),
    ...labelProductJsonFacts("userReviews", product.userReviews, {
      excludeKeys: ["nickname"],
    }),
  ].filter((fact) => fact.value.trim().length > 0);
}

function labelFacts(label: string, values: string[]): LabeledTextFact[] {
  return values.map((value) => ({ label, value }));
}

function labelAttributes(
  attributes: Record<string, string[]>,
): LabeledTextFact[] {
  return Object.entries(attributes).flatMap(([key, values]) =>
    values.map((value) => ({
      label: `attributes.${key}`,
      value,
    }))
  );
}

function labelProductJsonFacts(
  label: string,
  value: unknown,
  options: { excludeKeys: string[] },
): LabeledTextFact[] {
  return flattenJsonText(value, new Set(options.excludeKeys)).map((text) => ({
    label,
    value: text,
  }));
}

function findFreeFromTerms(
  value: string,
  term: NegativeFactTermDefinition,
): string[] {
  const result = new Set<string>();

  for (const alias of term.aliases) {
    if (hasSafeFreeStatement(value, alias)) {
      result.add(term.canonical);
    }
  }

  return sortTerms(result);
}

function findRiskTerms(
  fact: LabeledTextFact,
  term: NegativeFactTermDefinition,
): string[] {
  const result = new Set<string>();

  for (const clause of splitClauses(fact.value)) {
    for (const alias of term.aliases) {
      if (clauseHasRiskEvidence(clause, alias)) {
        result.add(term.canonical);
        addRiskPhraseTerms(result, clause, term.canonical, alias);
      }
    }
  }

  return sortTerms(result);
}

function clauseHasRiskEvidence(clause: string, alias: string): boolean {
  const text = normalizeText(clause);
  const normalizedAlias = normalizeText(alias);

  if (!normalizedAlias || !text.includes(normalizedAlias)) {
    return false;
  }

  if (hasSafeFreeStatement(clause, alias)) {
    return false;
  }

  return [
    new RegExp(`(?:可能含|疑似含|含有|含)[^。；;,.，、!?！？]{0,12}${escapeRegExp(normalizedAlias)}`, "iu"),
    new RegExp(`${escapeRegExp(normalizedAlias)}(?:成分|味|气味|敏感|刺激|过敏)`, "iu"),
    new RegExp(`(?:对|不适合|慎用|避免)[^。；;,.，、!?！？]{0,16}${escapeRegExp(normalizedAlias)}`, "iu"),
    new RegExp(`${escapeRegExp(normalizedAlias)}[^。；;,.，、!?！？]{0,16}(?:慎用|不适|过敏|刺激)`, "iu"),
  ].some((pattern) => pattern.test(text));
}

function addRiskPhraseTerms(
  result: Set<string>,
  clause: string,
  canonicalTerm: string,
  alias: string,
): void {
  const text = normalizeText(clause);
  const normalizedAlias = normalizeText(alias);

  if (text.includes(`${normalizedAlias}敏感`)) {
    result.add(`${canonicalTerm}敏感`);
  }

  if (text.includes(`${normalizedAlias}味`)) {
    result.add(`${canonicalTerm}味`);
  }

  if (text.includes(`${normalizedAlias}成分`)) {
    result.add(`${canonicalTerm}成分`);
  }
}

function extractWearingStyles(product: Product): RagWearingStyle[] {
  const structured = new Set<RagWearingStyle>();

  for (const [key, values] of Object.entries(product.attributes)) {
    if (!isWearingAttributeKey(key)) {
      continue;
    }

    for (const value of values) {
      const style = canonicalizeWearingStyle(value);

      if (style) {
        structured.add(style);
      }
    }
  }

  if (structured.size > 0) {
    return sortWearingStyles(structured);
  }

  const textDerived = new Set<RagWearingStyle>();
  const textFacts = [
    product.name,
    ...product.visualTags,
    product.marketingDescription,
    product.knowledgeText,
    ...flattenJsonText(product.contentBlocks, new Set(["block_id", "block_type"])),
    ...flattenJsonText(product.officialFaq, new Set(["question"])),
  ];

  for (const value of textFacts) {
    const style = canonicalizeWearingStyle(value);

    if (style) {
      textDerived.add(style);
    }
  }

  return sortWearingStyles(textDerived);
}

function hasSafeFreeStatement(value: string, alias: string): boolean {
  const text = normalizeText(value);
  const normalizedAlias = escapeRegExp(normalizeText(alias));

  if (!normalizedAlias) {
    return false;
  }

  const prefixGroup = FREE_FROM_PREFIXES.map((prefix) =>
    escapeRegExp(normalizeText(prefix))
  ).join("|");
  const patterns = [
    new RegExp(`(?:${prefixGroup})[^。；;,.，!?！？]{0,30}${normalizedAlias}`, "iu"),
    new RegExp(`${normalizedAlias}(?:free|0添加|零添加)`, "iu"),
    new RegExp(`freefrom[^。；;,.，!?！？]{0,30}${normalizedAlias}`, "iu"),
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function splitClauses(value: string): string[] {
  return value
    .split(/[。；;,.，、!?！？\n\r]+/u)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
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

function flattenJsonText(
  value: unknown,
  excludedKeys: Set<string>,
): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonText(item, excludedKeys));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entryValue]) =>
      excludedKeys.has(key)
        ? []
        : flattenJsonText(entryValue, excludedKeys)
    );
  }

  return [];
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .toLocaleLowerCase("zh-CN");
}

function sortTerms(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function sortWearingStyles(
  values: Iterable<RagWearingStyle>,
): RagWearingStyle[] {
  const order: RagWearingStyle[] = [
    "in_ear",
    "semi_in_ear",
    "open_ear",
    "over_ear",
  ];
  const set = new Set(values);

  return order.filter((style) => set.has(style));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
