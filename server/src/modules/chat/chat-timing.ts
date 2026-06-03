export type ChatTimingMarkName =
  | "request_received"
  | "sse_started"
  | "cart_snapshot_done"
  | "cart_intent_done"
  | "negative_intent_done"
  | "comparison_intent_done"
  | "clarification_intent_done"
  | "query_rewrite_done"
  | "cache_read_done"
  | "vector_search_done"
  | "product_lookup_done"
  | "llm_first_delta"
  | "llm_complete"
  | "done_sent";

export interface ChatTimingEntry {
  name: ChatTimingMarkName;
  elapsedMs: number;
  sincePreviousMs: number;
}

export interface ChatTimingTracker {
  mark(name: ChatTimingMarkName): void;
  toSafeMetadata(): ChatTimingEntry[];
}

export class ChatTiming implements ChatTimingTracker {
  private readonly startTimeMs: number;
  private readonly marks: Array<{ name: ChatTimingMarkName; atMs: number }> = [];

  constructor(nowMs: () => number = () => Date.now()) {
    this.nowMs = nowMs;
    this.startTimeMs = nowMs();
  }

  private readonly nowMs: () => number;

  mark(name: ChatTimingMarkName): void {
    this.marks.push({
      name,
      atMs: this.nowMs(),
    });
  }

  toSafeMetadata(): ChatTimingEntry[] {
    let previousAtMs = this.startTimeMs;

    return this.marks.map((mark) => {
      const entry = {
        name: mark.name,
        elapsedMs: Math.max(0, Math.round(mark.atMs - this.startTimeMs)),
        sincePreviousMs: Math.max(0, Math.round(mark.atMs - previousAtMs)),
      };
      previousAtMs = mark.atMs;

      return entry;
    });
  }
}
