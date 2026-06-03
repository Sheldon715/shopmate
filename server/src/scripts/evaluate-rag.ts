import path from "node:path";
import type { Pool } from "pg";
import { createDatabasePool } from "../lib/db/pool";
import { getEnv } from "../lib/env";
import { findActiveProductsByIds } from "../modules/products/product.repository";
import type { Product } from "../modules/products/product.types";
import { QueryRewriteService } from "../modules/chat/query-rewrite.service";
import {
  evaluateVectorSearchCases,
} from "../modules/vector/vector-evaluation.service";
import type {
  VectorEvaluationCase,
  VectorEvaluationPassCriteria,
  VectorEvaluationProductLookup,
  VectorEvaluationProductSnapshot,
  VectorEvaluationQueryRewriter,
} from "../modules/vector/vector-evaluation.types";
import { VectorSearchService } from "../modules/vector/vector-search.service";
import type { VectorSearchFilters } from "../modules/vector/vector-search.types";
import { createLlmClient } from "../modules/llm/openai-compatible-chat.client";
import {
  parseCsv,
  parsePositiveInteger,
  readNext,
  readText,
} from "../utils/cli";
import {
  readJsonFile,
  writeJsonlFile,
} from "../utils/json-files";

interface EvaluateRagOptions {
  caseIds: string[];
  limit?: number;
  output?: string;
  rewrite: boolean;
}

interface VectorIndexManifest {
  collection_name: string;
  source_document_count: number;
  indexed_document_count: number;
}

const EVALUATION_CASES_FILE = "evaluation-cases.json";
const EVALUATION_RESULTS_FILE = "evaluation-results.jsonl";
const VECTOR_INDEX_MANIFEST_FILE = "vector-index-manifest.json";

function parseArgs(argv: string[]): EvaluateRagOptions {
  const options: EvaluateRagOptions = {
    caseIds: [],
    rewrite: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith("--case=")) {
      options.caseIds.push(...parseCsv(readText(arg, "--case=")));
      continue;
    }

    if (arg === "--case") {
      options.caseIds.push(...parseCsv(readNext(argv, index, "--case")));
      index += 1;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = parsePositiveInteger(readText(arg, "--limit="), "--limit");
      continue;
    }

    if (arg === "--limit") {
      options.limit = parsePositiveInteger(
        readNext(argv, index, "--limit"),
        "--limit",
      );
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = readText(arg, "--output=");
      continue;
    }

    if (arg === "--output") {
      options.output = readNext(argv, index, "--output");
      index += 1;
      continue;
    }

    if (arg === "--rewrite") {
      options.rewrite = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function createEvaluationQueryRewriter(): VectorEvaluationQueryRewriter {
  const queryRewriteService = new QueryRewriteService({
    llmClient: createLlmClient(),
  });

  return async (input) => {
    const result = await queryRewriteService.rewrite({
      question: input.query,
      baseRetrievalQuery: input.query,
      filters: input.filters,
      requestId: `rag-evaluate:${input.caseId}`,
    });

    return {
      query: result.query,
      baseQuery: result.baseQuery,
      rewrittenQuery: result.rewrittenQuery,
      status: result.status,
      reason: result.reason,
      fallbackReason: result.fallbackReason,
    };
  };
}

async function readEvaluationCases(
  filePath: string,
): Promise<VectorEvaluationCase[]> {
  const parsed: unknown = await readJsonFile(filePath);

  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }

  return parsed.map((item, index) => readEvaluationCase(item, index));
}

function readEvaluationCase(
  value: unknown,
  index: number,
): VectorEvaluationCase {
  const record = requireRecord(value, `case at index ${index}`);

  return {
    caseId: requireString(record.caseId, "caseId"),
    query: requireString(record.query, "query"),
    filters: readFilters(record.filters),
    expectedCategory: optionalString(record.expectedCategory, "expectedCategory"),
    expectedSubCategory: optionalStringOrNull(
      record.expectedSubCategory,
      "expectedSubCategory",
    ),
    expectedProductIdsAny: readStringArray(
      record.expectedProductIdsAny,
      "expectedProductIdsAny",
    ),
    expectedNoResult: requireBoolean(
      record.expectedNoResult,
      "expectedNoResult",
    ),
    passCriteria: readPassCriteria(record.passCriteria),
  };
}

function readFilters(value: unknown): VectorSearchFilters {
  const record = value === undefined
    ? {}
    : requireRecord(value, "filters");

  return {
    category: optionalString(record.category, "filters.category"),
    subCategory: optionalString(record.subCategory, "filters.subCategory"),
    brand: optionalString(record.brand, "filters.brand"),
    minPriceCents: optionalNumber(
      record.minPriceCents,
      "filters.minPriceCents",
    ),
    maxPriceCents: optionalNumber(
      record.maxPriceCents,
      "filters.maxPriceCents",
    ),
    availableOnly: optionalBoolean(
      record.availableOnly,
      "filters.availableOnly",
    ),
    tagsAny: optionalStringArray(record.tagsAny, "filters.tagsAny"),
    avoidTerms: optionalStringArray(record.avoidTerms, "filters.avoidTerms"),
  };
}

function readPassCriteria(value: unknown): VectorEvaluationPassCriteria {
  const record = requireRecord(value, "passCriteria");

  return {
    description: requireString(record.description, "passCriteria.description"),
    minMatchingHits: optionalNumber(
      record.minMatchingHits,
      "passCriteria.minMatchingHits",
    ),
    requireExpectedProductId: optionalBoolean(
      record.requireExpectedProductId,
      "passCriteria.requireExpectedProductId",
    ),
  };
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalString(
  value: unknown,
  name: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalStringOrNull(
  value: unknown,
  name: string,
): string | null | undefined {
  if (value === null) {
    return null;
  }

  return optionalString(value, name);
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean.`);
  }

  return value;
}

function optionalBoolean(
  value: unknown,
  name: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean.`);
  }

  return value;
}

function optionalNumber(
  value: unknown,
  name: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return value;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number.`);
  }

  return value;
}

function readStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be a string array.`);
  }

  return value.map((item) => requireString(item, name));
}

