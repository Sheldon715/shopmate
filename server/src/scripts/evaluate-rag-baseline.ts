import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { createDatabasePool } from "../lib/db/pool";
import { getEnv } from "../lib/env";
import { QueryRewriteService } from "../modules/chat/query-rewrite.service";
import { createLlmLaneClients } from "../modules/llm/llm-lanes";
import { findActiveProductsByIds } from "../modules/products/product.repository";
import type { Product } from "../modules/products/product.types";
import {
  createRetrievalBaselineMarkdownReport,
  evaluateRetrievalBaseline,
  validateRetrievalBaselineCaseGroups,
} from "../modules/vector/retrieval-baseline-evaluation.service";
import type {
  RetrievalBaselineCaseGroup,
  RetrievalBaselineProductLookup,
  RetrievalBaselineQueryRewriter,
} from "../modules/vector/retrieval-baseline-evaluation.types";
import { VectorSearchService } from "../modules/vector/vector-search.service";
import type { RagWearingStyle } from "../modules/vector/rag-negative-fact-metadata";
import type { VectorSearchFilters } from "../modules/vector/vector-search.types";
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

interface EvaluateRagBaselineOptions {
  caseIds: string[];
  limit?: number;
  topK?: number;
  output?: string;
  traceOutput?: string;
  markdownReport?: string;
  rewrite: boolean;
}

interface VectorIndexManifest {
  collection_name: string;
  source_document_count: number;
  indexed_document_count: number;
}

const BASELINE_CASES_FILE = "retrieval-baseline-cases.json";
const BASELINE_RESULTS_FILE = "retrieval-baseline-results.jsonl";
const BASELINE_TRACES_FILE = "retrieval-baseline-traces.jsonl";
const BASELINE_MARKDOWN_REPORT = "rag-tuning-report.md";
const VECTOR_INDEX_MANIFEST_FILE = "vector-index-manifest.json";
const MIN_BASELINE_CASE_GROUPS = 20;
const MIN_BASELINE_QUERIES_PER_GROUP = 4;

