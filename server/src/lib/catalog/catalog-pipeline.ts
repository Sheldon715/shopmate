import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CatalogManifest,
  DuplicateEntry,
  DuplicateReport,
  NormalizedContentBlock,
  NormalizedProduct,
  NormalizedSku,
  ProductFaq,
  ProductReview,
  ValidationIssue,
  ValidationReport,
} from "./types";

const SOURCE_DATASET = "ecommerce_agent_dataset_v3";
const SOURCE_VERSION = "v3";
const SOURCE_TYPE = "synthetic_desensitized";
const DATA_VERSION = "catalog_v1";

type JsonRecord = Record<string, unknown>;

export interface CatalogPaths {
  catalogDir: string;
  normalizedProducts: string;
  importManifest: string;
  validationReport: string;
  duplicateReport: string;
}

export interface NormalizeDatasetResult {
  products: NormalizedProduct[];
  manifest: CatalogManifest;
}

export function getCatalogPaths(processedDataDir: string): CatalogPaths {
  const catalogDir = path.join(processedDataDir, "catalog");

  return {
    catalogDir,
    normalizedProducts: path.join(catalogDir, "products.normalized.jsonl"),
    importManifest: path.join(catalogDir, "import-manifest.json"),
    validationReport: path.join(catalogDir, "validation-report.json"),
    duplicateReport: path.join(catalogDir, "duplicate-report.json"),
  };
}

export function createIngestBatchId(prefix = "catalog"): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.]/g, "")
    .replace("T", "_")
    .replace("Z", "");

  return `${prefix}_${timestamp}_${randomUUID().slice(0, 8)}`;
}

export async function ensureCatalogDirectory(paths: CatalogPaths): Promise<void> {
  await mkdir(paths.catalogDir, { recursive: true });
}

export async function listCanonicalProductFiles(
  rawDataDir: string,
): Promise<string[]> {
  const datasetRoot = path.join(rawDataDir, SOURCE_DATASET);

  if (!existsSync(datasetRoot)) {
    throw new Error(`Raw dataset directory not found: ${datasetRoot}`);
  }

  const categoryEntries = await readdir(datasetRoot, { withFileTypes: true });
  const productFiles: string[] = [];

  for (const categoryEntry of categoryEntries) {
    if (!categoryEntry.isDirectory()) {
      continue;
    }

    const dataDir = path.join(datasetRoot, categoryEntry.name, "data");

    if (!existsSync(dataDir)) {
      continue;
    }

    const dataEntries = await readdir(dataDir, { withFileTypes: true });
    const jsonFiles = dataEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dataDir, entry.name))
      .sort((left, right) => left.localeCompare(right));

    productFiles.push(...jsonFiles);
  }

  return productFiles.sort((left, right) => left.localeCompare(right));
}

function asRecord(value: unknown): JsonRecord | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  return undefined;
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key];

  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): string[] =>
    typeof item === "string" && item.trim().length > 0 ? [item.trim()] : [],
  );
}

function readNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): number[] => {
    if (typeof item === "number" && Number.isFinite(item)) {
      return [item];
    }

    if (typeof item === "string") {
      const parsed = Number(item);
      return Number.isFinite(parsed) ? [parsed] : [];
    }

    return [];
  });
}

function normalizeStringArrayRecord(value: unknown): Record<string, string[]> {
  const record = asRecord(value);

  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, recordValue]) => [
      key,
      readStringArray(recordValue),
    ]),
  );
}

function normalizeProperties(value: unknown): Record<string, string> {
  const record = asRecord(value);

  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, propertyValue]) => [
      key,
      String(propertyValue),
    ]),
  );
}

function normalizeSkus(value: unknown): NormalizedSku[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): NormalizedSku[] => {
    const record = asRecord(item);

    if (!record) {
      return [];
    }

    const skuId = readString(record, "sku_id");
    const price = readNumber(record, "price");
    const inventory = asRecord(record.inventory) ?? {};

    if (!skuId || price === undefined) {
      return [];
    }

    return [
      {
        sku_id: skuId,
        properties: normalizeProperties(record.properties),
        price,
        available: readBoolean(inventory, "available"),
        stock_level: readString(inventory, "stock_level"),
      },
    ];
  });
}