function optionalStringArray(
  value: unknown,
  name: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readStringArray(value, name);
}

function selectCases(
  cases: VectorEvaluationCase[],
  options: EvaluateRagOptions,
): VectorEvaluationCase[] {
  const caseIds = new Set(options.caseIds);
  const filtered = caseIds.size === 0
    ? cases
    : cases.filter((evaluationCase) => caseIds.has(evaluationCase.caseId));

  for (const caseId of caseIds) {
    if (!cases.some((evaluationCase) => evaluationCase.caseId === caseId)) {
      throw new Error(`Unknown evaluation case: ${caseId}`);
    }
  }

  return options.limit === undefined
    ? filtered
    : filtered.slice(0, options.limit);
}

async function readOptionalIndexCoverageNote(
  ragDataDir: string,
): Promise<string | undefined> {
  try {
    const manifest = readVectorIndexManifest(
      await readJsonFile(path.join(ragDataDir, VECTOR_INDEX_MANIFEST_FILE)),
    );

    if (manifest.indexed_document_count >= manifest.source_document_count) {
      return undefined;
    }

    return `Current vector index manifest shows ${manifest.indexed_document_count}/${manifest.source_document_count} documents indexed in ${manifest.collection_name}; refresh index coverage before judging retrieval quality.`;
  } catch {
    return undefined;
  }
}

function readVectorIndexManifest(value: unknown): VectorIndexManifest {
  const record = requireRecord(value, VECTOR_INDEX_MANIFEST_FILE);

  return {
    collection_name: requireString(record.collection_name, "collection_name"),
    source_document_count: requireNumber(
      record.source_document_count,
      "source_document_count",
    ),
    indexed_document_count: requireNumber(
      record.indexed_document_count,
      "indexed_document_count",
    ),
  };
}

