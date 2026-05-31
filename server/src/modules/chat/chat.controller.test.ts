import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { ProductCardDto } from "../products/product.types";
import { chatContractFixtures } from "./chat-contract.fixture";
import type {
  ChatStreamContractEvent,
  RagChatRequest,
  RagChatResult,
} from "./chat.types";
import type { ChatAnswerService } from "./chat.controller";
import { createChatStreamController } from "./chat.controller";
import {
  parseSseEvents,
  payloadFor,
} from "./sse-test-utils";

describe("createChatStreamController", () => {
  it("streams message deltas, product cards, and done events in order", async () => {
    const calls: RagChatRequest[] = [];
    const service = createService(async (input) => {
      calls.push(input);
      return createResultFromFixture(chatContractFixtures.successStream.events);
    });
    const request = createRequest({
      conversationId: "local-chat-session-1",
      message: " recommend one ",
      history: [{ role: "user", content: " light please " }],
      filters: { category: "Electronics" },
      topK: 8,
      maxRecommendedProducts: 2,
    }, { "x-request-id": "request_123" });
    const response = new FakeResponse();

    await createChatStreamController(service)(
      request.asRequest(),
      response.asResponse(),
    );

    expect(calls[0]).toMatchObject({
      question: "recommend one",
      conversationId: "local-chat-session-1",
      shortHistory: [{ role: "user", content: "light please" }],
      filters: { category: "Electronics" },
      topK: 8,
      maxRecommendedProducts: 2,
      requestId: "request_123",
    });
    expect(calls[0].abortSignal).toBeInstanceOf(AbortSignal);
    expect(response.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(response.streamEvents()).toEqual(
      chatContractFixtures.successStream.events,
    );
    expect(response.ended).toBe(true);
  });

  it("streams fallback results as successful done events", async () => {
    const service = createService(async () =>
      createResultFromFixture(chatContractFixtures.emptyAnswerFallback.events)
    );
    const request = createRequest({ message: "unknown product" });
    const response = new FakeResponse();

    await createChatStreamController(service)(
      request.asRequest(),
      response.asResponse(),
    );

    expect(response.streamEvents()).toEqual(
      chatContractFixtures.emptyAnswerFallback.events,
    );
  });

  it("returns 400 JSON before SSE starts when request validation fails", async () => {
    const service = createService(async () => createResult());
    const request = createRequest({ message: "   " });
    const response = new FakeResponse();

    await createChatStreamController(service)(
      request.asRequest(),
      response.asResponse(),
    );

    expect(response.statusCode).toBe(400);
    expect(response.jsonPayload).toEqual({
      success: false,
      error: {
        code: "INVALID_CHAT_REQUEST",
        message: "message cannot be empty",
      },
    });
    expect(response.chunks).toEqual([]);
  });

  it("streams an error event and ends when the chat service throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const service = createService(async () => {
      throw new Error("provider down");
    });
    const request = createRequest({ message: "recommend one" });
    const response = new FakeResponse();

    await createChatStreamController(service)(
      request.asRequest(),
      response.asResponse(),
    );

    expect(response.streamEvents()).toEqual(
      chatContractFixtures.errorStream.events,
    );
    expect(response.ended).toBe(true);
  });

  it("streams no-product results with an empty product_cards payload", async () => {
    const service = createService(async () =>
      createResultFromFixture(chatContractFixtures.noProductStream.events)
    );
    const request = createRequest({ message: "unknown product" });
    const response = new FakeResponse();

    await createChatStreamController(service)(
      request.asRequest(),
      response.asResponse(),
    );

    expect(response.streamEvents()).toEqual(
      chatContractFixtures.noProductStream.events,
    );
    expect(response.ended).toBe(true);
  });

  it("streams clarification results as successful done events", async () => {
    const service = createService(async () =>
      createResultFromFixture(chatContractFixtures.clarificationStream.events)
    );
    const request = createRequest({ message: "推荐一款手机" });
    const response = new FakeResponse();

    await createChatStreamController(service)(
      request.asRequest(),
      response.asResponse(),
    );

    expect(response.streamEvents()).toEqual(
      chatContractFixtures.clarificationStream.events,
    );
    expect(response.ended).toBe(true);
  });

  it("does not treat request body close as a client disconnect", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveAnswer: ((result: RagChatResult) => void) | undefined;
    const service = createService((input) => {
      capturedSignal = input.abortSignal;
      return new Promise<RagChatResult>((resolve) => {
        resolveAnswer = resolve;
      });
    });
    const request = createRequest({ message: "recommend one" });
    const response = new FakeResponse();
    const controllerPromise = createChatStreamController(service)(
      request.asRequest(),
      response.asResponse(),
    );

    request.emit("close");
    expect(capturedSignal?.aborted).toBe(false);
    resolveAnswer?.(createResult());
    await controllerPromise;

    expect(response.streamEvents().map((event) => event.eventName)).toEqual([
      "message_delta",
      "product_cards",
      "done",
    ]);
    expect(response.ended).toBe(true);
  });

  it("aborts the downstream request and skips writes after client close", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveAnswer: ((result: RagChatResult) => void) | undefined;
    const service = createService((input) => {
      capturedSignal = input.abortSignal;
      return new Promise<RagChatResult>((resolve) => {
        resolveAnswer = resolve;
      });
    });
    const request = createRequest({ message: "recommend one" });
    const response = new FakeResponse();
    const controllerPromise = createChatStreamController(service)(
      request.asRequest(),
      response.asResponse(),
    );

    response.emit("close");
    expect(capturedSignal?.aborted).toBe(true);
    resolveAnswer?.(createResult());
    await controllerPromise;

    expect(response.chunks).toEqual([]);
    expect(response.ended).toBe(false);
  });
});

