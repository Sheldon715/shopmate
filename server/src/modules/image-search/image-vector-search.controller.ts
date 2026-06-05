import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { ok, fail } from "../../types/api-response";
import { loadImageSearchConfig } from "./image-search.config";
import { readImageSearchMultipart } from "./image-search.multipart";
import { validateImage } from "./image-search.service";
import { ImageSearchError } from "./image-search.types";
import { ImageVectorSearchService } from "../vector/image-vector-search.service";
import { VectorSearchError } from "../vector/vector-search.error";

export interface ImageVectorSearchControllerService {
  search(input: Parameters<ImageVectorSearchService["search"]>[0]):
    ReturnType<ImageVectorSearchService["search"]>;
}

export function createImageVectorSearchController(
  imageVectorSearchService?: ImageVectorSearchControllerService,
) {
  let defaultImageVectorSearchService = imageVectorSearchService;

  return async function imageVectorSearchController(
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
      defaultImageVectorSearchService ??= new ImageVectorSearchService();
      const vectorSearchService = defaultImageVectorSearchService;
      const multipart = await readImageSearchMultipart(
        request,
        config.maxImageBytes,
      );
      imageMeta = {
        bytes: multipart.image.buffer.length,
        mimeType: multipart.image.mimeType,
      };
      validateImage(multipart.image, config);
      const result = await vectorSearchService.search({
        image: {
          buffer: multipart.image.buffer,
          mimeType: multipart.image.mimeType,
          caption: multipart.message,
        },
        abortSignal: abortController.signal,
      });

      console.info("Image vector search", {
        requestId,
        status: "success",
        latencyMs: Date.now() - startedAt,
        image: imageMeta,
        hits: result.hits.length,
        dropped: result.droppedProductIds.length,
      });
      response.status(200).json(ok(result));
    } catch (error) {
      const mappedError = mapImageVectorSearchError(error);
      console.info("Image vector search", {
        requestId,
        status: "error",
        latencyMs: Date.now() - startedAt,
        image: imageMeta,
        errorCode: mappedError.code,
      });
      response
        .status(mappedError.statusCode)
        .json(fail(mappedError.code, mappedError.message));
    } finally {
      response.off("close", onClose);
    }
  };
}

function mapImageVectorSearchError(error: unknown): {
  code: string;
  statusCode: number;
  message: string;
} {
  if (error instanceof ImageSearchError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: safeImageSearchMessage(error),
    };
  }

  if (error instanceof VectorSearchError) {
    return {
      code: error.code,
      statusCode: 503,
      message: "图片相似检索暂时不可用，请稍后重试。",
    };
  }

  return {
    code: "IMAGE_VECTOR_SEARCH_FAILED",
    statusCode: 500,
    message: "图片相似检索失败，请稍后重试。",
  };
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
      return "图片检索服务暂时不可用，请稍后重试。";
    case "IMAGE_TIMEOUT":
      return "图片检索超时，请稍后重试。";
    case "IMAGE_INVALID_OUTPUT":
    case "IMAGE_REQUEST_FAILED":
      return "图片检索失败，请再试一次。";
  }
}
