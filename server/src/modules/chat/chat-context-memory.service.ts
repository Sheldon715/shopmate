import type { VectorSearchFilters } from "../vector/vector-search.types";
import { buildNegativeFactVectorFilters } from "../vector/rag-negative-fact-metadata";
import { ChatContextMemoryStore } from "./chat-context-memory.store";
import type {
  ChatContextConstraints,
  ChatContextMemory,
  ChatContextMemorySummary,
} from "./chat-context-memory.types";
import type { PendingClarification } from "./clarification.types";
import type { NegativeConstraint } from "./negative-constraint.types";

export interface ChatContextMemoryResolution {
  conversationId?: string;
  memory?: ChatContextMemory;
  contextMemory?: ChatContextMemorySummary;
  negativeConstraints?: NegativeConstraint[];
  retrievalQuery: string;
  filters?: VectorSearchFilters;
}

export interface ChatContextMemoryServiceOptions {
  store?: ChatContextMemoryStore;
  now?: () => Date;
}

const MAX_CONTEXT_TERMS = 12;
const MAX_TERM_LENGTH = 80;
const APPROXIMATE_BUDGET_TOLERANCE_PERCENT = 110;
const DEFAULT_STORE = new ChatContextMemoryStore();

const PREFERENCE_TERMS = [
  "轻量",
  "便携",
  "续航",
  "拍照",
  "性价比",
  "音质",
  "降噪",
  "低音",
  "人声",
  "通话",
  "佩戴舒适",
  "办公",
  "通勤",
];

const CATEGORY_HINTS = [
  {
    terms: ["跑鞋", "运动鞋"],
    category: "服饰运动",
    subCategory: "跑步鞋",
  },
  {
    terms: ["鞋", "鞋子"],
    category: "服饰运动",
  },
  {
    terms: ["手机"],
    category: "数码电子",
    subCategory: "智能手机",
  },
  {
    terms: ["蓝牙耳机", "耳机", "降噪耳机"],
    category: "数码电子",
    subCategory: "真无线耳机",
  },
  {
    terms: ["小家电", "厨房小电", "早餐机", "电炖盅", "电饭煲", "一人食小家电"],
    category: "家用电器",
    subCategory: "厨房小电",
  },
  {
    terms: ["家电", "家用电器"],
    category: "家用电器",
  },
  {
    terms: ["防晒霜", "防晒"],
    category: "美妆护肤",
    subCategory: "防晒",
  },
  {
    terms: ["洗面奶", "洁面乳", "洁面膏", "洁面泡沫", "洁面啫喱", "洁面"],
    category: "美妆护肤",
    subCategory: "洁面",
  },
  {
    terms: ["护肤品", "护肤"],
    category: "美妆护肤",
  },
  {
    terms: ["零食", "食品"],
    category: "食品饮料",
  },
] as const;

export class ChatContextMemoryService {
  private readonly store: ChatContextMemoryStore;
  private readonly now: () => Date;

  constructor(options: ChatContextMemoryServiceOptions = {}) {
    this.store = options.store ?? DEFAULT_STORE;
    this.now = options.now ?? (() => new Date());
  }

  resolve(input: {
    conversationId?: string;
    question: string;
    filters?: VectorSearchFilters;
  }): ChatContextMemoryResolution {
    const explicitNegativeConstraints =
      filtersToNegativeConstraints(input.filters);

    if (!input.conversationId) {
      const filters = mergeVectorFilters(
        filtersWithoutFactAvoidTerms(input.filters),
        negativeConstraintsToFactFilters(explicitNegativeConstraints),
      );

      return {
        retrievalQuery: input.question,
        ...(filters ? { filters } : {}),
        ...(explicitNegativeConstraints.length > 0
          ? { negativeConstraints: explicitNegativeConstraints }
          : {}),
      };
    }

    const previousMemory = this.store.get(input.conversationId);
    const memory = mergeExplicitNegativeConstraints(
      mergeMemory({
        conversationId: input.conversationId,
        previousMemory,
        question: input.question,
        now: this.now(),
      }),
      explicitNegativeConstraints,
    );

    return {
      conversationId: input.conversationId,
      memory,
      contextMemory: toSummary(memory),
      negativeConstraints: memory.negativeConstraints,
      retrievalQuery: buildRetrievalQuery(input.question, memory),
      filters: mergeVectorFilters(
        mergeFilters(input.filters, memory.constraints),
        negativeConstraintsToFactFilters(memory.negativeConstraints ?? []),
      ),
    };
  }

