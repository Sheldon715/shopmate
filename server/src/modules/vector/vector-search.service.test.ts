import { describe, expect, it } from "vitest";
import { FakeEmbeddingClient } from "./fake-embedding.service";
import {
  buildQdrantFilter,
  mapQdrantScoredPointToVectorSearchHit,
  VectorSearchError,
  VectorSearchService,
} from "./vector-search.service";
import type { EmbeddingClient, EmbeddingResult } from "./embedding.types";
import { validateEmbeddingResult } from "./embedding.service";
import type { QdrantScoredPoint, VectorStore } from "./qdrant.types";
import { mapRagDocumentToQdrantPayload } from "./qdrant.client";
import type { RagDocument } from "./rag-document.types";

describe("FakeEmbeddingClient", () => {
  it("returns stable vectors for the same text", async () => {
    const client = new FakeEmbeddingClient({ dimensions: 6 });

    const first = await client.embedQuery("适合油皮的洗面奶");
    const second = await client.embedQuery("适合油皮的洗面奶");

    expect(first.vectors[0]).toEqual(second.vectors[0]);
    expect(first.vectors[0]).toHaveLength(6);
  });

  it("rejects empty text", async () => {
    const client = new FakeEmbeddingClient();

    await expect(client.embedDocuments([" "])).rejects.toThrow(/empty/);
  });
});

describe("validateEmbeddingResult", () => {
  it("throws when vector dimensions do not match", () => {
    const result: EmbeddingResult = {
      model: "test",
      dimensions: 3,
      vectors: [[0.1, 0.2]],
    };

    expect(() => validateEmbeddingResult(result, 1, 3)).toThrow(
      /dimensions mismatch/,
    );
  });
});

describe("buildQdrantFilter", () => {
  it("adds active and available filters by default", () => {
    expect(buildQdrantFilter()).toEqual({
      must: [
        { key: "status", match: { value: "active" } },
        { key: "available", match: { value: true } },
      ],
    });
  });

  it("uses correct budget range direction", () => {
    expect(
      buildQdrantFilter({
        category: "数码电子",
        maxPriceCents: 20000,
        minPriceCents: 10000,
      }),
    ).toEqual({
      must: [
        { key: "status", match: { value: "active" } },
        { key: "available", match: { value: true } },
        { key: "category", match: { value: "数码电子" } },
        { key: "price_min_cents", range: { lte: 20000 } },
        { key: "price_max_cents", range: { gte: 10000 } },
      ],
    });
  });

  it("maps avoid terms to must_not brand, tag, and avoid_when filters", () => {
    expect(buildQdrantFilter({ avoidTerms: ["酒精"] })).toEqual({
      must: [
        { key: "status", match: { value: "active" } },
        { key: "available", match: { value: true } },
      ],
      must_not: [
        { key: "brand", match: { any: ["酒精"] } },
        { key: "tags", match: { any: ["酒精"] } },
        { key: "avoid_when", match: { any: ["酒精"] } },
        { key: "risk_terms", match: { any: ["酒精"] } },
      ],
    });
  });

  it("maps negative fact metadata filters to must_not risk and wearing fields", () => {
    expect(buildQdrantFilter({
      excludeRiskTerms: ["酒精"],
      excludeWearingStyles: ["in_ear"],
    })).toEqual({
      must: [
        { key: "status", match: { value: "active" } },
        { key: "available", match: { value: true } },
      ],
      must_not: [
        { key: "risk_terms", match: { any: ["酒精"] } },
        { key: "wearing_styles", match: { any: ["in_ear"] } },
      ],
    });
  });

  it("maps explicit negative exclusions to must_not filters", () => {
    expect(buildQdrantFilter({
      excludeBrands: ["安热沙"],
      excludeProductIds: ["p_beauty_010"],
      excludeCategories: ["防晒"],
    })).toEqual({
      must: [
        { key: "status", match: { value: "active" } },
        { key: "available", match: { value: true } },
      ],
      must_not: [
        { key: "brand", match: { any: ["安热沙"] } },
        { key: "product_id", match: { any: ["p_beauty_010"] } },
        { key: "category", match: { any: ["防晒"] } },
        { key: "sub_category", match: { any: ["防晒"] } },
      ],
    });
  });
});

describe("mapQdrantScoredPointToVectorSearchHit", () => {
  it("maps payload to a stable lightweight hit", () => {
    const hit = mapQdrantScoredPointToVectorSearchHit(createScoredPoint());

    expect(hit).toEqual({
      docId: "prod_001::description",
      productId: "prod_001",
      score: 0.91,
      snippet: "轻量 snippet",
      metadata: {
        docType: "description",
        category: "美妆护肤",
        subCategory: "防晒",
        brand: "示例品牌",
        tags: ["防晒", "清爽"],
        recommendWhen: ["通勤"],
        avoidWhen: ["酒精敏感"],
        freeFromTerms: [],
        riskTerms: ["酒精", "酒精敏感"],
        wearingStyles: [],
        blockType: null,
        priceMinCents: 9900,
        priceMaxCents: 12900,
        available: true,
        embeddingModel: "fake",
        embeddingDimensions: 8,
        ingestBatchId: "batch_001",
      },
    });
  });
});

