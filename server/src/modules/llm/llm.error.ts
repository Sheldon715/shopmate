export type LlmErrorCode =
  | "LLM_CONFIG_MISSING"
  | "LLM_BAD_BASE_URL"
  | "LLM_AUTH_FAILED"
  | "LLM_BAD_REQUEST"
  | "LLM_RATE_LIMITED"
  | "LLM_TIMEOUT"
  | "LLM_PROVIDER_UNAVAILABLE"
  | "LLM_INVALID_RESPONSE"
  | "LLM_EMPTY_RESPONSE"
  | "LLM_REQUEST_FAILED";

export interface LlmErrorOptions {
  code: LlmErrorCode;
  retryable?: boolean;
  statusCode?: number;
  providerRequestId?: string;
  cause?: unknown;
}

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly providerRequestId?: string;

  constructor(message: string, options: LlmErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "LlmError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.statusCode = options.statusCode;
    this.providerRequestId = options.providerRequestId;
  }
}

export function isRetryableHttpStatus(statusCode: number): boolean {
  return (
    statusCode === 408
    || statusCode === 409
    || statusCode === 429
    || statusCode >= 500
  );
}

export function mapHttpStatusToLlmError(
  statusCode: number,
  statusText: string,
  bodyText?: string,
  providerRequestId?: string,
): LlmError {
  const detail = bodyText ? `: ${bodyText}` : "";
  const message = `LLM provider request failed with HTTP ${statusCode} ${statusText}${detail}`;
  const retryable = isRetryableHttpStatus(statusCode);

  if (statusCode === 401 || statusCode === 403) {
    return new LlmError(message, {
      code: "LLM_AUTH_FAILED",
      statusCode,
      providerRequestId,
    });
  }

  if (statusCode === 400 || statusCode === 422) {
    return new LlmError(message, {
      code: "LLM_BAD_REQUEST",
      statusCode,
      providerRequestId,
    });
  }

  if (statusCode === 408) {
    return new LlmError(message, {
      code: "LLM_TIMEOUT",
      retryable,
      statusCode,
      providerRequestId,
    });
  }

  if (statusCode === 429) {
    return new LlmError(message, {
      code: "LLM_RATE_LIMITED",
      retryable,
      statusCode,
      providerRequestId,
    });
  }

  if (statusCode >= 500) {
    return new LlmError(message, {
      code: "LLM_PROVIDER_UNAVAILABLE",
      retryable,
      statusCode,
      providerRequestId,
    });
  }

  return new LlmError(message, {
    code: "LLM_REQUEST_FAILED",
    retryable,
    statusCode,
    providerRequestId,
  });
}
