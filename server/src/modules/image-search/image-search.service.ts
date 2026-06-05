import { loadImageSearchConfig } from "./image-search.config";
import type { ImageSearchConfig } from "./image-search.config";
import { OpenAiVisualIntentClient } from "./visual-intent.client";
import type {
  ImageSearchImageInput,
  ImageSearchInterpretRequest,
  ImageSearchInterpretResult,
  ImageSearchConfidence,
  VisualIntent,
  VisualIntentClient,
} from "./image-search.types";
import { ImageSearchError } from "./image-search.types";

export interface ImageSearchServiceOptions {
  config?: ImageSearchConfig;
  visualIntentClient?: VisualIntentClient;
}

const VISUAL_INTENT_ARRAY_MAX_ITEMS = 12;
const VISUAL_INTENT_ITEM_MAX_CHARS = 80;
const VISUAL_INTENT_QUERY_MAX_CHARS = 300;
const VISUAL_INTENT_TEXT_MAX_CHARS = 120;
const BUSINESS_ACTION_CLARIFICATION =
  "图片里或补充文字里可能包含购物车、下单或对比等操作指令。请直接告诉我想找的商品类型或特点，我再帮你找货。";
const BUSINESS_ACTION_CUE_PATTERNS = [
  /购物车|加购|加入购物车|加到购物车|放到购物车|加进购物车|清空购物车/u,
  /删除|删掉|移除|勾选|取消勾选|取消选择/u,
  /下单|结算|付款|支付|立即购买|买这个|要这个|这款也要|这个也要/u,
  /对比(?:一下|下|这|两|第|前|和|跟|与|哪个|哪款|哪种|$)|比较(?:一下|下|这|两|第|前|和|跟|与|哪个|哪款|哪种|$)|哪个更|哪款更|怎么选|有什么区别|有啥区别|区别是什么|差异在哪里|有什么差异/u,
  /\b(?:cart|checkout|order|delete|remove|compare)\b/iu,
] as const;

const KNOWN_CATEGORIES = [
  "美妆护肤",
  "数码电子",
  "服饰运动",
  "食品饮料",
  "家用电器",
  "母婴用品",
  "办公学习",
] as const;

const CATEGORY_ALIASES = new Map<string, string>([
  ["美妆", "美妆护肤"],
  ["护肤", "美妆护肤"],
  ["美妆护肤", "美妆护肤"],
  ["数码", "数码电子"],
  ["电子", "数码电子"],
  ["数码电子", "数码电子"],
  ["手机电脑", "数码电子"],
  ["服饰", "服饰运动"],
  ["运动", "服饰运动"],
  ["服饰运动", "服饰运动"],
  ["食品", "食品饮料"],
  ["饮料", "食品饮料"],
  ["零食", "食品饮料"],
  ["生活食品", "食品饮料"],
  ["食品生活", "食品饮料"],
  ["食品饮料", "食品饮料"],
  ["家居", "家用电器"],
  ["家用", "家用电器"],
  ["家电", "家用电器"],
  ["小家电", "家用电器"],
  ["空气护理", "家用电器"],
  ["家居日用", "家用电器"],
  ["家用电器", "家用电器"],
  ["母婴", "母婴用品"],
  ["母婴用品", "母婴用品"],
  ["办公", "办公学习"],
  ["学习", "办公学习"],
  ["办公学习", "办公学习"],
  ["办公外设", "办公学习"],
  ["学生宿舍", "办公学习"],
  ["学生宿舍用品", "办公学习"],
  ["宿舍用品", "办公学习"],
]);

export class ImageSearchService {
  private readonly config: ImageSearchConfig;
  private readonly visualIntentClient: VisualIntentClient;

  constructor(options: ImageSearchServiceOptions = {}) {
    this.config = options.config ?? loadImageSearchConfig();
    this.visualIntentClient = options.visualIntentClient
      ?? new OpenAiVisualIntentClient({ config: this.config });
  }

  async interpret(
    request: ImageSearchInterpretRequest,
  ): Promise<ImageSearchInterpretResult> {
    validateImage(request.image, this.config);

    const providerIntent = await this.visualIntentClient.interpret({
      image: {
        buffer: request.image.buffer,
        mimeType: normalizeMimeType(request.image.mimeType),
      },
      userText: request.userText,
      requestId: request.requestId,
      abortSignal: request.abortSignal,
    });
    const visualIntent = normalizeVisualIntent(providerIntent);
    const safeVisualIntent = containsBusinessActionCue(
      visualIntent,
      request.userText,
    )
      ? toBusinessActionClarification(visualIntent)
      : visualIntent;

    if (
      safeVisualIntent.confidence === "low"
      || !safeVisualIntent.is_product_search
      || safeVisualIntent.search_query.length === 0
    ) {
      return {
        visualIntent: safeVisualIntent,
        chatMessage: null,
        filters: null,
        imageSearchMode: "vlm_first",
      };
    }

    return {
      visualIntent: safeVisualIntent,
      chatMessage: buildChatMessage(safeVisualIntent),
      filters: safeVisualIntent.detected_category
        ? { category: safeVisualIntent.detected_category }
        : null,
      imageSearchMode: "vlm_first",
    };
  }
}

