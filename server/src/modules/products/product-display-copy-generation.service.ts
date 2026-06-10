import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import { buildProductDisplayName } from "./product-display-copy";
import type { Product } from "./product.types";

export interface ProductDisplayCopy {
  productId: string;
  cardReason?: string;
  detailReason?: string;
  detailHighlights?: string[];
}

export interface ProductDisplayCopyGenerationInput {
  products: readonly Product[];
  userQuestion?: string;
  surface?: "chat_card" | "product_detail" | "comparison";
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface ProductDisplayCopyGenerator {
  generate(
    input: ProductDisplayCopyGenerationInput,
  ): Promise<Map<string, ProductDisplayCopy>>;
}

export interface ProductDisplayCopyGenerationServiceOptions {
  llmClient: LlmClient;
}

export class ProductDisplayCopyGenerationOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductDisplayCopyGenerationOutputError";
  }
}

const PRODUCT_DISPLAY_COPY_MAX_COMPLETION_TOKENS = 900;
const PRODUCT_DISPLAY_COPY_TIMEOUT_MS = 15_000;
const MAX_PRODUCTS_PER_REQUEST = 4;
const MAX_PRODUCT_FACTS = 12;
const MAX_FACT_CHARS = 110;
const MAX_CARD_REASON_CHARS = 72;
const MAX_DETAIL_REASON_CHARS = 120;
const MAX_DETAIL_HIGHLIGHTS = 3;
const MAX_DETAIL_HIGHLIGHT_CHARS = 42;

const FORBIDDEN_DISPLAY_COPY_MARKERS = [
  "本数据集",
  "本商品数据",
  "比赛数据集",
  "模拟内容",
  "真实用户反馈",
  "不代表实时售价",
  "不代表真实用户反馈",
  "SKU",
  "sku",
  "FAQ",
  "faq",
  "评论",
  "实时售价",
  "PostgreSQL",
  "product_id",
  "source_dataset",
  "导购信息经过",
  "脱敏",
  "结构化整理",
  "课程 Demo",
  "课程Demo",
  "检索实验",
];

const WEAK_DISPLAY_COPY_MARKERS = [
  "配置清晰",
  "参数比较",
  "当前可选",
  "库内有货",
  "继续比较",
  "信息完整",
  "规格明确",
  "便于筛选",
];

export class ProductDisplayCopyGenerationService
  implements ProductDisplayCopyGenerator {
  private readonly llmClient: LlmClient;

  constructor(options: ProductDisplayCopyGenerationServiceOptions) {
    this.llmClient = options.llmClient;
  }

  async generate(
    input: ProductDisplayCopyGenerationInput,
  ): Promise<Map<string, ProductDisplayCopy>> {
    if (input.products.length === 0) {
      return new Map();
    }

    const products = input.products.slice(0, MAX_PRODUCTS_PER_REQUEST);
    const request: LlmGenerateRequest = {
      messages: buildProductDisplayCopyPrompt({
        ...input,
        products,
      }),
      temperature: 0.35,
      maxCompletionTokens: PRODUCT_DISPLAY_COPY_MAX_COMPLETION_TOKENS,
      timeoutMs: PRODUCT_DISPLAY_COPY_TIMEOUT_MS,
      requestId: input.requestId,
      abortSignal: input.abortSignal,
    };
    const response = await this.llmClient.generate(request);

    return parseProductDisplayCopyOutput(
      response.text,
      products.map((product) => product.id),
    );
  }
}

export function parseProductDisplayCopyOutput(
  rawText: string,
  allowlistProductIds: readonly string[],
): Map<string, ProductDisplayCopy> {
  const payload = parseJsonObject(stripCodeFence(rawText));
  const rawProducts =
    payload.products ?? payload.items ?? payload.product_copies;

  if (!Array.isArray(rawProducts)) {
    throw new ProductDisplayCopyGenerationOutputError(
      "product display copy output must include products array.",
    );
  }

  const allowlist = new Set(allowlistProductIds);
  const copies = new Map<string, ProductDisplayCopy>();

  for (const item of rawProducts) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const productId = parseString(
      record.product_id ?? record.productId ?? record.id,
    );

    if (!productId || !allowlist.has(productId) || copies.has(productId)) {
      continue;
    }

    const cardReason = normalizeCardReason(
      parseString(
        record.card_reason
          ?? record.cardReason
          ?? record.recommendation_reason
          ?? record.recommendationReason,
      ),
    );
    const detailReason = normalizeDetailReason(
      parseString(
        record.detail_reason
          ?? record.detailReason
          ?? record.detail_recommendation_reason,
      ),
    );
    const detailHighlights = parseDetailHighlights(
      record.detail_highlights
        ?? record.detailHighlights
        ?? record.highlights,
    );

    if (!cardReason && !detailReason && detailHighlights.length === 0) {
      continue;
    }

    copies.set(productId, {
      productId,
      ...(cardReason ? { cardReason } : {}),
      ...(detailReason ? { detailReason } : {}),
      ...(detailHighlights.length > 0 ? { detailHighlights } : {}),
    });
  }

  return copies;
}

