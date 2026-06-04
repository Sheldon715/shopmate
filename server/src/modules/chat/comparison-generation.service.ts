import { rethrowIfAborted } from "../../lib/abort";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type { Product } from "../products/product.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";
import type { ChatHistoryMessage } from "./chat.types";
import {
  normalizeLlmText,
  parseJsonObject,
  stripCodeFence,
} from "./llm-output-utils";
import { normalizeChatHistory } from "./prompt.builder";

export interface ComparisonGenerationProductContext {
  product: Product;
  snippets: string[];
}

export interface ComparisonGenerationInput {
  question: string;
  shortHistory?: ChatHistoryMessage[];
  contextMemory?: ChatContextMemorySummary;
  userPriority?: string;
  products: ComparisonGenerationProductContext[];
  generatedAt: Date;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface ComparisonProductOutput {
  productId: string;
  displayLabel: string;
}

export interface ComparisonCellOutput {
  productId: string;
  value: string;
  highlight?: boolean;
}

export interface ComparisonDimensionOutput {
  id: string;
  label: string;
  cells: ComparisonCellOutput[];
}

export interface ComparisonHighlightOutput {
  productId: string;
  label: string;
  text: string;
}

export interface GeneratedComparisonOutput {
  answer: string;
  title: string;
  products: ComparisonProductOutput[];
  dimensions: ComparisonDimensionOutput[];
  recommendedProductId?: string | null;
  conclusion: string;
  highlights: ComparisonHighlightOutput[];
}

export interface ComparisonGenerationServiceOptions {
  llmClient: LlmClient;
}

export class ComparisonGenerationOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComparisonGenerationOutputError";
  }
}

const COMPARISON_GENERATION_MAX_COMPLETION_TOKENS = 1200;
const COMPARISON_GENERATION_TIMEOUT_MS = 60_000;
const COMPARISON_PRODUCT_COUNT = 2;
const MAX_DIMENSIONS = 6;
const MIN_DIMENSIONS = 2;
const MAX_HIGHLIGHTS = 4;
const MAX_ANSWER_CHARS = 90;
const MAX_TITLE_CHARS = 40;
const MAX_LABEL_CHARS = 32;
const MAX_CELL_VALUE_CHARS = 90;
const MAX_CONCLUSION_CHARS = 160;
const MAX_HIGHLIGHT_TEXT_CHARS = 90;
const MAX_PRODUCT_FACT_CHARS = 180;
const MAX_PRODUCT_FACTS = 8;
const MAX_PRODUCT_LIST_ITEMS = 4;
const MAX_PRODUCT_ATTRIBUTE_KEYS = 6;
const MAX_PRODUCT_ATTRIBUTE_VALUES = 4;
const MAX_COMPARISON_HISTORY_MESSAGES = 2;

export class ComparisonGenerationService {
  private readonly llmClient: LlmClient;

  constructor(options: ComparisonGenerationServiceOptions) {
    this.llmClient = options.llmClient;
  }

  async generate(
    input: ComparisonGenerationInput,
  ): Promise<GeneratedComparisonOutput> {
    try {
      const response = await this.llmClient.generate({
        messages: buildComparisonGenerationPrompt(input),
        temperature: 0,
        maxCompletionTokens: COMPARISON_GENERATION_MAX_COMPLETION_TOKENS,
        timeoutMs: COMPARISON_GENERATION_TIMEOUT_MS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });

      const parsed = parseComparisonGenerationOutput(
        response.text,
        input.products.map((context) => context.product.id),
      );

      return input.userPriority?.trim()
        ? parsed
        : clearDimensionHighlights(parsed);
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      throw error;
    }
  }
}

function clearDimensionHighlights(
  output: GeneratedComparisonOutput,
): GeneratedComparisonOutput {
  return {
    ...output,
    dimensions: output.dimensions.map((dimension) => ({
      ...dimension,
      cells: dimension.cells.map((cell) => ({
        ...cell,
        highlight: undefined,
      })),
    })),
  };
}

function buildComparisonGenerationPrompt(
  input: ComparisonGenerationInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的两款商品对比生成器。",
        "只能基于输入 facts 生成；不得编造库外商品、价格、库存、优惠、功效或成分。",
        "输出紧凑 JSON object，不要 markdown 或解释文字。",
        "answer <=90 中文字符；title <=40；conclusion <=160。",
        "comparison.products 必须刚好 2 个，product_id 只能来自 allowlistProductIds。",
        "dimensions 生成 2-5 行，每行 cells 覆盖两款商品；每个 cell <=90 字。",
        "维度、单元格、高亮和结论必须围绕用户问题，不能套固定品类模板。",
        "每行最多一个 highlight=true；只有用户有明确优先需求且事实明显支持时才高亮。",
        "recommended_product_id 没有明确优势时为 null。",
        "highlights 是产品亮点，不代表更优；每款至多一条。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        shortHistory: normalizeComparisonHistory(input.shortHistory ?? []),
        contextMemory: summarizeContextMemory(input.contextMemory),
        userPriority: input.userPriority,
        allowlistProductIds: input.products.map((context) => context.product.id),
        products: input.products.map(summarizeProductContext),
        schema: {
          answer: "string",
          comparison: {
            title: "string",
            products: [
              {
                product_id: "string from allowlistProductIds",
                display_label: "string",
              },
            ],
            dimensions: [
              {
                id: "string",
                label: "string",
                cells: [
                  {
                    product_id: "string from allowlistProductIds",
                    value: "string",
                    highlight: "boolean optional",
                  },
                ],
              },
            ],
            recommended_product_id: "string from allowlistProductIds or null",
            conclusion: "string",
            highlights: [
              {
                product_id: "string from allowlistProductIds",
                label: "string",
                text: "string",
              },
            ],
          },
        },
      }),
    },
  ];
}