export function validateImage(
  image: ImageSearchImageInput,
  config: Pick<ImageSearchConfig, "maxImageBytes" | "allowedMimeTypes">,
): void {
  if (image.buffer.length === 0) {
    throw new ImageSearchError("Image file is required.", {
      code: "IMAGE_REQUIRED",
      statusCode: 400,
    });
  }

  if (image.buffer.length > config.maxImageBytes) {
    throw new ImageSearchError("Image file is too large.", {
      code: "IMAGE_TOO_LARGE",
      statusCode: 413,
    });
  }

  const mimeType = normalizeMimeType(image.mimeType);

  if (!config.allowedMimeTypes.includes(mimeType)) {
    throw new ImageSearchError("Unsupported image type.", {
      code: "IMAGE_UNSUPPORTED_MEDIA_TYPE",
      statusCode: 415,
    });
  }

  const detectedMimeType = detectMimeType(image.buffer);

  if (!detectedMimeType || detectedMimeType !== mimeType) {
    throw new ImageSearchError("Image content type does not match.", {
      code: "IMAGE_UNSUPPORTED_MEDIA_TYPE",
      statusCode: 415,
    });
  }
}

export function normalizeVisualIntent(value: unknown): VisualIntent {
  if (!isRecord(value)) {
    throw invalidOutput();
  }

  const confidence = readConfidence(value.confidence);
  const isProductSearch = readBoolean(value.is_product_search);
  const searchQuery = normalizeText(value.search_query, {
    maxChars: VISUAL_INTENT_QUERY_MAX_CHARS,
    fallback: "",
  }) ?? "";
  const normalizedIntent: VisualIntent = {
    is_product_search: isProductSearch,
    detected_category: mapKnownCategory(value.detected_category),
    detected_brand_text: normalizeText(value.detected_brand_text, {
      maxChars: VISUAL_INTENT_TEXT_MAX_CHARS,
    }),
    visual_attributes: normalizeTextArray(value.visual_attributes),
    colors: normalizeTextArray(value.colors),
    materials: normalizeTextArray(value.materials),
    use_case: normalizeText(value.use_case, {
      maxChars: VISUAL_INTENT_TEXT_MAX_CHARS,
    }),
    constraints: normalizeTextArray(value.constraints),
    search_query: searchQuery,
    confidence,
    clarification_question: normalizeText(value.clarification_question, {
      maxChars: VISUAL_INTENT_TEXT_MAX_CHARS,
    }),
  };

  if (
    normalizedIntent.is_product_search
    && normalizedIntent.confidence !== "low"
    && normalizedIntent.search_query.length === 0
  ) {
    throw invalidOutput();
  }

  if (
    (!normalizedIntent.is_product_search
      || normalizedIntent.confidence === "low")
    && !normalizedIntent.clarification_question
  ) {
    normalizedIntent.clarification_question =
      "我没看清具体商品，可以换一张更清晰的商品主体图，或者补充想找的类型。";
  }

  return normalizedIntent;
}

function buildChatMessage(intent: VisualIntent): string {
  return `图片找货：${intent.search_query}`;
}

function containsBusinessActionCue(
  intent: VisualIntent,
  userText: string | undefined,
): boolean {
  const text = [
    userText,
    intent.search_query,
    intent.detected_brand_text,
    intent.use_case,
    intent.clarification_question,
    ...intent.visual_attributes,
    ...intent.colors,
    ...intent.materials,
    ...intent.constraints,
  ]
    .filter((item): item is string => typeof item === "string")
    .join(" ");
  const compactText = text.replace(/\s+/gu, "");

  return BUSINESS_ACTION_CUE_PATTERNS.some((pattern) =>
    pattern.test(compactText) || pattern.test(text)
  );
}

function toBusinessActionClarification(intent: VisualIntent): VisualIntent {
  return {
    ...intent,
    confidence: "low",
    search_query: "",
    clarification_question: BUSINESS_ACTION_CLARIFICATION,
  };
}

function detectMimeType(buffer: Buffer): string | undefined {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return undefined;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw invalidOutput();
  }

  return value;
}

function readConfidence(value: unknown): ImageSearchConfidence {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  throw invalidOutput();
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw invalidOutput();
  }

  const seen = new Set<string>();
  const items: string[] = [];

  for (const item of value) {
    const normalized = normalizeText(item, {
      maxChars: VISUAL_INTENT_ITEM_MAX_CHARS,
    });

    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      items.push(normalized);
    }

    if (items.length >= VISUAL_INTENT_ARRAY_MAX_ITEMS) {
      break;
    }
  }

  return items;
}

function normalizeText(
  value: unknown,
  options: { maxChars: number; fallback?: string },
): string | null {
  if (value === null || value === undefined) {
    return options.fallback ?? null;
  }

  if (typeof value !== "string") {
    throw invalidOutput();
  }

  const normalized = value.replace(/\s+/gu, " ").trim();

  if (normalized.length === 0) {
    return options.fallback ?? null;
  }

  return Array.from(normalized).slice(0, options.maxChars).join("");
}

function mapKnownCategory(value: unknown): string | null {
  const normalized = normalizeText(value, {
    maxChars: VISUAL_INTENT_TEXT_MAX_CHARS,
  });

  if (!normalized) {
    return null;
  }

  if ((KNOWN_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized;
  }

  return CATEGORY_ALIASES.get(normalized) ?? null;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidOutput(): ImageSearchError {
  return new ImageSearchError("Visual intent output schema is invalid.", {
    code: "IMAGE_INVALID_OUTPUT",
    statusCode: 502,
  });
}