function normalizeContentBlocks(value: unknown): NormalizedContentBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): NormalizedContentBlock[] => {
    const record = asRecord(item);

    if (!record) {
      return [];
    }

    const blockId = readString(record, "block_id");
    const blockType = readString(record, "block_type");
    const title = readString(record, "title");
    const content = readString(record, "content");

    if (!blockId || !blockType || !title || !content) {
      return [];
    }

    return [
      {
        block_id: blockId,
        block_type: blockType,
        title,
        content,
        keywords: readStringArray(record.keywords),
      },
    ];
  });
}

function normalizeFaq(value: unknown): ProductFaq[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): ProductFaq[] => {
    const record = asRecord(item);

    if (!record) {
      return [];
    }

    const question = readString(record, "question");
    const answer = readString(record, "answer");

    if (!question || !answer) {
      return [];
    }

    return [{ question, answer }];
  });
}

function normalizeReviews(value: unknown): ProductReview[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): ProductReview[] => {
    const record = asRecord(item);

    if (!record) {
      return [];
    }

    const nickname = readString(record, "nickname");
    const rating = readNumber(record, "rating");
    const content = readString(record, "content");

    if (!nickname || rating === undefined || !content) {
      return [];
    }

    return [{ nickname, rating, content }];
  });
}

function getSourcePath(rawDataDir: string, filePath: string): string {
  return path.relative(rawDataDir, filePath).replace(/\\/g, "/");
}

