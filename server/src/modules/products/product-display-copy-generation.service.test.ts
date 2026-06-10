import { describe, expect, it } from "vitest";
import { MockLlmClient } from "../llm/mock-llm.client";
import type { LlmGenerateRequest, LlmGenerateResponse } from "../llm/llm.types";
import type { Product } from "./product.types";
import {
  ProductDisplayCopyGenerationService,
  ProductDisplayCopyGenerationOutputError,
  parseProductDisplayCopyOutput,
} from "./product-display-copy-generation.service";

describe("parseProductDisplayCopyOutput", () => {
  it("accepts valid generated card, detail, and highlight copy", () => {
    const copies = parseProductDisplayCopyOutput(
      JSON.stringify({
        products: [
          {
            product_id: "product_001",
            card_reason: "推荐理由：半入耳轻盈，通勤久戴不闷，通话也清楚。",
            detail_reason: "半入耳佩戴轻松，适合通勤和办公长时间使用，兼顾通话清晰度。",
            detail_highlights: [
              "半入耳佩戴轻松",
              "适合通勤办公",
              "通话清晰度更稳",
            ],
          },
        ],
      }),
      ["product_001"],
    );

    expect(copies.get("product_001")).toEqual({
      productId: "product_001",
      cardReason: "推荐理由：半入耳轻盈，通勤久戴不闷，通话也清楚。",
      detailReason: "半入耳佩戴轻松，适合通勤和办公长时间使用，兼顾通话清晰度。",
      detailHighlights: [
        "半入耳佩戴轻松",
        "适合通勤办公",
        "通话清晰度更稳",
      ],
    });
  });

  it("drops non-allowlisted ids, internal data notices, and weak template copy", () => {
    const copies = parseProductDisplayCopyOutput(
      JSON.stringify({
        products: [
          {
            product_id: "product_999",
            card_reason: "推荐理由：越权商品。",
          },
          {
            product_id: "product_001",
            card_reason: "推荐理由：配置清晰，适合参数比较。",
            detail_reason: "价格、SKU、评论和 FAQ 为比赛数据集模拟内容。",
            detail_highlights: [
              "SKU 选择较多",
              "通勤佩戴舒服",
            ],
          },
        ],
      }),
      ["product_001"],
    );

    expect(copies.get("product_999")).toBeUndefined();
    expect(copies.get("product_001")).toEqual({
      productId: "product_001",
      detailHighlights: ["通勤佩戴舒服"],
    });
  });

  it("drops weak detail copy that looks like generated catalog placeholders", () => {
    const copies = parseProductDisplayCopyOutput(
      JSON.stringify({
        products: [
          {
            product_id: "product_001",
            card_reason: "推荐理由：适合日常防晒与换季护理，场景明确。",
            detail_reason:
              "这款适合日常护肤用户，使用场景覆盖日常护理、换季护理和送礼，便于按肤质筛选。",
            detail_highlights: [
              "适用场景：日常护理",
              "适用场景：换季护理",
              "便于按肤质筛选",
            ],
          },
        ],
      }),
      ["product_001"],
    );

    expect(copies.get("product_001")).toBeUndefined();
  });

  it("rejects non-json output", () => {
    expect(() =>
      parseProductDisplayCopyOutput("not json", ["product_001"])
    ).toThrow(ProductDisplayCopyGenerationOutputError);
  });
});