export function parseComparisonGenerationOutput(
  rawText: string,
  allowlistProductIds: string[],
): GeneratedComparisonOutput {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const comparison = payload.comparison;

  if (!comparison || typeof comparison !== "object" || Array.isArray(comparison)) {
    throw new ComparisonGenerationOutputError(
      "comparison generation output must include comparison object.",
    );
  }

  const comparisonRecord = comparison as Record<string, unknown>;
  if (new Set(allowlistProductIds).size !== COMPARISON_PRODUCT_COUNT) {
    throw new ComparisonGenerationOutputError(
      "comparison generation requires exactly two allowlisted products.",
    );
  }

  const allowlist = new Set(allowlistProductIds);
  const answer = normalizeRequiredText(payload.answer, {
    fieldName: "answer",
    maxChars: MAX_ANSWER_CHARS,
  });
  const products = parseProducts(comparisonRecord.products, allowlist);
  const productIds = products.map((product) => product.productId);
  const productIdSet = new Set(productIds);
  const dimensions = parseDimensions(comparisonRecord.dimensions, productIdSet);
  const conclusion = normalizeRequiredText(comparisonRecord.conclusion, {
    fieldName: "conclusion",
    maxChars: MAX_CONCLUSION_CHARS,
  });

  return {
    answer,
    title: normalizeRequiredText(comparisonRecord.title, {
      fieldName: "title",
      maxChars: MAX_TITLE_CHARS,
    }),
    products,
    dimensions,
    recommendedProductId: parseRecommendedProductId(
      comparisonRecord.recommended_product_id,
      productIdSet,
    ),
    conclusion,
    highlights: parseHighlights(comparisonRecord.highlights, productIdSet),
  };
}

function parseProducts(
  value: unknown,
  allowlist: Set<string>,
): ComparisonProductOutput[] {
  if (!Array.isArray(value)) {
    throw new ComparisonGenerationOutputError(
      "comparison products must be an array.",
    );
  }

  if (value.length !== COMPARISON_PRODUCT_COUNT) {
    throw new ComparisonGenerationOutputError(
      "comparison output must include exactly two products.",
    );
  }

  const products: ComparisonProductOutput[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const productId = parseAllowedProductId(record.product_id, allowlist);
    const displayLabel = normalizeLlmText(parseOptionalString(record.display_label), {
      maxChars: MAX_LABEL_CHARS,
    });

    if (!productId || !displayLabel || seen.has(productId)) {
      continue;
    }

    seen.add(productId);
    products.push({ productId, displayLabel });
  }

  if (products.length !== COMPARISON_PRODUCT_COUNT) {
    throw new ComparisonGenerationOutputError(
      "comparison output must include exactly two valid products.",
    );
  }

  return products;
}

function parseDimensions(
  value: unknown,
  productIdSet: Set<string>,
): ComparisonDimensionOutput[] {
  if (!Array.isArray(value)) {
    throw new ComparisonGenerationOutputError(
      "comparison dimensions must be an array.",
    );
  }

  const dimensions: ComparisonDimensionOutput[] = [];
  const seen = new Set<string>();

  for (const item of value.slice(0, MAX_DIMENSIONS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const id = normalizeLlmText(parseOptionalString(record.id), {
      maxChars: MAX_LABEL_CHARS,
    });
    const label = normalizeLlmText(parseOptionalString(record.label), {
      maxChars: MAX_LABEL_CHARS,
    });

    if (!id || !label || seen.has(id)) {
      continue;
    }

    const cells = parseCells(record.cells, productIdSet);

    if (cells.length !== productIdSet.size) {
      continue;
    }

    seen.add(id);
    dimensions.push({ id, label, cells });
  }

  if (dimensions.length < MIN_DIMENSIONS) {
    throw new ComparisonGenerationOutputError(
      "comparison output must include valid dimensions covering all products.",
    );
  }

  return dimensions;
}

function parseCells(
  value: unknown,
  productIdSet: Set<string>,
): ComparisonCellOutput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cellsByProductId = new Map<string, ComparisonCellOutput>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const productId = parseAllowedProductId(record.product_id, productIdSet);
    const cellValue = normalizeLlmText(parseOptionalString(record.value), {
      maxChars: MAX_CELL_VALUE_CHARS,
    });

    if (!productId || !cellValue || cellsByProductId.has(productId)) {
      continue;
    }

    cellsByProductId.set(productId, {
      productId,
      value: cellValue,
      highlight: record.highlight === true ? true : undefined,
    });
  }

  const orderedCells = [...productIdSet].flatMap((productId) => {
    const cell = cellsByProductId.get(productId);

    return cell ? [cell] : [];
  });
  const highlightedCount = orderedCells.filter((cell) => cell.highlight).length;

  if (highlightedCount > 1) {
    return orderedCells.map((cell) => ({
      ...cell,
      highlight: undefined,
    }));
  }

  return orderedCells;
}