class FakeRequest extends EventEmitter {
  constructor(
    readonly body: unknown,
    private readonly headers: Record<string, string> = {},
  ) {
    super();
  }

  asRequest(): Request {
    return this as unknown as Request;
  }

  get(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }
}

class FakeResponse extends EventEmitter {
  readonly headers = new Map<string, string>();
  readonly chunks: string[] = [];
  statusCode = 200;
  jsonPayload: unknown;
  ended = false;
  writableEnded = false;
  destroyed = false;

  constructor() {
    super();
  }

  asResponse(): Response {
    return this as unknown as Response;
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: number | string | readonly string[]): this {
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  }

  flushHeaders(): void {
    return undefined;
  }

  write(chunk: string): boolean {
    if (this.writableEnded || this.destroyed) {
      throw new Error("response is closed");
    }

    this.chunks.push(chunk);
    return true;
  }

  end(): this {
    this.ended = true;
    this.writableEnded = true;
    return this;
  }

  json(payload: unknown): this {
    this.jsonPayload = payload;
    this.ended = true;
    return this;
  }

  events(): string[] {
    return this.chunks.map((chunk) => {
      const eventLine = chunk
        .split("\n")
        .find((line) => line.startsWith("event: "));

      return eventLine?.slice("event: ".length) ?? "";
    });
  }

  streamEvents(): ChatStreamContractEvent[] {
    return parseSseEvents(this.chunks);
  }

  dataFor(eventName: string): unknown {
    return payloadFor(
      parseSseEvents(this.chunks),
      eventName as ChatStreamContractEvent["eventName"],
    );
  }
}

function createRequest(
  body: unknown,
  headers: Record<string, string> = {},
): FakeRequest {
  return new FakeRequest(body, headers);
}

function createService(
  answer: (input: RagChatRequest) => Promise<RagChatResult>,
): ChatAnswerService {
  return { answer };
}

function createResult(
  overrides: Partial<RagChatResult> = {},
): RagChatResult {
  return {
    answer: "Use product one.",
    recommendedProductIds: ["product_001"],
    productCards: [createProductCard()],
    fallbackUsed: false,
    retrieval: {
      candidateCount: 1,
      returnedProductIds: ["product_001"],
    },
    ...overrides,
  };
}

function createResultFromFixture(
  events: ChatStreamContractEvent[],
): RagChatResult {
  const answer = events
    .filter(
      (
        event,
      ): event is Extract<
        ChatStreamContractEvent,
        { eventName: "message_delta" }
      > => event.eventName === "message_delta",
    )
    .map((event) => event.payload.text)
    .join("");
  const productCardsPayload = payloadFor(
    events,
    "product_cards",
  );
  const donePayload = payloadFor(events, "done");

  return createResult({
    answer,
    recommendedProductIds: donePayload.recommendedProductIds,
    productCards: productCardsPayload.items,
    fallbackUsed: donePayload.fallbackUsed,
    fallbackReason: donePayload.fallbackReason ?? undefined,
    clarification: donePayload.clarification,
    retrieval: donePayload.retrieval,
    contextMemory: donePayload.contextMemory,
  });
}

function createProductCard(): ProductCardDto {
  return {
    id: "product_001",
    name: "Demo Product",
    brand: "Demo",
    category: "Electronics",
    subCategory: "Headphones",
    priceCents: 39900,
    priceRangeCents: {
      min: 39900,
      max: 49900,
    },
    currency: "CNY",
    imagePath: "/images/product_001.png",
    ratingAvg: 4.7,
    tags: ["wireless"],
    available: true,
  };
}
