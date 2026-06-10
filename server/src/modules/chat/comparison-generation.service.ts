import { rethrowIfAborted } from "../../lib/abort";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import { buildProductDisplayName } from "../products/product-display-copy";
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

const COMPARISON_GENERATION_MAX_COMPLETION_TOKENS = 2000;
const COMPARISON_GENERATION_TIMEOUT_MS = 45_000;
const COMPARISON_PRODUCT_COUNT = 2;
const MAX_DIMENSIONS = 6;
const MIN_DIMENSIONS = 2;
const MAX_HIGHLIGHTS = 6;
const MAX_ANSWER_CHARS = 110;
const MAX_TITLE_CHARS = 48;
const MAX_LABEL_CHARS = 32;
const MAX_CELL_VALUE_CHARS = 150;
const MAX_CONCLUSION_CHARS = 240;
const MAX_HIGHLIGHT_TEXT_CHARS = 130;
const MAX_PRODUCT_FACT_CHARS = 190;
const MAX_PRODUCT_FACTS = 9;
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
      const request: LlmGenerateRequest = {
        messages: buildComparisonGenerationPrompt(input),
        temperature: 0,
        maxCompletionTokens: COMPARISON_GENERATION_MAX_COMPLETION_TOKENS,
        timeoutMs: COMPARISON_GENERATION_TIMEOUT_MS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      };
      const rawText = await this.generateRawText(request);

      const parsed = parseComparisonGenerationOutput(
        rawText,
        input.products.map((context) => context.product.id),
      );

      return input.userPriority?.trim()
        ? parsed
        : clearRecommendationSignals(parsed);
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      throw error;
    }
  }

  private async generateRawText(request: LlmGenerateRequest): Promise<string> {
    const response = await this.llmClient.generate(request);

    return response.text;
  }
}