  applyNegativeConstraints(
    resolution: ChatContextMemoryResolution,
    constraints: NegativeConstraint[],
  ): ChatContextMemoryResolution {
    const mergedNegativeConstraints = mergeNegativeConstraints(
      resolution.negativeConstraints ?? resolution.memory?.negativeConstraints ?? [],
      constraints,
    );
    const avoidTerms = negativeConstraintsToAvoidTerms(mergedNegativeConstraints);
    const excludeBrands = negativeConstraintsToExcludeBrands(
      mergedNegativeConstraints,
    );
    const excludeProductIds = negativeConstraintsToExcludeProductIds(
      mergedNegativeConstraints,
    );
    const excludeCategories = negativeConstraintsToExcludeCategories(
      mergedNegativeConstraints,
    );
    const factFilters = negativeConstraintsToFactFilters(
      mergedNegativeConstraints,
    );

    if (!resolution.memory) {
      return {
        ...resolution,
        negativeConstraints: mergedNegativeConstraints,
        filters: mergeVectorFilters(filtersWithoutFactAvoidTerms(resolution.filters), {
          ...factFilters,
          excludeBrands,
          excludeProductIds,
          excludeCategories,
        }),
      };
    }

    const memory: ChatContextMemory = {
      ...resolution.memory,
      constraints: pruneConstraints({
        ...resolution.memory.constraints,
        avoidTerms: mergeTerms(
          resolution.memory.constraints.avoidTerms,
          avoidTerms,
        ),
      }),
      negativeConstraints: mergedNegativeConstraints,
    };
    const memoryFilters = mergeFilters(undefined, memory.constraints);
    const baseFilters = mergeVectorFilters(
      memoryFilters,
      filtersWithoutFactAvoidTerms(resolution.filters) ?? {},
    );

    return {
      ...resolution,
      memory,
      contextMemory: toSummary(memory),
      negativeConstraints: mergedNegativeConstraints,
      filters: mergeVectorFilters(baseFilters, {
        ...factFilters,
        excludeBrands,
        excludeProductIds,
        excludeCategories,
      }),
    };
  }

  commit(
    resolution: ChatContextMemoryResolution,
    recommendedProductIds: string[],
    options: {
      pendingClarification?: PendingClarification;
      preserveLastRecommendedProductIds?: boolean;
    } = {},
  ): ChatContextMemorySummary | undefined {
    if (!resolution.conversationId || !resolution.memory) {
      return undefined;
    }

    const memory = {
      ...resolution.memory,
      lastRecommendedProductIds: options.preserveLastRecommendedProductIds
        ? resolution.memory.lastRecommendedProductIds
        : normalizeTerms(recommendedProductIds),
      pendingClarification: options.pendingClarification,
      updatedAt: this.now().toISOString(),
    };

    this.store.set(memory);
    return toSummary(memory);
  }
}

