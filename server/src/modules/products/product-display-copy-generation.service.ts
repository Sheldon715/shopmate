import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import { buildProductDisplayName } from "./product-display-copy";
import type { Product } from "./product.types";

export interface ProductDisplayCopy {
  productId: string;
  cardReason?: string;
  detailReason?: string;
  detailHighlights?: string[];
  displayName?: string;
  displayTags?: string[];
  displaySpecs?: ProductDisplaySpec[];
  suitabilityText?: string;
}

export interface ProductDisplaySpec {
  label: string;
  value: string;
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
const MAX_DISPLAY_NAME_CHARS = 22;
const MAX_DISPLAY_TAGS = 4;
const MAX_DISPLAY_TAG_CHARS = 10;
const MAX_DISPLAY_SPECS = 4;
const MAX_DISPLAY_SPEC_LABEL_CHARS = 8;
const MAX_DISPLAY_SPEC_VALUE_CHARS = 22;
const MAX_SUITABILITY_TEXT_CHARS = 120;

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
  "功效描述明确",
  "适用场景清楚",
  "适用场景明确",
  "场景明确",
  "场景清楚",
  "便于按肤质筛选",
  "按肤质筛选",
  "日常护肤用户",
  "关注肤感的人群",
  "成分敏感用户",
  "日常护理",
  "换季护理",
  "送礼",
  "口味信息明确",
  "规格容易比较",
  "规格选择清楚",
  "场景适用性强",
  "配置清晰",
  "参数比较",
  "当前可选",
  "库内有货",
  "继续比较",
  "信息完整",
  "规格明确",
  "便于筛选",
  "SKU 选择较多",
  "SKU选择较多",
  "主图",
  "占位图",
  "商品信息",
  "结合自身需求",
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

    const copies = new Map<string, ProductDisplayCopy>();

    for (
      let index = 0;
      index < input.products.length;
      index += MAX_PRODUCTS_PER_REQUEST
    ) {
      const products = input.products.slice(
        index,
        index + MAX_PRODUCTS_PER_REQUEST,
      );
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
      const batchCopies = parseProductDisplayCopyOutput(
        response.text,
        products.map((product) => product.id),
      );

      for (const [productId, copy] of batchCopies) {
        copies.set(productId, copy);
      }
    }

    return copies;
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
    const displayName = normalizeDisplayName(
      parseString(record.display_name ?? record.displayName),
    );
    const displayTags = parseDisplayTags(
      record.display_tags
        ?? record.displayTags
        ?? record.tags,
    );
    const displaySpecs = parseDisplaySpecs(
      record.display_specs
        ?? record.displaySpecs
        ?? record.specs,
    );
    const suitabilityText = normalizeSuitabilityText(
      parseString(
        record.suitability_text
          ?? record.suitabilityText
          ?? record.selection_advice
          ?? record.selectionAdvice,
      ),
    );

    if (
      !cardReason
      && !detailReason
      && detailHighlights.length === 0
      && !displayName
      && displayTags.length === 0
      && displaySpecs.length === 0
      && !suitabilityText
    ) {
      continue;
    }

    copies.set(productId, {
      productId,
      ...(cardReason ? { cardReason } : {}),
      ...(detailReason ? { detailReason } : {}),
      ...(detailHighlights.length > 0 ? { detailHighlights } : {}),
      ...(displayName ? { displayName } : {}),
      ...(displayTags.length > 0 ? { displayTags } : {}),
      ...(displaySpecs.length > 0 ? { displaySpecs } : {}),
      ...(suitabilityText ? { suitabilityText } : {}),
    });
  }

  return copies;
}

function buildProductDisplayCopyPrompt(
  input: ProductDisplayCopyGenerationInput,
): LlmGenerateRequest["messages"] {
  const surface = input.surface ?? "chat_card";
  const productSchemaInstruction = surface === "product_detail"
    ? [
        "为每个商品生成 card_reason、detail_reason、detail_highlights、display_name、display_tags、display_specs、suitability_text。",
        "card_reason 必须以“推荐理由：”开头，1 句自然中文，<=72 字，解释为什么适合当前用户问题或常见购买场景。",
        "detail_reason 不要加“推荐理由：”前缀，1-2 句，<=120 字，适合详情页导购推荐理由。",
        "detail_highlights 写 2-3 条具体事实亮点，每条 <=42 字，不要和 detail_reason 完全重复。",
        "display_name 是详情页短商品名，<=22 字，只能压缩原商品名/品牌/品类事实，不得编造新型号、新品牌或营销称号。",
        "display_tags 写 2-4 个短标签，每个 <=10 字，必须是商品事实或场景，不要写品牌、一级类目、二级类目、价格或库存。",
        "display_specs 写 4 个详情页规格 tile，每个包含 label/value；label <=8 字，value <=22 字，优先体现不同商品之间的差异，如佩戴方式、容量、使用场景、核心卖点、限制条件，不要重复品牌/品类/价格/库存。",
        "suitability_text 写 1-2 句选择建议，<=120 字，要说明适合谁、适合什么场景，必要时指出与更高阶/更便宜商品的取舍；不得编造。",
        '只输出 JSON object，格式为 {"products":[{"product_id":"...","card_reason":"推荐理由：...","detail_reason":"...","detail_highlights":["...","..."],"display_name":"...","display_tags":["..."],"display_specs":[{"label":"...","value":"..."}],"suitability_text":"..."}]}。',
      ]
    : [
        "只为每个商品生成 card_reason。",
        "card_reason 必须以“推荐理由：”开头，1 句自然中文，<=72 字，解释为什么适合当前用户问题或当前对比/推荐场景。",
        "即使商品 facts 比较少，也要基于已有商品事实输出简短 card_reason，不要留空，不要解释。",
        '只输出 JSON object，格式为 {"products":[{"product_id":"...","card_reason":"推荐理由：..."}]}。',
      ];

  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的商品展示文案生成器。",
        "只基于输入的库内商品 facts 写用户可见文案，不得编造库外商品、销量、优惠、库存、真实评论、功效、参数或成分。",
        "不要出现 SKU、FAQ、评论、数据集、模拟内容、实时售价、PostgreSQL、product_id 等内部或数据说明词。",
        "优先使用 facts 里的具体成分、功效、容量、佩戴/使用场景、限制或 FAQ 答案；不要把泛化标签当作事实。",
        "不要写“功效描述明确”“适用场景清楚”“日常护理”“换季护理”“便于按肤质筛选”“配置清晰”“适合参数比较”“库内有货”“继续比较”这类模板话术。",
        "product_id 只能来自 allowlistProductIds；不要输出 markdown、解释或额外 key。",
        ...productSchemaInstruction,
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        userQuestion: input.userQuestion?.trim() || null,
        surface,
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
  const officialFaqFacts = extractOfficialFaqFacts(product.officialFaq);
  const rawFacts = [
    product.marketingDescription,
    ...officialFaqFacts,
    ...product.recommendWhen,
    ...product.pros,
    ...attributeFacts,
    ...contentBlockFacts,
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

function extractOfficialFaqFacts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const answer = parseString(record.answer);

    return answer ? [answer] : [];
  });
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

