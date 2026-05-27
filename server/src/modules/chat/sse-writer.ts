import type { Response } from "express";

export type ChatStreamEventName =
  | "message_delta"
  | "product_cards"
  | "done"
  | "error";

export class SseSerializationError extends Error {
  readonly code = "SSE_SERIALIZATION_ERROR";

  constructor(cause: unknown) {
    super("SSE event payload could not be serialized.");
    this.name = "SseSerializationError";
    this.cause = cause;
  }
}

export function startSseStream(response: Response): void {
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders?.();
}

export function writeSseEvent(
  response: Response,
  eventName: ChatStreamEventName,
  data: unknown,
): boolean {
  if (isResponseClosed(response)) {
    return false;
  }

  let payload: string;

  try {
    payload = JSON.stringify(data);
  } catch (error) {
    throw new SseSerializationError(error);
  }

  try {
    response.write(`event: ${eventName}\ndata: ${payload}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export function writeSseComment(
  response: Response,
  comment: string,
): boolean {
  if (isResponseClosed(response)) {
    return false;
  }

  try {
    response.write(`: ${comment}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export function chunkMessageDelta(
  answer: string,
  chunkSize = 100,
): string[] {
  if (chunkSize < 1 || !Number.isInteger(chunkSize)) {
    throw new Error("chunkSize must be a positive integer.");
  }

  const characters = Array.from(answer);
  const chunks: string[] = [];

  for (let index = 0; index < characters.length; index += chunkSize) {
    chunks.push(characters.slice(index, index + chunkSize).join(""));
  }

  return chunks;
}

function isResponseClosed(response: Response): boolean {
  return response.writableEnded || response.destroyed;
}