function mergeMemory(input: {
  conversationId: string;
  previousMemory?: ChatContextMemory;
  question: string;
  now: Date;
}): ChatContextMemory {
  const extracted = extractConstraints(input.question);
  const previousConstraints = input.previousMemory?.constraints
    ?? createEmptyConstraints();
  const categoryChanged =
    extracted.category !== undefined
    && extracted.category !== previousConstraints.category;
  const previousNegativeConstraints = categoryChanged
    ? []
    : input.previousMemory?.negativeConstraints ?? [];
  const constraints = pruneConstraints({
    category: extracted.category ?? previousConstraints.category,
    subCategory: extracted.subCategory
      ?? (categoryChanged ? undefined : previousConstraints.subCategory),
    brand: extracted.brand ?? (categoryChanged ? undefined : previousConstraints.brand),
    minPriceCents: extracted.clearPriceConstraints
      ? undefined
      : extracted.minPriceCents ?? previousConstraints.minPriceCents,
    maxPriceCents: extracted.clearPriceConstraints
      ? undefined
      : extracted.maxPriceCents ?? previousConstraints.maxPriceCents,
    preferenceTerms: mergeTerms(
      previousConstraints.preferenceTerms,
      extracted.preferenceTerms,
    ),
    avoidTerms: mergeTerms(
      categoryChanged ? [] : previousConstraints.avoidTerms,
      extracted.avoidTerms,
    ),
  });

  return {
    conversationId: input.conversationId,
    lastIntent: extractIntent(input.question, extracted)
      ?? input.previousMemory?.lastIntent,
    constraints,
    negativeConstraints: previousNegativeConstraints,
    lastRecommendedProductIds:
      input.previousMemory?.lastRecommendedProductIds ?? [],
    updatedAt: input.now.toISOString(),
    turnCount: (input.previousMemory?.turnCount ?? 0) + 1,
  };
}

function buildRetrievalQuery(
  question: string,
  memory: ChatContextMemory,
): string {
  const parts = [
    question.trim(),
    memory.lastIntent,
    memory.constraints.category,
    memory.constraints.subCategory,
    ...memory.constraints.preferenceTerms,
  ];

  return normalizeTerms(parts).join(" ");
}

function mergeFilters(
  explicitFilters: VectorSearchFilters | undefined,
  constraints: ChatContextConstraints,
): VectorSearchFilters | undefined {
  const explicitCategoryDiffers =
    explicitFilters?.category !== undefined
    && explicitFilters.category !== constraints.category;
  const merged = {
    category: explicitFilters?.category ?? constraints.category,
    subCategory: explicitFilters?.subCategory
      ?? (explicitCategoryDiffers ? undefined : constraints.subCategory),
    brand: explicitFilters?.brand ?? constraints.brand,
    minPriceCents: explicitFilters?.minPriceCents ?? constraints.minPriceCents,
    maxPriceCents: explicitFilters?.maxPriceCents ?? constraints.maxPriceCents,
    availableOnly: explicitFilters?.availableOnly,
    tagsAny: explicitFilters?.tagsAny,
    excludeBrands: explicitFilters?.excludeBrands,
    excludeProductIds: explicitFilters?.excludeProductIds,
    excludeCategories: explicitFilters?.excludeCategories,
    excludeRiskTerms: explicitFilters?.excludeRiskTerms,
    excludeWearingStyles: explicitFilters?.excludeWearingStyles,
  };

  return Object.keys(pruneUndefined(merged)).length > 0
    ? pruneUndefined(merged)
    : undefined;
}

interface ExtractedChatContextConstraints extends ChatContextConstraints {
  clearPriceConstraints?: boolean;
}

function extractConstraints(question: string): ExtractedChatContextConstraints {
  const categoryHint = findCategoryHint(question);
  const budgetRange = extractBudgetRangeCents(question);
  const clearPriceConstraints = hasBudgetClearCue(question);

  const constraints = pruneConstraints({
    category: categoryHint?.category,
    subCategory: categoryHint?.subCategory,
    brand: undefined,
    minPriceCents: clearPriceConstraints
      ? undefined
      : budgetRange?.minPriceCents ?? extractMinPriceCents(question),
    maxPriceCents: clearPriceConstraints
      ? undefined
      : budgetRange?.maxPriceCents ?? extractMaxPriceCents(question),
    preferenceTerms: PREFERENCE_TERMS.filter((term) => question.includes(term)),
    avoidTerms: [],
  });

  return {
    ...constraints,
    ...(clearPriceConstraints ? { clearPriceConstraints: true } : {}),
  };
}