function resolveOutputPath(
  output: string | undefined,
  ragDataDir: string,
): string {
  if (!output) {
    return path.join(ragDataDir, EVALUATION_RESULTS_FILE);
  }

  return path.isAbsolute(output) ? output : path.resolve(process.cwd(), output);
}

function createProductLookup(pool: Pool): VectorEvaluationProductLookup {
  const cachedProducts = new Map<string, VectorEvaluationProductSnapshot>();
  const missingProductIds = new Set<string>();

  return async (productIds) => {
    const products = new Map<string, VectorEvaluationProductSnapshot>();
    const uniqueIds = [...new Set(
      productIds
        .map((productId) => productId.trim())
        .filter((productId) => productId.length > 0),
    )];
    const uncachedIds = uniqueIds.filter(
      (productId) =>
        !cachedProducts.has(productId) && !missingProductIds.has(productId),
    );

    if (uncachedIds.length > 0) {
      const foundProducts = await findActiveProductsByIds(pool, uncachedIds);
      const foundProductIds = new Set<string>();

      for (const product of foundProducts) {
        foundProductIds.add(product.id);
        cachedProducts.set(product.id, mapProductToSnapshot(product));
      }

      for (const productId of uncachedIds) {
        if (!foundProductIds.has(productId)) {
          missingProductIds.add(productId);
        }
      }
    }

    for (const productId of uniqueIds) {
      const cachedProduct = cachedProducts.get(productId);

      if (cachedProduct) {
        products.set(productId, cachedProduct);
      }
    }

    return products;
  };
}

function mapProductToSnapshot(product: Product): VectorEvaluationProductSnapshot {
  return {
    productId: product.id,
    status: product.status,
    name: product.name,
    brand: product.brand,
    category: product.category,
    subCategory: product.subCategory,
    tags: product.visualTags,
    recommendWhen: product.recommendWhen,
    avoidWhen: product.avoidWhen,
    pros: product.pros,
    cons: product.cons,
    attributes: product.attributes,
    marketingDescription: product.marketingDescription,
    knowledgeText: product.knowledgeText,
    reviewSummary: product.reviewSummary,
    contentBlocks: product.contentBlocks,
    officialFaq: product.officialFaq,
    userReviews: product.userReviews,
    priceMinCents: product.priceMinCents,
    priceMaxCents: product.priceMaxCents,
    available: product.skus.length === 0
      ? product.status === "active"
      : product.skus.some((sku) => sku.available),
  };
}

export async function evaluateRagCommand(
  options = parseArgs(process.argv.slice(2)),
): Promise<number> {
  const env = getEnv();
  const casesPath = path.join(env.ragDataDir, EVALUATION_CASES_FILE);
  const outputPath = resolveOutputPath(options.output, env.ragDataDir);
  const indexCoverageNote = await readOptionalIndexCoverageNote(env.ragDataDir);
  const cases = selectCases(await readEvaluationCases(casesPath), options);
  const searchService = new VectorSearchService();
  const pool = createDatabasePool({ allowExitOnIdle: true });

  try {
    const results = await evaluateVectorSearchCases({
      cases,
      search: (input) => searchService.search(input),
      queryRewriter: options.rewrite
        ? createEvaluationQueryRewriter()
        : undefined,
      productLookup: createProductLookup(pool),
    });

    if (indexCoverageNote) {
      for (const result of results) {
        result.notes.push(indexCoverageNote);
      }
    }

    const failedCount = results.filter((result) => !result.passed).length;

    await writeJsonlFile(outputPath, results);

    console.log(
      `Evaluated ${results.length} case(s): ${results.length - failedCount} passed, ${failedCount} failed.`,
    );
    if (indexCoverageNote) {
      console.warn(indexCoverageNote);
    }
    console.log(`Wrote ${outputPath}.`);

    return failedCount;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  evaluateRagCommand()
    .then((failedCount) => {
      if (failedCount > 0) {
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
