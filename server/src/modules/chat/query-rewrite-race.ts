import type { ChatContextMemoryResolution } from "./chat-context-memory.service";
import type { RagChatRequest } from "./chat.types";
import type { NegativeConstraint } from "./negative-constraint.types";
import type {
  QueryRewriteResult,
  QueryRewriteService,
} from "./query-rewrite.service";

export const QUERY_REWRITE_FIRST_TOKEN_TIMEOUT_MS = 900;

export type QueryRewriteRaceResult =
  | { kind: "rewrite"; status: "done"; queryRewrite: QueryRewriteResult }
  | { kind: "rewrite"; status: "error"; error: unknown }
  | { kind: "rewrite"; status: "timeout" };

export async function raceQueryRewriteWithTimeout(input: {
  queryRewriteService: Pick<QueryRewriteService, "rewrite">;
  question: string;
  request: Pick<
    RagChatRequest,
    "shortHistory" | "requestId" | "abortSignal" | "timing"
  >;
  memoryResolution: ChatContextMemoryResolution;
  negativeConstraints: readonly NegativeConstraint[];
  baseQuery: string;
}): Promise<QueryRewriteRaceResult> {
  input.request.timing?.mark("query_rewrite_started");
  const rewriteAbortController = new AbortController();
  const removeAbortListener = pipeAbortSignal(
    input.request.abortSignal,
    rewriteAbortController,
  );
  let rewriteSettled = false;

  const rewriteTask = input.queryRewriteService.rewrite({
    question: input.question,
    baseRetrievalQuery: input.memoryResolution.retrievalQuery,
    shortHistory: input.request.shortHistory,
    contextMemory: input.memoryResolution.contextMemory,
    filters: input.memoryResolution.filters,
    negativeConstraints: [...input.negativeConstraints],
    requestId: input.request.requestId,
    abortSignal: rewriteAbortController.signal,
  })
    .then((queryRewrite) => {
      rewriteSettled = true;
      input.request.timing?.mark("query_rewrite_done");
      return {
        kind: "rewrite" as const,
        status: "done" as const,
        queryRewrite,
      };
    })
    .catch((error) => {
      rewriteSettled = true;
      input.request.timing?.mark("query_rewrite_done");
      return {
        kind: "rewrite" as const,
        status: "error" as const,
        error,
      };
    })
    .finally(removeAbortListener);

  const timeoutTask = delay(QUERY_REWRITE_FIRST_TOKEN_TIMEOUT_MS)
    .then(() => {
      if (!rewriteSettled) {
        input.request.timing?.mark("query_rewrite_timeout");
        rewriteAbortController.abort(createQueryRewriteTimeoutError());
      }

      return {
        kind: "rewrite" as const,
        status: "timeout" as const,
      };
    });

  return Promise.race([rewriteTask, timeoutTask]);
}

function pipeAbortSignal(
  source: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (!source) {
    return () => undefined;
  }

  if (source.aborted) {
    controller.abort(source.reason);
    return () => undefined;
  }

  const onAbort = () => controller.abort(source.reason);
  source.addEventListener("abort", onAbort, { once: true });

  return () => source.removeEventListener("abort", onAbort);
}

function createQueryRewriteTimeoutError(): Error {
  const error = new Error("Query rewrite timed out.");
  error.name = "TimeoutError";
  return error;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
