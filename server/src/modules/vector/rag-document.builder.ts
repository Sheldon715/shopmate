import { createHash } from "node:crypto";
import { isProductAvailable } from "../products/product-availability";
import type { Product } from "../products/product.types";
import type {
  JsonRecord,
  RagDocument,
  RagDocumentMetadata,
  RagDocumentType,
} from "./rag-document.types";

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

const DATASET_NOTE =
  "本商品数据来自 synthetic/desensitized 脱敏商品数据集，仅用于课程 Demo 和检索实验；价格、库存与最终展示以后续 PostgreSQL 回查为准。";

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
  return [
    `商品名: ${product.name}`,
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
    `数据说明: ${DATASET_NOTE}`,
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
    tags: product.visualTags,
    recommendWhen: product.recommendWhen,
    avoidWhen: product.avoidWhen,
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
  metadata?: Partial<Omit<RagDocumentMetadata, "documentHash">>;
}): RagDocument | undefined {
  const bodyLines = input.bodyLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (bodyLines.length === 0) {
    return undefined;
  }

  const text = [...buildSharedContext(input.product), ...bodyLines].join("\n");
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

function buildContentBlockDocuments(product: Product): RagDocument[] {
  return parseContentBlocks(product.contentBlocks).flatMap((block) => {
    const document = createDocument({
      product,
      docType: "content_block",
      docId: `${product.id}::content_block::${block.blockId}`,
      bodyLines: [
        `内容块标题: ${block.title}`,
        `内容块类型: ${block.blockType}`,
        `正文: ${block.content}`,
        formatList("关键词", block.keywords),
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

function buildDescriptionDocument(product: Product): RagDocument[] {
  const description = nonEmptyText(product.marketingDescription);

  if (!description) {
    return [];
  }

  const document = createDocument({
    product,
    docType: "description",
    docId: `${product.id}::description`,
    bodyLines: [`商品描述: ${description}`],
  });

  return document ? [document] : [];
}

function buildReviewSummaryDocument(product: Product): RagDocument[] {
  const reviewSummary = parseReviewSummary(product.reviewSummary);

  if (!reviewSummary) {
    return [];
  }

  const document = createDocument({
    product,
    docType: "review_summary",
    docId: `${product.id}::review_summary`,
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
    ...buildContentBlockDocuments(product),
    ...buildFaqDocuments(product),
    ...buildDescriptionDocument(product),
    ...buildReviewSummaryDocument(product),
  ];
}

export function buildRagDocuments(products: Product[]): RagDocument[] {
  return products.flatMap((product) => buildProductRagDocuments(product));
}