function buildKnowledgeText(product: Omit<NormalizedProduct, "knowledge_text">): string {
  const skuSummary = product.skus
    .slice(0, 5)
    .map((sku) => {
      const properties = Object.entries(sku.properties)
        .map(([key, value]) => `${key}:${value}`)
        .join(",");
      return `${sku.sku_id} ${properties} ${sku.price}`;
    })
    .join(" | ");
  const faqSummary = product.official_faq
    .slice(0, 3)
    .map((faq) => `${faq.question} ${faq.answer}`)
    .join(" ");
  const reviewSummary = product.user_reviews
    .slice(0, 3)
    .map((review) => `${review.rating}星 ${review.content}`)
    .join(" ");
  const blockSummary = product.content_blocks
    .map((block) => `${block.title}:${block.content}`)
    .join(" ");
  const attributeSummary = Object.entries(product.attributes)
    .map(([key, values]) => `${key}:${values.join("、")}`)
    .join(" ");

  return [
    `商品名:${product.name}`,
    `类目:${product.category}`,
    product.sub_category ? `子类目:${product.sub_category}` : undefined,
    product.category_path.length > 0
      ? `类目路径:${product.category_path.join(">")}`
      : undefined,
    `品牌:${product.brand}`,
    `价格:${product.base_price} ${product.currency}`,
    product.price_range.length > 0
      ? `价格范围:${product.price_range.join("-")}`
      : undefined,
    attributeSummary ? `属性:${attributeSummary}` : undefined,
    product.pros.length > 0 ? `优势:${product.pros.join("、")}` : undefined,
    product.cons.length > 0 ? `限制:${product.cons.join("、")}` : undefined,
    product.recommend_when.length > 0
      ? `推荐条件:${product.recommend_when.join("、")}`
      : undefined,
    product.avoid_when.length > 0
      ? `避免条件:${product.avoid_when.join("、")}`
      : undefined,
    `描述:${product.marketing_description}`,
    blockSummary ? `内容块:${blockSummary}` : undefined,
    skuSummary ? `SKU:${skuSummary}` : undefined,
    faqSummary ? `FAQ:${faqSummary}` : undefined,
    reviewSummary ? `用户评价:${reviewSummary}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

async function normalizeProductFile(
  rawDataDir: string,
  ingestBatchId: string,
  filePath: string,
): Promise<NormalizedProduct> {
  const rawJson = await readFile(filePath, "utf8");
  const parsed = JSON.parse(rawJson) as unknown;
  const record = asRecord(parsed);

  if (!record) {
    throw new Error(`Expected JSON object in ${filePath}`);
  }

  const priceInfo = asRecord(record.price_info) ?? {};
  const image = asRecord(record.image) ?? {};
  const rawKnowledge =
    asRecord(record.raw_knowledge) ?? asRecord(record.rag_knowledge) ?? {};
  const prosCons = asRecord(record.pros_cons) ?? {};
  const decisionFactors = asRecord(record.decision_factors) ?? {};
  const reviewSummary = asRecord(record.review_summary) ?? {};
  const baseProduct: Omit<NormalizedProduct, "knowledge_text"> = {
    product_id: readString(record, "product_id") ?? path.basename(filePath, ".json"),
    status: readString(record, "status") ?? "active",
    name: readString(record, "title") ?? "",
    brand: readString(record, "brand") ?? "",
    category: readString(record, "category") ?? "",
    sub_category: readString(record, "sub_category"),
    category_path: readStringArray(record.category_path),
    currency: readString(priceInfo, "currency") ?? "CNY",
    base_price:
      readNumber(priceInfo, "base_price") ?? readNumber(record, "base_price") ?? 0,
    price_range: readNumberArray(priceInfo.price_range),
    image_path: readString(image, "path") ?? readString(record, "image_path"),
    image_caption: readString(image, "caption"),
    visual_tags: readStringArray(image.visual_tags),
    skus: normalizeSkus(record.skus),
    attributes: normalizeStringArrayRecord(record.attributes),
    pros: readStringArray(prosCons.pros),
    cons: readStringArray(prosCons.cons),
    recommend_when: readStringArray(decisionFactors.recommend_when),
    avoid_when: readStringArray(decisionFactors.avoid_when),
    compare_with: readStringArray(decisionFactors.compare_with),
    content_blocks: normalizeContentBlocks(record.content_blocks),
    review_summary: {
      rating_avg: readNumber(reviewSummary, "rating_avg"),
      positive_points: readStringArray(reviewSummary.positive_points),
      negative_points: readStringArray(reviewSummary.negative_points),
      common_complaints: readStringArray(reviewSummary.common_complaints),
    },
    marketing_description: readString(rawKnowledge, "marketing_description") ?? "",
    official_faq: normalizeFaq(rawKnowledge.official_faq),
    user_reviews: normalizeReviews(rawKnowledge.user_reviews),
    source: {
      source_dataset: SOURCE_DATASET,
      source_version: SOURCE_VERSION,
      source_type: readString(record, "source_type") ?? SOURCE_TYPE,
      data_version: readString(record, "data_version") ?? DATA_VERSION,
      is_desensitized: true,
      ingest_batch_id: ingestBatchId,
      source_path: getSourcePath(rawDataDir, filePath),
    },
  };

  return {
    ...baseProduct,
    knowledge_text: buildKnowledgeText(baseProduct),
  };
}

export async function normalizeCanonicalDataset(
  rawDataDir: string,
  processedDataDir: string,
  ingestBatchId = createIngestBatchId(),
): Promise<NormalizeDatasetResult> {
  const paths = getCatalogPaths(processedDataDir);
  const productFiles = await listCanonicalProductFiles(rawDataDir);
  const products: NormalizedProduct[] = [];
  const errors: string[] = [];

  for (const filePath of productFiles) {
    try {
      products.push(await normalizeProductFile(rawDataDir, ingestBatchId, filePath));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${getSourcePath(rawDataDir, filePath)}: ${message}`);
    }
  }

  const manifest: CatalogManifest = {
    ingest_batch_id: ingestBatchId,
    source_dataset: SOURCE_DATASET,
    source_version: SOURCE_VERSION,
    source_type: SOURCE_TYPE,
    data_version: DATA_VERSION,
    is_desensitized: true,
    source_path: SOURCE_DATASET,
    raw_item_count: productFiles.length,
    processed_item_count: products.length,
    error_count: errors.length,
    generated_at: new Date().toISOString(),
    normalized_output_path: "catalog/products.normalized.jsonl",
    errors,
  };

  return { products, manifest };
}

export async function writeNormalizedProducts(
  filePath: string,
  products: NormalizedProduct[],
): Promise<void> {
  const lines = products.map((product) => JSON.stringify(product));
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readNormalizedProducts(
  filePath: string,
): Promise<NormalizedProduct[]> {
  const raw = await readFile(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line) => JSON.parse(line) as NormalizedProduct);
}

function addIssue(issues: ValidationIssue[], issue: ValidationIssue): void {
  issues.push(issue);
}

function collectDuplicates(
  values: Array<{ value: string; sourcePath: string }>,
): DuplicateEntry[] {
  const seen = new Map<string, string[]>();

  for (const item of values) {
    const sourcePaths = seen.get(item.value) ?? [];
    sourcePaths.push(item.sourcePath);
    seen.set(item.value, sourcePaths);
  }

  return [...seen.entries()]
    .filter(([, sourcePaths]) => sourcePaths.length > 1)
    .map(([value, sourcePaths]) => ({
      value,
      source_paths: sourcePaths,
    }));
}

