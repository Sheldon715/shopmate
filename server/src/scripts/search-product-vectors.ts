import { getEnv } from "../lib/env";
import { VectorSearchService } from "../modules/vector/vector-search.service";
import type { VectorSearchFilters } from "../modules/vector/vector-search.types";
import {
  parseCsv,
  parsePositiveInteger,
  readNext,
  readText,
} from "../utils/cli";

interface SearchProductVectorsOptions {
  query: string;
  filters: VectorSearchFilters;
  topK?: number;
}

function parseArgs(argv: string[]): SearchProductVectorsOptions {
  const options: SearchProductVectorsOptions = {
    query: "",
    filters: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith("--query=")) {
      options.query = arg.slice("--query=".length);
      continue;
    }

    if (arg === "--query") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error("--query requires text.");
      }

      options.query = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--category=")) {
      options.filters.category = readText(arg, "--category=");
      continue;
    }

    if (arg === "--category") {
      options.filters.category = readNext(argv, index, "--category");
      index += 1;
      continue;
    }

    if (arg.startsWith("--sub-category=")) {
      options.filters.subCategory = readText(arg, "--sub-category=");
      continue;
    }

    if (arg === "--sub-category") {
      options.filters.subCategory = readNext(argv, index, "--sub-category");
      index += 1;
      continue;
    }

    if (arg.startsWith("--brand=")) {
      options.filters.brand = readText(arg, "--brand=");
      continue;
    }

    if (arg === "--brand") {
      options.filters.brand = readNext(argv, index, "--brand");
      index += 1;
      continue;
    }

    if (arg.startsWith("--min-price-cents=")) {
      options.filters.minPriceCents = parsePositiveInteger(
        readText(arg, "--min-price-cents="),
        "--min-price-cents",
      );
      continue;
    }

    if (arg === "--min-price-cents") {
      options.filters.minPriceCents = parsePositiveInteger(
        readNext(argv, index, "--min-price-cents"),
        "--min-price-cents",
      );
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-price-cents=")) {
      options.filters.maxPriceCents = parsePositiveInteger(
        readText(arg, "--max-price-cents="),
        "--max-price-cents",
      );
      continue;
    }

    if (arg === "--max-price-cents") {
      options.filters.maxPriceCents = parsePositiveInteger(
        readNext(argv, index, "--max-price-cents"),
        "--max-price-cents",
      );
      index += 1;
      continue;
    }

    if (arg === "--include-unavailable") {
      options.filters.availableOnly = false;
      continue;
    }

    if (arg.startsWith("--tags-any=")) {
      options.filters.tagsAny = parseCsv(readText(arg, "--tags-any="));
      continue;
    }

    if (arg === "--tags-any") {
      options.filters.tagsAny = parseCsv(readNext(argv, index, "--tags-any"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--avoid-terms=")) {
      options.filters.avoidTerms = parseCsv(readText(arg, "--avoid-terms="));
      continue;
    }

    if (arg === "--avoid-terms") {
      options.filters.avoidTerms = parseCsv(
        readNext(argv, index, "--avoid-terms"),
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

    throw new Error(`Unknown option: ${arg}`);
  }

  if (options.query.trim().length === 0) {
    throw new Error("--query is required.");
  }

  return options;
}

export async function searchProductVectorsCommand(
  options = parseArgs(process.argv.slice(2)),
): Promise<void> {
  const env = getEnv();
  const service = new VectorSearchService();
  const hits = await service.search({
    query: options.query,
    filters: options.filters,
    topK: options.topK ?? env.ragTopK,
  });

  console.log(
    JSON.stringify(
      hits.map((hit) => ({
        doc_id: hit.docId,
        product_id: hit.productId,
        score: hit.score,
        snippet: hit.snippet,
      })),
      null,
      2,
    ),
  );
}

if (require.main === module) {
  searchProductVectorsCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
