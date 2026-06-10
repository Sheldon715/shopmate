import path from "node:path";
import { getEnv } from "../../lib/env";
import {
  createLlmLaneMetadata,
  type LlmLaneMetadata,
  type LlmLaneModelMetadata,
} from "../llm/llm-lanes";
import { readJsonFile } from "../../utils/json-files";
import type { PopularQueryCacheVersions } from "./popular-query-cache.service";

export interface PopularQueryCacheVersionReader {
  read(): Promise<PopularQueryCacheVersions>;
}

interface RagDocumentManifest {
  ingest_batch_id?: unknown;
  data_version?: unknown;
  generated_at?: unknown;
}

interface VectorIndexManifest {
  embedding_model?: unknown;
  embedding_dimensions?: unknown;
  ingest_batch_id?: unknown;
  generated_at?: unknown;
}

const RAG_CHAT_PROMPT_VERSION = "rag-chat-v1";
const DOCUMENT_MANIFEST_FILE = "document-manifest.json";
const VECTOR_INDEX_MANIFEST_FILE = "vector-index-manifest.json";

export class PopularQueryCacheVersionService
  implements PopularQueryCacheVersionReader {
  async read(): Promise<PopularQueryCacheVersions> {
    const env = getEnv();
    const [documentManifest, vectorManifest] = await Promise.all([
      readOptionalJson<RagDocumentManifest>(
        path.join(env.ragDataDir, DOCUMENT_MANIFEST_FILE),
      ),
      readOptionalJson<VectorIndexManifest>(
        path.join(env.ragDataDir, VECTOR_INDEX_MANIFEST_FILE),
      ),
    ]);

    const llmLanes = createLlmLaneMetadata();

    return {
      modelVersion: buildPopularQueryModelVersion(llmLanes),
      promptVersion: RAG_CHAT_PROMPT_VERSION,
      dataVersion: buildPopularQueryDataVersion(
        documentManifest,
        vectorManifest,
      ),
      visibleBoundary: buildVisibleBoundary(env.publicImageBaseUrl),
    };
  }
}

export function buildPopularQueryModelVersion(llm: LlmLaneMetadata): string {
  return [
    formatLlmLaneModel("decision", llm.decisionPrimary),
    llm.decisionFallback
      ? formatLlmLaneModel("fallback", llm.decisionFallback)
      : "fallback=none",
    formatLlmLaneModel("answer", llm.answer),
  ].join("|");
}

export function buildPopularQueryDataVersion(
  documentManifest: RagDocumentManifest | undefined,
  vectorManifest: VectorIndexManifest | undefined,
): string {
  if (!documentManifest || !vectorManifest) {
    return "";
  }

  const parts = [
    stringValue(documentManifest?.data_version),
    stringValue(documentManifest?.ingest_batch_id),
    stringValue(documentManifest?.generated_at),
    stringValue(vectorManifest?.embedding_model),
    stringValue(vectorManifest?.embedding_dimensions),
    stringValue(vectorManifest?.ingest_batch_id),
    stringValue(vectorManifest?.generated_at),
  ].filter((part) => part.length > 0);

  return parts.join("|");
}

function buildVisibleBoundary(publicImageBaseUrl: string | undefined): string {
  return [
    "locale=zh-CN",
    "currency=CNY",
    `imageBase=${publicImageBaseUrl ?? "relative"}`,
  ].join("|");
}

function formatLlmLaneModel(
  label: string,
  lane: LlmLaneModelMetadata,
): string {
  const provider = sanitizeVersionPart(lane.provider) || "unknown-provider";
  const model = sanitizeVersionPart(lane.model) || "llm-disabled";
  const state = lane.enabled ? "on" : "off";

  return `${label}=${provider}/${model}/${state}`;
}

function sanitizeVersionPart(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/[|=/\s]+/gu, "-");
}

function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

async function readOptionalJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return undefined;
  }
}
