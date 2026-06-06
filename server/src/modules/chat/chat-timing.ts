export type ChatTimingMarkName =
  | "request_received"
  | "sse_started"
  | "cart_snapshot_done"
  | "cart_intent_done"
  | "checkout_intent_done"
  | "negative_intent_done"
  | "comparison_prefetch_started"
  | "comparison_prefetch_done"
  | "comparison_intent_done"
  | "comparison_targets_started"
  | "comparison_targets_done"
  | "comparison_preset_delta_sent"
  | "comparison_generation_started"
  | "comparison_generation_done"
  | "clarification_intent_done"
  | "original_search_started"
  | "original_search_done"
  | "query_rewrite_started"
  | "query_rewrite_timeout"
  | "query_rewrite_done"
  | "cache_read_done"
  | "rewrite_search_started"
  | "rewrite_search_done"
  | "vector_search_done"
  | "retrieval_plan_selected"
  | "product_lookup_done"
  | "grounded_llm_started"
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