function parseHighlights(
  value: unknown,
  productIdSet: Set<string>,
): ComparisonHighlightOutput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const highlights: ComparisonHighlightOutput[] = [];

  for (const item of value.slice(0, MAX_HIGHLIGHTS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const productId = parseAllowedProductId(record.product_id, productIdSet);
    const label = normalizeLlmText(parseOptionalString(record.label), {
      maxChars: MAX_LABEL_CHARS,
    });
    const text = normalizeLlmText(parseOptionalString(record.text), {
      maxChars: MAX_HIGHLIGHT_TEXT_CHARS,
    });

    if (!productId || !label || !text) {
      continue;
    }

    highlights.push({ productId, label, text });
  }

  return highlights;
}

function parseRecommendedProductId(
  value: unknown,
  productIdSet: Set<string>,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return parseAllowedProductId(value, productIdSet) ?? null;
}

function parseAllowedProductId(
  value: unknown,
  allowlist: Set<string>,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const productId = value.trim();

  return productId && allowlist.has(productId) ? productId : undefined;
}

function normalizeRequiredText(
  value: unknown,
  input: {
    fieldName: string;
    maxChars: number;
  },
): string {
  const normalized = normalizeLlmText(parseOptionalString(value), {
    maxChars: input.maxChars,
  });

  if (!normalized) {
    throw new ComparisonGenerationOutputError(
      `comparison output must include ${input.fieldName}.`,
    );
  }

  return normalized;
}

function summarizeProductContext(
  context: ComparisonGenerationProductContext,
): Record<string, unknown> {
  const product = context.product;

  return {
    product_id: product.id,
    name: product.name,
    brand: product.brand,
    cat: product.category,
    subCat: product.subCategory,
    price: product.basePriceCents,
    priceRange: {
      min: product.priceMinCents,
      max: product.priceMaxCents,
    },
    cur: product.currency,
    rating: product.ratingAvg,
    tags: compactList(product.visualTags),
    attrs: summarizeAttributes(product.attributes),
    facts: compactList([
      product.marketingDescription,
      ...context.snippets,
      ...prefixFacts("优点", product.pros),
      ...prefixFacts("注意", product.cons),
      ...prefixFacts("适合", product.recommendWhen),
      ...prefixFacts("不适合", product.avoidWhen),
    ], MAX_PRODUCT_FACTS),
  };
}

function normalizeComparisonHistory(
  history: ChatHistoryMessage[],
): ChatHistoryMessage[] {
  return normalizeChatHistory(history).slice(-MAX_COMPARISON_HISTORY_MESSAGES);
}

function summarizeContextMemory(
  contextMemory: ChatContextMemorySummary | undefined,
): Record<string, unknown> | undefined {
  if (!contextMemory) {
    return undefined;
  }

  return {
    lastIntent: contextMemory.lastIntent,
    constraints: contextMemory.constraints,
    pendingClarification: contextMemory.pendingClarification,
  };
}

function summarizeAttributes(
  attributes: Product["attributes"],
): Record<string, string[]> {
  const summarized: Record<string, string[]> = {};

  for (const [key, values] of Object.entries(attributes)) {
    if (Object.keys(summarized).length >= MAX_PRODUCT_ATTRIBUTE_KEYS) {
      break;
    }

    const compactValues = compactList(values, MAX_PRODUCT_ATTRIBUTE_VALUES);
    if (compactValues.length > 0) {
      summarized[key] = compactValues;
    }
  }

  return summarized;
}

function prefixFacts(prefix: string, values: string[]): string[] {
  return compactList(values).map((value) => `${prefix}:${value}`);
}

function compactList(
  values: string[],
  maxItems: number = MAX_PRODUCT_LIST_ITEMS,
): string[] {
  const seen = new Set<string>();
  const compacted: string[] = [];

  for (const value of values) {
    const compactedValue = truncateProductFact(value);

    if (!compactedValue || seen.has(compactedValue)) {
      continue;
    }

    seen.add(compactedValue);
    compacted.push(compactedValue);

    if (compacted.length >= maxItems) {
      break;
    }
  }

  return compacted;
}

function truncateProductFact(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();

  return Array.from(normalized).slice(0, MAX_PRODUCT_FACT_CHARS).join("");
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
