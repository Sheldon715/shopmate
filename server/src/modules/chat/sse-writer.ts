import type { Response } from "express";
import type { ChatStreamEventName } from "./chat.types";

export type { ChatStreamEventName } from "./chat.types";

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
): Promise<boolean> {
  if (isResponseClosed(response)) {
    return Promise.resolve(false);
  }

  let payload: string;

  try {
    payload = JSON.stringify(data);
  } catch (error) {
    throw new SseSerializationError(error);
  }

  return writeSseChunk(response, `event: ${eventName}\ndata: ${payload}\n\n`);
}

export function writeSseComment(
  response: Response,
  comment: string,
): Promise<boolean> {
  if (isResponseClosed(response)) {
    return Promise.resolve(false);
  }

  return writeSseChunk(response, `: ${comment}\n\n`);
}

async function writeSseChunk(
  response: Response,
  chunk: string,
): Promise<boolean> {
  try {
    const canContinue = response.write(chunk);

    if (canContinue) {
      return true;
    }

    return await waitForDrainOrClose(response);
  } catch {
    return false;
  }
}

function waitForDrainOrClose(response: Response): Promise<boolean> {
  if (isResponseClosed(response)) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      response.off("drain", handleDrain);
      response.off("close", handleClose);
      response.off("error", handleClose);
    };
    const handleDrain = () => {
      cleanup();
      resolve(!isResponseClosed(response));
    };
    const handleClose = () => {
      cleanup();
      resolve(false);
    };

    response.once("drain", handleDrain);
    response.once("close", handleClose);
    response.once("error", handleClose);
  });
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