function buildProductDisplayCopyPrompt(
  input: ProductDisplayCopyGenerationInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的商品展示文案生成器。",
        "只基于输入的库内商品 facts 写用户可见文案，不得编造库外商品、销量、优惠、库存、真实评论、功效、参数或成分。",
        "为每个商品生成 card_reason、detail_reason、detail_highlights。",
        "card_reason 必须以“推荐理由：”开头，1 句自然中文，<=72 字，解释为什么适合当前用户问题或常见购买场景。",
        "detail_reason 不要加“推荐理由：”前缀，1-2 句，<=120 字，适合详情页导购推荐理由。",
        "detail_highlights 写 2-3 条具体事实亮点，每条 <=42 字，不要和 detail_reason 完全重复。",
        "不要出现 SKU、FAQ、评论、数据集、模拟内容、实时售价、PostgreSQL、product_id 等内部或数据说明词。",
        "不要写“配置清晰”“适合参数比较”“库内有货”“继续比较”这类模板话术。",
        "product_id 只能来自 allowlistProductIds；不要输出 markdown、解释或额外 key。",
        '只输出 JSON object，格式为 {"products":[{"product_id":"...","card_reason":"推荐理由：...","detail_reason":"...","detail_highlights":["...","..."]}]}。',
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        userQuestion: input.userQuestion?.trim() || null,
        surface: input.surface ?? "chat_card",
        allowlistProductIds: input.products.map((product) => product.id),
        products: input.products.map(summarizeProductForDisplayCopy),
      }),
    },
  ];
}

function summarizeProductForDisplayCopy(product: Product): Record<string, unknown> {
  return {
    product_id: product.id,
    display_name: buildProductDisplayName(product),
    brand: product.brand,
    category: product.category,
    sub_category: product.subCategory,
    price_range: formatProductPriceRange(product),
    available: product.skus.some((sku) => sku.available),
    tags: product.visualTags.filter(isUsefulDisplayCopy).slice(0, 5),
    facts: collectProductFacts(product),
  };
}

function collectProductFacts(product: Product): string[] {
  const attributeFacts = Object.entries(product.attributes)
    .flatMap(([key, values]) =>
      values.map((value) => `${normalizeFactKey(key)}：${value}`)
    );
  const contentBlockFacts = extractContentBlockFacts(product.contentBlocks);
  const rawFacts = [
    ...product.recommendWhen,
    ...product.pros,
    ...attributeFacts,
    ...contentBlockFacts,
    product.marketingDescription,
    product.knowledgeText,
  ];
  const facts: string[] = [];
  const seen = new Set<string>();

  for (const rawFact of rawFacts.flatMap(splitFactCandidates)) {
    const fact = cleanDisplayFact(rawFact);
    const normalized = normalizeDisplayCopyKey(fact);

    if (
      fact.length === 0
      || seen.has(normalized)
      || !isUsefulDisplayCopy(fact)
    ) {
      continue;
    }

    seen.add(normalized);
    facts.push(fact);

    if (facts.length >= MAX_PRODUCT_FACTS) {
      break;
    }
  }

  return facts;
}

function extractContentBlockFacts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const title = parseString(record.title);
    const content = parseString(record.content);

    return [
      title && content ? `${title}：${content}` : content,
    ].filter((fact): fact is string => Boolean(fact));
  });
}

function splitFactCandidates(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .replace(/主要卖点包括/gu, "。")
    .replace(/核心特点包括/gu, "。")
    .replace(/它的核心特点包括/gu, "。")
    .split(/[。；;！!\n]+/u)
    .flatMap((sentence) => sentence.split(/(?<=，|,)(?=适合|主打|核心|采用|支持|带来|水感|半入耳|小容量|续航|降噪|拍照|芯片)/u));
}

