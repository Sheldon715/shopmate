import type { ChatStreamContractEvent } from "./chat.types";

const EVENT_PREFIX = "event: ";
const DATA_PREFIX = "data: ";

type ChatStreamEventByName<
  EventName extends ChatStreamContractEvent["eventName"],
> = Extract<ChatStreamContractEvent, { eventName: EventName }>;

export function parseSseChunk(chunk: string): ChatStreamContractEvent {
  const lines = chunk.split("\n");
  const eventLine = lines.find((line) => line.startsWith(EVENT_PREFIX));
  const dataLine = lines.find((line) => line.startsWith(DATA_PREFIX));

  if (!eventLine || !dataLine) {
    throw new Error("SSE chunk is missing event or data line.");
  }

  return {
    eventName: eventLine.slice(EVENT_PREFIX.length),
    payload: JSON.parse(dataLine.slice(DATA_PREFIX.length)),
  } as ChatStreamContractEvent;
}

export function parseSseEvents(chunks: string[]): ChatStreamContractEvent[] {
  return chunks.map((chunk) => parseSseChunk(chunk));
}

export function eventNames(events: ChatStreamContractEvent[]): string[] {
  return events.map((event) => event.eventName);
}

export function payloadFor<
  EventName extends ChatStreamContractEvent["eventName"],
>(
  events: ChatStreamContractEvent[],
  eventName: EventName,
): ChatStreamEventByName<EventName>["payload"] {
  const event = events.find(
    (item): item is ChatStreamEventByName<EventName> =>
      item.eventName === eventName,
  );

  if (!event) {
    throw new Error(`Missing fixture event ${eventName}.`);
  }

  return event.payload as unknown as ChatStreamEventByName<EventName>["payload"];
}
