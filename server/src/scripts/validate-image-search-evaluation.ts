import path from "node:path";
import { getEnv } from "../lib/env";
import {
  validateImageSearchEvaluationCases,
  validateImageSearchEvaluationResults,
} from "../modules/image-search/image-search-evaluation.validation";
import { readNext, readText } from "../utils/cli";
import { readJsonFile, readJsonlFile } from "../utils/json-files";

interface ValidateImageSearchEvaluationOptions {
  cases?: string;
  results?: string;
}

const IMAGE_EVALUATION_CASES_FILE = "image-evaluation-cases.json";
const IMAGE_EVALUATION_RESULTS_FILE = "image-evaluation-results.jsonl";

function parseArgs(argv: string[]): ValidateImageSearchEvaluationOptions {
  const options: ValidateImageSearchEvaluationOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith("--cases=")) {
      options.cases = readText(arg, "--cases=");
      continue;
    }

    if (arg === "--cases") {
      options.cases = readNext(argv, index, "--cases");
      index += 1;
      continue;
    }

    if (arg.startsWith("--results=")) {
      options.results = readText(arg, "--results=");
      continue;
    }

    if (arg === "--results") {
      options.results = readNext(argv, index, "--results");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function resolvePath(filePath: string | undefined, fallback: string): string {
  if (!filePath) {
    return fallback;
  }

  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

export async function validateImageSearchEvaluationCommand(
  options = parseArgs(process.argv.slice(2)),
): Promise<void> {
  const env = getEnv();
  const casesPath = resolvePath(
    options.cases,
    path.join(env.ragDataDir, IMAGE_EVALUATION_CASES_FILE),
  );
  const resultsPath = resolvePath(
    options.results,
    path.join(env.ragDataDir, IMAGE_EVALUATION_RESULTS_FILE),
  );
  const cases = validateImageSearchEvaluationCases(
    await readJsonFile(casesPath),
  );
  const results = validateImageSearchEvaluationResults(
    await readJsonlFile(resultsPath),
    cases,
  );

  console.log(
    `Validated ${cases.length} image-search evaluation case(s) from ${casesPath}.`,
  );
  console.log(
    `Validated ${results.length} image-search evaluation result record(s) from ${resultsPath}.`,
  );
}

if (require.main === module) {
  validateImageSearchEvaluationCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
