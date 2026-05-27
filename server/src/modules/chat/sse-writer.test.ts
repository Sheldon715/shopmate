import type { Response } from "express";
import { describe, expect, it } from "vitest";
import type { ProductCardDto } from "../products/product.types";
import {
  SseSerializationError,
  chunkMessageDelta,
  startSseStream,
  writeSseComment,
  writeSseEvent,
} from "./sse-writer";

describe("sse-writer", () => {
  it("writes standard event and data lines followed by a blank line", () => {
    const response = new FakeSseResponse();

    expect(
      writeSseEvent(response.asResponse(), "message_delta", {
        text: "hello",
        index: 0,
      }),
    ).toBe(true);

    expect(response.chunks).toEqual([
      'event: message_delta\ndata: {"text":"hello","index":0}\n\n',
    ]);
  });

  it("sets SSE headers and can write comment heartbeats", () => {
    const response = new FakeSseResponse();

    startSseStream(response.asResponse());
    expect(writeSseComment(response.asResponse(), "ping")).toBe(true);

    expect(response.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.flushed).toBe(true);
    expect(response.chunks).toEqual([": ping\n\n"]);
  });

  it("serializes product card events", () => {
    const response = new FakeSseResponse();
    const card = createProductCard();

    expect(
      writeSseEvent(response.asResponse(), "product_cards", {
        items: [card],
      }),
    ).toBe(true);

    expect(parseSseData(response.chunks[0])).toEqual({ items: [card] });
  });

  it("throws a fixed error when event payload serialization fails", () => {
    const response = new FakeSseResponse();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() =>
      writeSseEvent(response.asResponse(), "done", circular)
    ).toThrow(SseSerializationError);
  });

  it("chunks messages without corrupting Chinese text or emoji code points", () => {
    const answer = "你好🙂世界abc";
    const chunks = chunkMessageDelta(answer, 3);

    expect(chunks).toEqual(["你好🙂", "世界a", "bc"]);
    expect(chunks.join("")).toBe(answer);
  });
});

class FakeSseResponse {
  readonly headers = new Map<string, string>();
  readonly chunks: string[] = [];
  writableEnded = false;
  destroyed = false;
  flushed = false;

  asResponse(): Response {
    return this as unknown as Response;
  }

  setHeader(name: string, value: number | string | readonly string[]): this {
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  }

  flushHeaders(): void {
    this.flushed = true;
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
}

function parseSseData(chunk: string): unknown {
  const dataLine = chunk
    .split("\n")
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    throw new Error("SSE chunk does not include a data line.");
  }

  return JSON.parse(dataLine.slice("data: ".length));
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
