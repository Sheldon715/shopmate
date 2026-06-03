import type {
  QdrantDocumentPayload,
  QdrantCondition,
  QdrantFilter,
  QdrantScoredPoint,
} from "./qdrant.types";
import {
  buildNegativeFactVectorFilters,
  type RagWearingStyle,
} from "./rag-negative-fact-metadata";
import type { VectorSearchFilters, VectorSearchHit } from "./vector-search.types";
import { VectorSearchError } from "./vector-search.error";

export function buildQdrantFilter(
  filters: VectorSearchFilters = {},
): QdrantFilter {
  const must: QdrantCondition[] = [
    exactMatch("status", "active"),
  ];
  const mustNot: QdrantCondition[] = [];

  if (filters.availableOnly !== false) {
    must.push(exactMatch("available", true));
  }

  if (filters.category) {
    must.push(exactMatch("category", filters.category));
  }

  if (filters.subCategory) {
    must.push(exactMatch("sub_category", filters.subCategory));
  }

  if (filters.brand) {
    must.push(exactMatch("brand", filters.brand));
  }

  if (filters.maxPriceCents !== undefined) {
    must.push({
      key: "price_min_cents",
      range: { lte: filters.maxPriceCents },
    });
  }

  if (filters.minPriceCents !== undefined) {
    must.push({
      key: "price_max_cents",
      range: { gte: filters.minPriceCents },
    });
  }

  const tagsAny = nonEmptyStrings(filters.tagsAny);

  if (tagsAny.length > 0) {
    must.push(matchAny("tags", tagsAny));
  }

  const avoidTerms = nonEmptyStrings(filters.avoidTerms);

  if (avoidTerms.length > 0) {
    mustNot.push(matchAny("brand", avoidTerms));
    mustNot.push(matchAny("tags", avoidTerms));
    mustNot.push(matchAny("avoid_when", avoidTerms));
  }

  const avoidTermFactFilters = buildNegativeFactVectorFilters(avoidTerms);
  const excludeRiskTerms = nonEmptyStrings([
    ...(filters.excludeRiskTerms ?? []),
    ...avoidTermFactFilters.excludeRiskTerms,
  ]);

  if (excludeRiskTerms.length > 0) {
    mustNot.push(matchAny("risk_terms", excludeRiskTerms));
  }

  const excludeWearingStyles = nonEmptyStrings([
    ...(filters.excludeWearingStyles ?? []),
    ...avoidTermFactFilters.excludeWearingStyles,
  ]);

  if (excludeWearingStyles.length > 0) {
    mustNot.push(matchAny("wearing_styles", excludeWearingStyles));
  }

  const excludeBrands = nonEmptyStrings(filters.excludeBrands);

  if (excludeBrands.length > 0) {
    mustNot.push(matchAny("brand", excludeBrands));
  }

  const excludeProductIds = nonEmptyStrings(filters.excludeProductIds);

  if (excludeProductIds.length > 0) {
    mustNot.push(matchAny("product_id", excludeProductIds));
  }

  const excludeCategories = nonEmptyStrings(filters.excludeCategories);

  if (excludeCategories.length > 0) {
    mustNot.push(matchAny("category", excludeCategories));
    mustNot.push(matchAny("sub_category", excludeCategories));
  }

  return mustNot.length > 0 ? { must, must_not: mustNot } : { must };
}

export function mapQdrantScoredPointToVectorSearchHit(
  point: QdrantScoredPoint,
): VectorSearchHit {
  const payload = normalizePayload(point.payload);

  return {
    docId: payload.doc_id,
    productId: payload.product_id,
    score: point.score,
    snippet: payload.snippet,
    metadata: {
      docType: payload.doc_type,
      category: payload.category,
      subCategory: payload.sub_category ?? null,
      brand: payload.brand,
      tags: payload.tags,
      recommendWhen: payload.recommend_when,
      avoidWhen: payload.avoid_when,
      freeFromTerms: payload.free_from_terms,
      riskTerms: payload.risk_terms,
      wearingStyles: payload.wearing_styles,
      blockType: payload.block_type ?? null,
      priceMinCents: payload.price_min_cents,
      priceMaxCents: payload.price_max_cents,
      available: payload.available,
      embeddingModel: payload.embedding_model,
      embeddingDimensions: payload.embedding_dimensions,
      ingestBatchId: payload.ingest_batch_id,
    },
  };
}

function exactMatch(
  key: string,
  value: string | number | boolean,
): QdrantCondition {
  return {
    key,
    match: { value },
  };
}

function matchAny(key: string, values: string[]): QdrantCondition {
  return {
    key,
    match: { any: values },
  };
}

function nonEmptyStrings(values: string[] | undefined): string[] {
  return values
    ? values.map((value) => value.trim()).filter((value) => value.length > 0)
    : [];
}

function normalizePayload(payload: QdrantScoredPoint["payload"]): QdrantDocumentPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new VectorSearchError("Qdrant hit is missing payload.");
  }

  const record = payload as Record<string, unknown>;

  return {
    doc_id: requireString(record, "doc_id"),
    product_id: requireString(record, "product_id"),
    doc_type: requireString(record, "doc_type"),
    status: requireString(record, "status"),
    category: requireString(record, "category"),
    sub_category: optionalString(record, "sub_category"),
    brand: requireString(record, "brand"),
    tags: requireStringArray(record, "tags"),
    recommend_when: requireStringArray(record, "recommend_when"),
    avoid_when: requireStringArray(record, "avoid_when"),
    free_from_terms: requireStringArray(record, "free_from_terms"),
    risk_terms: requireStringArray(record, "risk_terms"),
    wearing_styles: requireWearingStyleArray(record, "wearing_styles"),
    block_type: optionalString(record, "block_type"),
    ingest_batch_id: requireString(record, "ingest_batch_id"),
    embedding_model: requireString(record, "embedding_model"),
    embedding_dimensions: requireNumber(record, "embedding_dimensions"),
    document_hash: requireString(record, "document_hash"),
    snippet: requireString(record, "snippet"),
    available: requireBoolean(record, "available"),
    price_min_cents: requireNumber(record, "price_min_cents"),
    price_max_cents: requireNumber(record, "price_max_cents"),
    source_dataset: requireString(record, "source_dataset"),
    source_version: requireString(record, "source_version"),
    data_version: requireString(record, "data_version"),
  };
}

function requireString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new VectorSearchError(`Qdrant payload field ${key} must be a string.`);
  }

  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new VectorSearchError(`Qdrant payload field ${key} must be a string.`);
  }

  return value;
}

function requireNumber(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = record[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new VectorSearchError(`Qdrant payload field ${key} must be a number.`);
  }

  return value;
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean {
  const value = record[key];

  if (typeof value !== "boolean") {
    throw new VectorSearchError(`Qdrant payload field ${key} must be a boolean.`);
  }

  return value;
}

function requireStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] {
  const value = record[key];

  if (
    !Array.isArray(value)
    || !value.every((item) => typeof item === "string")
  ) {
    throw new VectorSearchError(
      `Qdrant payload field ${key} must be a string array.`,
    );
  }

  return value;
}

function requireWearingStyleArray(
  record: Record<string, unknown>,
  key: string,
): RagWearingStyle[] {
  const values = requireStringArray(record, key);

  for (const value of values) {
    if (!["in_ear", "semi_in_ear", "open_ear", "over_ear"].includes(value)) {
      throw new VectorSearchError(
        `Qdrant payload field ${key} contains an invalid wearing style.`,
      );
    }
  }

  return values as RagWearingStyle[];
}
