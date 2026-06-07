import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { fail } from "../../types/api-response";
import type {
  ChatCheckoutActionPayload,
  ChatDonePayload,
  ChatComparisonResultPayload,
  ChatErrorPayload,
  ChatMessageDeltaPayload,
  ChatProductCardsPayload,
  ChatStreamWriter,
  RagChatRequest,
  RagChatResult,
} from "./chat.types";
import { ChatTiming, type ChatTimingTracker } from "./chat-timing";
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
  answerStream?(
    input: RagChatRequest,
    writer: ChatStreamWriter,
  ): Promise<void>;
}

type SseWriteStatus = "ok" | "closed" | "serialization_error";

export function createChatStreamController(
  chatService?: ChatAnswerService,
) {
  let defaultChatService: ChatAnswerService | undefined = chatService;

  return async function chatStreamController(
    request: Request,
    response: Response,
  ): Promise<void> {
    defaultChatService ??= new RagChatService();
    await handleChatStream(request, response, defaultChatService);
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
    const timing = new ChatTiming();
    timing.mark("request_received");

    response.status(200);
    startSseStream(response);
    sseStarted = true;
    timing.mark("sse_started");

    const answerInput: RagChatRequest = {
      ...body,
      requestId,
      abortSignal: abortController.signal,
      timing,
    };

    if (chatService.answerStream) {
      await chatService.answerStream(
        answerInput,
        createChatStreamWriter(response, timing),
      );

      if (!clientClosed && !isResponseClosed(response)) {
        responseFinished = true;
        response.end();
      }
      return;
    }

    const result = await chatService.answer(answerInput);

    if (clientClosed || isResponseClosed(response)) {
      return;
    }

    const writeStatus = await writeChatResult(response, result, timing);

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
  timing?: ChatTimingTracker,
): Promise<SseWriteStatus> {
  const chunks = chunkMessageDelta(result.answer);

  if (result.checkoutAction) {
    const checkoutActionStatus = await safeWriteSseEvent(
      response,
      "checkout_action",
      result.checkoutAction,
    );

    if (checkoutActionStatus !== "ok") {
      return checkoutActionStatus;
    }
  }

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

  if (result.comparisonResult) {
    const comparisonPayload: ChatComparisonResultPayload = result.comparisonResult;
    const comparisonStatus = await safeWriteSseEvent(
      response,
      "comparison_result",
      comparisonPayload,
    );

    if (comparisonStatus !== "ok") {
      return comparisonStatus;
    }
  }

  timing?.mark("done_sent");
  const donePayload: ChatDonePayload = {
    recommendedProductIds: result.recommendedProductIds,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason,
    clarification: result.clarification,
    retrieval: withTiming(result.retrieval, timing),
    contextMemory: result.contextMemory,
    cartAction: result.cartAction,
    checkoutAction: result.checkoutAction,
  };

  return safeWriteSseEvent(response, "done", donePayload);
}

function createChatStreamWriter(
  response: Response,
  timing: ChatTimingTracker,
): ChatStreamWriter {
  let messageIndex = 0;

  return {
    writeMessageDelta: async (text) => {
      if (text.length === 0) {
        return true;
      }

      const payload: ChatMessageDeltaPayload = {
        text,
        index: messageIndex,
      };
      messageIndex += 1;

      return (await safeWriteSseEvent(response, "message_delta", payload))
        === "ok";
    },
    writeCheckoutAction: async (payload: ChatCheckoutActionPayload) =>
      (await safeWriteSseEvent(response, "checkout_action", payload)) === "ok",
    writeProductCards: async (items) => {
      const payload: ChatProductCardsPayload = { items };

      return (await safeWriteSseEvent(response, "product_cards", payload))
        === "ok";
    },
    writeComparisonResult: async (payload) =>
      (await safeWriteSseEvent(response, "comparison_result", payload)) === "ok",
    writeDone: async (payload) => {
      timing.mark("done_sent");

      return (await safeWriteSseEvent(response, "done", {
        ...payload,
        retrieval: withTiming(payload.retrieval, timing),
      })) === "ok";
    },
    isClosed: () => isResponseClosed(response),
  };
}

function withTiming(
  retrieval: ChatDonePayload["retrieval"],
  timing: ChatTimingTracker | undefined,
): ChatDonePayload["retrieval"] {
  if (!timing || retrieval.timing) {
    return retrieval;
  }

  return {
    ...retrieval,
    timing: timing.toSafeMetadata(),
  };
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
  console.error("Chat stream error:", toSafeLogError(error));
}

function toSafeLogError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const record = error as Error & {
    code?: unknown;
    statusCode?: unknown;
    providerRequestId?: unknown;
  };

  return {
    name: error.name,
    message: error.message,
    ...(typeof record.code === "string" ? { code: record.code } : {}),
    ...(typeof record.statusCode === "number"
      ? { statusCode: record.statusCode }
      : {}),
    ...(typeof record.providerRequestId === "string"
      ? { providerRequestId: record.providerRequestId }
      : {}),
  };
}
