import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { fail } from "../../types/api-response";
import type {
  ChatDonePayload,
  ChatErrorPayload,
  ChatMessageDeltaPayload,
  ChatProductCardsPayload,
  RagChatRequest,
  RagChatResult,
} from "./chat.types";
import {
  CHAT_STREAM_REQUEST_ERROR_CODE,
  ChatStreamRequestError,
  parseChatStreamRequestBody,
} from "./chat-stream.request";
import { RagChatError, RagChatService } from "./rag.service";
import {
  SseSerializationError,
  chunkMessageDelta,
  startSseStream,
  writeSseEvent,
} from "./sse-writer";

export interface ChatAnswerService {
  answer(input: RagChatRequest): Promise<RagChatResult>;
}

type SseWriteStatus = "ok" | "closed" | "serialization_error";

export function createChatStreamController(
  chatService: ChatAnswerService = new RagChatService(),
) {
  return async function chatStreamController(
    request: Request,
    response: Response,
  ): Promise<void> {
    await handleChatStream(request, response, chatService);
  };
}

async function handleChatStream(
  request: Request,
  response: Response,
  chatService: ChatAnswerService,
): Promise<void> {
  const abortController = new AbortController();
  let clientClosed = false;
  let responseFinished = false;
  let sseStarted = false;

  const handleClientClose = () => {
    if (!responseFinished) {
      clientClosed = true;
      abortController.abort();
    }
  };

  response.on("close", handleClientClose);

  try {
    const body = parseChatStreamRequestBody(request.body);
    const requestId = resolveRequestId(request);

    response.status(200);
    startSseStream(response);
    sseStarted = true;

    const result = await chatService.answer({
      ...body,
      requestId,
      abortSignal: abortController.signal,
    });

    if (clientClosed || isResponseClosed(response)) {
      return;
    }

    const writeStatus = await writeChatResult(response, result);

    if (writeStatus === "serialization_error") {
      await writeSseError(response, {
        code: "SSE_SERIALIZATION_ERROR",
        message: "Chat stream payload could not be serialized.",
        retryable: false,
      });
    }

    if (writeStatus !== "closed") {
      responseFinished = true;
      response.end();
    }
  } catch (error) {
    if (clientClosed || isResponseClosed(response)) {
      return;
    }

    if (!sseStarted) {
      writeJsonError(response, error);
      responseFinished = true;
      return;
    }

    const chatError = mapStreamError(error);
    const writeStatus = await writeSseError(response, chatError);

    if (writeStatus !== "closed") {
      responseFinished = true;
      response.end();
    }
  } finally {
    response.off("close", handleClientClose);
  }
}

async function writeChatResult(
  response: Response,
  result: RagChatResult,
): Promise<SseWriteStatus> {
  const chunks = chunkMessageDelta(result.answer);

  for (const [index, text] of chunks.entries()) {
    const payload: ChatMessageDeltaPayload = {
      text,
      index,
    };
    const status = await safeWriteSseEvent(response, "message_delta", payload);

    if (status !== "ok") {
      return status;
    }
  }

  const productCardsPayload: ChatProductCardsPayload = {
    items: result.productCards,
  };
  const productCardsStatus = await safeWriteSseEvent(
    response,
    "product_cards",
    productCardsPayload,
  );

  if (productCardsStatus !== "ok") {
    return productCardsStatus;
  }

  const donePayload: ChatDonePayload = {
    recommendedProductIds: result.recommendedProductIds,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason,
    retrieval: result.retrieval,
    contextMemory: result.contextMemory,
  };

  return safeWriteSseEvent(response, "done", donePayload);
}

function writeJsonError(response: Response, error: unknown): void {
  if (error instanceof ChatStreamRequestError) {
    response.status(400).json(fail(error.code, error.message));
    return;
  }

  if (error instanceof RagChatError) {
    response
      .status(400)
      .json(fail(CHAT_STREAM_REQUEST_ERROR_CODE, error.message));
    return;
  }

  logUnexpectedError(error);
  response.status(500).json(fail("INTERNAL_ERROR", "Chat stream failed."));
}

function mapStreamError(error: unknown): ChatErrorPayload {
  if (error instanceof RagChatError) {
    return {
      code: CHAT_STREAM_REQUEST_ERROR_CODE,
      message: error.message,
      retryable: false,
    };
  }

  logUnexpectedError(error);

  return {
    code: "CHAT_STREAM_ERROR",
    message: "Chat stream failed.",
    retryable: true,
  };
}

function writeSseError(
  response: Response,
  error: ChatErrorPayload,
): Promise<SseWriteStatus> {
  return safeWriteSseEvent(response, "error", error);
}

async function safeWriteSseEvent(
  response: Response,
  eventName: Parameters<typeof writeSseEvent>[1],
  data: unknown,
): Promise<SseWriteStatus> {
  try {
    return await writeSseEvent(response, eventName, data) ? "ok" : "closed";
  } catch (error) {
    if (error instanceof SseSerializationError) {
      return "serialization_error";
    }

    throw error;
  }
}

function resolveRequestId(request: Request): string {
  return request.get("x-request-id")?.trim() || randomUUID();
}

function isResponseClosed(response: Response): boolean {
  return response.writableEnded || response.destroyed;
}

function logUnexpectedError(error: unknown): void {
  console.error("Chat stream error:", error);
}
