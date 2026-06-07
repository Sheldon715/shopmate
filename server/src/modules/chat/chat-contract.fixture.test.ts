import type { Response } from "express";
import { describe, expect, it } from "vitest";
import type { ProductCardDto } from "../products/product.types";
import {
  chatContractFixtureList,
  chatContractFixtures,
} from "./chat-contract.fixture";
import type {
  ChatProductCardsPayload,
  ChatStreamContractEvent,
} from "./chat.types";
import {
  eventNames,
  parseSseEvents,
} from "./sse-test-utils";
import { writeSseEvent } from "./sse-writer";

describe("chat contract fixtures", () => {
  it("keeps event order aligned with the stream contract", () => {
    expect(eventNames(chatContractFixtures.successStream.events)).toEqual([
      "message_delta",
      "message_delta",
      "product_cards",
      "done",
    ]);
    expect(eventNames(chatContractFixtures.emptyAnswerFallback.events)).toEqual([
      "product_cards",
      "done",
    ]);
    expect(eventNames(chatContractFixtures.errorStream.events)).toEqual([
      "error",
    ]);
    expect(eventNames(chatContractFixtures.noProductStream.events)).toEqual([
      "message_delta",
      "product_cards",
      "done",
    ]);
    expect(eventNames(chatContractFixtures.clarificationStream.events)).toEqual([
      "message_delta",
      "product_cards",
      "done",
    ]);
    expect(
      eventNames(chatContractFixtures.comparisonClarificationStream.events),
    ).toEqual([
      "message_delta",
      "product_cards",
      "done",
    ]);
    expect(eventNames(chatContractFixtures.cartAddStream.events)).toEqual([
      "message_delta",
      "product_cards",
      "done",
    ]);
    expect(eventNames(chatContractFixtures.checkoutStream.events)).toEqual([
      "checkout_action",
      "message_delta",
      "product_cards",
      "done",
    ]);
    expect(eventNames(chatContractFixtures.comparisonStream.events)).toEqual([
      "message_delta",
      "product_cards",
      "comparison_result",
      "done",
    ]);
  });

  it("serializes every fixture event with writeSseEvent", async () => {
    for (const fixture of chatContractFixtureList) {
      const response = new FakeSseResponse();

      for (const event of fixture.events) {
        expect(
          await writeSseEvent(
            response.asResponse(),
            event.eventName,
            event.payload,
          ),
        ).toBe(true);
      }

      expect(response.events()).toEqual(fixture.events);
    }
  });

  it("keeps product cards compatible with ProductCardDto required fields", () => {
    const requiredFields = [
      "id",
      "name",
      "brand",
      "category",
      "subCategory",
      "priceCents",
      "priceRangeCents",
      "currency",
      "imagePath",
      "ratingAvg",
      "tags",
      "available",
    ] satisfies Array<keyof ProductCardDto>;

    for (const payload of productCardPayloads()) {
      for (const card of payload.items) {
        for (const field of requiredFields) {
          expect(card).toHaveProperty(field);
        }

        expect(typeof card.id).toBe("string");
        expect(typeof card.name).toBe("string");
        expect(typeof card.priceCents).toBe("number");
        expect(typeof card.priceRangeCents.min).toBe("number");
        expect(typeof card.priceRangeCents.max).toBe("number");
        expect(Array.isArray(card.tags)).toBe(true);
        expect(typeof card.available).toBe("boolean");
      }
    }
  });

  it("keeps done payloads compatible with Android parser expectations", () => {
    for (const event of contractEventsByName("done")) {
      expect(Array.isArray(event.payload.recommendedProductIds)).toBe(true);
      expect(typeof event.payload.fallbackUsed).toBe("boolean");
      expect(typeof event.payload.retrieval.candidateCount).toBe("number");
      expect(Array.isArray(event.payload.retrieval.returnedProductIds)).toBe(
        true,
      );
      if (event.payload.fallbackReason === "NEEDS_CLARIFICATION") {
        expect(event.payload.clarification).toEqual({
          missingSlots: ["budget", "priority"],
        });
      }
      if (event.payload.cartAction) {
        expect(event.payload.cartAction).toMatchObject({
          type: "add",
          status: expect.any(String) as unknown as string,
          message: expect.any(String) as unknown as string,
        });
      }
      if (event.payload.checkoutAction) {
        expect(event.payload.checkoutAction).toMatchObject({
          type: expect.any(String) as unknown as string,
          status: expect.any(String) as unknown as string,
        });
      }
    }
  });

  it("keeps checkout_action payloads aligned with done.checkoutAction", () => {
    const checkoutActionEvents = contractEventsByName("checkout_action");

    expect(checkoutActionEvents).toHaveLength(1);

    const done = chatContractFixtures.checkoutStream.events.find(
      (event): event is Extract<ChatStreamContractEvent, { eventName: "done" }> =>
        event.eventName === "done",
    );

    expect(done?.payload.checkoutAction).toEqual(checkoutActionEvents[0].payload);
    expect(checkoutActionEvents[0].payload).toMatchObject({
      type: "start_checkout",
      status: "draft_created",
      draftId: "draft_1",
      draft: {
        id: "draft_1",
        status: "pending",
      },
      changedFields: [],
    });
  });

  it("keeps comparison payloads compatible with Android parser expectations", () => {
    for (const event of contractEventsByName("comparison_result")) {
      expect(typeof event.payload.id).toBe("string");
      expect(typeof event.payload.title).toBe("string");
      expect(typeof event.payload.query).toBe("string");
      expect(Array.isArray(event.payload.productIds)).toBe(true);
      expect(event.payload.productIds.length).toBe(2);
      expect(Array.isArray(event.payload.dimensions)).toBe(true);
      for (const dimension of event.payload.dimensions) {
        expect(typeof dimension.id).toBe("string");
        expect(typeof dimension.label).toBe("string");
        expect(dimension.cells.map((cell) => cell.productId).sort()).toEqual(
          [...event.payload.productIds].sort(),
        );
      }
      expect(typeof event.payload.conclusion).toBe("string");
      expect(Array.isArray(event.payload.highlights)).toBe(true);
    }
  });

  it("keeps error payloads sanitized and retry-aware", () => {
    for (const event of contractEventsByName("error")) {
      expect(event.payload).toEqual({
        code: "CHAT_STREAM_ERROR",
        message: "Chat stream failed.",
        retryable: true,
      });
      expect(event.payload.message).not.toMatch(/api key|\.env|provider/i);
    }
  });
});

class FakeSseResponse {
  readonly chunks: string[] = [];
  writableEnded = false;
  destroyed = false;

  asResponse(): Response {
    return this as unknown as Response;
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  events(): ChatStreamContractEvent[] {
    return parseSseEvents(this.chunks);
  }
}

function productCardPayloads(): ChatProductCardsPayload[] {
  return contractEventsByName("product_cards").map((event) => event.payload);
}

function contractEventsByName<EventName extends ChatStreamContractEvent["eventName"]>(
  eventName: EventName,
): Array<Extract<ChatStreamContractEvent, { eventName: EventName }>> {
  return chatContractFixtureList.flatMap((fixture) =>
    fixture.events.filter(
      (event): event is Extract<
        ChatStreamContractEvent,
        { eventName: EventName }
      > => event.eventName === eventName,
    )
  );
}