function extractIntent(
  question: string,
  constraints: ExtractedChatContextConstraints,
): string | undefined {
  if (
    constraints.category
    || constraints.subCategory
    || /推荐|重新|换|找|想买|看看/u.test(question)
  ) {
    return question.trim();
  }

  return undefined;
}

function hasBudgetClearCue(question: string): boolean {
  const normalized = question.replace(/\s+/gu, "");

  return [
    "不用管预算",
    "不要管预算",
    "不管预算",
    "预算不用管",
    "预算不要管",
    "预算先不管",
    "先不管预算",
    "不限预算",
    "没有预算限制",
    "不要预算限制",
    "不用预算限制",
    "不限制预算",
    "不用管200",
    "不要管200",
    "不管200",
    "不用管价格",
    "不要管价格",
    "不管价格",
  ].some((term) => normalized.includes(term))
    || /(?:不用|不要|不)管\d{1,6}(?:元|块)?/u.test(normalized)
    || /(?:不用|不要|不)看\d{1,6}(?:元|块)?/u.test(normalized)
    || /(?:预算|价格)(?:不用|不要|不)限/u.test(normalized);
}

function findCategoryHint(question: string):
  | { category: string; subCategory?: string }
  | undefined {
  const hint = CATEGORY_HINTS.find((candidate) =>
    candidate.terms.some((term) => categoryTermMatches(question, term))
  );

  return hint
    ? {
        category: hint.category,
        subCategory: "subCategory" in hint ? hint.subCategory : undefined,
      }
    : undefined;
}

function categoryTermMatches(question: string, term: string): boolean {
  if (term.length === 1) {
    return normalizeTerseQuery(question) === term;
  }

  return question.includes(term);
}

function normalizeTerseQuery(question: string): string {
  return question.replace(/[\s，。！？!?、,.]/gu, "");
}

function extractBudgetRangeCents(question: string): {
  minPriceCents: number;
  maxPriceCents: number;
} | undefined {
  const valuePattern = String.raw`(\d{1,6}|[一二三四五六七八九十百千万两〇零]{1,12})`;
  const rangePatterns = [
    new RegExp(
      String.raw`(?:预算|价位|价格|预算大概|预算大约|预算约)\s*`
      + valuePattern
      + String.raw`\s*(?:-|~|－|—|到|至|和|跟|与)\s*`
      + valuePattern
      + String.raw`\s*(?:元|块)?`,
      "u",
    ),
    new RegExp(
      valuePattern
      + String.raw`\s*(?:-|~|－|—|到|至)\s*`
      + valuePattern
      + String.raw`\s*(?:元|块)\s*(?:预算|价位|价格)?`,
      "u",
    ),
  ];

  for (const pattern of rangePatterns) {
    const match = pattern.exec(question);

    if (!match) {
      continue;
    }

    const first = parsePriceYuan(match[1] ?? "");
    const second = parsePriceYuan(match[2] ?? "");

    if (first === undefined || second === undefined) {
      continue;
    }

    return {
      minPriceCents: Math.min(first, second) * 100,
      maxPriceCents: Math.max(first, second) * 100,
    };
  }

  return undefined;
}

function extractMaxPriceCents(question: string): number | undefined {
  const strictPatterns = [
    pricePattern(String.raw`(?:不超过|不高于|低于|小于|少于|最多|上限)\s*`, String.raw`\s*(?:元|块)?`),
    pricePattern("", String.raw`\s*(?:元|块)?\s*(?:以内|以下)`),
  ];
  const strictMaxPriceCents = extractPriceCents(question, strictPatterns);

  if (strictMaxPriceCents !== undefined) {
    return strictMaxPriceCents;
  }

  const followUpBudgetCents = extractFollowUpBudgetCents(question);

  if (followUpBudgetCents !== undefined) {
    return followUpBudgetCents;
  }

  const approximatePatterns = [
    pricePattern(String.raw`预算\s*(?:大概|大约|约|差不多)?\s*`, String.raw`\s*(?:元|块)?\s*(?:左右|上下|附近)?`),
    pricePattern(String.raw`(?:大概|大约|约|差不多)\s*`, String.raw`\s*(?:元|块)?\s*(?:左右|上下|附近)?`),
    pricePattern("", String.raw`\s*(?:元|块)?\s*(?:左右|上下|附近)`),
  ];
  const approximateMaxPriceCents = extractPriceCents(
    question,
    approximatePatterns,
  );

  return approximateMaxPriceCents === undefined
    ? undefined
    : Math.ceil(
        (approximateMaxPriceCents * APPROXIMATE_BUDGET_TOLERANCE_PERCENT)
          / 100,
      );
}

