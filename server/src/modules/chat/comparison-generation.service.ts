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

const COMPARISON_GENERATION_MAX_COMPLETION_TOKENS = 1800;
const COMPARISON_GENERATION_TIMEOUT_MS = 60_000;
const COMPARISON_PRODUCT_COUNT = 2;
const MAX_DIMENSIONS = 6;
const MIN_DIMENSIONS = 3;
const MAX_HIGHLIGHTS = 4;
const MAX_ANSWER_CHARS = 90;
const MAX_TITLE_CHARS = 40;
const MAX_LABEL_CHARS = 32;
const MAX_CELL_VALUE_CHARS = 90;
const MAX_CONCLUSION_CHARS = 160;
const MAX_HIGHLIGHT_TEXT_CHARS = 90;
const MAX_PRODUCT_FACT_CHARS = 900;

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
        "你是 ShopMate 的商品对比结果生成器。",
        "只能基于后端提供的库内商品事实、snippets 和字段生成对比。",
        "不要引入库外商品，不要编造价格、库存、优惠、功效或成分。",
        "answer 是聊天气泡里的简短中文回复，不超过 90 个中文字符。",
        "只生成两款商品的对比；comparison.products 必须刚好包含 2 个商品。",
        "comparison.products 的 product_id 必须来自输入 allowlist。",
        "dimensions 生成 3 到 6 行；每个 dimension.cells 必须覆盖所有 comparison.products。",
        "对比维度、每格内容、高亮和推荐结论都要围绕用户问题和关注点生成，不能使用固定品类模板。",
        "每个 dimension 最多只能有一个 cell.highlight=true；只有当用户有明确优先需求且某一款在该维度明显更适合时才标 true。",
        "如果用户没有明确需求，或两款在该维度各有优势/无法判断单一更优，两个 cell 都不要输出 highlight=true。",
        "highlights 应尽量为两款商品各给一条基于事实的产品亮点；这不是“更优”标记。",
        "recommended_product_id 可以为 null；没有明确优势时不要硬推荐。",
        "conclusion 不超过 160 个中文字符。",
        "不允许输出 markdown、表格字符串或解释文字；只输出 JSON object。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        shortHistory: normalizeChatHistory(input.shortHistory ?? []),
        contextMemory: summarizeContextMemory(input.contextMemory),
        userPriority: input.userPriority,
        generatedAt: input.generatedAt.toISOString(),
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
    category: product.category,
    subCategory: product.subCategory,
    priceCents: product.basePriceCents,
    priceRangeCents: {
      min: product.priceMinCents,
      max: product.priceMaxCents,
    },
    currency: product.currency,
    ratingAvg: product.ratingAvg,
    marketingDescription: product.marketingDescription,
    knowledgeText: truncateProductFact(product.knowledgeText),
    attributes: product.attributes,
    pros: product.pros,
    cons: product.cons,
    recommendWhen: product.recommendWhen,
    avoidWhen: product.avoidWhen,
    snippets: context.snippets,
  };
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

function truncateProductFact(value: string): string {
  return Array.from(value).slice(0, MAX_PRODUCT_FACT_CHARS).join("");
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