function normalizeDisplayName(value: string | undefined): string | undefined {
  const cleaned = normalizeGeneratedDisplayCopy(value, MAX_DISPLAY_NAME_CHARS)
    ?.replace(/^商品名[:：]\s*/u, "")
    .replace(/[。；;，,\s]+$/gu, "")
    .trim();

  if (!cleaned || !isUsefulGeneratedCopy(cleaned)) {
    return undefined;
  }

  return cleaned;
}

function parseDisplayTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const cleaned = normalizeGeneratedDisplayCopy(
      parseString(item),
      MAX_DISPLAY_TAG_CHARS,
    )
      ?.replace(/[。；;，,\s]+$/gu, "")
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
    tags.push(cleaned);

    if (tags.length >= MAX_DISPLAY_TAGS) {
      break;
    }
  }

  return tags;
}

function parseDisplaySpecs(value: unknown): ProductDisplaySpec[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const specs: ProductDisplaySpec[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const label = normalizeDisplaySpecLabel(
      parseString(record.label ?? record.name ?? record.title),
    );
    const specValue = normalizeDisplaySpecValue(
      parseString(record.value ?? record.text ?? record.content),
    );
    const normalized = normalizeDisplayCopyKey(`${label ?? ""}|${specValue ?? ""}`);

    if (
      !label
      || !specValue
      || seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    specs.push({ label, value: specValue });

    if (specs.length >= MAX_DISPLAY_SPECS) {
      break;
    }
  }

  return specs;
}

function normalizeDisplaySpecLabel(value: string | undefined): string | undefined {
  const cleaned = normalizeGeneratedDisplayCopy(value, MAX_DISPLAY_SPEC_LABEL_CHARS)
    ?.replace(/[。；;，,\s]+$/gu, "")
    .trim();

  if (!cleaned || !isUsefulGeneratedCopy(cleaned)) {
    return undefined;
  }

  return cleaned;
}

function normalizeDisplaySpecValue(value: string | undefined): string | undefined {
  const cleaned = normalizeGeneratedDisplayCopy(value, MAX_DISPLAY_SPEC_VALUE_CHARS)
    ?.replace(/[。；;，,\s]+$/gu, "")
    .trim();

  if (!cleaned || !isUsefulGeneratedCopy(cleaned)) {
    return undefined;
  }

  return cleaned;
}

function normalizeSuitabilityText(value: string | undefined): string | undefined {
  const cleaned = normalizeGeneratedDisplayCopy(value, MAX_SUITABILITY_TEXT_CHARS)
    ?.trim();

  if (!cleaned || !isUsefulGeneratedCopy(cleaned)) {
    return undefined;
  }

  return ensureSentence(cleaned, MAX_SUITABILITY_TEXT_CHARS);
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
  return isUsefulDisplayCopy(value);
}

function isUsefulDisplayCopy(value: string): boolean {
  const cleaned = value.trim();

  return cleaned.length > 0
    && !FORBIDDEN_DISPLAY_COPY_MARKERS.some((marker) =>
      cleaned.includes(marker)
    )
    && !WEAK_DISPLAY_COPY_MARKERS.some((marker) =>
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
    const extracted = extractJsonObjectCandidate(rawText);

    if (extracted) {
      try {
        parsed = JSON.parse(extracted);
      } catch {
        throw new ProductDisplayCopyGenerationOutputError(
          "product display copy output must be valid JSON.",
        );
      }
    } else {
      throw new ProductDisplayCopyGenerationOutputError(
        "product display copy output must be valid JSON.",
      );
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProductDisplayCopyGenerationOutputError(
      "product display copy output must be a JSON object.",
    );
  }

  return parsed as Record<string, unknown>;
}

function extractJsonObjectCandidate(rawText: string): string | undefined {
  const start = rawText.indexOf("{");
  if (start < 0) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < rawText.length; index += 1) {
    const char = rawText[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return rawText.slice(start, index + 1).trim();
      }
    }
  }

  return undefined;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
