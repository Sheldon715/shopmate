import type {
  NormalizedProduct,
  NormalizedSku,
} from "../../lib/catalog/types";
import { resolvePublicProductImagePath } from "../images/image.service";
import { isProductAvailable } from "./product-availability";
import { buildProductDisplayName } from "./product-display-copy";
import type {
  JsonValue,
  Product,
  ProductCardDto,
  ProductDetailDto,
  ProductRow,
  ProductSku,
  ProductSkuRow,
  ProductSkuUpsertInput,
  ProductWithSkusUpsertInput,
} from "./product.types";

export interface ProductMapperOptions {
  publicImageBaseUrl?: string;
  recommendationReason?: string;
  recommendationHighlights?: string[];
}

function toJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function toRecordOfStringArrays(value: JsonValue): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string[]> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (Array.isArray(rawValue)) {
      result[key] = rawValue.filter(
        (item): item is string => typeof item === "string",
      );
      continue;
    }

    if (typeof rawValue === "string") {
      result[key] = [rawValue];
    }
  }

  return result;
}

function toStringArray(value: JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toStringRecord(value: JsonValue): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
    ) {
      result[key] = String(rawValue);
    }
  }

  return result;
}

function parseRating(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function optionalText(value: string | undefined): string | null {
  return value ?? null;
}

export function moneyToCents(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative finite number.`);
  }

  return Math.round((value + Number.EPSILON) * 100);
}

function mapPriceRangeToCents(product: NormalizedProduct): {
  min: number;
  max: number;
} {
  const basePriceCents = moneyToCents(product.base_price, "base_price");
  const range = product.price_range
    .filter((price) => Number.isFinite(price) && price >= 0)
    .map((price) => moneyToCents(price, "price_range"));

  if (range.length === 0) {
    return { min: basePriceCents, max: basePriceCents };
  }

  return {
    min: Math.min(...range),
    max: Math.max(...range),
  };
}

function mapNormalizedSkuToUpsertInput(
  product: NormalizedProduct,
  sku: NormalizedSku,
  index: number,
): ProductSkuUpsertInput {
  return {
    id: sku.sku_id,
    productId: product.product_id,
    properties: toJsonValue(sku.properties),
    priceCents: moneyToCents(sku.price, `skus[${index}].price`),
    currency: product.currency,
    available: sku.available ?? true,
    stockLevel: sku.stock_level ?? null,
    sortOrder: index,
  };
}

export function mapNormalizedProductToUpsertInput(
  product: NormalizedProduct,
): ProductWithSkusUpsertInput {
  const priceRange = mapPriceRangeToCents(product);

  return {
    product: {
      id: product.product_id,
      status: product.status,
      name: product.name,
      brand: product.brand,
      category: product.category,
      subCategory: optionalText(product.sub_category),
      imagePath: optionalText(product.image_path),
      imageCaption: optionalText(product.image_caption),
      currency: product.currency,
      basePriceCents: moneyToCents(product.base_price, "base_price"),
      priceMinCents: priceRange.min,
      priceMaxCents: priceRange.max,
      marketingDescription: product.marketing_description,
      knowledgeText: product.knowledge_text,
      ratingAvg: product.review_summary.rating_avg ?? null,
      categoryPath: toJsonValue(product.category_path),
      visualTags: toJsonValue(product.visual_tags),
      attributes: toJsonValue(product.attributes),
      pros: toJsonValue(product.pros),
      cons: toJsonValue(product.cons),
      recommendWhen: toJsonValue(product.recommend_when),
      avoidWhen: toJsonValue(product.avoid_when),
      compareWith: toJsonValue(product.compare_with),
      reviewSummary: toJsonValue(product.review_summary),
      contentBlocks: toJsonValue(product.content_blocks),
      officialFaq: toJsonValue(product.official_faq),
      userReviews: toJsonValue(product.user_reviews),
      normalizedPayload: toJsonValue(product),
      sourceDataset: product.source.source_dataset,
      sourceVersion: product.source.source_version,
      sourceType: product.source.source_type,
      dataVersion: product.source.data_version,
      isDesensitized: product.source.is_desensitized,
      ingestBatchId: product.source.ingest_batch_id,
      sourcePath: product.source.source_path,
    },
    skus: product.skus.map((sku, index) =>
      mapNormalizedSkuToUpsertInput(product, sku, index),
    ),
  };
}

export function mapNormalizedProductsToUpsertInputs(
  products: NormalizedProduct[],
): ProductWithSkusUpsertInput[] {
  return products.map((product) => mapNormalizedProductToUpsertInput(product));
}

export function mapProductSkuRowToProductSku(row: ProductSkuRow): ProductSku {
  return {
    id: row.id,
    productId: row.product_id,
    properties: toStringRecord(row.properties),
    priceCents: row.price_cents,
    currency: row.currency,
    available: row.available,
    stockLevel: row.stock_level,
    sortOrder: row.sort_order,
  };
}

export function mapProductRowToProduct(
  row: ProductRow,
  skus: ProductSku[] = [],
): Product {
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subCategory: row.sub_category,
    imagePath: row.image_path,
    imageCaption: row.image_caption,
    currency: row.currency,
    basePriceCents: row.base_price_cents,
    priceMinCents: row.price_min_cents,
    priceMaxCents: row.price_max_cents,
    marketingDescription: row.marketing_description,
    knowledgeText: row.knowledge_text,
    ratingAvg: parseRating(row.rating_avg),
    categoryPath: toStringArray(row.category_path),
    visualTags: toStringArray(row.visual_tags),
    attributes: toRecordOfStringArrays(row.attributes),
    pros: toStringArray(row.pros),
    cons: toStringArray(row.cons),
    recommendWhen: toStringArray(row.recommend_when),
    avoidWhen: toStringArray(row.avoid_when),
    compareWith: toStringArray(row.compare_with),
    reviewSummary: row.review_summary,
    contentBlocks: row.content_blocks,
    officialFaq: row.official_faq,
    userReviews: row.user_reviews,
    normalizedPayload: row.normalized_payload,
    sourceDataset: row.source_dataset,
    sourceVersion: row.source_version,
    sourceType: row.source_type,
    dataVersion: row.data_version,
    isDesensitized: row.is_desensitized,
    ingestBatchId: row.ingest_batch_id,
    sourcePath: row.source_path,
    skus,
  };
}

export function mapProductToCardDto(
  product: Product,
  options: ProductMapperOptions = {},
): ProductCardDto {
  return {
    id: product.id,
    name: buildProductDisplayName(product),
    brand: product.brand,
    category: product.category,
    subCategory: product.subCategory,
    priceCents: product.basePriceCents,
    priceRangeCents: {
      min: product.priceMinCents,
      max: product.priceMaxCents,
    },
    currency: product.currency,
    imagePath: resolvePublicProductImagePath(
      product.imagePath,
      options.publicImageBaseUrl,
    ),
    ratingAvg: product.ratingAvg,
    tags: createPublicProductTags(product),
    available: isProductAvailable(product),
    recommendationReason:
      options.recommendationReason
      ?? buildProductCardRecommendationReason(product),
  };
}

export function mapProductToDetailDto(
  product: Product,
  options: ProductMapperOptions = {},
): ProductDetailDto {
  return {
    ...mapProductToCardDto(product, options),
    marketingDescription: product.marketingDescription,
    skus: product.skus,
    attributes: product.attributes,
    pros: product.pros,
    cons: product.cons,
    recommendWhen: product.recommendWhen,
    avoidWhen: product.avoidWhen,
    reviewSummary: product.reviewSummary,
    officialFaq: product.officialFaq,
    contentBlocks: product.contentBlocks,
    ...(options.recommendationHighlights
      ? { recommendationHighlights: options.recommendationHighlights }
      : {}),
  };
}

function buildProductCardRecommendationReason(product: Product): string {
  const displayName = buildProductDisplayName(product);
  const structuredFacts = [
    ...product.recommendWhen,
    ...flattenAttributeFacts(product.attributes),
    ...product.pros,
    ...product.visualTags,
  ]
    .map(cleanReasonFact)
    .filter((value) => value.length > 0)
    .filter((value) => !isCautionFact(value))
    .filter((value) => !isWeakCategoryFact(value, product))
    .filter((value) => !isTitleEchoFact(value, product, displayName));
  const uniqueFacts = [
    ...new Set([
      ...structuredFacts,
      ...extractMarketingReasonFacts(product)
        .filter((value) => !isTitleEchoFact(value, product, displayName)),
    ]),
  ].slice(0, 3);

  if (uniqueFacts.length > 0) {
    return `推荐理由：${uniqueFacts.join("，")}。`;
  }

  const summary = cleanReasonFact(product.marketingDescription);

  if (
    summary.length > 0
    && !isCautionFact(summary)
    && !isWeakCategoryFact(summary, product)
    && !isTitleEchoFact(summary, product, displayName)
  ) {
    return `推荐理由：${summary}。`;
  }

  return isProductAvailable(product)
    ? "推荐理由：库内有货，可结合预算和使用场景继续比较。"
    : "推荐理由：当前暂不可选，可看看同类可选商品。";
}

export function createPublicProductTags(product: Product): string[] {
  const maxPublicTags = 3;
  const weakTags = [
    product.brand,
    product.category,
    product.subCategory ?? "",
    "主图",
    "占位图",
    "商品",
  ]
    .map(normalizeProductTag)
    .filter((value) => value.length > 0);
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const rawTag of product.visualTags) {
    const tag = cleanPublicTagCandidate(rawTag);
    const normalizedTag = normalizeProductTag(tag);

    if (
      tag.length === 0
      || hasSeenPublicTag(seen, normalizedTag)
      || isCautionFact(tag)
      || isWeakCategoryFact(tag, product)
      || weakTags.some((weakTag) =>
        normalizedTag === weakTag || normalizedTag === `适合${weakTag}`
      )
    ) {
      continue;
    }

    seen.add(normalizedTag);
    tags.push(tag);

    if (tags.length >= maxPublicTags) {
      break;
    }
  }

  if (tags.length > 0) {
    return tags;
  }

  return createFallbackProductTags(product);
}

function normalizeProductTag(value: string): string {
  return value.replace(/\s+/gu, "");
}

function hasSeenPublicTag(seen: Set<string>, normalizedTag: string): boolean {
  if (seen.has(normalizedTag)) {
    return true;
  }

  if (Array.from(normalizedTag).length < 4) {
    return false;
  }

  return [...seen].some((seenTag) => {
    if (Array.from(seenTag).length < 4) {
      return false;
    }

    return normalizedTag.includes(seenTag) || seenTag.includes(normalizedTag);
  });
}

function createFallbackProductTags(product: Product): string[] {
  const fallbackCandidates = [
    ...(product.attributes["佩戴形态"] ?? []),
    ...(product.attributes["使用场景"] ?? []),
    ...(product.attributes["适用人群"] ?? []),
    ...product.recommendWhen,
    ...product.pros,
    ...extractMarketingTagCandidates(product),
  ];
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const rawValue of fallbackCandidates) {
    const tag = cleanPublicTagCandidate(rawValue);
    const normalizedTag = normalizeProductTag(tag);

    if (
      tag.length === 0
      || hasSeenPublicTag(seen, normalizedTag)
      || isCautionFact(tag)
      || isWeakCategoryFact(tag, product)
    ) {
      continue;
    }

    seen.add(normalizedTag);
    tags.push(tag);

    if (tags.length >= 3) {
      break;
    }
  }

  return tags;
}

function extractMarketingTagCandidates(product: Product): string[] {
  const candidates: string[] = [];

  for (const segment of product.marketingDescription.split(/[。；;！!\n]+/u)) {
    const cleanedSegment = stripLeadingProductReference(
      segment.trim(),
      product,
    );

    candidates.push(...extractKnownPublicTagSignals(cleanedSegment));

    for (const phrase of extractShortMarketingTagPhrases(cleanedSegment)) {
      candidates.push(phrase);
    }
  }

  return candidates;
}

function extractKnownPublicTagSignals(value: string): string[] {
  const signals: string[] = [];
  const paRating = value.match(/PA\+{2,4}/iu)?.[0].toUpperCase();

  if (/SPF\s*50\+?/iu.test(value)) {
    signals.push("SPF50+");
  }

  if (paRating) {
    signals.push(paRating);
  }

  const signalTags: Array<[RegExp, string]> = [
    [/夜间肌底修护/u, "夜间肌底修护"],
    [/屏障修护/u, "屏障修护"],
    [/补水修护/u, "补水修护"],
    [/锁水保湿/u, "锁水保湿"],
    [/淡纹紧致/u, "淡纹紧致"],
    [/水感轻薄/u, "水感轻薄"],
    [/清爽不油腻/u, "清爽不油腻"],
    [/质地清爽/u, "质地清爽"],
    [/抗初老/u, "抗初老"],
    [/控油/u, "控油"],
    [/温和/u, "温和"],
    [/清洁/u, "清洁"],
    [/主动降噪/u, "主动降噪"],
    [/半入耳/u, "半入耳"],
    [/真无线/u, "真无线"],
    [/长续航/u, "长续航"],
    [/通勤/u, "通勤"],
    [/小容量/u, "小容量"],
    [/宿舍友好/u, "宿舍友好"],
    [/早餐制作/u, "早餐制作"],
    [/一人食/u, "一人食"],
    [/办公室补给/u, "办公室补给"],
    [/小包装/u, "小包装"],
    [/多任务办公/u, "多任务办公"],
    [/办公学习/u, "办公学习"],
    [/影音娱乐/u, "影音娱乐"],
    [/折叠屏/u, "折叠屏"],
    [/大屏/u, "大屏"],
    [/拍照/u, "拍照"],
    [/轻量/u, "轻量"],
    [/缓震/u, "缓震"],
    [/透气/u, "透气"],
    [/耐磨/u, "耐磨"],
  ];

  for (const [pattern, tag] of signalTags) {
    if (pattern.test(value)) {
      signals.push(tag);
    }
  }

  return signals;
}

function extractShortMarketingTagPhrases(value: string): string[] {
  const source = value
    .replace(/^(主要卖点包括|核心特点包括|它的核心特点包括)\s*/u, "")
    .trim();
  const markerIndex = [
    source.indexOf("主打"),
    source.indexOf("适合"),
    source.indexOf("包括"),
  ]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const phraseSource = markerIndex === undefined
    ? source
    : source.slice(markerIndex);

  if (!hasMarketingReasonSignal(phraseSource)) {
    return [];
  }

  return phraseSource
    .split(/[、，,]/u)
    .map(cleanPublicTagCandidate)
    .filter((phrase) => phrase.length > 0);
}

function cleanPublicTagCandidate(value: string): string {
  return value
    .replace(/^(主要卖点包括|核心特点包括|它的核心特点包括)\s*/u, "")
    .replace(/^(主打|包括)\s*/u, "")
    .replace(/^适合/u, "")
    .replace(/的人群$/u, "")
    .replace(/用户$/u, "")
    .replace(/[。；;,.，\s]+$/u, "")
    .trim()
    .slice(0, 12);
}

function flattenAttributeFacts(
  attributes: Record<string, string[]>,
): string[] {
  return Object.entries(attributes)
    .map(([key, values]) => ({
      values,
      descriptor: attributeFactDescriptor(key),
    }))
    .filter((entry): entry is {
      values: string[];
      descriptor: AttributeFactDescriptor;
    } => entry.descriptor !== null)
    .sort((a, b) => a.descriptor.priority - b.descriptor.priority)
    .flatMap(({ values, descriptor }) =>
      values.map((value) => `${descriptor.label}${value}`),
    );
}

interface AttributeFactDescriptor {
  label: string;
  priority: number;
}

function attributeFactDescriptor(
  key: string,
): AttributeFactDescriptor | null {
  const normalized = key.trim().toLowerCase();

  if (
    normalized.includes("avoid")
    || normalized.includes("caution")
    || normalized.includes("注意")
    || normalized.includes("不适合")
  ) {
    return null;
  }

  if (
    normalized.includes("core")
    || normalized.includes("feature")
    || normalized.includes("卖点")
    || normalized.includes("亮点")
  ) {
    return { label: "", priority: 1 };
  }

  if (
    normalized.includes("scene")
    || normalized.includes("use")
    || normalized.includes("场景")
  ) {
    return { label: "适合", priority: 2 };
  }

  if (normalized.includes("skin") || normalized.includes("肤质")) {
    return { label: "适合", priority: 3 };
  }

  if (
    normalized.includes("audience")
    || normalized.includes("user")
    || normalized.includes("适用")
    || normalized.includes("人群")
  ) {
    return { label: "适合", priority: 4 };
  }

  return null;
}

function extractMarketingReasonFacts(product: Product): string[] {
  return product.marketingDescription
    .split(/[。；;，,！!\n]+/u)
    .map((value) => cleanMarketingReasonFact(value, product))
    .filter((value) => value.length > 0)
    .filter((value) => !isCautionFact(value))
    .filter((value) => !isWeakCategoryFact(value, product))
    .filter(hasMarketingReasonSignal)
    .slice(0, 2);
}

function cleanMarketingReasonFact(value: string, product: Product): string {
  const cleaned = value
    .replace(/^推荐理由[:：]\s*/u, "")
    .replace(/^(主要卖点包括|核心特点包括|它的核心特点包括)\s*/u, "")
    .replace(/[。；;,.，\s]+$/u, "")
    .trim();
  const withoutProductPrefix = stripLeadingProductReference(cleaned, product);

  return withoutProductPrefix.slice(0, 28);
}

function stripLeadingProductReference(value: string, product: Product): string {
  let result = value.trim();
  const prefixes = [
    product.name,
    product.brand,
  ]
    .filter((prefix) => prefix.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const prefix of prefixes) {
    if (result.startsWith(prefix)) {
      result = result.slice(prefix.length).trim();
    }
  }

  for (const marker of ["主打", "核心", "适合", "既能", "能", "添加", "采用", "搭配"]) {
    const markerIndex = result.indexOf(marker);

    if (markerIndex > 0 && markerIndex <= 28) {
      result = result.slice(markerIndex);
      break;
    }
  }

  return result
    .replace(/^这款/u, "")
    .replace(/^[的，,。；;\s]+/gu, "")
    .trim();
}

function hasMarketingReasonSignal(value: string): boolean {
  return [
    "适合",
    "主打",
    "核心",
    "卖点",
    "优势",
    "清洁",
    "控油",
    "油脂",
    "泡沫",
    "温和",
    "水润",
    "小容量",
    "省空间",
    "宿舍",
    "一人食",
    "早餐",
    "便携",
    "轻量",
    "续航",
    "降噪",
    "耐穿",
    "缓震",
    "支撑",
    "拍照",
    "老人",
    "操作",
    "简单",
    "价格低",
    "节省",
  ].some((marker) => value.includes(marker));
}

function cleanReasonFact(value: string): string {
  return value
    .replace(/^推荐理由[:：]\s*/u, "")
    .replace(/[。；;,.，\s]+$/u, "")
    .trim()
    .slice(0, 36);
}

function isWeakCategoryFact(value: string, product: Product): boolean {
  const normalized = value.replace(/\s+/gu, "");
  const weakTexts = [
    product.brand,
    product.category,
    product.subCategory ?? "",
    `${product.brand}${product.category}`,
    `${product.brand}${product.subCategory ?? ""}`,
    "当前可选",
    "商品信息",
    "功效描述明确",
    "适用场景清楚",
    "适用场景明确",
    "场景明确",
    "场景清楚",
    "便于按肤质筛选",
    "按肤质筛选",
    "日常护肤用户",
    "日常护肤",
    "关注肤感的人群",
    "关注肤感",
    "成分敏感用户",
    "成分敏感",
    "日常护理",
    "换季护理",
    "送礼",
    "口味信息明确",
    "规格容易比较",
    "规格选择清楚",
    "场景适用性强",
    "配置清晰",
    "SKU 选择较多",
    "适合参数比较",
    "主图",
    "占位图",
  ]
    .map((item) => item.replace(/\s+/gu, ""))
    .filter((item) => item.length > 0);

  if (
    weakTexts.some((item) =>
      normalized === item || normalized === `适合${item}`
    )
  ) {
    return true;
  }

  return [
    "本数据集",
    "本商品数据",
    "真实品牌",
    "真实用户反馈",
    "产品名",
    "后续查找",
    "对应商品图片",
    "构建商品详情页",
    "导购信息经过",
    "脱敏",
    "结构化整理",
    "课程 Demo",
    "课程Demo",
    "检索实验",
    "最终展示",
    "PostgreSQL",
    "比赛数据集",
    "模拟内容",
    "SKU",
    "sku",
    "FAQ",
    "faq",
    "评论",
    "实时售价",
    "不代表实时售价",
    "不代表真实用户反馈",
    "价格、SKU",
    "商品详情页数据",
    "如果用户属于",
    "推荐时需要结合限制条件",
  ].some((marker) => value.includes(marker));
}

function isTitleEchoFact(
  value: string,
  product: Product,
  displayName: string,
): boolean {
  const normalized = normalizeReasonFact(value);

  if (normalized.length < 5) {
    return false;
  }

  const titleCandidates = [
    product.name,
    displayName,
    product.brand,
  ]
    .map(normalizeReasonFact)
    .filter((candidate) => candidate.length >= 4);

  return titleCandidates.some((candidate) =>
    normalized === candidate
    || normalized.startsWith(candidate)
    || (
      normalized.length >= 8
      && normalized.length >= candidate.length * 0.6
      && candidate.startsWith(normalized)
    )
  );
}

function normalizeReasonFact(value: string): string {
  return value
    .replace(/^适合/u, "")
    .replace(/\s+/gu, "")
    .replace(/[。；;，,]/gu, "")
    .trim();
}

function isCautionFact(value: string): boolean {
  return [
    "不适合",
    "谨慎",
    "注意",
    "过敏",
    "避免",
    "禁忌",
    "医疗",
    "下架",
    "暂不可选",
  ].some((marker) => value.includes(marker));
}