describe("mapRagDocumentToQdrantPayload", () => {
  it("writes negative fact metadata payload fields", () => {
    expect(
      mapRagDocumentToQdrantPayload(
        createRagDocument(),
        "fake",
        8,
      ),
    ).toMatchObject({
      free_from_terms: ["酒精"],
      risk_terms: [],
      wearing_styles: ["semi_in_ear"],
    });
  });
});

describe("VectorSearchService", () => {
  it("maps vector store errors to VECTOR_SEARCH_FAILED", async () => {
    const service = new VectorSearchService({
      embeddingClient: new FakeEmbeddingClient({ dimensions: 4 }),
      embeddingDimensions: 4,
      vectorStore: {
        ensureCollection: async () => undefined,
        upsertDocuments: async () => undefined,
        search: async () => {
          throw new Error("qdrant unavailable");
        },
      },
      collectionName: "test_collection",
      topK: 3,
    });

    await expect(
      service.search({ query: "蓝牙耳机" }),
    ).rejects.toMatchObject({
      code: "VECTOR_SEARCH_FAILED",
    });
  });

  it("passes query embedding and filters into the vector store", async () => {
    const calls: Array<Parameters<VectorStore["search"]>[0]> = [];
    const embeddingClient: EmbeddingClient = {
      embedDocuments: async () => ({
        model: "fake",
        dimensions: 3,
        vectors: [],
      }),
      embedQuery: async () => ({
        model: "fake",
        dimensions: 3,
        vectors: [[0.1, 0.2, 0.3]],
      }),
    };
    const service = new VectorSearchService({
      embeddingClient,
      embeddingDimensions: 3,
      collectionName: "test_collection",
      topK: 5,
      vectorStore: {
        ensureCollection: async () => undefined,
        upsertDocuments: async () => undefined,
        search: async (input) => {
          calls.push(input);
          return [];
        },
      },
    });

    await service.search({
      query: " 蓝牙耳机 ",
      filters: { category: "数码电子" },
      topK: 2,
    });

    expect(calls).toEqual([
      {
        collectionName: "test_collection",
        vector: [0.1, 0.2, 0.3],
        filters: { category: "数码电子" },
        topK: 2,
      },
    ]);
  });

  it("passes abortSignal to embedding and vector store calls", async () => {
    const abortController = new AbortController();
    let embeddingSignal: AbortSignal | undefined;
    let vectorStoreSignal: AbortSignal | undefined;
    const embeddingClient: EmbeddingClient = {
      embedDocuments: async () => ({
        model: "fake",
        dimensions: 3,
        vectors: [],
      }),
      embedQuery: async (_text, options) => {
        embeddingSignal = options?.abortSignal;

        return {
          model: "fake",
          dimensions: 3,
          vectors: [[0.1, 0.2, 0.3]],
        };
      },
    };
    const service = new VectorSearchService({
      embeddingClient,
      embeddingDimensions: 3,
      collectionName: "test_collection",
      vectorStore: {
        ensureCollection: async () => undefined,
        upsertDocuments: async () => undefined,
        search: async (input) => {
          vectorStoreSignal = input.abortSignal;
          return [];
        },
      },
    });

    await service.search({
      query: "蓝牙耳机",
      abortSignal: abortController.signal,
    });

    expect(embeddingSignal).toBe(abortController.signal);
    expect(vectorStoreSignal).toBe(abortController.signal);
  });
});

function createScoredPoint(): QdrantScoredPoint {
  return {
    id: "818902a1-8d7b-5a45-9bd5-9f00d7f0a111",
    version: 1,
    score: 0.91,
    payload: {
      doc_id: "prod_001::description",
      product_id: "prod_001",
      doc_type: "description",
      status: "active",
      category: "美妆护肤",
      sub_category: "防晒",
      brand: "示例品牌",
      tags: ["防晒", "清爽"],
      recommend_when: ["通勤"],
      avoid_when: ["酒精敏感"],
      free_from_terms: [],
      risk_terms: ["酒精", "酒精敏感"],
      wearing_styles: [],
      ingest_batch_id: "batch_001",
      embedding_model: "fake",
      embedding_dimensions: 8,
      document_hash: "abc123",
      snippet: "轻量 snippet",
      available: true,
      price_min_cents: 9900,
      price_max_cents: 12900,
      source_dataset: "dataset",
      source_version: "v1",
      data_version: "v1",
    },
  };
}

function createRagDocument(): RagDocument {
  return {
    docId: "prod_001::description",
    productId: "prod_001",
    docType: "description",
    text: "Demo document",
    snippet: "Demo snippet",
    metadata: {
      productName: "Demo Product",
      brand: "示例品牌",
      category: "美妆护肤",
      subCategory: "防晒",
      status: "active",
      available: true,
      priceMinCents: 9900,
      priceMaxCents: 12900,
      currency: "CNY",
      tags: ["防晒"],
      recommendWhen: ["通勤"],
      avoidWhen: [],
      freeFromTerms: ["酒精"],
      riskTerms: [],
      wearingStyles: ["semi_in_ear"],
      pros: [],
      cons: [],
      sourceDataset: "dataset",
      sourceVersion: "v1",
      sourceType: "synthetic_desensitized",
      dataVersion: "v1",
      isDesensitized: true,
      ingestBatchId: "batch_001",
      sourcePath: "data/raw/demo.json",
      docType: "description",
      documentHash: "abc123",
    },
  };
}
