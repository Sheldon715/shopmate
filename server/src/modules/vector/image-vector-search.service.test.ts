import { describe, expect, it } from "vitest";
import type { Product } from "../products/product.types";
import {
  DisabledImageEmbeddingClient,
  FakeImageEmbeddingClient,
  ImageEmbeddingError,
  validateImageEmbeddingResult,
  type ImageEmbeddingClient,
} from "./image-embedding.client";
import {
  buildImageQdrantFilter,
  createEmbeddedProductImageDocument,
  mapProductImageDocumentToPayload,
  type ImageVectorStore,
  type ProductImageVectorHit,
} from "./image-vector-store";
import { ImageVectorSearchService } from "./image-vector-search.service";
import type { ProductImageDocument } from "./image-document.types";

describe("FakeImageEmbeddingClient", () => {
  it("returns stable vectors for the same image", async () => {
    const client = new FakeImageEmbeddingClient({ dimensions: 6 });
    const image = {
      buffer: Buffer.from("image-bytes"),
      mimeType: "image/jpeg",
      caption: "耳机主图",
    };

    const first = await client.embedImage(image);
    const second = await client.embedImage(image);

    expect(first.vectors[0]).toEqual(second.vectors[0]);
    expect(first.vectors[0]).toHaveLength(6);
  });

  it("keeps disabled provider explicit", async () => {
    const client = new DisabledImageEmbeddingClient();

    await expect(
      client.embedImage({ buffer: Buffer.from("x"), mimeType: "image/jpeg" }),
    ).rejects.toMatchObject({
      code: "IMAGE_EMBEDDING_DISABLED",
    });
  });
});

describe("validateImageEmbeddingResult", () => {
  it("throws when dimensions do not match", () => {
    expect(() =>
      validateImageEmbeddingResult({
        model: "fake",
        dimensions: 2,
        vectors: [[0.1, 0.2]],
      }, 1, 3)
    ).toThrow(ImageEmbeddingError);
  });
});

describe("image vector payload and filters", () => {
  it("maps image document payload without full product detail text", () => {
    expect(
      mapProductImageDocumentToPayload(createImageDocument(), "fake", 8),
    ).toEqual({
      doc_id: "product:prod_001:image:main",
      product_id: "prod_001",
      doc_type: "image_main",
      image_path: "digital/images/prod_001.jpg",
      visual_caption: "黑色耳机主图",
      visual_tags: ["黑色", "真无线"],
      category: "数码电子",
      sub_category: "耳机",
      brand: "示例品牌",
      status: "active",
      available: true,
      price_min_cents: 9900,
      price_max_cents: 12900,
      image_embedding_model: "fake",
      image_embedding_dimensions: 8,
      image_hash: "hash_001",
      ingest_batch_id: "batch_001",
      source_dataset: "dataset",
      source_version: "v1",
      data_version: "v1",
    });
  });

  it("adds image-specific Qdrant filters", () => {
    expect(buildImageQdrantFilter({
      category: "数码电子",
      maxPriceCents: 20000,
      excludeProductIds: ["prod_002"],
    })).toEqual({
      must: [
        { key: "doc_type", match: { value: "image_main" } },
        { key: "status", match: { value: "active" } },
        { key: "available", match: { value: true } },
        { key: "category", match: { value: "数码电子" } },
        { key: "price_min_cents", range: { lte: 20000 } },
      ],
      must_not: [
        { key: "product_id", match: { any: ["prod_002"] } },
      ],
    });
  });

  it("creates deterministic point ids from image documents", () => {
    const first = createEmbeddedProductImageDocument({
      document: createImageDocument(),
      vector: [0.1, 0.2],
      imageEmbeddingModel: "fake",
      imageEmbeddingDimensions: 2,
    });
    const second = createEmbeddedProductImageDocument({
      document: createImageDocument(),
      vector: [0.1, 0.2],
      imageEmbeddingModel: "fake",
      imageEmbeddingDimensions: 2,
    });

    expect(first.pointId).toBe(second.pointId);
    expect(first.payload.image_hash).toBe("hash_001");
  });
});