export function validateProducts(
  products: NormalizedProduct[],
  rawDataDir: string,
): { validationReport: ValidationReport; duplicateReport: DuplicateReport } {
  const issues: ValidationIssue[] = [];
  const productIds: Array<{ value: string; sourcePath: string }> = [];
  const skuIds: Array<{ value: string; sourcePath: string }> = [];

  for (const product of products) {
    const sourcePath = product.source.source_path;

    if (!product.product_id) {
      addIssue(issues, {
        severity: "error",
        code: "MISSING_PRODUCT_ID",
        message: "Product is missing product_id.",
        source_path: sourcePath,
      });
    } else {
      productIds.push({ value: product.product_id, sourcePath });
    }

    if (!product.name) {
      addIssue(issues, {
        severity: "error",
        code: "MISSING_NAME",
        message: "Product is missing name.",
        product_id: product.product_id,
        source_path: sourcePath,
      });
    }

    if (!product.category) {
      addIssue(issues, {
        severity: "error",
        code: "MISSING_CATEGORY",
        message: "Product is missing category.",
        product_id: product.product_id,
        source_path: sourcePath,
      });
    }

    if (!Number.isFinite(product.base_price) || product.base_price < 0) {
      addIssue(issues, {
        severity: "error",
        code: "INVALID_PRICE",
        message: "Product base_price must be a non-negative number.",
        product_id: product.product_id,
        source_path: sourcePath,
      });
    }

    if (!product.marketing_description) {
      addIssue(issues, {
        severity: "warning",
        code: "MISSING_MARKETING_DESCRIPTION",
        message: "Product is missing RAG marketing description.",
        product_id: product.product_id,
        source_path: sourcePath,
      });
    }

    if (product.skus.length === 0) {
      addIssue(issues, {
        severity: "warning",
        code: "MISSING_SKUS",
        message: "Product has no valid SKU records.",
        product_id: product.product_id,
        source_path: sourcePath,
      });
    }

    for (const sku of product.skus) {
      skuIds.push({ value: sku.sku_id, sourcePath });

      if (!Number.isFinite(sku.price) || sku.price < 0) {
        addIssue(issues, {
          severity: "error",
          code: "INVALID_SKU_PRICE",
          message: `SKU ${sku.sku_id} price must be a non-negative number.`,
          product_id: product.product_id,
          source_path: sourcePath,
        });
      }
    }

    if (product.image_path) {
      const imagePath = path.join(rawDataDir, SOURCE_DATASET, product.image_path);

      if (!existsSync(imagePath)) {
        addIssue(issues, {
          severity: "error",
          code: "MISSING_IMAGE",
          message: `Image file not found: ${product.image_path}`,
          product_id: product.product_id,
          source_path: sourcePath,
        });
      }
    }
  }

  const duplicateReport: DuplicateReport = {
    generated_at: new Date().toISOString(),
    duplicate_product_ids: collectDuplicates(productIds),
    duplicate_sku_ids: collectDuplicates(skuIds),
  };

  for (const duplicate of duplicateReport.duplicate_product_ids) {
    addIssue(issues, {
      severity: "error",
      code: "DUPLICATE_PRODUCT_ID",
      message: `Duplicate product_id: ${duplicate.value}`,
      product_id: duplicate.value,
      source_path: duplicate.source_paths.join(", "),
    });
  }

  for (const duplicate of duplicateReport.duplicate_sku_ids) {
    addIssue(issues, {
      severity: "error",
      code: "DUPLICATE_SKU_ID",
      message: `Duplicate sku_id: ${duplicate.value}`,
      source_path: duplicate.source_paths.join(", "),
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;

  const validationReport: ValidationReport = {
    generated_at: new Date().toISOString(),
    source_dataset: SOURCE_DATASET,
    source_version: SOURCE_VERSION,
    data_version: DATA_VERSION,
    item_count: products.length,
    valid_item_count: errorCount === 0 ? products.length : 0,
    error_count: errorCount,
    warning_count: warningCount,
    status: errorCount === 0 ? "valid" : "invalid",
    issues,
  };

  return { validationReport, duplicateReport };
}
