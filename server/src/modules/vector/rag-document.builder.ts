import { createHash } from "node:crypto";
import { isProductAvailable } from "../products/product-availability";
import { buildProductDisplayName } from "../products/product-display-copy";
import type { Product } from "../products/product.types";
import type {
  JsonRecord,
  RagDocument,
  RagDocumentMetadata,
  RagDocumentType,
} from "./rag-document.types";
import { buildRagDocumentAliases } from "./rag-document-aliases";
import { extractRagNegativeFactMetadata } from "./rag-negative-fact-metadata";
import {
  cleanRagDocumentKeywordArray,
  cleanRagDocumentText,
  shouldSkipRagContentBlock,
} from "./rag-document-text-cleaner";

interface ContentBlock {
  blockId: string;
  blockType: string;
  title: string;
  content: string;
  keywords: string[];
}

interface FaqItem {
  question: string;
  answer: string;
}

interface ReviewSummary {
  ratingAvg?: number;
  positivePoints: string[];
  negativePoints: string[];
  commonComplaints: string[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): string[] => {
    const text = nonEmptyText(item);
    return text ? [text] : [];
  });
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseContentBlocks(value: unknown): ContentBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index): ContentBlock[] => {
    const record = asRecord(item);

    if (!record) {
      return [];
    }

    const title = nonEmptyText(record.title);
    const content = nonEmptyText(record.content);

    if (!title || !content) {
      return [];
    }

    return [
      {
        blockId:
          nonEmptyText(record.block_id) ??
          nonEmptyText(record.blockId) ??
          `block_${String(index + 1).padStart(3, "0")}`,
        blockType:
          nonEmptyText(record.block_type) ??
          nonEmptyText(record.blockType) ??
          "general",
        title,
        content,
        keywords: asStringArray(record.keywords),
      },
    ];
  });
}

function parseFaq(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): FaqItem[] => {
    const record = asRecord(item);

    if (!record) {
      return [];
    }

    const question = nonEmptyText(record.question);
    const answer = nonEmptyText(record.answer);

    return question && answer ? [{ question, answer }] : [];
  });
}

function parseReviewSummary(value: unknown): ReviewSummary | undefined {
  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  const reviewSummary = {
    ratingAvg:
      asNumber(record.rating_avg) ?? asNumber(record.ratingAvg),
    positivePoints:
      asStringArray(record.positive_points).length > 0
        ? asStringArray(record.positive_points)
        : asStringArray(record.positivePoints),
    negativePoints:
      asStringArray(record.negative_points).length > 0
        ? asStringArray(record.negative_points)
        : asStringArray(record.negativePoints),
    commonComplaints:
      asStringArray(record.common_complaints).length > 0
        ? asStringArray(record.common_complaints)
        : asStringArray(record.commonComplaints),
  };

  if (
    reviewSummary.ratingAvg === undefined &&
    reviewSummary.positivePoints.length === 0 &&
    reviewSummary.negativePoints.length === 0 &&
    reviewSummary.commonComplaints.length === 0
  ) {
    return undefined;
  }

  return reviewSummary;
}

function formatPriceRange(product: Product): string {
  const min = (product.priceMinCents / 100).toFixed(2);
  const max = (product.priceMaxCents / 100).toFixed(2);

  return product.priceMinCents === product.priceMaxCents
    ? `${min} ${product.currency}`
    : `${min}-${max} ${product.currency}`;
}

function formatList(label: string, values: string[]): string | undefined {
  return values.length > 0 ? `${label}: ${values.join("、")}` : undefined;
}

function formatAttributes(
  label: string,
  attributes: Record<string, string[]>,
): string | undefined {
  const entries = Object.entries(attributes)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => `${key}:${values.join("、")}`);

  return entries.length > 0 ? `${label}: ${entries.join("；")}` : undefined;
}

