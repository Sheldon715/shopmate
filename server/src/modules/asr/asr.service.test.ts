import { describe, expect, it } from "vitest";
import { AsrService } from "./asr.service";
import type { AsrProvider } from "./asr.types";
import { AsrError } from "./asr.types";

const config = {
  enabled: true,
  provider: "llm-audio",
  baseUrl: "https://asr.example.com/v1",
  apiKey: "secret-key",
  model: "asr-model",
  timeoutMs: 20000,
  maxAudioBytes: 16,
  language: "zh-CN",
  missing: [],
};

describe("AsrService", () => {
  it("returns a cleaned transcript and safe metadata", async () => {
    const service = new AsrService({
      config,
      provider: providerReturning({
        transcript: "  推荐一款通勤耳机  ",
        language: "zh-CN",
        model: "asr model with spaces!",
      }),
    });

    await expect(
      service.transcribe({
        audio: audioInput(),
      }),
    ).resolves.toEqual({
      transcript: "推荐一款通勤耳机",
      language: "zh-CN",
      provider: "llm-audio",
      model: "asrmodelwithspaces",
    });
  });

  it("rejects empty transcript", async () => {
    const service = new AsrService({
      config,
      provider: providerReturning({ transcript: "  " }),
    });

    await expect(service.transcribe({ audio: audioInput() })).rejects.toMatchObject({
      code: "ASR_TRANSCRIPT_EMPTY",
      statusCode: 400,
    });
  });

  it("maps provider timeout", async () => {
    const service = new AsrService({
      config,
      provider: providerThrowing(
        new AsrError("provider raw timeout secret-key", {
          code: "ASR_TIMEOUT",
          statusCode: 504,
          retryable: true,
        }),
      ),
    });

    await expect(service.transcribe({ audio: audioInput() })).rejects.toMatchObject({
      code: "ASR_TIMEOUT",
      statusCode: 504,
    });
  });

  it("rejects files larger than the configured limit", async () => {
    const service = new AsrService({
      config,
      provider: providerReturning({ transcript: "不会调用" }),
    });

    await expect(
      service.transcribe({
        audio: {
          buffer: Buffer.alloc(17),
          mimeType: "audio/wav",
        },
      }),
    ).rejects.toMatchObject({
      code: "ASR_AUDIO_TOO_LARGE",
      statusCode: 413,
    });
  });

  it("rejects non-audio mime types", async () => {
    const service = new AsrService({
      config,
      provider: providerReturning({ transcript: "不会调用" }),
    });

    await expect(
      service.transcribe({
        audio: {
          buffer: Buffer.from("text"),
          mimeType: "text/plain",
        },
      }),
    ).rejects.toMatchObject({
      code: "ASR_UNSUPPORTED_MEDIA_TYPE",
      statusCode: 415,
    });
  });

  it("accepts Ark documented aac audio mime type", async () => {
    const service = new AsrService({
      config,
      provider: providerReturning({ transcript: "推荐通勤耳机" }),
    });

    await expect(
      service.transcribe({
        audio: {
          buffer: Buffer.from("aac"),
          mimeType: "audio/aac",
        },
      }),
    ).resolves.toMatchObject({
      transcript: "推荐通勤耳机",
    });
  });
});

function providerReturning(
  result: Awaited<ReturnType<AsrProvider["transcribe"]>>,
): AsrProvider {
  return {
    transcribe: async () => result,
  };
}

function providerThrowing(error: Error): AsrProvider {
  return {
    transcribe: async () => {
      throw error;
    },
  };
}

function audioInput() {
  return {
    buffer: Buffer.from("wav"),
    mimeType: "audio/wav",
  };
}