function extractFollowUpBudgetCents(question: string): number | undefined {
  const valuePattern = String.raw`(\d{2,6}|[一二三四五六七八九十百千万两〇零]{1,12})`;
  const normalized = question.trim();
  const patterns = [
    new RegExp(String.raw`^${valuePattern}\s*(?:元|块)?\s*呢?$`, "u"),
    new RegExp(
      String.raw`^${valuePattern}\s*(?:元|块)?\s*的(?:耳机|手机|跑鞋|鞋|防晒|洗面奶|洁面|小家电|商品)?\s*呢?$`,
      "u",
    ),
    new RegExp(
      String.raw`^${valuePattern}\s*(?:元|块)?\s*(?:有没有|有吗|有没有合适的)$`,
      "u",
    ),
  ];

  for (const pattern of patterns) {
    const value = pattern.exec(normalized)?.[1];
    const yuan = value ? parsePriceYuan(value) : undefined;

    if (yuan !== undefined) {
      return yuan * 100;
    }
  }

  return undefined;
}

function extractMinPriceCents(question: string): number | undefined {
  const patterns = [
    pricePattern(String.raw`(?:至少|不低于|高于|大于)\s*`, String.raw`\s*(?:元|块)?`),
  ];

  return extractPriceCents(question, patterns);
}

function extractPriceCents(question: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const value = pattern.exec(question)?.[1];
    const yuan = value ? parsePriceYuan(value) : undefined;

    if (yuan !== undefined) {
      return yuan * 100;
    }
  }

  return undefined;
}

function pricePattern(prefix: string, suffix: string): RegExp {
  return new RegExp(
    `${prefix}(\\d{1,6}|[一二三四五六七八九十百千万两〇零]{1,12})${suffix}`,
    "u",
  );
}

function parsePriceYuan(value: string): number | undefined {
  if (/^\d{1,6}$/u.test(value)) {
    return Number.parseInt(value, 10);
  }

  return parseChineseInteger(value);
}

function parseChineseInteger(value: string): number | undefined {
  const normalized = value.replace(/两/gu, "二").replace(/〇/gu, "零");

  if (!/^[一二三四五六七八九十百千万零]+$/u.test(normalized)) {
    return undefined;
  }

  const [wanPart, restPart] = normalized.split("万");
  if (restPart !== undefined) {
    const wanValue = parseChineseSection(wanPart);
    const restValue = parseChineseWanRemainder(restPart);

    return wanValue === undefined || restValue === undefined
      ? undefined
      : wanValue * 10000 + restValue;
  }

  return parseChineseSection(normalized);
}

function parseChineseWanRemainder(value: string): number | undefined {
  if (value.length === 0) {
    return 0;
  }

  if (/^[一二三四五六七八九]$/u.test(value)) {
    const digit = parseChineseDigit(value);
    return digit === undefined ? undefined : digit * 1000;
  }

  return parseChineseSection(value);
}