function parseArgs(argv: string[]): EvaluateRagBaselineOptions {
  const options: EvaluateRagBaselineOptions = {
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

    if (arg.startsWith("--top-k=")) {
      options.topK = parsePositiveInteger(readText(arg, "--top-k="), "--top-k");
      continue;
    }

    if (arg === "--top-k") {
      options.topK = parsePositiveInteger(
        readNext(argv, index, "--top-k"),
        "--top-k",
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

    if (arg.startsWith("--trace-output=")) {
      options.traceOutput = readText(arg, "--trace-output=");
      continue;
    }

    if (arg === "--trace-output") {
      options.traceOutput = readNext(argv, index, "--trace-output");
      index += 1;
      continue;
    }

    if (arg.startsWith("--markdown-report=")) {
      options.markdownReport = readText(arg, "--markdown-report=");
      continue;
    }

    if (arg === "--markdown-report") {
      options.markdownReport = readNext(argv, index, "--markdown-report");
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

async function readBaselineCaseGroups(
  filePath: string,
): Promise<RetrievalBaselineCaseGroup[]> {
  const parsed: unknown = await readJsonFile(filePath);

  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }

  return parsed.map((item, index) => readBaselineCaseGroup(item, index));
}

function readBaselineCaseGroup(
  value: unknown,
  index: number,
): RetrievalBaselineCaseGroup {
  const record = requireRecord(value, `case group at index ${index}`);

  return {
    caseId: requireString(record.caseId, "caseId"),
    capability: requireCapability(record.capability, "capability"),
    queries: readStringArray(record.queries, "queries", {
      allowEmpty: false,
    }),
    filters: readFilters(record.filters),
    expectedProductIdsAny: readStringArray(
      record.expectedProductIdsAny,
      "expectedProductIdsAny",
      { allowEmpty: true },
    ),
    expectedCategory: optionalString(record.expectedCategory, "expectedCategory"),
    expectedSubCategory: optionalStringOrNull(
      record.expectedSubCategory,
      "expectedSubCategory",
    ),
    expectedNoResult: requireBoolean(record.expectedNoResult, "expectedNoResult"),
    forbidden: readForbidden(record.forbidden),
    notes: optionalString(record.notes, "notes"),
  };
}

function requireCapability(
  value: unknown,
  name: string,
): RetrievalBaselineCaseGroup["capability"] {
  if (
    value === "category_retrieval"
    || value === "budget_filter"
    || value === "negative_constraint"
    || value === "use_case"
    || value === "paraphrase_consistency"
    || value === "data_gap"
  ) {
    return value;
  }

  throw new Error(`${name} is invalid.`);
}

function readForbidden(
  value: unknown,
): RetrievalBaselineCaseGroup["forbidden"] {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, "forbidden");

  return {
    productIds: optionalStringArray(record.productIds, "forbidden.productIds"),
    brands: optionalStringArray(record.brands, "forbidden.brands"),
    riskTerms: optionalStringArray(record.riskTerms, "forbidden.riskTerms"),
    terms: optionalStringArray(record.terms, "forbidden.terms"),
    wearingStyles: optionalWearingStyleArray(
      record.wearingStyles,
      "forbidden.wearingStyles",
    ),
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
    minPriceCents: optionalNumber(record.minPriceCents, "filters.minPriceCents"),
    maxPriceCents: optionalNumber(record.maxPriceCents, "filters.maxPriceCents"),
    availableOnly: optionalBoolean(record.availableOnly, "filters.availableOnly"),
    tagsAny: optionalStringArray(record.tagsAny, "filters.tagsAny"),
    avoidTerms: optionalStringArray(record.avoidTerms, "filters.avoidTerms"),
    excludeRiskTerms: optionalStringArray(
      record.excludeRiskTerms,
      "filters.excludeRiskTerms",
    ),
    excludeWearingStyles: optionalWearingStyleArray(
      record.excludeWearingStyles,
      "filters.excludeWearingStyles",
    ),
    excludeBrands: optionalStringArray(
      record.excludeBrands,
      "filters.excludeBrands",
    ),
    excludeProductIds: optionalStringArray(
      record.excludeProductIds,
      "filters.excludeProductIds",
    ),
    excludeCategories: optionalStringArray(
      record.excludeCategories,
      "filters.excludeCategories",
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

function optionalString(value: unknown, name: string): string | undefined {
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

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean.`);
  }

  return value;
}

function optionalNumber(value: unknown, name: string): number | undefined {
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

function readStringArray(
  value: unknown,
  name: string,
  options: { allowEmpty?: boolean } = {},
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be a string array.`);
  }

  if (!options.allowEmpty && value.length === 0) {
    throw new Error(`${name} must be a non-empty string array.`);
  }

  return value.map((item) => requireString(item, name));
}

function optionalStringArray(value: unknown, name: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${name} must be a string array.`);
  }

  return value.map((item) => requireString(item, name));
}

function optionalWearingStyleArray(
  value: unknown,
  name: string,
): RagWearingStyle[] | undefined {
  const values = optionalStringArray(value, name);

  if (!values) {
    return undefined;
  }

  for (const item of values) {
    if (!["in_ear", "semi_in_ear", "open_ear", "over_ear"].includes(item)) {
      throw new Error(
        `${name} must contain only in_ear, semi_in_ear, open_ear, or over_ear.`,
      );
    }
  }

  return values as RagWearingStyle[];
}

function selectGroups(
  groups: RetrievalBaselineCaseGroup[],
  options: EvaluateRagBaselineOptions,
): RetrievalBaselineCaseGroup[] {
  const caseIds = new Set(options.caseIds);
  const filtered = caseIds.size === 0
    ? groups
    : groups.filter((group) => caseIds.has(group.caseId));

  for (const caseId of caseIds) {
    if (!groups.some((group) => group.caseId === caseId)) {
      throw new Error(`Unknown baseline case group: ${caseId}`);
    }
  }

  return options.limit === undefined
    ? filtered
    : filtered.slice(0, options.limit);
}

function createBaselineQueryRewriter(): RetrievalBaselineQueryRewriter {
  const laneClients = createLlmLaneClients();
  const queryRewriteService = new QueryRewriteService({
    llmClient: laneClients.decision,
  });

  return async (input) => {
    const result = await queryRewriteService.rewrite({
      question: input.query,
      baseRetrievalQuery: input.query,
      filters: input.filters,
      requestId: `rag-baseline:${input.caseId}`,
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
  fallbackPath: string,
): string {
  if (!output) {
    return fallbackPath;
  }

  return path.isAbsolute(output) ? output : path.resolve(process.cwd(), output);
}

function createProductLookup(pool: Pool): RetrievalBaselineProductLookup {
  const cachedProducts = new Map<string, Product>();
  const missingProductIds = new Set<string>();

  return async (productIds) => {
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
      const foundProductIds = new Set(foundProducts.map((product) => product.id));

      for (const product of foundProducts) {
        cachedProducts.set(product.id, product);
      }

      for (const productId of uncachedIds) {
        if (!foundProductIds.has(productId)) {
          missingProductIds.add(productId);
        }
      }
    }

    return uniqueIds.flatMap((productId) => {
      const product = cachedProducts.get(productId);
      return product ? [product] : [];
    });
  };
}

async function writeMarkdownReport(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export async function evaluateRagBaselineCommand(
  options = parseArgs(process.argv.slice(2)),
): Promise<number> {
  const env = getEnv();
  const groupsPath = path.join(env.ragDataDir, BASELINE_CASES_FILE);
  const outputPath = resolveOutputPath(
    options.output,
    path.join(env.ragDataDir, BASELINE_RESULTS_FILE),
  );
  const traceOutputPath = resolveOutputPath(
    options.traceOutput,
    path.join(env.ragDataDir, BASELINE_TRACES_FILE),
  );
  const markdownReportPath = resolveOutputPath(
    options.markdownReport,
    path.join(resolveProjectRootForDocs(), "docs", BASELINE_MARKDOWN_REPORT),
  );
  const indexCoverageNote = await readOptionalIndexCoverageNote(env.ragDataDir);
  const allGroups = await readBaselineCaseGroups(groupsPath);
  const groups = selectGroups(allGroups, options);
  const searchService = new VectorSearchService();
  const pool = createDatabasePool({ allowExitOnIdle: true });
  const productLookup = createProductLookup(pool);

  try {
    await validateRetrievalBaselineCaseGroups({
      groups: allGroups,
      minGroups: MIN_BASELINE_CASE_GROUPS,
      minQueriesPerGroup: MIN_BASELINE_QUERIES_PER_GROUP,
      productLookup,
    });

    const result = await evaluateRetrievalBaseline({
      groups,
      search: (input) => searchService.search(input),
      productLookup,
      queryRewriter: options.rewrite ? createBaselineQueryRewriter() : undefined,
      topK: options.topK,
    });

    if (indexCoverageNote) {
      for (const queryResult of result.queryResults) {
        queryResult.notes.push(indexCoverageNote);
      }

      for (const trace of result.traces) {
        trace.notes.push(indexCoverageNote);
      }
    }

    await writeJsonlFile(outputPath, result.queryResults);
    await writeJsonlFile(traceOutputPath, result.traces);
    await writeMarkdownReport(
      markdownReportPath,
      createRetrievalBaselineMarkdownReport(result, {
        resultJsonlPath: outputPath,
        traceJsonlPath: traceOutputPath,
      }),
    );

    const failedCount = result.queryResults.filter((item) => !item.passed).length;

    console.log(
      `Evaluated ${result.queryResults.length} query run(s) across ${result.groupResults.length} case group(s): ${result.queryResults.length - failedCount} passed, ${failedCount} failed.`,
    );
    if (indexCoverageNote) {
      console.warn(indexCoverageNote);
    }
    console.log(`Wrote ${outputPath}.`);
    console.log(`Wrote ${traceOutputPath}.`);
    console.log(`Wrote ${markdownReportPath}.`);

    return failedCount;
  } finally {
    await pool.end();
  }
}

function resolveProjectRootForDocs(): string {
  const cwd = process.cwd();

  return path.basename(cwd).toLowerCase() === "server"
    ? path.resolve(cwd, "..")
    : cwd;
}

if (require.main === module) {
  evaluateRagBaselineCommand()
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
