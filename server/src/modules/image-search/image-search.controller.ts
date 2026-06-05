import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { ok, fail } from "../../types/api-response";
import { loadImageSearchConfig } from "./image-search.config";
import { readImageSearchMultipart } from "./image-search.multipart";
import { ImageSearchService } from "./image-search.service";
import { ImageSearchError } from "./image-search.types";
import type {
  ImageSearchInterpretRequest,
  ImageSearchInterpretResult,
} from "./image-search.types";

export interface ImageSearchInterpretService {
  interpret(
    input: ImageSearchInterpretRequest,
  ): Promise<ImageSearchInterpretResult>;
}

export function createImageSearchInterpretController(
  imageSearchService?: ImageSearchInterpretService,
) {
  let defaultImageSearchService = imageSearchService;

  return async function imageSearchInterpretController(
    request: Request,
    response: Response,
  ): Promise<void> {
    const startedAt = Date.now();
    const requestId = request.get("x-request-id")?.trim() || randomUUID();
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    response.on("close", onClose);
    let imageMeta: { bytes: number; mimeType: string } | undefined;

    try {
      const config = loadImageSearchConfig();
      defaultImageSearchService ??= new ImageSearchService({ config });
      const multipart = await readImageSearchMultipart(
        request,
        config.maxImageBytes,
      );
      imageMeta = {
        bytes: multipart.image.buffer.length,
        mimeType: multipart.image.mimeType,
      };
      const result = await defaultImageSearchService.interpret({
        image: multipart.image,
        userText: multipart.message,
        conversationId: multipart.conversationId,
        requestId,
        abortSignal: abortController.signal,
      });

      logImageSearchRequest({
        requestId,
        status: "success",
        latencyMs: Date.now() - startedAt,
        imageMeta,
        confidence: result.visualIntent.confidence,
        isProductSearch: result.visualIntent.is_product_search,
      });
      response.status(200).json(ok(result));
    } catch (error) {
      const imageSearchError = mapImageSearchError(error);
      logImageSearchRequest({
        requestId,
        status: "error",
        latencyMs: Date.now() - startedAt,
        imageMeta,
        errorCode: imageSearchError.code,
        providerStatusCode: imageSearchError.providerStatusCode,
        providerErrorCode: imageSearchError.providerErrorCode,
        providerRequestId: imageSearchError.providerRequestId,
      });
      response
        .status(imageSearchError.statusCode)
        .json(fail(imageSearchError.code, safeImageSearchMessage(
          imageSearchError,
        )));
    } finally {
      response.off("close", onClose);
    }
  };
}

function logImageSearchRequest(event: {
  requestId: string;
  status: "success" | "error";
  latencyMs: number;
  imageMeta?: { bytes: number; mimeType: string };
  confidence?: string;
  isProductSearch?: boolean;
  errorCode?: string;
  providerStatusCode?: number;
  providerErrorCode?: string;
  providerRequestId?: string;
}): void {
  console.info("Image search interpret", {
    requestId: event.requestId,
    status: event.status,
    latencyMs: event.latencyMs,
    image: event.imageMeta
      ? {
        bytes: event.imageMeta.bytes,
        mimeType: event.imageMeta.mimeType,
      }
      : undefined,
    confidence: event.confidence,
    isProductSearch: event.isProductSearch,
    errorCode: event.errorCode,
    provider: event.providerStatusCode
      ? {
        statusCode: event.providerStatusCode,
        errorCode: event.providerErrorCode,
        requestId: event.providerRequestId,
      }
      : undefined,
  });
}

function mapImageSearchError(error: unknown): ImageSearchError {
  if (error instanceof ImageSearchError) {
    return error;
  }

  console.error("Image search error:", toSafeLogError(error));

  return new ImageSearchError("图片识别失败，请再试一次。", {
    code: "IMAGE_REQUEST_FAILED",
    statusCode: 500,
  });
}

function safeImageSearchMessage(error: ImageSearchError): string {
  switch (error.code) {
    case "IMAGE_REQUIRED":
      return error.message;
    case "IMAGE_TOO_LARGE":
      return "图片文件过大，请压缩后再试。";
    case "IMAGE_UNSUPPORTED_MEDIA_TYPE":
      return "暂不支持该图片格式。";
    case "IMAGE_MULTIPART_INVALID":
    case "IMAGE_UNEXPECTED_FIELD":
      return "图片上传请求格式不正确。";
    case "IMAGE_CONFIG_MISSING":
    case "IMAGE_PROVIDER_UNAVAILABLE":
      return "图片识别服务暂时不可用，请稍后重试。";
    case "IMAGE_TIMEOUT":
      return "图片识别超时，请稍后重试。";
    case "IMAGE_INVALID_OUTPUT":
    case "IMAGE_REQUEST_FAILED":
      return "图片识别失败，请再试一次。";
  }
}

function toSafeLogError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const record = error as Error & {
    code?: unknown;
    statusCode?: unknown;
    providerRequestId?: unknown;
  };

  return {
    name: error.name,
    message: error.message,
    ...(typeof record.code === "string" ? { code: record.code } : {}),
    ...(typeof record.statusCode === "number"
      ? { statusCode: record.statusCode }
      : {}),
    ...(typeof record.providerRequestId === "string"
      ? { providerRequestId: record.providerRequestId }
      : {}),
  };
}