describe("ImageVectorSearchService", () => {
  it("embeds uploaded image, searches image collection, and hydrates active products", async () => {
    const calls: Array<Parameters<ImageVectorStore["search"]>[0]> = [];
    const service = new ImageVectorSearchService({
      imageEmbeddingClient: fixedEmbeddingClient([0.1, 0.2, 0.3]),
      imageEmbeddingDimensions: 3,
      collectionName: "image_collection",
      topK: 5,
      imageVectorStore: {
        ensureCollection: async () => undefined,
        upsertDocuments: async () => undefined,
        search: async (input) => {
          calls.push(input);
          return [
            createImageVectorHit("prod_001", 0.92),
            createImageVectorHit("stale_product", 0.88),
          ];
        },
      },
      productLookup: async (productIds) =>
        productIds.includes("prod_001") ? [createProduct()] : [],
    });

    const result = await service.search({
      image: {
        buffer: Buffer.from("user-image"),
        mimeType: "image/jpeg",
      },
      filters: { category: "数码电子" },
      topK: 2,
    });

    expect(calls).toEqual([
      {
        collectionName: "image_collection",
        vector: [0.1, 0.2, 0.3],
        filters: { category: "数码电子" },
        topK: 2,
      },
    ]);
    expect(result).toMatchObject({
      mode: "image_vector",
      hits: [
        {
          productId: "prod_001",
          score: 0.92,
          imagePath: "digital/images/prod_001.jpg",
          imageHash: "hash_001",
          product: {
            id: "prod_001",
            name: "真无线蓝牙耳机",
            category: "数码电子",
          },
        },
      ],
      droppedProductIds: ["stale_product"],
    });
  });
});

function fixedEmbeddingClient(vector: number[]): ImageEmbeddingClient {
  return {
    embedImages: async () => ({
      model: "fake",
      dimensions: vector.length,
      vectors: [vector],
    }),
    embedImage: async () => ({
      model: "fake",
      dimensions: vector.length,
      vectors: [vector],
    }),
  };
}

function createImageDocument(): ProductImageDocument {
  return {
    docId: "product:prod_001:image:main",
    productId: "prod_001",
    docType: "image_main",
    imagePath: "digital/images/prod_001.jpg",
    imageMimeType: "image/jpeg",
    visualCaption: "黑色耳机主图",
    visualTags: ["黑色", "真无线"],
    category: "数码电子",
    subCategory: "耳机",
    brand: "示例品牌",
    status: "active",
    available: true,
    sourceDataset: "dataset",
    sourceVersion: "v1",
    dataVersion: "v1",
    ingestBatchId: "batch_001",
    priceMinCents: 9900,
    priceMaxCents: 12900,
    imageHash: "hash_001",
  };
}

function createImageVectorHit(
  productId: string,
  score: number,
): ProductImageVectorHit {
  return {
    docId: `product:${productId}:image:main`,
    productId,
    score,
    metadata: {
      docType: "image_main",
      imagePath: "digital/images/prod_001.jpg",
      visualCaption: "黑色耳机主图",
      visualTags: ["黑色", "真无线"],
      category: "数码电子",
      subCategory: "耳机",
      brand: "示例品牌",
      priceMinCents: 9900,
      priceMaxCents: 12900,
      available: true,
      imageEmbeddingModel: "fake",
      imageEmbeddingDimensions: 3,
      imageHash: "hash_001",
      ingestBatchId: "batch_001",
    },
  };
}

function createProduct(): Product {
  return {
    id: "prod_001",
    status: "active",
    name: "真无线蓝牙耳机",
    brand: "示例品牌",
    category: "数码电子",
    subCategory: "耳机",
    imagePath: "digital/images/prod_001.jpg",
    imageCaption: "黑色耳机主图",
    currency: "CNY",
    basePriceCents: 9900,
    priceMinCents: 9900,
    priceMaxCents: 12900,
    marketingDescription: "通勤耳机。",
    knowledgeText: "通勤耳机",
    ratingAvg: 4.6,
    categoryPath: ["数码电子", "耳机"],
    visualTags: ["黑色", "真无线"],
    attributes: {},
    pros: [],
    cons: [],
    recommendWhen: [],
    avoidWhen: [],
    compareWith: [],
    reviewSummary: {},
    contentBlocks: [],
    officialFaq: [],
    userReviews: [],
    normalizedPayload: {},
    sourceDataset: "dataset",
    sourceVersion: "v1",
    sourceType: "synthetic_desensitized",
    dataVersion: "v1",
    isDesensitized: true,
    ingestBatchId: "batch_001",
    sourcePath: "digital/data/prod_001.json",
    skus: [
      {
        id: "sku_001",
        productId: "prod_001",
        properties: {},
        priceCents: 9900,
        currency: "CNY",
        available: true,
        stockLevel: "in_stock",
        sortOrder: 0,
      },
    ],
  };
}
