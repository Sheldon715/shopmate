import type { VectorSearchFilters } from "../vector/vector-search.types";
import { ChatContextMemoryStore } from "./chat-context-memory.store";
import type {
  ChatContextConstraints,
  ChatContextMemory,
  ChatContextMemorySummary,
} from "./chat-context-memory.types";

export interface ChatContextMemoryResolution {
  conversationId?: string;
  memory?: ChatContextMemory;
  contextMemory?: ChatContextMemorySummary;
  retrievalQuery: string;
  filters?: VectorSearchFilters;
}

export interface ChatContextMemoryServiceOptions {
  store?: ChatContextMemoryStore;
  now?: () => Date;
}

const MAX_CONTEXT_TERMS = 12;
const MAX_TERM_LENGTH = 80;
const DEFAULT_STORE = new ChatContextMemoryStore();

const PREFERENCE_TERMS = [
  "轻量",
  "便携",
  "续航",
  "拍照",
  "性价比",
];

const CATEGORY_HINTS = [
  {
    terms: ["跑鞋", "运动鞋"],
    category: "服饰运动",
    subCategory: "跑步鞋",
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
    terms: ["防晒霜", "防晒"],
    category: "美妆护肤",
    subCategory: "防晒",
  },
  {
    terms: ["洗面奶", "洁面", "护肤"],
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
    if (!input.conversationId) {
      return input.filters
        ? {
            retrievalQuery: input.question,
            filters: input.filters,
          }
        : { retrievalQuery: input.question };
    }

    const previousMemory = this.store.get(input.conversationId);
    const memory = mergeMemory({
      conversationId: input.conversationId,
      previousMemory,
      question: input.question,
      now: this.now(),
    });

    return {
      conversationId: input.conversationId,
      memory,
      contextMemory: toSummary(memory),
      retrievalQuery: buildRetrievalQuery(input.question, memory),
      filters: mergeFilters(input.filters, memory.constraints),
    };
  }

  commit(
    resolution: ChatContextMemoryResolution,
    recommendedProductIds: string[],
  ): ChatContextMemorySummary | undefined {
    if (!resolution.conversationId || !resolution.memory) {
      return undefined;
    }

    const memory = {
      ...resolution.memory,
      lastRecommendedProductIds: normalizeTerms(recommendedProductIds),
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
  const constraints = pruneConstraints({
    category: extracted.category ?? previousConstraints.category,
    subCategory: extracted.subCategory
      ?? (categoryChanged ? undefined : previousConstraints.subCategory),
    brand: extracted.brand ?? (categoryChanged ? undefined : previousConstraints.brand),
    minPriceCents: extracted.minPriceCents ?? previousConstraints.minPriceCents,
    maxPriceCents: extracted.maxPriceCents ?? previousConstraints.maxPriceCents,
    preferenceTerms: mergeTerms(
      previousConstraints.preferenceTerms,
      extracted.preferenceTerms,
    ),
    avoidTerms: mergeTerms(previousConstraints.avoidTerms, extracted.avoidTerms),
  });

  return {
    conversationId: input.conversationId,
    lastIntent: extractIntent(input.question, extracted)
      ?? input.previousMemory?.lastIntent,
    constraints,
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
    avoidTerms: explicitFilters?.avoidTerms,
  };

  return Object.keys(pruneUndefined(merged)).length > 0
    ? pruneUndefined(merged)
    : undefined;
}

function extractConstraints(question: string): ChatContextConstraints {
  const categoryHint = findCategoryHint(question);

  return pruneConstraints({
    category: categoryHint?.category,
    subCategory: categoryHint?.subCategory,
    brand: undefined,
    minPriceCents: extractMinPriceCents(question),
    maxPriceCents: extractMaxPriceCents(question),
    preferenceTerms: PREFERENCE_TERMS.filter((term) => question.includes(term)),
    avoidTerms: extractAvoidTerms(question),
  });
}

function extractIntent(
  question: string,
  constraints: ChatContextConstraints,
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

function findCategoryHint(question: string):
  | { category: string; subCategory?: string }
  | undefined {
  const hint = CATEGORY_HINTS.find((candidate) =>
    candidate.terms.some((term) => question.includes(term))
  );

  return hint
    ? {
        category: hint.category,
        subCategory: "subCategory" in hint ? hint.subCategory : undefined,
      }
    : undefined;
}

function extractMaxPriceCents(question: string): number | undefined {
  const patterns = [
    /预算\s*(\d{1,6})\s*(?:元)?/u,
    /(?:不超过|低于|小于|少于)\s*(\d{1,6})\s*(?:元)?/u,
    /(\d{1,6})\s*(?:元)?\s*以内/u,
  ];

  return extractPriceCents(question, patterns);
}

function extractMinPriceCents(question: string): number | undefined {
  const patterns = [
    /(?:至少|不低于|高于|大于)\s*(\d{1,6})\s*(?:元)?/u,
  ];

  return extractPriceCents(question, patterns);
}

function extractPriceCents(question: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const value = pattern.exec(question)?.[1];

    if (value) {
      return Number.parseInt(value, 10) * 100;
    }
  }

  return undefined;
}

function extractAvoidTerms(question: string): string[] {
  const patterns = [
    /不要\s*([\p{Script=Han}A-Za-z0-9_-]{1,40})/gu,
    /不含\s*([\p{Script=Han}A-Za-z0-9_-]{1,40})/gu,
    /除了\s*([\p{Script=Han}A-Za-z0-9_-]{1,40})/gu,
  ];
  const terms: string[] = [];

  for (const pattern of patterns) {
    for (const match of question.matchAll(pattern)) {
      const term = cleanAvoidTerm(match[1] ?? "");

      if (term) {
        terms.push(term);
      }
    }
  }

  return normalizeTerms(terms);
}

function cleanAvoidTerm(term: string): string {
  return term
    .replace(/^含/u, "")
    .replace(/[的了吧呀呢啊。！？!,，；;]+$/u, "")
    .trim();
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
  };
}
