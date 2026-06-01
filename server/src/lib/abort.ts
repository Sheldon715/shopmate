export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }

  const reason = signal.reason;

  if (reason instanceof Error) {
    throw reason;
  }

  const error = new Error(
    typeof reason === "string" && reason.trim().length > 0
      ? reason
      : "Request aborted.",
  );
  error.name = "AbortError";
  throw error;
}

export function rethrowIfAborted(
  signal: AbortSignal | undefined,
  error: unknown,
): void {
  if (signal?.aborted || isAbortError(error)) {
    throw error instanceof Error ? error : createAbortError();
  }
}

export function isAbortError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "name" in error
      && ((error as { name?: unknown }).name === "AbortError"
        || (error as { name?: unknown }).name === "TimeoutError"),
  );
}

function createAbortError(): Error {
  const error = new Error("Request aborted.");
  error.name = "AbortError";
  return error;
}
