import type { VectorSearchFilters } from "../vector/vector-search.types";

export type ImageSearchConfidence = "high" | "medium" | "low";

export interface VisualIntent {
  is_product_search: boolean;
  detected_category: string | null;
  detected_brand_text: string | null;
  visual_attributes: string[];
  colors: string[];
  materials: string[];
  use_case: string | null;
  constraints: string[];
  search_query: string;
  confidence: ImageSearchConfidence;
  clarification_question: string | null;
}

export interface ImageSearchImageInput {
  buffer: Buffer;
  mimeType: string;
}

export interface ImageSearchInterpretRequest {
  image: ImageSearchImageInput;
  userText?: string;
  conversationId?: string;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface ImageSearchInterpretResult {
  visualIntent: VisualIntent;
  chatMessage: string | null;
  filters: Pick<VectorSearchFilters, "category"> | null;
  imageSearchMode: "vlm_first";
}

export interface VisualIntentClient {
  interpret(input: {
    image: ImageSearchImageInput;
    userText?: string;
    requestId?: string;
    abortSignal?: AbortSignal;
  }): Promise<VisualIntent>;
}

export type ImageSearchErrorCode =
  | "IMAGE_CONFIG_MISSING"
  | "IMAGE_REQUIRED"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_UNSUPPORTED_MEDIA_TYPE"
  | "IMAGE_MULTIPART_INVALID"
  | "IMAGE_UNEXPECTED_FIELD"
  | "IMAGE_INVALID_OUTPUT"
  | "IMAGE_TIMEOUT"
  | "IMAGE_PROVIDER_UNAVAILABLE"
  | "IMAGE_REQUEST_FAILED";

export interface ImageSearchErrorOptions {
  code: ImageSearchErrorCode;
  statusCode?: number;
  retryable?: boolean;
  cause?: unknown;
  providerStatusCode?: number;
  providerErrorCode?: string;
  providerRequestId?: string;
}

export class ImageSearchError extends Error {
  readonly code: ImageSearchErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly providerStatusCode?: number;
  readonly providerErrorCode?: string;
  readonly providerRequestId?: string;

  constructor(message: string, options: ImageSearchErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ImageSearchError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.retryable = options.retryable ?? false;
    this.providerStatusCode = options.providerStatusCode;
    this.providerErrorCode = options.providerErrorCode;
    this.providerRequestId = options.providerRequestId;
  }
}
