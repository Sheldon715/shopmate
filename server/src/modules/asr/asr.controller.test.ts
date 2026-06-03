import { Readable } from "node:stream";
import type { IncomingHttpHeaders } from "node:http";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAsrTranscribeController } from "./asr.controller";
import { AsrError } from "./asr.types";

describe("createAsrTranscribeController", () => {
  beforeEach(() => {
    process.env.LLM_API_KEY = "server-secret-key";
    process.env.LLM_BASE_URL = "https://ark.example.com/v1";
    process.env.LLM_MODEL = "audio-model";
    process.env.ASR_MAX_AUDIO_BYTES = "4096";
  });

  it("returns ApiResponse transcript for multipart audio", async () => {
    const controller = createAsrTranscribeController({
      transcribe: async ({ audio }) => ({
        transcript: audio.buffer.toString("utf8"),
        language: "zh-CN",
        provider: "llm-audio",
        model: "audio-model",
      }),
    });
    const response = createMockResponse();

    await controller(
      createMultipartRequest({
        fieldName: "audio",
        content: "推荐通勤耳机",
        mimeType: "audio/wav",
      }),
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        transcript: "推荐通勤耳机",
        language: "zh-CN",
        provider: "llm-audio",
        model: "audio-model",
      },
    });
  });

  it("returns 400 when audio field is missing", async () => {
    const controller = createAsrTranscribeController({
      transcribe: async () => {
        throw new Error("should not call service");
      },
    });
    const response = createMockResponse();

    await controller(
      createMultipartRequest({
        fieldName: "file",
        content: "推荐通勤耳机",
        mimeType: "audio/wav",
      }),
      response,
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "ASR_AUDIO_REQUIRED",
        message: "Missing audio field.",
      },
    });
  });

  it("does not leak provider raw error or API key", async () => {
    const controller = createAsrTranscribeController({
      transcribe: async () => {
        throw new AsrError("provider raw error server-secret-key", {
          code: "ASR_PROVIDER_UNAVAILABLE",
          statusCode: 502,
        });
      },
    });
    const response = createMockResponse();

    await controller(
      createMultipartRequest({
        fieldName: "audio",
        content: "推荐通勤耳机",
        mimeType: "audio/wav",
      }),
      response,
    );

    expect(response.statusCode).toBe(502);
    expect(JSON.stringify(response.body)).not.toContain("server-secret-key");
    expect(response.body.error.code).toBe("ASR_PROVIDER_UNAVAILABLE");
  });
});

function createMultipartRequest(input: {
  fieldName: string;
  content: string;
  mimeType: string;
}): Request {
  const boundary = "shopmate-test-boundary";
  const body = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${input.fieldName}"; filename="voice.wav"`,
      `Content-Type: ${input.mimeType}`,
      "",
      input.content,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
  const stream = Readable.from([body]) as Request;
  const headers: IncomingHttpHeaders = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };
  stream.headers = headers;
  stream.get = ((name: string) => headers[name.toLowerCase()] as string | undefined) as Request["get"];
  return stream;
}

function createMockResponse(): Response & {
  statusCode?: number;
  body?: unknown;
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
    body?: unknown;
  };
}
