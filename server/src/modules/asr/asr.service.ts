import { loadAsrConfig } from "./asr.config";
import type { AsrConfig } from "./asr.config";
import { LlmAudioAsrClient } from "./llm-audio-asr.client";
import type {
  AsrProvider,
  AsrTranscribeRequest,
  AsrTranscribeResult,
} from "./asr.types";
import { AsrError } from "./asr.types";

export interface AsrServiceOptions {
  config?: AsrConfig;
  provider?: AsrProvider;
}

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
]);

export class AsrService {
  private readonly config: AsrConfig;
  private readonly provider: AsrProvider;

  constructor(options: AsrServiceOptions = {}) {
    this.config = options.config ?? loadAsrConfig();
    this.provider = options.provider ?? new LlmAudioAsrClient({ config: this.config });
  }

  async transcribe(
    request: AsrTranscribeRequest,
  ): Promise<AsrTranscribeResult> {
    validateAudio(request.audio.buffer, request.audio.mimeType, this.config);

    const result = await this.provider.transcribe(request);
    const transcript = normalizeTranscript(result.transcript);

    if (transcript.length === 0) {
      throw new AsrError("没有识别到语音，请再试一次。", {
        code: "ASR_TRANSCRIPT_EMPTY",
        statusCode: 400,
      });
    }

    return {
      transcript,
      language: result.language?.trim() || this.config.language,
      provider: result.provider?.trim() || this.config.provider,
      model: safeModelName(result.model?.trim() || this.config.model || "unknown"),
    };
  }
}

export function validateAudio(
  buffer: Buffer,
  mimeType: string,
  config: Pick<AsrConfig, "maxAudioBytes">,
): void {
  if (buffer.length === 0) {
    throw new AsrError("Audio file is required.", {
      code: "ASR_AUDIO_REQUIRED",
      statusCode: 400,
    });
  }

  if (buffer.length > config.maxAudioBytes) {
    throw new AsrError("Audio file is too large.", {
      code: "ASR_AUDIO_TOO_LARGE",
      statusCode: 413,
    });
  }

  const normalizedMimeType = normalizeMimeType(mimeType);

  if (!SUPPORTED_AUDIO_MIME_TYPES.has(normalizedMimeType)) {
    throw new AsrError("Unsupported audio type.", {
      code: "ASR_UNSUPPORTED_MEDIA_TYPE",
      statusCode: 415,
    });
  }
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function normalizeTranscript(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 2000);
}

function safeModelName(value: string): string {
  return value.replace(/[^\w.:-]/g, "").slice(0, 120) || "unknown";
}