function clearRecommendationSignals(
  output: GeneratedComparisonOutput,
): GeneratedComparisonOutput {
  return {
    ...output,
    recommendedProductId: null,
    highlights: [],
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
        "输出 JSON object，不要 markdown 或解释文字。",
        "answer <=110 中文字符；title <=48；conclusion <=240。",
        "comparison.products 必须刚好 2 个，product_id 只能来自 allowlistProductIds。",
        "dimensions 目标生成 4-6 行；如果 facts 不足，也至少生成 2 行有事实支撑的完整维度，不要编造补齐。",
        "每个 cell 需要写具体差异事实和适用判断，<=150 字，不要只写短标签。",
        "优先覆盖用户问题相关维度，再补充价格、核心功效/参数、适用场景、限制/注意点等有事实支撑的维度。",
        "维度、单元格、高亮和结论必须围绕用户问题，不能套固定品类模板，不能只写短标签。",
        "每行最多一个 highlight=true；只有用户有明确优先需求且事实明显支持时才高亮。",
        "如果 userPriority 为 null 或空：recommended_product_id 必须为 null，highlights 必须为 []，cells 不要输出 highlight 字段。",
        "不要输出 false、null 之外的可选字段，不要输出解释、markdown 或额外 key。",
        "recommended_product_id 没有明确优势时为 null。",
        "当 userPriority 不为空时，highlights 写 2-4 条有事实依据的产品亮点，不代表更优；每款可有 1-2 条，text 需要说明事实依据。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        shortHistory: normalizeComparisonHistory(input.shortHistory ?? []),
        contextMemory: summarizeContextMemory(input.contextMemory),
        userPriority: input.userPriority?.trim() || null,
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
            dimensions: {
              type: "array",
              minItems: 2,
              maxItems: 6,
              items: {
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
            },
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
  let payload: Record<string, unknown>;

  try {
    payload = parseComparisonJsonObject(rawText);
  } catch {
    throw new ComparisonGenerationOutputError(
      "comparison generation output must be a valid JSON object.",
    );
  }

  const comparison =
    payload.comparison
    ?? payload.comparison_result
    ?? payload.comparisonResult
    ?? payload;

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
  const products = parseProducts(
    comparisonRecord.products,
    allowlist,
    allowlistProductIds,
  );
  const productIds = products.map((product) => product.productId);
  const dimensions = parseDimensions(comparisonRecord.dimensions, productIds);
  const productIdSet = new Set(productIds);
  const rawAnswer = payload.answer ?? comparisonRecord.answer;
  const conclusion = normalizeOptionalText(
    pickRecordValue(comparisonRecord, ["conclusion", "summary"]),
    MAX_CONCLUSION_CHARS,
  ) ?? normalizeOptionalText(rawAnswer, MAX_CONCLUSION_CHARS)
    ?? "两款商品各有侧重，可按上面的事实维度继续判断。";
  const answer = normalizeOptionalText(
    rawAnswer,
    MAX_ANSWER_CHARS,
  ) ?? normalizeLlmText(conclusion, { maxChars: MAX_ANSWER_CHARS }) ?? conclusion;

  return {
    answer,
    title: normalizeOptionalText(
      pickRecordValue(comparisonRecord, ["title", "comparisonTitle"]),
      MAX_TITLE_CHARS,
    ) ?? "商品对比",
    products,
    dimensions,
    recommendedProductId: parseRecommendedProductId(
      pickRecordValue(comparisonRecord, [
        "recommended_product_id",
        "recommendedProductId",
      ]),
      productIdSet,
    ),
    conclusion,
    highlights: parseHighlights(
      pickRecordValue(comparisonRecord, ["highlights", "keyHighlights"]),
      productIdSet,
    ),
  };
}

function parseComparisonJsonObject(rawText: string): Record<string, unknown> {
  const normalized = stripCodeFence(rawText);

  try {
    return parseJsonObject(normalized);
  } catch {
    const jsonObject = extractLikelyJsonObject(normalized);

    if (jsonObject) {
      return parseJsonObject(jsonObject);
    }

    throw new Error("LLM output must be a JSON object.");
  }
}

function extractLikelyJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
}

function parseProducts(
  value: unknown,
  allowlist: Set<string>,
  allowlistProductIds: string[],
): ComparisonProductOutput[] {
  if (!Array.isArray(value)) {
    return allowlistProductIds.map((productId) => ({
      productId,
      displayLabel: productId,
    }));
  }

  const products: ComparisonProductOutput[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const rawProductId = pickRecordValue(record, [
      "product_id",
      "productId",
      "id",
    ]);
    const productId = parseAllowedProductId(
      rawProductId,
      allowlist,
    );

    if (rawProductId !== undefined && !productId) {
      throw new ComparisonGenerationOutputError(
        "comparison products must use allowlisted product ids.",
      );
    }

    const displayLabel = normalizeLlmText(
      parseOptionalString(
        pickRecordValue(record, ["display_label", "displayLabel", "label", "name"]),
      ),
      { maxChars: MAX_LABEL_CHARS },
    ) || productId;

    if (!productId || !displayLabel || seen.has(productId)) {
      continue;
    }

    seen.add(productId);
    products.push({ productId, displayLabel });
  }

  if (products.length === COMPARISON_PRODUCT_COUNT) {
    return products;
  }

  return allowlistProductIds.map((productId) => ({
    productId,
    displayLabel: productId,
  }));
}

function parseDimensions(
  value: unknown,
  productIds: string[],
): ComparisonDimensionOutput[] {
  if (!Array.isArray(value)) {
    throw new ComparisonGenerationOutputError(
      "comparison dimensions must be an array.",
    );
  }

  const dimensions: ComparisonDimensionOutput[] = [];
  const seen = new Set<string>();
  const productIdSet = new Set(productIds);

  for (const item of value) {
    if (dimensions.length >= MAX_DIMENSIONS) {
      break;
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const rawId = normalizeOptionalText(record.id, MAX_LABEL_CHARS);
    const label = normalizeOptionalText(
      pickRecordValue(record, ["label", "dimension", "name", "title"]),
      MAX_LABEL_CHARS,
    ) ?? rawId;
    const id = rawId || createDimensionId(label, dimensions.length + 1);

    if (!id || !label || seen.has(id)) {
      continue;
    }

    const cells = parseCells(
      record.cells ?? createCellsFromDimensionRecord(record, productIds),
      productIds,
    );

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
  productIds: string[],
): ComparisonCellOutput[] {
  if (!Array.isArray(value)) {
    if (value && typeof value === "object") {
      return parseCells(
        createCellsFromDimensionRecord(
          value as Record<string, unknown>,
          productIds,
        ),
        productIds,
      );
    }

    return [];
  }

  const cellsByProductId = new Map<string, ComparisonCellOutput>();
  const productIdSet = new Set(productIds);

  for (const [index, item] of value.entries()) {
    if (typeof item === "string") {
      const productId = productIds[index];
      const cellValue = normalizeLlmText(item, {
        maxChars: MAX_CELL_VALUE_CHARS,
      });

      if (productId && cellValue && !cellsByProductId.has(productId)) {
        cellsByProductId.set(productId, {
          productId,
          value: cellValue,
        });
      }

      continue;
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const rawProductId = pickRecordValue(record, [
      "product_id",
      "productId",
      "id",
    ]);
    const explicitProductId = parseAllowedProductId(rawProductId, productIdSet);
    const productId = rawProductId === undefined
      ? productIds[index]
      : explicitProductId;
    const cellValue = normalizeLlmText(
      parseOptionalString(
        pickRecordValue(record, ["value", "text", "summary", "content"]),
      ),
      { maxChars: MAX_CELL_VALUE_CHARS },
    );

    if (!productId || !cellValue || cellsByProductId.has(productId)) {
      continue;
    }

    cellsByProductId.set(productId, {
      productId,
      value: cellValue,
      highlight: parseOptionalBoolean(record.highlight) ? true : undefined,
    });
  }

  const orderedCells = productIds.flatMap((productId) => {
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
    const productId = parseAllowedProductId(
      pickRecordValue(record, ["product_id", "productId", "id"]),
      productIdSet,
    );
    const label = normalizeLlmText(
      parseOptionalString(pickRecordValue(record, ["label", "title", "name"])),
      { maxChars: MAX_LABEL_CHARS },
    );
    const text = normalizeLlmText(
      parseOptionalString(
        pickRecordValue(record, ["text", "value", "summary", "content"]),
      ),
      { maxChars: MAX_HIGHLIGHT_TEXT_CHARS },
    );

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

function normalizeOptionalText(
  value: unknown,
  maxChars: number,
): string | undefined {
  return normalizeLlmText(parseOptionalString(value), { maxChars });
}

function summarizeProductContext(
  context: ComparisonGenerationProductContext,
): Record<string, unknown> {
  const product = context.product;

  return {
    product_id: product.id,
    name: buildProductDisplayName(product),
    rawName: product.name,
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

function parseOptionalBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function pickRecordValue(
  record: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }

  return undefined;
}

function createDimensionId(label: string | undefined, index: number): string {
  const normalized = label
    ?.toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/gu, "");

  return normalized || `dimension_${index}`;
}

function createCellsFromDimensionRecord(
  record: Record<string, unknown>,
  productIds: string[],
): Array<Record<string, unknown>> {
  const directValues = productIds.map((productId) => record[productId]);

  if (directValues.every((value) => typeof value === "string")) {
    return productIds.map((productId, index) => ({
      product_id: productId,
      value: directValues[index],
    }));
  }

  const first = parseOptionalString(
    pickRecordValue(record, ["first", "left", "product1", "product_1"]),
  );
  const second = parseOptionalString(
    pickRecordValue(record, ["second", "right", "product2", "product_2"]),
  );

  if (first && second) {
    return [
      { product_id: productIds[0], value: first },
      { product_id: productIds[1], value: second },
    ];
  }

  return [];
}
