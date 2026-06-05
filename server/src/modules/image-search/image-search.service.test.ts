import { describe, expect, it } from "vitest";
import { ImageSearchService, normalizeVisualIntent } from "./image-search.service";
import type { ImageSearchConfig } from "./image-search.config";
import type { VisualIntent, VisualIntentClient } from "./image-search.types";
import { ImageSearchError } from "./image-search.types";

const config: ImageSearchConfig = {
  enabled: true,
  provider: "openai-compatible",
  baseUrl: "https://ark.example.com/api/v3",
  apiKey: "secret-key",
  model: "vision-model",
  timeoutMs: 25000,
  maxImageBytes: 32,
  maxCompletionTokens: 700,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  missing: [],
};

describe("ImageSearchService", () => {
  it("generates chatMessage and category filters for medium-confidence product intent", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning({
        ...baseIntent(),
        detected_category: "数码",
        detected_brand_text: "SomeBrand",
        visual_attributes: [" 真无线耳机 ", "真无线耳机", "充电盒"],
        colors: ["黑色"],
        use_case: "通勤",
        constraints: ["便宜一点"],
        search_query: "黑色真无线蓝牙耳机，适合通勤，价格更便宜",
        confidence: "medium",
      }),
    });

    await expect(
      service.interpret({
        image: pngInput(),
      }),
    ).resolves.toEqual({
      visualIntent: {
        is_product_search: true,
        detected_category: "数码电子",
        detected_brand_text: "SomeBrand",
        visual_attributes: ["真无线耳机", "充电盒"],
        colors: ["黑色"],
        materials: [],
        use_case: "通勤",
        constraints: ["便宜一点"],
        search_query: "黑色真无线蓝牙耳机，适合通勤，价格更便宜",
        confidence: "medium",
        clarification_question: null,
      },
      chatMessage: "图片找货：黑色真无线蓝牙耳机，适合通勤，价格更便宜",
      filters: {
        category: "数码电子",
      },
      imageSearchMode: "vlm_first",
    });
  });

  it("does not generate chatMessage for low confidence intent", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning({
        ...baseIntent(),
        search_query: "",
        confidence: "low",
      }),
    });

    await expect(
      service.interpret({ image: pngInput() }),
    ).resolves.toMatchObject({
      chatMessage: null,
      filters: null,
      visualIntent: {
        confidence: "low",
        clarification_question:
          "我没看清具体商品，可以换一张更清晰的商品主体图，或者补充想找的类型。",
      },
    });
  });

  it("does not generate chatMessage for non-product or privacy-risk image", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning({
        ...baseIntent(),
        is_product_search: false,
        search_query: "",
        confidence: "low",
        clarification_question: "请换一张清晰的商品主体图。",
      }),
    });

    await expect(
      service.interpret({ image: pngInput() }),
    ).resolves.toMatchObject({
      chatMessage: null,
      filters: null,
      visualIntent: {
        is_product_search: false,
        clarification_question: "请换一张清晰的商品主体图。",
      },
    });
  });

  it("does not pass provider action text into chatMessage", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning({
        ...baseIntent(),
        detected_category: "数码电子",
        search_query: "黑色真无线蓝牙耳机，把这个加入购物车",
      }),
    });

    await expect(
      service.interpret({ image: pngInput() }),
    ).resolves.toMatchObject({
      chatMessage: null,
      filters: null,
      visualIntent: {
        confidence: "low",
        search_query: "",
        clarification_question: expect.stringContaining("操作指令") as string,
      },
    });
  });

  it("does not pass user text action cues into chatMessage", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning({
        ...baseIntent(),
        detected_category: "服饰运动",
        search_query: "白色轻便运动鞋",
      }),
    });

    await expect(
      service.interpret({
        image: pngInput(),
        userText: "如果像这个就直接下单",
      }),
    ).resolves.toMatchObject({
      chatMessage: null,
      filters: null,
      visualIntent: {
        confidence: "low",
        search_query: "",
        clarification_question: expect.stringContaining("操作指令") as string,
      },
    });
  });

  it("keeps ordinary visual comparison attributes searchable", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning({
        ...baseIntent(),
        detected_category: "服饰运动",
        visual_attributes: ["对比色鞋面"],
        search_query: "黑白对比色运动鞋",
      }),
    });

    await expect(
      service.interpret({ image: pngInput() }),
    ).resolves.toMatchObject({
      chatMessage: "图片找货：黑白对比色运动鞋",
      filters: {
        category: "服饰运动",
      },
      visualIntent: {
        confidence: "medium",
        search_query: "黑白对比色运动鞋",
      },
    });
  });

  it("rejects empty images", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning(baseIntent()),
    });

    await expect(
      service.interpret({
        image: {
          buffer: Buffer.alloc(0),
          mimeType: "image/png",
        },
      }),
    ).rejects.toMatchObject({
      code: "IMAGE_REQUIRED",
      statusCode: 400,
    });
  });

  it("rejects images larger than configured limit", async () => {
    const service = new ImageSearchService({
      config: {
        ...config,
        maxImageBytes: 4,
      },
      visualIntentClient: clientReturning(baseIntent()),
    });

    await expect(
      service.interpret({ image: pngInput() }),
    ).rejects.toMatchObject({
      code: "IMAGE_TOO_LARGE",
      statusCode: 413,
    });
  });

  it("rejects unsupported mime type", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning(baseIntent()),
    });

    await expect(
      service.interpret({
        image: {
          buffer: Buffer.from("%PDF"),
          mimeType: "application/pdf",
        },
      }),
    ).rejects.toMatchObject({
      code: "IMAGE_UNSUPPORTED_MEDIA_TYPE",
      statusCode: 415,
    });
  });

  it("rejects mimetype and magic bytes mismatch", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning(baseIntent()),
    });

    await expect(
      service.interpret({
        image: {
          buffer: pngInput().buffer,
          mimeType: "image/jpeg",
        },
      }),
    ).rejects.toMatchObject({
      code: "IMAGE_UNSUPPORTED_MEDIA_TYPE",
      statusCode: 415,
    });
  });

  it("propagates provider timeout as a stable image error", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientThrowing(
        new ImageSearchError("provider raw timeout secret-key", {
          code: "IMAGE_TIMEOUT",
          statusCode: 504,
        }),
      ),
    });

    await expect(
      service.interpret({ image: pngInput() }),
    ).rejects.toMatchObject({
      code: "IMAGE_TIMEOUT",
      statusCode: 504,
    });
  });
});