function parseChineseSection(value: string): number | undefined {
  if (value.length === 0 || value === "零") {
    return 0;
  }

  const unitValues: Record<string, number> = {
    千: 1000,
    百: 100,
    十: 10,
  };
  let pendingDigit: number | undefined;
  let lastUnit = 1;
  let hasZeroAfterLastUnit = false;
  let total = 0;

  for (const char of Array.from(value)) {
    if (char === "零") {
      hasZeroAfterLastUnit = true;
      pendingDigit = undefined;
      continue;
    }

    const unitValue = unitValues[char];
    if (unitValue !== undefined) {
      const digit = pendingDigit ?? 1;
      total += digit * unitValue;
      pendingDigit = undefined;
      lastUnit = unitValue;
      hasZeroAfterLastUnit = false;
      continue;
    }

    const digit = parseChineseDigit(char);

    if (digit === undefined) {
      return undefined;
    }

    pendingDigit = digit;
  }

  if (pendingDigit === undefined) {
    return total;
  }

  const inferredUnit =
    total > 0 && lastUnit > 10 && !hasZeroAfterLastUnit
      ? lastUnit / 10
      : 1;

  return total + pendingDigit * inferredUnit;
}

function parseChineseDigit(value: string): number | undefined {
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  return value.length === 1 ? digits[value] : undefined;
}

function createEmptyConstraints(): ChatContextConstraints {
  return {
    preferenceTerms: [],
    avoidTerms: [],
  };
}

function pruneConstraints(
  constraints: ChatContextConstraints,
): ChatContextConstraints {
  return {
    ...pruneUndefined({
      category: normalizeTerm(constraints.category),
      subCategory: normalizeTerm(constraints.subCategory),
      brand: normalizeTerm(constraints.brand),
      minPriceCents: constraints.minPriceCents,
      maxPriceCents: constraints.maxPriceCents,
    }),
    preferenceTerms: normalizeTerms(constraints.preferenceTerms),
    avoidTerms: normalizeTerms(constraints.avoidTerms),
  };
}

function mergeTerms(left: string[], right: string[]): string[] {
  return normalizeTerms([...left, ...right]);
}

