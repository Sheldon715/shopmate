import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { ok, fail } from "../../types/api-response";
import { loadAsrConfig } from "./asr.config";
import { readMultipartAudio } from "./asr.multipart";
import { AsrService } from "./asr.service";
import { AsrError } from "./asr.types";
import type { AsrTranscribeResult } from "./asr.types";

export interface AsrTranscribeService {
  transcribe(input: {
    audio: { buffer: Buffer; mimeType: string; filename?: string };
    requestId?: string;
    abortSignal?: AbortSignal;
  }): Promise<AsrTranscribeResult>;
}

export function createAsrTranscribeController(
  asrService?: AsrTranscribeService,
) {
  let defaultAsrService = asrService;

  return async function asrTranscribeController(
    request: Request,
    response: Response,
  ): Promise<void> {
    const startedAt = Date.now();
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    response.on("close", onClose);
    const requestId = request.get("x-request-id")?.trim() || randomUUID();
    let audioMeta:
      | { bytes: number; mimeType: string; filename?: string }
      | undefined;

    try {
      const config = defaultAsrService ? undefined : loadAsrConfig();
      defaultAsrService ??= new AsrService({ config });
      const maxAudioBytes = config?.maxAudioBytes ?? loadAsrConfig().maxAudioBytes;
      const audio = await readMultipartAudio(request, maxAudioBytes);
      audioMeta = {
        bytes: audio.buffer.length,
        mimeType: audio.mimeType,
        filename: audio.filename,
      };
      const result = await defaultAsrService.transcribe({
        audio,
        requestId,
        abortSignal: abortController.signal,
      });

      logAsrRequest({
        requestId,
        status: "success",
        latencyMs: Date.now() - startedAt,
        audioMeta,
        transcriptLength: result.transcript.length,
      });
      response.status(200).json(ok(result));
    } catch (error) {
      const asrError = mapAsrError(error);
      logAsrRequest({
        requestId,
        status: "error",
        latencyMs: Date.now() - startedAt,
        audioMeta,
        errorCode: asrError.code,
        providerStatusCode: asrError.providerStatusCode,
        providerErrorCode: asrError.providerErrorCode,
        providerRequestId: asrError.providerRequestId,
      });
      response
        .status(asrError.statusCode)
        .json(fail(asrError.code, asrError.message));
    } finally {
      response.off("close", onClose);
    }
  };
}

function logAsrRequest(event: {
  requestId: string;
  status: "success" | "error";
  latencyMs: number;
  audioMeta?: { bytes: number; mimeType: string; filename?: string };
  transcriptLength?: number;
  errorCode?: string;
  providerStatusCode?: number;
  providerErrorCode?: string;
  providerRequestId?: string;
}): void {
  console.info("ASR transcribe", {
    requestId: event.requestId,
    status: event.status,
    latencyMs: event.latencyMs,
    audio: event.audioMeta
      ? {
        bytes: event.audioMeta.bytes,
        mimeType: event.audioMeta.mimeType,
        filename: event.audioMeta.filename,
      }
      : undefined,
    transcriptLength: event.transcriptLength,
    errorCode: event.errorCode,
    provider: event.providerStatusCode
      ? {
        statusCode: event.providerStatusCode,
        errorCode: event.providerErrorCode,
        requestId: event.providerRequestId,
      }
      : undefined,
  });
}

function mapAsrError(error: unknown): AsrError {
  if (error instanceof AsrError) {
    return new AsrError(safeAsrMessage(error), {
      code: error.code,
      statusCode: error.statusCode,
      retryable: error.retryable,
      providerStatusCode: error.providerStatusCode,
      providerErrorCode: error.providerErrorCode,
      providerRequestId: error.providerRequestId,
    });
  }

  console.error("ASR error:", error);

  return new AsrError("语音识别失败，请再试一次。", {
    code: "ASR_REQUEST_FAILED",
    statusCode: 500,
  });
}

function safeAsrMessage(error: AsrError): string {
  switch (error.code) {
    case "ASR_AUDIO_REQUIRED":
      return error.message;
    case "ASR_AUDIO_TOO_LARGE":
      return "语音文件过大，请缩短录音后再试。";
    case "ASR_UNSUPPORTED_MEDIA_TYPE":
      return "暂不支持该音频格式。";
    case "ASR_TRANSCRIPT_EMPTY":
      return "没有识别到语音，请再试一次。";
    case "ASR_TIMEOUT":
      return "语音识别超时，请稍后重试。";
    case "ASR_CONFIG_MISSING":
    case "ASR_PROVIDER_UNAVAILABLE":
      return "语音识别服务暂时不可用，请稍后重试。";
    case "ASR_INVALID_OUTPUT":
    case "ASR_REQUEST_FAILED":
      return "语音识别失败，请再试一次。";
  }
}