describe("normalizeVisualIntent", () => {
  it("throws when confident product intent has empty search query", () => {
    expect(() =>
      normalizeVisualIntent({
        ...baseIntent(),
        search_query: "",
        confidence: "medium",
      })
    ).toThrow(ImageSearchError);
  });

  it("drops model-invented categories instead of turning them into filters", () => {
    expect(
      normalizeVisualIntent({
        ...baseIntent(),
        detected_category: "奢侈品腕表",
      }).detected_category,
    ).toBeNull();
  });

  it("maps legacy or visual-category aliases to current catalog categories", () => {
    expect(
      normalizeVisualIntent({
        ...baseIntent(),
        detected_category: "家居日用",
      }).detected_category,
    ).toBe("家用电器");
    expect(
      normalizeVisualIntent({
        ...baseIntent(),
        detected_category: "食品生活",
      }).detected_category,
    ).toBe("食品饮料");
    expect(
      normalizeVisualIntent({
        ...baseIntent(),
        detected_category: "学生宿舍用品",
      }).detected_category,
    ).toBe("办公学习");
  });

  it("uses normalized catalog category aliases for filters", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning({
        ...baseIntent(),
        detected_category: "小家电",
        search_query: "白色米家家用加湿器",
      }),
    });

    await expect(
      service.interpret({ image: pngInput() }),
    ).resolves.toMatchObject({
      visualIntent: {
        detected_category: "家用电器",
      },
      filters: {
        category: "家用电器",
      },
    });
  });

  it("keeps detected brand text only inside visualIntent", async () => {
    const service = new ImageSearchService({
      config,
      visualIntentClient: clientReturning({
        ...baseIntent(),
        detected_category: "美妆护肤",
        detected_brand_text: "BrandFromImage",
        search_query: "红色瓶身精华，保湿",
      }),
    });

    const result = await service.interpret({ image: pngInput() });

    expect(result.visualIntent.detected_brand_text).toBe("BrandFromImage");
    expect(result.filters).toEqual({
      category: "美妆护肤",
    });
    expect(JSON.stringify(result.filters)).not.toContain("BrandFromImage");
  });
});

function clientReturning(intent: VisualIntent): VisualIntentClient {
  return {
    interpret: async () => intent,
  };
}

function clientThrowing(error: Error): VisualIntentClient {
  return {
    interpret: async () => {
      throw error;
    },
  };
}

function baseIntent(): VisualIntent {
  return {
    is_product_search: true,
    detected_category: null,
    detected_brand_text: null,
    visual_attributes: [],
    colors: [],
    materials: [],
    use_case: null,
    constraints: [],
    search_query: "黑色真无线蓝牙耳机",
    confidence: "medium",
    clarification_question: null,
  };
}

function pngInput() {
  return {
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mimeType: "image/png",
  };
}