function mergeNegativeConstraints(
  left: readonly NegativeConstraint[],
  right: readonly NegativeConstraint[],
): NegativeConstraint[] {
  const seen = new Set<string>();
  const merged: NegativeConstraint[] = [];

  for (const constraint of [...left, ...right]) {
    const normalized = normalizeNegativeConstraint(constraint);

    if (!normalized) {
      continue;
    }

    const key = [
      normalized.term,
      normalized.kind,
      normalized.scope,
      normalized.matchPolicy,
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(normalized);

    if (merged.length >= MAX_CONTEXT_TERMS) {
      break;
    }
  }

  return merged;
}

function mergeExplicitNegativeConstraints(
  memory: ChatContextMemory,
  constraints: NegativeConstraint[],
): ChatContextMemory {
  if (constraints.length === 0) {
    return memory;
  }

  const avoidTerms = negativeConstraintsToAvoidTerms(constraints);

  return {
    ...memory,
    constraints: pruneConstraints({
      ...memory.constraints,
      avoidTerms: mergeTerms(memory.constraints.avoidTerms, avoidTerms),
    }),
    negativeConstraints: mergeNegativeConstraints(
      memory.negativeConstraints ?? [],
      constraints,
    ),
  };
}

function filtersToNegativeConstraints(
  filters: VectorSearchFilters | undefined,
): NegativeConstraint[] {
  return normalizeTerms(filters?.avoidTerms ?? []).map((term) => ({
    rawText: term,
    term,
    kind: "unknown",
    scope: "product",
    matchPolicy: "exclude_if_product_facts_conflict",
  }));
}

function filtersWithoutFactAvoidTerms(
  filters: VectorSearchFilters | undefined,
): VectorSearchFilters | undefined {
  if (!filters) {
    return undefined;
  }

  const { avoidTerms: _avoidTerms, ...rest } = filters;
  const pruned = pruneUndefined(rest);

  return Object.keys(pruned).length > 0
    ? pruned as VectorSearchFilters
    : undefined;
}

function normalizeNegativeConstraint(
  constraint: NegativeConstraint,
): NegativeConstraint | undefined {
  const rawText = normalizeTerm(constraint.rawText);
  const term = normalizeTerm(constraint.term);

  return rawText && term
    ? {
        rawText,
        term,
        kind: constraint.kind,
        scope: constraint.scope,
        matchPolicy: constraint.matchPolicy,
      }
    : undefined;
}

function negativeConstraintsToAvoidTerms(
  constraints: readonly NegativeConstraint[],
): string[] {
  return normalizeTerms(
    constraints
      .filter((constraint) =>
        constraint.kind !== "price"
        && constraint.matchPolicy !== "needs_clarification"
      )
      .map((constraint) => constraint.term),
  );
}

function negativeConstraintsToExcludeBrands(
  constraints: readonly NegativeConstraint[],
): string[] {
  return normalizeTerms(
    constraints
      .filter((constraint) => constraint.matchPolicy === "exclude_brand")
      .map((constraint) => constraint.term),
  );
}

function negativeConstraintsToExcludeProductIds(
  constraints: readonly NegativeConstraint[],
): string[] {
  return normalizeTerms(
    constraints
      .filter((constraint) => constraint.matchPolicy === "exclude_product")
      .map((constraint) => constraint.term),
  );
}

function negativeConstraintsToExcludeCategories(
  constraints: readonly NegativeConstraint[],
): string[] {
  return normalizeTerms(
    constraints
      .filter((constraint) => constraint.matchPolicy === "exclude_category")
      .map((constraint) => constraint.term),
  );
}

function negativeConstraintsToFactFilters(
  constraints: readonly NegativeConstraint[],
): Pick<VectorSearchFilters, "excludeRiskTerms" | "excludeWearingStyles"> {
  return buildNegativeFactVectorFilters(
    constraints
      .filter((constraint) =>
        constraint.matchPolicy === "exclude_if_product_facts_conflict"
        && constraint.kind !== "price"
      )
      .map((constraint) => constraint.term),
  );
}

function mergeVectorFilters(
  base: VectorSearchFilters | undefined,
  next: VectorSearchFilters,
): VectorSearchFilters | undefined {
  const merged = pruneUndefined({
    ...base,
    ...next,
    excludeBrands: mergeTerms(
      base?.excludeBrands ?? [],
      next.excludeBrands ?? [],
    ),
    excludeProductIds: mergeTerms(
      base?.excludeProductIds ?? [],
      next.excludeProductIds ?? [],
    ),
    excludeCategories: mergeTerms(
      base?.excludeCategories ?? [],
      next.excludeCategories ?? [],
    ),
    excludeRiskTerms: mergeTerms(
      base?.excludeRiskTerms ?? [],
      next.excludeRiskTerms ?? [],
    ),
    excludeWearingStyles: mergeTerms(
      base?.excludeWearingStyles ?? [],
      next.excludeWearingStyles ?? [],
    ),
  });

  for (const key of [
    "excludeBrands",
    "excludeProductIds",
    "excludeCategories",
    "excludeRiskTerms",
    "excludeWearingStyles",
  ] as const) {
    if (Array.isArray(merged[key]) && merged[key].length === 0) {
      delete merged[key];
    }
  }

  return Object.keys(merged).length > 0
    ? merged as VectorSearchFilters
    : undefined;
}

function normalizeTerms(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  for (const value of values) {
    const normalizedValue = normalizeTerm(value);

    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    normalizedValues.push(normalizedValue);

    if (normalizedValues.length >= MAX_CONTEXT_TERMS) {
      break;
    }
  }

  return normalizedValues;
}

function normalizeTerm(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0
    ? Array.from(trimmed).slice(0, MAX_TERM_LENGTH).join("")
    : undefined;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>;
}

function toSummary(memory: ChatContextMemory): ChatContextMemorySummary {
  return {
    conversationId: memory.conversationId,
    lastIntent: memory.lastIntent,
    constraints: memory.constraints,
    lastRecommendedProductIds: memory.lastRecommendedProductIds,
    pendingClarification: memory.pendingClarification,
  };
}
