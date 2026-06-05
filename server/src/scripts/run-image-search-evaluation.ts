import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { app } from "../app";
import { getEnv } from "../lib/env";
import { ImageSearchService } from "../modules/image-search/image-search.service";
import type {
  ImageSearchEvaluationCase,
  ImageSearchEvaluationResult,
} from "../modules/image-search/image-search-evaluation.types";
import {
  validateImageSearchEvaluationCases,
  validateImageSearchEvaluationResults,
} from "../modules/image-search/image-search-evaluation.validation";
import type { ImageSearchInterpretResult, VisualIntent } from "../modules/image-search/image-search.types";
import { readNext, readText } from "../utils/cli";
import { readJsonFile, writeJsonlFile } from "../utils/json-files";

interface RunImageSearchEvaluationOptions {
  cases?: string;
  output?: string;
  limit?: number;
  skipChat?: boolean;
}

interface ImageInput {
  buffer: Buffer;
  mimeType: string;
}

interface ChatRunResult {
  returnedProductIds: string[];
  chatTtftMs: number;
  chatTotalMs: number;
  refusalReason?: string;
  notes: string[];
}

interface SseEvent {
  eventName: string;
  payload: unknown;
}

const IMAGE_EVALUATION_CASES_FILE = "image-evaluation-cases.json";
const IMAGE_EVALUATION_RESULTS_FILE = "image-evaluation-results.jsonl";

const DEMO_PRODUCT_IMAGES = new Map<string, string>([
  ["demo:earbuds_main", "digital/images/p_digital_007_main.jpg"],
  ["demo:sunscreen_bottle", "beauty/images/p_beauty_006_main.jpg"],
  ["demo:commute_clothes_style", "clothes/images/p_clothes_001_main.jpg"],
  ["demo:small_home_appliance", "home_appliance/images/p_home_air_004_main.jpg"],
  ["demo:weak_brand_package", "beauty/images/p_beauty_023_main.jpg"],
]);