function buildSharedContext(product: Product): string[] {
  const aliases = buildRagDocumentAliases(product);

  return [
    `商品: ${buildProductDisplayName(product)}`,
    `原始标题: ${product.name}`,
    `品牌: ${product.brand}`,
    `类目: ${product.category}${product.subCategory ? ` / ${product.subCategory}` : ""}`,
    `价格参考: ${formatPriceRange(product)}`,
    `状态: ${product.status}`,
    `是否可售: ${isProductAvailable(product) ? "是" : "否"}`,
    formatAttributes("属性", product.attributes),
    formatList("适合", product.recommendWhen),
    formatList("不适合", product.avoidWhen),
    formatList("优势", product.pros),
    formatList("限制", product.cons),
    formatList("自然语言标签", aliases),
  ].filter((part): part is string => Boolean(part));
}

function hashDocument(docId: string, text: string): string {
  return createHash("sha256")
    .update(docId)
    .update("\n")
    .update(text)
    .digest("hex");
}

function createSnippet(text: string, maxLength = 180): string {
  const normalized = normalizeWhitespace(text);

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}…`;
}

function createBaseMetadata(
  product: Product,
  docType: RagDocumentType,
): Omit<RagDocumentMetadata, "documentHash"> {
  const negativeFactMetadata = extractRagNegativeFactMetadata(product);

  return {
    productName: product.name,
    brand: product.brand,
    category: product.category,
    subCategory: product.subCategory,
    status: product.status,
    available: isProductAvailable(product),
    priceMinCents: product.priceMinCents,
    priceMaxCents: product.priceMaxCents,
    currency: product.currency,
    tags: cleanRagDocumentKeywordArray(product.visualTags),
    recommendWhen: product.recommendWhen,
    avoidWhen: product.avoidWhen,
    freeFromTerms: negativeFactMetadata.freeFromTerms,
    riskTerms: negativeFactMetadata.riskTerms,
    wearingStyles: negativeFactMetadata.wearingStyles,
    pros: product.pros,
    cons: product.cons,
    sourceDataset: product.sourceDataset,
    sourceVersion: product.sourceVersion,
    sourceType: product.sourceType,
    dataVersion: product.dataVersion,
    isDesensitized: product.isDesensitized,
    ingestBatchId: product.ingestBatchId,
    sourcePath: product.sourcePath,
    docType,
  };
}

function createDocument(input: {
  product: Product;
  docType: RagDocumentType;
  docId: string;
  bodyLines: string[];
  includeSharedContext?: boolean;
  metadata?: Partial<Omit<RagDocumentMetadata, "documentHash">>;
}): RagDocument | undefined {
  const bodyLines = input.bodyLines
    .map((line) => cleanRagDocumentText(line))
    .filter((line) => line.length > 0);

  if (bodyLines.length === 0) {
    return undefined;
  }

  const sharedContext = input.includeSharedContext === false
    ? []
    : buildSharedContext(input.product);
  const text = [...sharedContext, ...bodyLines]
    .map((line) => cleanRagDocumentText(line))
    .filter((line) => line.length > 0)
    .join("\n");
  const documentHash = hashDocument(input.docId, text);

  return {
    docId: input.docId,
    productId: input.product.id,
    docType: input.docType,
    text,
    snippet: createSnippet(bodyLines.join(" ")),
    metadata: {
      ...createBaseMetadata(input.product, input.docType),
      ...input.metadata,
      documentHash,
    },
  };
}

function mapContentBlockTypeToDocumentType(
  blockType: string,
): RagDocumentType | undefined {
  const normalized = blockType.trim().toLowerCase();

  if (shouldSkipRagContentBlock(normalized)) {
    return undefined;
  }

  if (normalized === "spec" || normalized === "sku") {
    return "product_specs";
  }

  if (normalized === "selling_point") {
    return "selling_points";
  }

  if (normalized === "scenario") {
    return "use_cases";
  }

  if (normalized === "limitation") {
    return "constraints";
  }

  return "selling_points";
}

function buildProductProfileDocument(product: Product): RagDocument[] {
  const aliases = buildRagDocumentAliases(product);
  const marketingDescription = cleanRagDocumentText(product.marketingDescription);
  const document = createDocument({
    product,
    docType: "product_profile",
    docId: `${product.id}::product_profile`,
    includeSharedContext: false,
    bodyLines: [
      `商品: ${buildProductDisplayName(product)}`,
      `原始标题: ${product.name}`,
      `品牌: ${product.brand}`,
      `类目: ${product.category}${product.subCategory ? ` / ${product.subCategory}` : ""}`,
      `价格: ${formatPriceRange(product)}`,
      `可售: ${isProductAvailable(product) ? "是" : "否"}`,
      formatAttributes("属性", product.attributes),
      formatList("适合人群", asStringArray(product.attributes["适用人群"])),
      formatList("使用场景", [
        ...asStringArray(product.attributes["使用场景"]),
        ...product.recommendWhen,
      ]),
      formatList("核心特点", [
        ...asStringArray(product.attributes["核心卖点"]),
        ...product.pros,
      ]),
      formatList("不适合", [
        ...asStringArray(product.attributes["不适合"]),
        ...product.avoidWhen,
        ...product.cons,
      ]),
      formatList("自然语言标签", aliases),
      marketingDescription ? `商品描述要点: ${marketingDescription}` : undefined,
    ].filter((line): line is string => Boolean(line)),
  });

  return document ? [document] : [];
}

function buildContentBlockDocuments(product: Product): RagDocument[] {
  return parseContentBlocks(product.contentBlocks).flatMap((block) => {
    const docType = mapContentBlockTypeToDocumentType(block.blockType);

    if (!docType) {
      return [];
    }

    const document = createDocument({
      product,
      docType,
      docId: `${product.id}::${docType}::${block.blockId}`,
      bodyLines: [
        `内容块标题: ${block.title}`,
        `内容块类型: ${block.blockType}`,
        `正文: ${block.content}`,
        formatList("关键词", cleanRagDocumentKeywordArray(block.keywords)),
      ].filter((line): line is string => Boolean(line)),
      metadata: {
        blockId: block.blockId,
        blockType: block.blockType,
      },
    });

    return document ? [document] : [];
  });
}

function buildFaqDocuments(product: Product): RagDocument[] {
  return parseFaq(product.officialFaq).flatMap((faq, index) => {
    const faqIndex = index + 1;
    const document = createDocument({
      product,
      docType: "faq",
      docId: `${product.id}::faq::${String(faqIndex).padStart(3, "0")}`,
      bodyLines: [
        `问题: ${faq.question}`,
        `答案: ${faq.answer}`,
      ],
      metadata: { faqIndex },
    });

    return document ? [document] : [];
  });
}

function buildReviewSummaryDocument(product: Product): RagDocument[] {
  const reviewSummary = parseReviewSummary(product.reviewSummary);

  if (!reviewSummary) {
    return [];
  }

  const document = createDocument({
    product,
    docType: "reviews_summary",
    docId: `${product.id}::reviews_summary`,
    bodyLines: [
      reviewSummary.ratingAvg !== undefined
        ? `评分摘要: ${reviewSummary.ratingAvg}`
        : undefined,
      formatList("好评点", reviewSummary.positivePoints),
      formatList("差评点", reviewSummary.negativePoints),
      formatList("常见反馈", reviewSummary.commonComplaints),
    ].filter((line): line is string => Boolean(line)),
  });

  return document ? [document] : [];
}

export function buildProductRagDocuments(product: Product): RagDocument[] {
  return [
    ...buildProductProfileDocument(product),
    ...buildContentBlockDocuments(product),
    ...buildFaqDocuments(product),
    ...buildReviewSummaryDocument(product),
  ];
}

export function buildRagDocuments(products: Product[]): RagDocument[] {
  return products.flatMap((product) => buildProductRagDocuments(product));
}
