import { Readable } from "node:stream";
import type { IncomingHttpHeaders } from "node:http";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImageSearchInterpretController } from "./image-search.controller";
import { createImageVectorSearchController } from "./image-vector-search.controller";
import { ImageSearchError } from "./image-search.types";
import type { ImageSearchInterpretResult } from "./image-search.types";

describe("createImageSearchInterpretController", () => {
  beforeEach(() => {
    process.env.IMAGE_SEARCH_PROVIDER = "openai-compatible";
    process.env.IMAGE_SEARCH_BASE_URL = "https://ark.example.com/api/v3";
    process.env.IMAGE_SEARCH_API_KEY = "server-secret-key";
    process.env.IMAGE_SEARCH_MODEL = "vision-model";
    process.env.IMAGE_SEARCH_MAX_IMAGE_BYTES = "4096";
  });

  it("returns ApiResponse visual intent for multipart image", async () => {
    const controller = createImageSearchInterpretController({
      interpret: async ({ image, userText, conversationId }) => {
        expect(image.buffer).toEqual(pngBuffer());
        expect(image.mimeType).toBe("image/png");
        expect(userText).toBe("便宜一点");
        expect(conversationId).toBe("conv-1");
        return successResult();
      },
    });
    const response = createMockResponse();

    await controller(
      createMultipartRequest({
        image: {
          fieldName: "image",
          content: pngBuffer(),
          mimeType: "image/png",
        },
        fields: {
          message: "  便宜一点  ",
          conversationId: "conv-1",
        },
      }),
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: successResult(),
    });
  });

  it("returns 400 when image field is missing", async () => {
    const controller = createImageSearchInterpretController({
      interpret: async () => {
        throw new Error("should not call service");
      },
    });
    const response = createMockResponse();

    await controller(
      createMultipartRequest({
        fields: {
          message: "推荐耳机",
        },
      }),
      response,
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "IMAGE_REQUIRED",
        message: "Missing image field.",
      },
    });
  });

  it("returns stable unsupported media response for non-image input", async () => {
    const controller = createImageSearchInterpretController({
      interpret: async () => {
        throw new ImageSearchError("provider should not leak", {
          code: "IMAGE_UNSUPPORTED_MEDIA_TYPE",
          statusCode: 415,
        });
      },
    });
    const response = createMockResponse();

    await controller(
      createMultipartRequest({
        image: {
          fieldName: "image",
          content: Buffer.from("%PDF"),
          mimeType: "application/pdf",
        },
      }),
      response,
    );

    expect(response.statusCode).toBe(415);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "IMAGE_UNSUPPORTED_MEDIA_TYPE",
        message: "暂不支持该图片格式。",
      },
    });
  });

  it("does not leak provider raw error or API key", async () => {
    const controller = createImageSearchInterpretController({
      interpret: async () => {
        throw new ImageSearchError("provider raw error server-secret-key", {
          code: "IMAGE_PROVIDER_UNAVAILABLE",
          statusCode: 502,
          providerStatusCode: 503,
          providerErrorCode: "ProviderDown",
          providerRequestId: "req-1",
        });
      },
    });
    const response = createMockResponse();

    await controller(
      createMultipartRequest({
        image: {
          fieldName: "image",
          content: pngBuffer(),
          mimeType: "image/png",
        },
      }),
      response,
    );

    expect(response.statusCode).toBe(502);
    expect(JSON.stringify(response.body)).not.toContain("server-secret-key");
    expect(response.body.error.code).toBe("IMAGE_PROVIDER_UNAVAILABLE");
    expect(response.body.error.message).toBe(
      "图片识别服务暂时不可用，请稍后重试。",
    );
  });

  it("returns stable config error when provider is disabled", async () => {
    process.env.IMAGE_SEARCH_PROVIDER = "disabled";
    process.env.IMAGE_SEARCH_BASE_URL = "";
    process.env.IMAGE_SEARCH_API_KEY = "";
    process.env.IMAGE_SEARCH_MODEL = "";
    const controller = createImageSearchInterpretController();
    const response = createMockResponse();

    await controller(
      createMultipartRequest({
        image: {
          fieldName: "image",
          content: pngBuffer(),
          mimeType: "image/png",
        },
      }),
      response,
    );

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "IMAGE_CONFIG_MISSING",
        message: "图片识别服务暂时不可用，请稍后重试。",
      },
    });
  });
});

describe("createImageVectorSearchController", () => {
  beforeEach(() => {
    process.env.IMAGE_SEARCH_MAX_IMAGE_BYTES = "4096";
  });

  it("validates image bytes before calling image vector search", async () => {
    const search = vi.fn(async () => ({
      mode: "image_vector" as const,
      hits: [],
      droppedProductIds: [],
    }));
    const controller = createImageVectorSearchController({ search });
    const response = createMockResponse();

    await controller(
      createMultipartRequest({
        image: {
          fieldName: "image",
          content: Buffer.from("%PDF"),
          mimeType: "image/jpeg",
        },
      }),
      response,
    );

    expect(search).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(415);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "IMAGE_UNSUPPORTED_MEDIA_TYPE",
        message: "暂不支持该图片格式。",
      },
    });
  });
});

function createMultipartRequest(input: {
  image?: {
    fieldName: string;
    content: Buffer;
    mimeType: string;
  };
  fields?: Record<string, string>;
}): Request {
  const boundary = "shopmate-image-search-boundary";
  const parts: Buffer[] = [];

  for (const [fieldName, value] of Object.entries(input.fields ?? {})) {
    parts.push(Buffer.from([
      `--${boundary}`,
      `Content-Disposition: form-data; name="${fieldName}"`,
      "",
      value,
    ].join("\r\n")));
    parts.push(Buffer.from("\r\n"));
  }

  if (input.image) {
    parts.push(Buffer.from([
      `--${boundary}`,
      `Content-Disposition: form-data; name="${input.image.fieldName}"; filename="upload.png"`,
      `Content-Type: ${input.image.mimeType}`,
      "",
    ].join("\r\n")));
    parts.push(Buffer.from("\r\n"));
    parts.push(input.image.content);
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const stream = Readable.from(parts) as Request;
  const headers: IncomingHttpHeaders = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };
  stream.headers = headers;
  stream.get = ((name: string) =>
    headers[name.toLowerCase()] as string | undefined) as Request["get"];
  return stream;
}

function createMockResponse(): Response & {
  statusCode?: number;
  body?: { error?: { code?: string; message?: string } };
} {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const response = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener);
      return response;
    }),
    off: vi.fn((event: string) => {
      listeners.delete(event);
      return response;
    }),
    status: vi.fn((statusCode: number) => {
      response.statusCode = statusCode;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };

  return response as unknown as Response & {
    statusCode?: number;
    body?: { error?: { code?: string; message?: string } };
  };
}

function successResult(): ImageSearchInterpretResult {
  return {
    visualIntent: {
      is_product_search: true,
      detected_category: "数码电子",
      detected_brand_text: null,
      visual_attributes: ["真无线耳机"],
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
  };
}

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
