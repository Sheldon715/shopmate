import { describe, expect, it } from "vitest";
import type { LlmGenerateRequest } from "../llm/llm.types";
import type { Product } from "../products/product.types";
import {
  ComparisonGenerationService,
  ComparisonGenerationOutputError,
  parseComparisonGenerationOutput,
} from "./comparison-generation.service";

describe("parseComparisonGenerationOutput", () => {
  it("uses a bounded timeout and token budget for structured comparison generation", async () => {
    let request: LlmGenerateRequest | undefined;
    const service = new ComparisonGenerationService({
      llmClient: {
        generate: async (input) => {
          request = input;
          return {
            text: JSON.stringify({
              answer: "我按通勤肤感做了对比。",
              comparison: {
                title: "防晒霜对比",
                products: [
                  { product_id: "product_001", display_label: "Product 1" },
                  { product_id: "product_002", display_label: "Product 2" },
                ],
                dimensions: createValidComparisonDimensions(
                  {
                    id: "skin_feel",
                    label: "肤感",
                    cells: [
                      { product_id: "product_001", value: "轻薄。" },
                      { product_id: "product_002", value: "清爽。" },
                    ],
                  },
                ),
                recommended_product_id: null,
                conclusion: "两款都适合通勤，可按肤质偏好选择。",
                highlights: [],
              },
            }),
            model: "mock",
            provider: "mock",
            finishReason: "stop",
            latencyMs: 0,
          };
        },
      },
    });

    await service.generate({
      question: "帮我对比这两款",
      products: [
        { product: createProduct("product_001"), snippets: ["轻薄"] },
        { product: createProduct("product_002"), snippets: ["清爽"] },
      ],
      generatedAt: new Date("2026-05-31T00:00:00.000Z"),
    });

    expect(request?.timeoutMs).toBe(45_000);
    expect(request?.maxCompletionTokens).toBe(2000);
  });

  it("sends compact comparison facts instead of full product knowledge payloads", async () => {
    let request: LlmGenerateRequest | undefined;
    const service = new ComparisonGenerationService({
      llmClient: {
        generate: async (input) => {
          request = input;
          return {
            text: JSON.stringify({
              answer: "我按核心差异做了对比。",
              comparison: {
                title: "防晒霜对比",
                products: [
                  { product_id: "product_001", display_label: "Product 1" },
                  { product_id: "product_002", display_label: "Product 2" },
                ],
                dimensions: createValidComparisonDimensions(
                  {
                    id: "skin_feel",
                    label: "肤感",
                    cells: [
                      { product_id: "product_001", value: "轻薄。" },
                      { product_id: "product_002", value: "清爽。" },
                    ],
                  },
                ),
                recommended_product_id: null,
                conclusion: "两款各有侧重。",
                highlights: [],
              },
            }),
            model: "mock",
            provider: "mock",
            finishReason: "stop",
            latencyMs: 0,
          };
        },
      },
    });
    const longKnowledgeText = "FULL_KNOWLEDGE_TEXT_SHOULD_NOT_BE_SENT ".repeat(40);

    await service.generate({
      question: "帮我对比这两款",
      shortHistory: [
        { role: "user", content: "第一轮历史" },
        { role: "assistant", content: "第二轮历史" },
        { role: "user", content: "第三轮历史" },
      ],
      products: [
        {
          product: createProduct("product_001", {
            knowledgeText: longKnowledgeText,
            attributes: {
              skin_type: ["oily", "dry", "sensitive", "normal", "combo"],
              finish: ["matte"],
              region: ["commute"],
              season: ["summer"],
              extra_1: ["a"],
              extra_2: ["b"],
              extra_3: ["c"],
            },
          }),
          snippets: [" ".repeat(4) + "轻薄通勤事实 ".repeat(30)],
        },
        { product: createProduct("product_002"), snippets: ["清爽"] },
      ],
      generatedAt: new Date("2026-05-31T00:00:00.000Z"),
    });

    const userPayload = JSON.parse(request?.messages[1]?.content ?? "{}") as {
      shortHistory?: unknown[];
      userPriority?: unknown;
      products?: Array<Record<string, unknown>>;
    };
    const promptText = request?.messages.map((message) => message.content).join("\n")
      ?? "";

    expect(promptText).not.toContain("FULL_KNOWLEDGE_TEXT_SHOULD_NOT_BE_SENT");
    expect(userPayload.shortHistory).toHaveLength(2);
    expect(userPayload.userPriority).toBeNull();
    expect(userPayload.products?.[0]).toMatchObject({
      product_id: "product_001",
      facts: expect.arrayContaining([expect.stringContaining("轻薄通勤事实")]),
    });
    const facts = userPayload.products?.[0]?.facts as string[] | undefined;

    expect(facts).toBeDefined();
    expect(facts?.length).toBeLessThanOrEqual(9);
    expect(facts?.every((fact) => Array.from(fact).length <= 190)).toBe(true);
    expect(Object.keys(userPayload.products?.[0]?.attrs ?? {})).toHaveLength(6);
  });

  it("clears recommendation signals when the user has no explicit priority", async () => {
    const service = new ComparisonGenerationService({
      llmClient: {
        generate: async () => ({
          text: JSON.stringify({
            answer: "我按核心差异做了对比。",
            comparison: {
              title: "防晒霜对比",
              products: [
                { product_id: "product_001", display_label: "Product 1" },
                { product_id: "product_002", display_label: "Product 2" },
              ],
              dimensions: createValidComparisonDimensions(
                {
                  id: "skin_feel",
                  label: "肤感",
                  cells: [
                    {
                      product_id: "product_001",
                      value: "轻薄。",
                      highlight: true,
                    },
                    {
                      product_id: "product_002",
                      value: "清爽。",
                    },
                  ],
                },
              ),
              recommended_product_id: "product_001",
              conclusion: "两款各有侧重。",
              highlights: [
                {
                  product_id: "product_001",
                  label: "通勤肤感",
                  text: "更轻薄。",
                },
              ],
            },
          }),
          model: "mock",
          provider: "mock",
          finishReason: "stop",
          latencyMs: 0,
        }),
      },
    });

    const result = await service.generate({
      question: "帮我对比这两款",
      products: [
        { product: createProduct("product_001"), snippets: ["轻薄"] },
        { product: createProduct("product_002"), snippets: ["清爽"] },
      ],
      generatedAt: new Date("2026-05-31T00:00:00.000Z"),
    });

    expect(result.dimensions[0]?.cells.some((cell) => cell.highlight)).toBe(false);
    expect(result.recommendedProductId).toBeNull();
    expect(result.highlights).toEqual([]);
  });

  it("parses a valid comparison result and normalizes invalid recommendation ids", () => {
    const result = parseComparisonGenerationOutput(
      JSON.stringify({
        answer: "我按通勤肤感、防晒稳定性和预算做了对比。",
        comparison: {
          title: "防晒霜对比",
          products: [
            { product_id: "product_001", display_label: "理肤泉" },
            { product_id: "product_002", display_label: "安热沙" },
          ],
          dimensions: createValidComparisonDimensions(
            {
              id: "skin_feel",
              label: "肤感",
              cells: [
                {
                  product_id: "product_001",
                  value: "更轻薄，适合日常通勤。",
                  highlight: true,
                },
                {
                  product_id: "product_002",
                  value: "成膜更强，户外稳定性更好。",
                  highlight: false,
                },
              ],
            },
          ),
          recommended_product_id: "product_999",
          conclusion: "如果主要是油皮通勤，优先看理肤泉；如果长时间户外，安热沙更稳。",
          highlights: [
            {
              product_id: "product_001",
              label: "通勤肤感",
              text: "更轻薄，日常使用压力小。",
            },
          ],
        },
      }),
      ["product_001", "product_002"],
    );

    expect(result.recommendedProductId).toBeNull();
    expect(result.products.map((product) => product.productId)).toEqual([
      "product_001",
      "product_002",
    ]);
    expect(result.dimensions[0]?.cells.map((cell) => cell.productId)).toEqual([
      "product_001",
      "product_002",
    ]);
  });

  it("wraps malformed JSON as comparison invalid output", () => {
    expect(() =>
      parseComparisonGenerationOutput("{ nope", ["product_001", "product_002"])
    ).toThrow(ComparisonGenerationOutputError);
  });

  it("rejects dimensions that do not cover every comparison product", () => {
    expect(() =>
      parseComparisonGenerationOutput(
        JSON.stringify({
          answer: "我做了对比。",
          comparison: {
            title: "防晒霜对比",
            products: [
              { product_id: "product_001", display_label: "理肤泉" },
              { product_id: "product_002", display_label: "安热沙" },
            ],
            dimensions: [
              {
                id: "skin_feel",
                label: "肤感",
                cells: [
                  {
                    product_id: "product_001",
                    value: "更轻薄。",
                  },
                ],
              },
            ],
            recommended_product_id: null,
            conclusion: "需要补充完整对比。",
            highlights: [],
          },
        }),
        ["product_001", "product_002"],
      )
    ).toThrow(ComparisonGenerationOutputError);
  });

  it("accepts four complete dimensions for quality comparison output", () => {
    const result = parseComparisonGenerationOutput(
      JSON.stringify({
        answer: "我做了对比。",
        comparison: {
          title: "防晒霜对比",
          products: [
            { product_id: "product_001", display_label: "理肤泉" },
            { product_id: "product_002", display_label: "安热沙" },
          ],
          dimensions: [
            {
              id: "skin_feel",
              label: "肤感",
              cells: [
                { product_id: "product_001", value: "更轻薄。" },
                { product_id: "product_002", value: "更清爽。" },
              ],
            },
            {
              id: "price",
              label: "价格",
              cells: [
                { product_id: "product_001", value: "价格更低。" },
                { product_id: "product_002", value: "价格更高。" },
              ],
            },
            {
              id: "usage",
              label: "适用场景",
              cells: [
                { product_id: "product_001", value: "适合日常通勤。" },
                { product_id: "product_002", value: "适合长时间户外。" },
              ],
            },
            {
              id: "limits",
              label: "注意点",
              cells: [
                { product_id: "product_001", value: "户外长时间使用需要补涂。" },
                { product_id: "product_002", value: "肤感可能更有存在感。" },
              ],
            },
          ],
          recommended_product_id: null,
          conclusion: "两款都有清晰差异，可按肤感和预算选择。",
          highlights: [],
        },
      }),
      ["product_001", "product_002"],
    );

    expect(result.dimensions).toHaveLength(4);
  });

  it("rejects comparison output with fewer than four complete dimensions", () => {
    expect(() =>
      parseComparisonGenerationOutput(
        JSON.stringify({
          answer: "我做了对比。",
          comparison: {
            title: "防晒霜对比",
            products: [
              { product_id: "product_001", display_label: "理肤泉" },
              { product_id: "product_002", display_label: "安热沙" },
            ],
            dimensions: [
              {
                id: "skin_feel",
                label: "肤感",
                cells: [
                  { product_id: "product_001", value: "更轻薄。" },
                  { product_id: "product_002", value: "更清爽。" },
                ],
              },
            ],
            recommended_product_id: null,
            conclusion: "维度不足，不应生成完整对比。",
            highlights: [],
          },
        }),
        ["product_001", "product_002"],
      )
    ).toThrow(ComparisonGenerationOutputError);
  });

  it("clears highlights when both products are marked better in one dimension", () => {
    const result = parseComparisonGenerationOutput(
      JSON.stringify({
        answer: "我做了对比。",
        comparison: {
          title: "防晒霜对比",
          products: [
            { product_id: "product_001", display_label: "理肤泉" },
            { product_id: "product_002", display_label: "安热沙" },
          ],
          dimensions: createValidComparisonDimensions(
            {
              id: "core_effect",
              label: "核心功效",
              cells: [
                {
                  product_id: "product_001",
                  value: "控油持妆。",
                  highlight: true,
                },
                {
                  product_id: "product_002",
                  value: "淡纹紧致。",
                  highlight: true,
                },
              ],
            },
          ),
          recommended_product_id: null,
          conclusion: "两款各有侧重。",
          highlights: [],
        },
      }),
      ["product_001", "product_002"],
    );

    expect(result.dimensions[0]?.cells.map((cell) => cell.highlight)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("rejects comparison output with more than two products", () => {
    expect(() =>
      parseComparisonGenerationOutput(
        JSON.stringify({
          answer: "我做了对比。",
          comparison: {
            title: "三款防晒对比",
            products: [
              { product_id: "product_001", display_label: "理肤泉" },
              { product_id: "product_002", display_label: "安热沙" },
              { product_id: "product_003", display_label: "雅诗兰黛" },
            ],
            dimensions: [
              {
                id: "skin_feel",
                label: "肤感",
                cells: [
                  { product_id: "product_001", value: "轻薄。" },
                  { product_id: "product_002", value: "清爽。" },
                  { product_id: "product_003", value: "滋润。" },
                ],
              },
            ],
            recommended_product_id: null,
            conclusion: "不应生成三款对比。",
            highlights: [],
          },
        }),
        ["product_001", "product_002", "product_003"],
      )
    ).toThrow(ComparisonGenerationOutputError);
  });

  it("rejects product ids outside the backend allowlist", () => {
    expect(() =>
      parseComparisonGenerationOutput(
        JSON.stringify({
          answer: "我做了对比。",
          comparison: {
            title: "防晒霜对比",
            products: [
              { product_id: "product_001", display_label: "理肤泉" },
              { product_id: "product_999", display_label: "库外商品" },
            ],
            dimensions: [],
            recommended_product_id: null,
            conclusion: "不应包含库外商品。",
            highlights: [],
          },
        }),
        ["product_001", "product_002"],
      )
    ).toThrow(ComparisonGenerationOutputError);
  });
});

function createProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    status: "active",
    name: id,
    brand: "ShopMate",
    category: "美妆护肤",
    subCategory: "防晒",
    imagePath: null,
    imageCaption: null,
    currency: "CNY",
    basePriceCents: 10000,
    priceMinCents: 10000,
    priceMaxCents: 10000,
    marketingDescription: "日常通勤防晒",
    knowledgeText: "适合油皮通勤",
    ratingAvg: 4.5,
    categoryPath: ["美妆护肤", "防晒"],
    visualTags: ["防晒"],
    attributes: {},
    pros: [],
    cons: [],
    recommendWhen: [],
    avoidWhen: [],
    compareWith: [],
    reviewSummary: null,
    contentBlocks: null,
    officialFaq: null,
    userReviews: null,
    normalizedPayload: null,
    sourceDataset: "test",
    sourceVersion: "test",
    sourceType: "test",
    dataVersion: "test",
    isDesensitized: true,
    ingestBatchId: "test",
    sourcePath: "test",
    skus: [],
    ...overrides,
  };
}

function createValidComparisonDimensions(
  firstDimension: Record<string, unknown>,
): Record<string, unknown>[] {
  return [
    firstDimension,
    {
      id: "price",
      label: "价格",
      cells: [
        { product_id: "product_001", value: "价格更低。" },
        { product_id: "product_002", value: "价格更高。" },
      ],
    },
    {
      id: "usage",
      label: "适用场景",
      cells: [
        { product_id: "product_001", value: "适合日常通勤。" },
        { product_id: "product_002", value: "适合长时间户外。" },
      ],
    },
    {
      id: "limits",
      label: "注意点",
      cells: [
        { product_id: "product_001", value: "长时间户外需要补涂。" },
        { product_id: "product_002", value: "肤感可能更有存在感。" },
      ],
    },
  ];
}
