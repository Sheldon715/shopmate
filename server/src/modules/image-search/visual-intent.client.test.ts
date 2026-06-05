import { describe, expect, it, vi } from "vitest";
import type { ImageSearchConfig } from "./image-search.config";
import { OpenAiVisualIntentClient } from "./visual-intent.client";

const config: ImageSearchConfig = {
  enabled: true,
  provider: "openai-compatible",
  baseUrl: "https://ark.example.com/api/v3",
  apiKey: "secret-key",
  model: "vision-model",
  timeoutMs: 25000,
  maxImageBytes: 1024,
  maxCompletionTokens: 700,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  missing: [],
};

describe("OpenAiVisualIntentClient", () => {
  it("sends an OpenAI-compatible multimodal request and parses JSON content", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                is_product_search: true,
                detected_category: "数码电子",
                detected_brand_text: null,
                visual_attributes: ["真无线耳机"],
                colors: ["黑色"],
                materials: [],
                use_case: "通勤",
                constraints: [],
                search_query: "黑色真无线蓝牙耳机",
                confidence: "medium",
                clarification_question: null,
              }),
            },
          },
        ],
      }))
    );
    const client = new OpenAiVisualIntentClient({
      config,
      fetchImpl,
    });

    const result = await client.interpret({
      image: {
        buffer: Buffer.from([0x89, 0x50]),
        mimeType: "image/png",
      },
      userText: "便宜一点",
      requestId: "req-1",
    });

    expect(result.search_query).toBe("黑色真无线蓝牙耳机");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ark.example.com/api/v3/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Authorization": "Bearer secret-key",
          "X-Request-Id": "req-1",
        }),
      }),
    );
    const requestBody = JSON.parse(
      (fetchImpl.mock.calls[0]?.[1]?.body as string) ?? "{}",
    ) as {
      model?: string;
      messages?: Array<{
        role: string;
        content: unknown;
      }>;
    };
    expect(requestBody.model).toBe("vision-model");
    const userMessage = requestBody.messages?.[1];
    expect(userMessage?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("便宜一点"),
        }),
        expect.objectContaining({
          type: "image_url",
          image_url: expect.objectContaining({
            url: expect.stringMatching(/^data:image\/png;base64,/),
            detail: "low",
          }),
        }),
      ]),
    );
  });

  it("returns a stable config error when image provider is disabled", async () => {
    const client = new OpenAiVisualIntentClient({
      config: {
        ...config,
        enabled: false,
        provider: "disabled",
        baseUrl: undefined,
        apiKey: undefined,
        model: undefined,
        missing: ["IMAGE_SEARCH_PROVIDER"],
      },
      fetchImpl: vi.fn(),
    });

    await expect(
      client.interpret({
        image: {
          buffer: Buffer.from([0x89, 0x50]),
          mimeType: "image/png",
        },
      }),
    ).rejects.toMatchObject({
      code: "IMAGE_CONFIG_MISSING",
      statusCode: 500,
    });
  });

  it("maps provider invalid JSON to IMAGE_INVALID_OUTPUT", async () => {
    const client = new OpenAiVisualIntentClient({
      config,
      fetchImpl: async () =>
        new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: "not json",
              },
            },
          ],
        })),
    });

    await expect(
      client.interpret({
        image: {
          buffer: Buffer.from([0x89, 0x50]),
          mimeType: "image/png",
        },
      }),
    ).rejects.toMatchObject({
      code: "IMAGE_INVALID_OUTPUT",
      statusCode: 502,
    });
  });
});
