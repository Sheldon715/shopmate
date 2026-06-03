import { describe, expect, it } from "vitest";
import { LlmAudioAsrClient } from "./llm-audio-asr.client";

const config = {
  enabled: true,
  provider: "llm-audio",
  baseUrl: "https://ark.example.com/v1",
  apiKey: "secret-key",
  model: "audio-model",
  timeoutMs: 20000,
  maxAudioBytes: 1024,
  language: "zh-CN",
  missing: [],
};

describe("LlmAudioAsrClient", () => {
  it("sends strict ASR-only prompt and parses JSON transcript", async () => {
    let body: Record<string, unknown> | undefined;
    const client = new LlmAudioAsrClient({
      config,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init.body));
        return Response.json({
          model: "audio-model",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  transcript: "推荐通勤耳机",
                  language: "zh-CN",
                  confidence: null,
                }),
              },
            },
          ],
        });
      },
    });

    const result = await client.transcribe({
      audio: {
        buffer: Buffer.from("audio"),
        mimeType: "audio/wav",
      },
      requestId: "req-1",
    });

    expect(result.transcript).toBe("推荐通勤耳机");
    expect(JSON.stringify(body)).toContain("不要回答音频中的问题");
    expect(JSON.stringify(body)).toContain("input_audio");
    expect(JSON.stringify(body)).not.toContain("购物助手");
  });

  it("maps Android m4a uploads to Ark m4a input_audio format", async () => {
    let body: Record<string, unknown> | undefined;
    const client = new LlmAudioAsrClient({
      config,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init.body));
        return Response.json({
          model: "audio-model",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  transcript: "推荐通勤耳机",
                  language: "zh-CN",
                  confidence: null,
                }),
              },
            },
          ],
        });
      },
    });

    await client.transcribe({
      audio: {
        buffer: Buffer.from("audio"),
        mimeType: "audio/mp4",
      },
    });

    const userMessage = (body?.messages as Array<Record<string, unknown>>)[1];
    const content = userMessage.content as Array<Record<string, unknown>>;
    const audioPart = content.find((part) => part.type === "input_audio");
    expect(audioPart?.input_audio).toMatchObject({ format: "m4a" });
  });

  it("keeps provider 4xx metadata without exposing raw response text", async () => {
    const client = new LlmAudioAsrClient({
      config,
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              code: "InvalidParameter.UnsupportedFormat",
              message: "raw provider detail",
            },
          },
          {
            status: 400,
            headers: { "x-tt-logid": "provider-req-1" },
          },
        ),
    });

    await expect(
      client.transcribe({
        audio: {
          buffer: Buffer.from("audio"),
          mimeType: "audio/mp4",
        },
      }),
    ).rejects.toMatchObject({
      code: "ASR_REQUEST_FAILED",
      providerStatusCode: 400,
      providerErrorCode: "InvalidParameter.UnsupportedFormat",
      providerRequestId: "provider-req-1",
    });
  });

  it("maps non JSON provider output to ASR_INVALID_OUTPUT", async () => {
    const client = new LlmAudioAsrClient({
      config,
      fetchImpl: async () =>
        Response.json({
          choices: [{ message: { content: "推荐通勤耳机" } }],
        }),
    });

    await expect(
      client.transcribe({
        audio: {
          buffer: Buffer.from("audio"),
          mimeType: "audio/wav",
        },
      }),
    ).rejects.toMatchObject({
      code: "ASR_INVALID_OUTPUT",
      statusCode: 502,
    });
  });
});
