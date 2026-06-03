export type AsrErrorCode =
  | "ASR_CONFIG_MISSING"
  | "ASR_AUDIO_REQUIRED"
  | "ASR_AUDIO_TOO_LARGE"
  | "ASR_UNSUPPORTED_MEDIA_TYPE"
  | "ASR_TRANSCRIPT_EMPTY"
  | "ASR_INVALID_OUTPUT"
  | "ASR_TIMEOUT"
  | "ASR_PROVIDER_UNAVAILABLE"
  | "ASR_REQUEST_FAILED";

export interface AsrAudioInput {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}

export interface AsrTranscribeRequest {
  audio: AsrAudioInput;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface AsrTranscribeResult {
  transcript: string;
  language: string;
  provider: string;
  model: string;
}

export interface AsrProviderTranscribeRequest {
  audio: AsrAudioInput;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface AsrProviderTranscribeResult {
  transcript: string;
  language?: string;
  confidence?: number | null;
  model?: string;
  provider?: string;
}

export interface AsrProvider {
  transcribe(
    request: AsrProviderTranscribeRequest,
  ): Promise<AsrProviderTranscribeResult>;
}

export interface AsrErrorOptions {
  code: AsrErrorCode;
  statusCode?: number;
  retryable?: boolean;
  cause?: unknown;
  providerStatusCode?: number;
  providerErrorCode?: string;
  providerRequestId?: string;
}

export class AsrError extends Error {
  readonly code: AsrErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly providerStatusCode?: number;
  readonly providerErrorCode?: string;
  readonly providerRequestId?: string;

  constructor(message: string, options: AsrErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "AsrError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.retryable = options.retryable ?? false;
    this.providerStatusCode = options.providerStatusCode;
    this.providerErrorCode = options.providerErrorCode;
    this.providerRequestId = options.providerRequestId;
  }
}