function parseArgs(argv: string[]): RunImageSearchEvaluationOptions {
  const options: RunImageSearchEvaluationOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith("--cases=")) {
      options.cases = readText(arg, "--cases=");
      continue;
    }

    if (arg === "--cases") {
      options.cases = readNext(argv, index, "--cases");
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = readText(arg, "--output=");
      continue;
    }

    if (arg === "--output") {
      options.output = readNext(argv, index, "--output");
      index += 1;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = readPositiveInteger(readText(arg, "--limit="), "--limit");
      continue;
    }

    if (arg === "--limit") {
      options.limit = readPositiveInteger(readNext(argv, index, "--limit"), "--limit");
      index += 1;
      continue;
    }

    if (arg === "--skip-chat") {
      options.skipChat = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function readPositiveInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function resolvePath(filePath: string | undefined, fallback: string): string {
  if (!filePath) {
    return fallback;
  }

  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

async function readImageInput(
  imageRef: string,
  staticImageRoot: string,
): Promise<ImageInput> {
  const productImagePath = DEMO_PRODUCT_IMAGES.get(imageRef);

  if (productImagePath) {
    return {
      buffer: await readFile(path.join(staticImageRoot, productImagePath)),
      mimeType: "image/jpeg",
    };
  }

  if (imageRef === "demo:non_product_scene") {
    return {
      buffer: createScenePng(),
      mimeType: "image/png",
    };
  }

  if (imageRef === "demo:order_or_qr_redacted") {
    return {
      buffer: createQrLikePng(),
      mimeType: "image/png",
    };
  }

  if (imageRef === "demo:unclear_product") {
    return {
      buffer: createUnclearPng(),
      mimeType: "image/png",
    };
  }

  throw new Error(`No low-sensitivity demo image mapping for ${imageRef}.`);
}

async function runSingleCase(input: {
  evaluationCase: ImageSearchEvaluationCase;
  service: ImageSearchService;
  staticImageRoot: string;
  chatBaseUrl?: string;
  skipChat?: boolean;
}): Promise<ImageSearchEvaluationResult> {
  const startedAt = performance.now();
  const image = await readImageInput(
    input.evaluationCase.imageRef,
    input.staticImageRoot,
  );
  let interpretResult: ImageSearchInterpretResult | undefined;
  let imageInterpretMs = 0;
  const notes: string[] = [];
  let refusalReason: string | undefined;
  let returnedProductIds: string[] = [];
  let chatTtftMs = 0;
  let chatTotalMs = 0;

  try {
    const interpretStartedAt = performance.now();
    interpretResult = await input.service.interpret({
      image,
      userText: input.evaluationCase.userText,
      requestId: `image-eval:${input.evaluationCase.caseId}`,
    });
    imageInterpretMs = elapsedMs(interpretStartedAt);
  } catch (error) {
    return createNeedsReviewResult({
      caseId: input.evaluationCase.caseId,
      startedAt,
      imageInterpretMs: elapsedMs(startedAt),
      visualIntent: null,
      chatMessage: null,
      filters: null,
      returnedProductIds: [],
      refusalReason: `image_provider_error:${readErrorCode(error)}`,
      notes: [readSafeErrorMessage(error)],
    });
  }

  if (interpretResult.chatMessage && !input.skipChat && input.chatBaseUrl) {
    const chatResult = await runChatSse({
      baseUrl: input.chatBaseUrl,
      caseId: input.evaluationCase.caseId,
      interpretResult,
    });
    returnedProductIds = chatResult.returnedProductIds;
    chatTtftMs = chatResult.chatTtftMs;
    chatTotalMs = chatResult.chatTotalMs;
    refusalReason = chatResult.refusalReason;
    notes.push(...chatResult.notes);
  } else if (interpretResult.chatMessage && input.skipChat) {
    refusalReason = "chat_sse_skipped";
    notes.push("Image provider ran; Chat SSE was skipped by --skip-chat.");
  } else {
    refusalReason = interpretResult.visualIntent.clarification_question
      ?? "image_search_no_chat_message";
  }

  return createNeedsReviewResult({
    caseId: input.evaluationCase.caseId,
    startedAt,
    imageInterpretMs,
    visualIntent: interpretResult.visualIntent,
    chatMessage: interpretResult.chatMessage,
    filters: interpretResult.filters,
    returnedProductIds,
    refusalReason: returnedProductIds.length > 0 ? undefined : refusalReason,
    chatTtftMs,
    notes: [
      "Live provider run; manual scoring pending.",
      ...notes,
    ],
  });
}

async function runChatSse(input: {
  baseUrl: string;
  caseId: string;
  interpretResult: ImageSearchInterpretResult;
}): Promise<ChatRunResult> {
  const visualIntent = input.interpretResult.visualIntent;
  const startedAt = performance.now();
  const response = await fetch(`${input.baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": `image-eval-chat:${input.caseId}`,
    },
    body: JSON.stringify({
      conversationId: `image_eval_${input.caseId}`,
      message: input.interpretResult.chatMessage,
      filters: input.interpretResult.filters ?? undefined,
      imageSearch: {
        mode: "vlm_first",
        confidence: visualIntent.confidence,
        visualQuery: visualIntent.search_query,
        detectedCategory: visualIntent.detected_category,
      },
      maxRecommendedProducts: 3,
    }),
  });

  if (!response.ok || !response.body) {
    return {
      returnedProductIds: [],
      chatTtftMs: 0,
      chatTotalMs: elapsedMs(startedAt),
      refusalReason: `chat_sse_http_${response.status}`,
      notes: [await safeReadResponseText(response)],
    };
  }

  const events = await readSseEvents(response, startedAt);
  const done = [...events.items]
    .reverse()
    .find((event) => event.eventName === "done");
  const error = events.items.find((event) => event.eventName === "error");
  const returnedProductIds = readReturnedProductIds(done?.payload);

  return {
    returnedProductIds,
    chatTtftMs: events.firstMessageDeltaMs,
    chatTotalMs: elapsedMs(startedAt),
    refusalReason: returnedProductIds.length > 0
      ? undefined
      : readChatFallbackReason(done?.payload, error?.payload),
    notes: [
      `Chat SSE events: ${summarizeEventNames(events.items)}`,
    ],
  };
}

async function readSseEvents(
  response: Response,
  startedAt: number,
): Promise<{ items: SseEvent[]; firstMessageDeltaMs: number }> {
  const reader = response.body?.getReader();

  if (!reader) {
    return { items: [], firstMessageDeltaMs: 0 };
  }

  const decoder = new TextDecoder();
  const items: SseEvent[] = [];
  let buffer = "";
  let firstMessageDeltaMs = 0;

  while (true) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    buffer += decoder.decode(result.value, { stream: true });
    const parsed = parseBufferedSseEvents(buffer);
    buffer = parsed.remainder;

    for (const item of parsed.events) {
      items.push(item);
      if (item.eventName === "message_delta" && firstMessageDeltaMs === 0) {
        firstMessageDeltaMs = elapsedMs(startedAt);
      }
    }
  }

  buffer += decoder.decode();
  const parsed = parseBufferedSseEvents(buffer);
  items.push(...parsed.events);

  return { items, firstMessageDeltaMs };
}

function parseBufferedSseEvents(buffer: string): {
  events: SseEvent[];
  remainder: string;
} {
  const events: SseEvent[] = [];
  let remainder = buffer;
  let delimiterIndex = remainder.indexOf("\n\n");

  while (delimiterIndex >= 0) {
    const rawEvent = remainder.slice(0, delimiterIndex);
    remainder = remainder.slice(delimiterIndex + 2);
    delimiterIndex = remainder.indexOf("\n\n");
    const parsed = parseSseEvent(rawEvent);

    if (parsed) {
      events.push(parsed);
    }
  }

  return { events, remainder };
}

function parseSseEvent(rawEvent: string): SseEvent | undefined {
  let eventName = "";
  const dataLines: string[] = [];

  for (const line of rawEvent.split(/\r?\n/u)) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (!eventName) {
    return undefined;
  }

  const data = dataLines.join("\n");

  return {
    eventName,
    payload: data ? JSON.parse(data) as unknown : null,
  };
}

function readReturnedProductIds(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return [];
  }

  const retrieval = payload.retrieval;

  if (isRecord(retrieval) && Array.isArray(retrieval.returnedProductIds)) {
    return retrieval.returnedProductIds
      .filter((item): item is string => typeof item === "string");
  }

  if (Array.isArray(payload.recommendedProductIds)) {
    return payload.recommendedProductIds
      .filter((item): item is string => typeof item === "string");
  }

  return [];
}

function readChatFallbackReason(
  donePayload: unknown,
  errorPayload: unknown,
): string {
  if (isRecord(errorPayload)) {
    const code = typeof errorPayload.code === "string"
      ? errorPayload.code
      : "unknown";
    return `chat_sse_error:${code}`;
  }

  if (isRecord(donePayload)) {
    const fallbackReason = typeof donePayload.fallbackReason === "string"
      ? donePayload.fallbackReason
      : undefined;

    return fallbackReason ?? "chat_sse_no_products";
  }

  return "chat_sse_no_done";
}

function createNeedsReviewResult(input: {
  caseId: string;
  startedAt: number;
  imageInterpretMs: number;
  visualIntent: VisualIntent | null;
  chatMessage: string | null;
  filters: ImageSearchEvaluationResult["filters"];
  returnedProductIds: string[];
  refusalReason?: string;
  chatTtftMs?: number;
  notes: string[];
}): ImageSearchEvaluationResult {
  return {
    caseId: input.caseId,
    runAt: new Date().toISOString(),
    runStatus: "needs_review",
    imageSearchMode: "vlm_first",
    visualIntent: input.visualIntent,
    chatMessage: input.chatMessage,
    filters: input.filters,
    returnedProductIds: input.returnedProductIds,
    ...(input.refusalReason ? { refusalReason: input.refusalReason } : {}),
    timing: {
      imageInterpretMs: input.imageInterpretMs,
      chatTtftMs: input.chatTtftMs ?? 0,
      totalMs: elapsedMs(input.startedAt),
    },
    humanScores: null,
    issues: [],
    notes: input.notes.map((note) => truncateNote(note)),
  };
}

function summarizeEventNames(events: readonly SseEvent[]): string {
  const counts = new Map<string, number>();

  for (const event of events) {
    counts.set(event.eventName, (counts.get(event.eventName) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([eventName, count]) => `${eventName}x${count}`)
    .join(", ");
}

async function listenOnEphemeralPort(): Promise<{
  server: Server;
  baseUrl: string;
}> {
  return new Promise((resolve) => {
    const server = createServer(app);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function runImageSearchEvaluationCommand(
  options = parseArgs(process.argv.slice(2)),
): Promise<void> {
  const env = getEnv();
  const casesPath = resolvePath(
    options.cases,
    path.join(env.ragDataDir, IMAGE_EVALUATION_CASES_FILE),
  );
  const outputPath = resolvePath(
    options.output,
    path.join(env.ragDataDir, IMAGE_EVALUATION_RESULTS_FILE),
  );
  const allCases = validateImageSearchEvaluationCases(
    await readJsonFile(casesPath),
  );
  const cases = options.limit ? allCases.slice(0, options.limit) : allCases;
  const service = new ImageSearchService();
  const chatServer = options.skipChat ? undefined : await listenOnEphemeralPort();

  try {
    const results: ImageSearchEvaluationResult[] = [];

    for (const evaluationCase of cases) {
      console.log(`Running ${evaluationCase.caseId}...`);
      const result = await runSingleCase({
        evaluationCase,
        service,
        staticImageRoot: env.staticImageRoot,
        chatBaseUrl: chatServer?.baseUrl,
        skipChat: options.skipChat,
      });
      results.push(result);
      console.log(
        `${evaluationCase.caseId}: ${result.refusalReason ?? result.returnedProductIds.join(", ")}`,
      );
    }

    validateImageSearchEvaluationResults(results, allCases);
    await writeJsonlFile(outputPath, results);
    console.log(`Wrote ${outputPath}.`);
  } finally {
    if (chatServer) {
      await closeServer(chatServer.server);
    }
  }
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readErrorCode(error: unknown): string {
  if (isRecord(error) && typeof error.code === "string") {
    return error.code;
  }

  return error instanceof Error ? error.name : "unknown";
}

function readSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return truncateNote(`${error.name}: ${error.message}`);
  }

  return truncateNote(String(error));
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "Unable to read response body.";
  }
}

function truncateNote(value: string): string {
  return Array.from(value).slice(0, 360).join("");
}

function createScenePng(): Buffer {
  return createPng(256, 256, (setPixel) => {
    fillRect(setPixel, 0, 0, 256, 150, [135, 206, 235, 255]);
    fillRect(setPixel, 0, 150, 256, 106, [68, 148, 74, 255]);
    fillCircle(setPixel, 205, 45, 22, [255, 218, 85, 255]);
    fillRect(setPixel, 40, 135, 60, 35, [118, 86, 55, 255]);
    fillRect(setPixel, 55, 100, 28, 45, [76, 134, 52, 255]);
  });
}

function createQrLikePng(): Buffer {
  return createPng(256, 256, (setPixel) => {
    fillRect(setPixel, 0, 0, 256, 256, [255, 255, 255, 255]);
    drawQrFinder(setPixel, 28, 28);
    drawQrFinder(setPixel, 150, 28);
    drawQrFinder(setPixel, 28, 150);
    for (let y = 96; y < 216; y += 16) {
      for (let x = 96; x < 216; x += 16) {
        if ((x + y) % 32 === 0) {
          fillRect(setPixel, x, y, 10, 10, [0, 0, 0, 255]);
        }
      }
    }
    fillRect(setPixel, 96, 155, 96, 8, [40, 40, 40, 255]);
    fillRect(setPixel, 96, 174, 72, 8, [40, 40, 40, 255]);
  });
}

function createUnclearPng(): Buffer {
  return createPng(256, 256, (setPixel) => {
    fillRect(setPixel, 0, 0, 256, 256, [220, 220, 220, 255]);
    for (let y = 0; y < 256; y += 32) {
      for (let x = 0; x < 256; x += 32) {
        const shade = 120 + ((x * 13 + y * 7) % 80);
        fillRect(setPixel, x, y, 32, 32, [shade, shade, shade, 255]);
      }
    }
    fillRect(setPixel, 88, 90, 80, 66, [160, 160, 160, 255]);
    fillRect(setPixel, 103, 106, 52, 35, [185, 185, 185, 255]);
  });
}

function createPng(
  width: number,
  height: number,
  draw: (
    setPixel: (x: number, y: number, color: [number, number, number, number]) => void,
  ) => void,
): Buffer {
  const pixels = Buffer.alloc(width * height * 4, 255);
  const setPixel = (
    x: number,
    y: number,
    color: [number, number, number, number],
  ) => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return;
    }

    const offset = (y * width + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  };

  draw(setPixel);

  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    pixels.copy(raw, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", createIhdr(width, height)),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIhdr(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return ihdr;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function fillRect(
  setPixel: (x: number, y: number, color: [number, number, number, number]) => void,
  left: number,
  top: number,
  width: number,
  height: number,
  color: [number, number, number, number],
): void {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      setPixel(x, y, color);
    }
  }
}

function fillCircle(
  setPixel: (x: number, y: number, color: [number, number, number, number]) => void,
  centerX: number,
  centerY: number,
  radius: number,
  color: [number, number, number, number],
): void {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2) {
        setPixel(x, y, color);
      }
    }
  }
}

function drawQrFinder(
  setPixel: (x: number, y: number, color: [number, number, number, number]) => void,
  left: number,
  top: number,
): void {
  fillRect(setPixel, left, top, 58, 58, [0, 0, 0, 255]);
  fillRect(setPixel, left + 8, top + 8, 42, 42, [255, 255, 255, 255]);
  fillRect(setPixel, left + 18, top + 18, 22, 22, [0, 0, 0, 255]);
}

if (require.main === module) {
  runImageSearchEvaluationCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