function cleanDisplayFact(value: string): string {
  return value
    .replace(/^推荐理由[:：]\s*/u, "")
    .replace(/^(商品名|类目|品牌|价格)[:：]\s*/u, "")
    .replace(/^[，,、\s]+|[。；;，,\s]+$/gu, "")
    .trim()
    .slice(0, MAX_FACT_CHARS);
}

function normalizeCardReason(value: string | undefined): string | undefined {
  const cleaned = normalizeGeneratedDisplayCopy(value, MAX_CARD_REASON_CHARS)
    ?.replace(/^推荐理由[:：]\s*/u, "")
    .trim();

  if (!cleaned || !isUsefulGeneratedCopy(cleaned)) {
    return undefined;
  }

  return `推荐理由：${ensureSentence(cleaned, MAX_CARD_REASON_CHARS - 5)}`;
}

function normalizeDetailReason(value: string | undefined): string | undefined {
  const cleaned = normalizeGeneratedDisplayCopy(value, MAX_DETAIL_REASON_CHARS)
    ?.replace(/^推荐理由[:：]\s*/u, "")
    .trim();

  if (!cleaned || !isUsefulGeneratedCopy(cleaned)) {
    return undefined;
  }

  return ensureSentence(cleaned, MAX_DETAIL_REASON_CHARS);
}

function parseDetailHighlights(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const highlights: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const cleaned = normalizeGeneratedDisplayCopy(
      parseString(item),
      MAX_DETAIL_HIGHLIGHT_CHARS,
    )
      ?.replace(/^推荐理由[:：]\s*/u, "")
      .replace(/[。；;，,\s]+$/gu, "")
      .trim();
    const normalized = normalizeDisplayCopyKey(cleaned ?? "");

    if (
      !cleaned
      || seen.has(normalized)
      || !isUsefulGeneratedCopy(cleaned)
    ) {
      continue;
    }

    seen.add(normalized);
    highlights.push(cleaned);

    if (highlights.length >= MAX_DETAIL_HIGHLIGHTS) {
      break;
    }
  }

  return highlights;
}

function normalizeGeneratedDisplayCopy(
  value: string | undefined,
  maxChars: number,
): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim();

  if (!normalized) {
    return undefined;
  }

  return Array.from(normalized).slice(0, maxChars).join("").trim();
}

function isUsefulGeneratedCopy(value: string): boolean {
  return isUsefulDisplayCopy(value)
    && !WEAK_DISPLAY_COPY_MARKERS.some((marker) => value.includes(marker));
}

function isUsefulDisplayCopy(value: string): boolean {
  const cleaned = value.trim();

  return cleaned.length > 0
    && !FORBIDDEN_DISPLAY_COPY_MARKERS.some((marker) =>
      cleaned.includes(marker)
    );
}

function normalizeFactKey(key: string): string {
  return key.replace(/_/gu, " ").trim();
}

function normalizeDisplayCopyKey(value: string): string {
  return value.replace(/\s+/gu, "").replace(/[。；;，,]/gu, "").trim();
}

function ensureSentence(value: string, maxChars: number): string {
  const withoutTrailingPunctuation = value.replace(/[。；;，,\s]+$/gu, "").trim();
  const truncated = Array.from(withoutTrailingPunctuation)
    .slice(0, Math.max(1, maxChars - 1))
    .join("")
    .trim();

  return /[。！？!?]$/u.test(truncated) ? truncated : `${truncated}。`;
}

function formatProductPriceRange(product: Product): string {
  const minPrice = formatCurrencyCents(product.priceMinCents, product.currency);
  const maxPrice = formatCurrencyCents(product.priceMaxCents, product.currency);

  return product.priceMinCents === product.priceMaxCents
    ? minPrice
    : `${minPrice}-${maxPrice}`;
}

function formatCurrencyCents(value: number, currency: string): string {
  const amount = (value / 100).toFixed(Number.isInteger(value / 100) ? 0 : 2);

  return currency === "CNY" ? `¥${amount}` : `${currency} ${amount}`;
}

function stripCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonObject(rawText: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new ProductDisplayCopyGenerationOutputError(
      "product display copy output must be valid JSON.",
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProductDisplayCopyGenerationOutputError(
      "product display copy output must be a JSON object.",
    );
  }

  return parsed as Record<string, unknown>;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