describe("ProductDisplayCopyGenerationService", () => {
  it("builds detail prompts from concrete marketing and FAQ facts instead of placeholder catalog facts", async () => {
    let llmRequest: LlmGenerateRequest | undefined;
    const service = new ProductDisplayCopyGenerationService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          llmRequest = request;

          return createLlmResponse(JSON.stringify({
            products: [
              {
                product_id: "p_beauty_006",
                card_reason:
                  "推荐理由：水感轻薄质地，适合日常通勤防晒。",
                detail_reason:
                  "水感轻薄质地，上脸成膜不厚重，适合油皮和混油皮做日常通勤防晒。",
                detail_highlights: [
                  "SPF50+ PA++++高倍防晒",
                  "水感轻薄不厚重",
                  "FAQ 明确不含酒精",
                ],
              },
            ],
          }));
        },
      }),
    });

    await service.generate({
      products: [createProduct()],
      userQuestion: "推荐无酒精防晒霜",
      surface: "product_detail",
    });

    const userMessage = llmRequest?.messages.find((message) =>
      message.role === "user"
    )?.content;
    const promptPayload = JSON.parse(userMessage ?? "{}") as {
      products?: Array<{ facts?: string[] }>;
    };
    const facts = promptPayload.products?.[0]?.facts ?? [];
    const factsText = facts.join("\n");

    expect(factsText).toContain("水感轻薄质地");
    expect(factsText).toContain("SPF50+ PA++++");
    expect(factsText).toContain("不含酒精");
    expect(factsText).not.toContain("功效描述明确");
    expect(factsText).not.toContain("适用场景清楚");
    expect(factsText).not.toContain("日常护理");
    expect(factsText).not.toContain("换季护理");
    expect(factsText).not.toContain("便于按肤质筛选");
  });

  it("batches product display copy generation so every requested product is covered", async () => {
    const requestedProductIds: string[][] = [];
    const service = new ProductDisplayCopyGenerationService({
      llmClient: new MockLlmClient({
        handler: (request) => {
          const userMessage = request.messages.find((message) =>
            message.role === "user"
          )?.content;
          const promptPayload = JSON.parse(userMessage ?? "{}") as {
            allowlistProductIds?: string[];
          };
          const productIds = promptPayload.allowlistProductIds ?? [];

          requestedProductIds.push(productIds);

          return createLlmResponse(JSON.stringify({
            products: productIds.map((productId) => ({
              product_id: productId,
              card_reason:
                `推荐理由：${productId} 小容量好收纳，适合宿舍早餐和一人食。`,
              detail_reason:
                `${productId} 小容量机身不占桌面，适合宿舍早餐和一人食。`,
              detail_highlights: [
                "小容量不占桌面",
                "早餐一人食友好",
              ],
            })),
          }));
        },
      }),
    });
    const products = Array.from({ length: 5 }, (_, index) =>
      createProduct({
        id: `product_${index + 1}`,
        name: `小熊电炖盅 ${index + 1}`,
      })
    );

    const copies = await service.generate({
      products,
      userQuestion: "推荐适合宿舍小家电",
      surface: "chat_card",
    });

    expect(requestedProductIds).toEqual([
      ["product_1", "product_2", "product_3", "product_4"],
      ["product_5"],
    ]);
    expect(Array.from(copies.keys())).toEqual([
      "product_1",
      "product_2",
      "product_3",
      "product_4",
      "product_5",
    ]);
  });
});

function createLlmResponse(text: string): LlmGenerateResponse {
  return {
    text,
    model: "mock-llm",
    provider: "mock",
    finishReason: "stop",
    latencyMs: 0,
  };
}

function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p_beauty_006",
    status: "active",
    name: "巴黎欧莱雅新多重防护隔离露水感轻薄高倍防晒修护提亮",
    brand: "巴黎欧莱雅",
    category: "美妆护肤",
    subCategory: "防晒",
    imagePath: "beauty/images/p_beauty_006_main.jpg",
    imageCaption: "防晒主图",
    currency: "CNY",
    basePriceCents: 17000,
    priceMinCents: 17000,
    priceMaxCents: 19000,
    marketingDescription:
      "巴黎欧莱雅新多重防护隔离露，主打水感轻薄质地，上脸瞬间推开成膜，无厚重黏腻感。采用欧莱雅专利麦色滤科技，实现SPF50+ PA++++高倍广谱防晒，有效阻隔UVA/UVB，添加玻尿酸与维生素E，防晒同时修护肌肤屏障，自然提亮肤色。适合油皮、混油皮及追求清爽肤感人群，日常通勤、上学、逛街或短途户外游玩适用。",
    knowledgeText:
      "商品名:巴黎欧莱雅新多重防护隔离露\n优势:功效描述明确、适用场景清楚",
    ratingAvg: 4.5,
    categoryPath: ["美妆护肤", "防晒"],
    visualTags: ["美妆护肤", "防晒", "主图"],
    attributes: {
      "适用人群": ["日常护肤用户", "关注肤感的人群", "成分敏感用户"],
      "使用场景": ["日常护理", "换季护理", "送礼"],
      "核心卖点": ["功效描述明确", "适用场景清楚", "便于按肤质筛选"],
      "不适合": ["对相关成分过敏的人群", "希望获得医疗效果的用户"],
    },
    pros: ["功效描述明确", "适用场景清楚"],
    cons: ["对相关成分过敏的人群"],
    recommendWhen: ["功效描述明确", "适用场景清楚"],
    avoidWhen: ["对相关成分过敏的人群"],
    compareWith: [],
    reviewSummary: {},
    contentBlocks: [
      {
        title: "商品详情介绍",
        content:
          "商品详情页数据。核心特点包括功效描述明确、适用场景清楚、便于按肤质筛选，适合日常护理、换季护理、送礼。",
      },
    ],
    officialFaq: [
      {
        question: "这款防晒是否含酒精？",
        answer: "这款防晒不含酒精，适合日常通勤使用。",
      },
    ],
    userReviews: [],
    normalizedPayload: {},
    sourceDataset: "demo",
    sourceVersion: "v1",
    sourceType: "synthetic_desensitized",
    dataVersion: "v1",
    isDesensitized: true,
    ingestBatchId: "batch_001",
    sourcePath: "demo.json",
    skus: [
      {
        id: "sku_001",
        productId: "p_beauty_006",
        properties: { "规格": "30ml" },
        priceCents: 17000,
        currency: "CNY",
        available: true,
        stockLevel: "unknown",
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}
