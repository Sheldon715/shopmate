import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv, resolveProjectRoot } from "../lib/env";
import { ImageVectorSearchService } from "../modules/vector/image-vector-search.service";
import type {
  ImageSearchEvaluationCase,
  ImageSearchEvaluationResult,
} from "../modules/image-search/image-search-evaluation.types";
import { readNext, readText } from "../utils/cli";
import {
  readJsonFile,
  readJsonlFile,
  writeJsonlFile,
} from "../utils/json-files";

interface RunImageVectorEvaluationOptions {
  cases?: string;
  v1Results?: string;
  output?: string;
  report?: string;
  limit?: number;
  dryRun?: boolean;
}

interface ImageVectorEvaluationResult {
  caseId: string;
  runAt: string;
  runStatus: "needs_review" | "skipped" | "failed";
  imageSearchMode: "image_vector";
  comparedAgainst: "vlm_first";
  v1ReturnedProductIds: string[];
  v2ReturnedProductIds: string[];
  winLossTie: "win" | "loss" | "tie" | "needs_review" | "skipped";
  failureReason?: string;
  timing: {
    imageVectorSearchMs: number;
    totalMs: number;
  };
  notes: string[];
}

interface ImageInput {
  buffer: Buffer;
  mimeType: string;
}

const IMAGE_EVALUATION_CASES_FILE = "image-evaluation-cases.json";
const IMAGE_EVALUATION_RESULTS_FILE = "image-evaluation-results.jsonl";
const IMAGE_VECTOR_EVALUATION_RESULTS_FILE = "image-vector-evaluation-results.jsonl";
const IMAGE_VECTOR_EVALUATION_REPORT_FILE = "image-vector-search-evaluation-report.md";

const DEMO_PRODUCT_IMAGES = new Map<string, string>([
  ["demo:earbuds_main", "digital/images/p_digital_007_main.jpg"],
  ["demo:sunscreen_bottle", "beauty/images/p_beauty_006_main.jpg"],
  ["demo:commute_clothes_style", "clothes/images/p_clothes_001_main.jpg"],
  ["demo:small_home_appliance", "home_appliance/images/p_home_air_004_main.jpg"],
  ["demo:weak_brand_package", "beauty/images/p_beauty_023_main.jpg"],
]);

function parseArgs(argv: string[]): RunImageVectorEvaluationOptions {
  const options: RunImageVectorEvaluationOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--cases=")) {
      options.cases = readText(arg, "--cases=");
      continue;
    }

    if (arg === "--cases") {
      options.cases = readNext(argv, index, "--cases");
      index += 1;
      continue;
    }

    if (arg.startsWith("--v1-results=")) {
      options.v1Results = readText(arg, "--v1-results=");
      continue;
    }

    if (arg === "--v1-results") {
      options.v1Results = readNext(argv, index, "--v1-results");
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

    if (arg.startsWith("--report=")) {
      options.report = readText(arg, "--report=");
      continue;
    }

    if (arg === "--report") {
      options.report = readNext(argv, index, "--report");
      index += 1;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = readPositiveInteger(readText(arg, "--limit="), "--limit");
      continue;
    }

    if (arg === "--limit") {
      options.limit = readPositiveInteger(readNext(argv, index, "--limit"), "--limit");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function readPositiveInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function resolvePath(filePath: string | undefined, fallback: string): string {
  if (!filePath) {
    return fallback;
  }

  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

async function readImageInput(
  imageRef: string,
  staticImageRoot: string,
): Promise<ImageInput | null> {
  const productImagePath = DEMO_PRODUCT_IMAGES.get(imageRef);

  if (!productImagePath) {
    return null;
  }

  return {
    buffer: await readFile(path.join(staticImageRoot, productImagePath)),
    mimeType: "image/jpeg",
  };
}

async function runSingleCase(input: {
  evaluationCase: ImageSearchEvaluationCase;
  v1Result: ImageSearchEvaluationResult | undefined;
  service: ImageVectorSearchService;
  staticImageRoot: string;
  dryRun: boolean;
  imageEmbeddingProvider: string;
}): Promise<ImageVectorEvaluationResult> {
  const startedAt = performance.now();
  const v1ProductIds = input.v1Result?.returnedProductIds ?? [];

  if (!shouldRunImageVectorCase(input.v1Result)) {
    return createSkippedResult({
      caseId: input.evaluationCase.caseId,
      startedAt,
      v1ProductIds,
      reason: "v1_result_not_product_search",
    });
  }

  const image = await readImageInput(
    input.evaluationCase.imageRef,
    input.staticImageRoot,
  );

  if (!image) {
    return createSkippedResult({
      caseId: input.evaluationCase.caseId,
      startedAt,
      v1ProductIds,
      reason: "no_low_sensitivity_demo_image_for_v2",
    });
  }

  if (input.dryRun || input.imageEmbeddingProvider === "disabled") {
    return createSkippedResult({
      caseId: input.evaluationCase.caseId,
      startedAt,
      v1ProductIds,
      reason: input.dryRun
        ? "dry_run"
        : "image_embedding_provider_disabled",
    });
  }

  try {
    const searchStartedAt = performance.now();
    const result = await input.service.search({
      image,
      filters: input.v1Result?.filters ?? undefined,
      topK: 3,
    });
    const v2ProductIds = result.hits.map((hit) => hit.productId);

    return {
      caseId: input.evaluationCase.caseId,
      runAt: new Date().toISOString(),
      runStatus: "needs_review",
      imageSearchMode: "image_vector",
      comparedAgainst: "vlm_first",
      v1ReturnedProductIds: v1ProductIds,
      v2ReturnedProductIds: v2ProductIds,
      winLossTie: classifyWinLossTie(v1ProductIds, v2ProductIds),
      timing: {
        imageVectorSearchMs: elapsedMs(searchStartedAt),
        totalMs: elapsedMs(startedAt),
      },
      notes: [
        `Dropped stale product ids: ${result.droppedProductIds.join(", ") || "none"}`,
      ],
    };
  } catch (error) {
    return {
      caseId: input.evaluationCase.caseId,
      runAt: new Date().toISOString(),
      runStatus: "failed",
      imageSearchMode: "image_vector",
      comparedAgainst: "vlm_first",
      v1ReturnedProductIds: v1ProductIds,
      v2ReturnedProductIds: [],
      winLossTie: "needs_review",
      failureReason: readSafeErrorCode(error),
      timing: {
        imageVectorSearchMs: 0,
        totalMs: elapsedMs(startedAt),
      },
      notes: ["Image vector evaluation failed; see failureReason."],
    };
  }
}

function shouldRunImageVectorCase(
  result: ImageSearchEvaluationResult | undefined,
): boolean {
  return Boolean(
    result
      && result.visualIntent?.is_product_search
      && result.visualIntent.confidence !== "low"
      && result.chatMessage,
  );
}

function createSkippedResult(input: {
  caseId: string;
  startedAt: number;
  v1ProductIds: string[];
  reason: string;
}): ImageVectorEvaluationResult {
  return {
    caseId: input.caseId,
    runAt: new Date().toISOString(),
    runStatus: "skipped",
    imageSearchMode: "image_vector",
    comparedAgainst: "vlm_first",
    v1ReturnedProductIds: input.v1ProductIds,
    v2ReturnedProductIds: [],
    winLossTie: "skipped",
    failureReason: input.reason,
    timing: {
      imageVectorSearchMs: 0,
      totalMs: elapsedMs(input.startedAt),
    },
    notes: ["V2 image vector evaluation skipped for this case."],
  };
}

function classifyWinLossTie(
  v1ProductIds: string[],
  v2ProductIds: string[],
): ImageVectorEvaluationResult["winLossTie"] {
  if (v2ProductIds.length === 0) {
    return v1ProductIds.length === 0 ? "tie" : "loss";
  }

  if (v1ProductIds.length === 0) {
    return "win";
  }

  const v1First = v1ProductIds[0];
  const v2First = v2ProductIds[0];

  return v1First === v2First ? "tie" : "needs_review";
}

function createReport(results: ImageVectorEvaluationResult[]): string {
  const counts = countStatuses(results);
  const rows = results.map((result) =>
    `| \`${result.caseId}\` | ${result.runStatus} | ${result.winLossTie} | ${formatProductIds(result.v1ReturnedProductIds)} | ${formatProductIds(result.v2ReturnedProductIds)} | ${result.failureReason ?? ""} |`
  );

  return [
    "# 图片找货 V2 图片向量评估报告",
    "",
    "## 当前结论",
    "",
    `本次生成 ${results.length} 条 V2 对比记录：needs_review ${counts.needs_review}，failed ${counts.failed}，skipped ${counts.skipped}。`,
    "",
    "V2 结果只比较 image vector returned product ids 与 V1 VLM-first returned product ids；是否真正 win / loss 仍需要人工结合图片相似度和商品事实判断。",
    "",
    "## 结果明细",
    "",
    "| caseId | 状态 | win/loss/tie | V1 returned ids | V2 returned ids | failureReason |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function countStatuses(results: ImageVectorEvaluationResult[]): {
  needs_review: number;
  failed: number;
  skipped: number;
} {
  return results.reduce(
    (counts, result) => ({
      ...counts,
      [result.runStatus]: counts[result.runStatus] + 1,
    }),
    { needs_review: 0, failed: 0, skipped: 0 },
  );
}

function formatProductIds(productIds: string[]): string {
  return productIds.length > 0
    ? productIds.map((productId) => `\`${productId}\``).join(", ")
    : "";
}

async function writeMarkdownFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export async function runImageVectorSearchEvaluationCommand(
  options = parseArgs(process.argv.slice(2)),
): Promise<void> {
  const env = getEnv();
  const projectRoot = resolveProjectRoot();
  const casesPath = resolvePath(
    options.cases,
    path.join(env.ragDataDir, IMAGE_EVALUATION_CASES_FILE),
  );
  const v1ResultsPath = resolvePath(
    options.v1Results,
    path.join(env.ragDataDir, IMAGE_EVALUATION_RESULTS_FILE),
  );
  const outputPath = resolvePath(
    options.output,
    path.join(env.ragDataDir, IMAGE_VECTOR_EVALUATION_RESULTS_FILE),
  );
  const reportPath = resolvePath(
    options.report,
    path.join(projectRoot, "docs", IMAGE_VECTOR_EVALUATION_REPORT_FILE),
  );
  const allCases = await readJsonFile<ImageSearchEvaluationCase[]>(casesPath);
  const cases = options.limit ? allCases.slice(0, options.limit) : allCases;
  const v1Results = await readJsonlFile<ImageSearchEvaluationResult>(v1ResultsPath);
  const v1ResultsByCaseId = new Map(
    v1Results.map((result) => [result.caseId, result]),
  );
  const service = new ImageVectorSearchService();
  const results: ImageVectorEvaluationResult[] = [];

  for (const evaluationCase of cases) {
    console.log(`Running V2 image vector evaluation ${evaluationCase.caseId}...`);
    results.push(
      await runSingleCase({
        evaluationCase,
        v1Result: v1ResultsByCaseId.get(evaluationCase.caseId),
        service,
        staticImageRoot: env.staticImageRoot,
        dryRun: options.dryRun ?? false,
        imageEmbeddingProvider: env.imageEmbeddingProvider,
      }),
    );
  }

  await writeJsonlFile(outputPath, results);
  await writeMarkdownFile(reportPath, createReport(results));

  console.log(`Wrote ${outputPath}.`);
  console.log(`Wrote ${reportPath}.`);
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function readSafeErrorCode(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: unknown }).code;

    return typeof code === "string" ? code : error.name;
  }

  return error instanceof Error ? error.name : "unknown";
}

if (require.main === module) {
  runImageVectorSearchEvaluationCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
