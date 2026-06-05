import type { Request } from "express";
import Busboy from "busboy";
import type { FileInfo } from "busboy";
import type { ImageSearchImageInput } from "./image-search.types";
import { ImageSearchError } from "./image-search.types";

export interface ImageSearchMultipartInput {
  image: ImageSearchImageInput;
  message?: string;
  conversationId?: string;
}

const FIELD_MAX_BYTES = 4 * 1024;
const MESSAGE_MAX_CHARS = 300;
const CONVERSATION_ID_MAX_CHARS = 80;
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;

export function readImageSearchMultipart(
  request: Request,
  maxImageBytes: number,
): Promise<ImageSearchMultipartInput> {
  const contentType = request.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return Promise.reject(
      new ImageSearchError("Request must be multipart/form-data.", {
        code: "IMAGE_REQUIRED",
        statusCode: 400,
      }),
    );
  }

  return new Promise((resolve, reject) => {
    let busboy: ReturnType<typeof Busboy>;

    try {
      busboy = Busboy({
        headers: request.headers,
        limits: {
          files: 1,
          fileSize: maxImageBytes,
          fields: 2,
          fieldSize: FIELD_MAX_BYTES,
        },
      });
    } catch (error) {
      reject(
        new ImageSearchError("Multipart request is invalid.", {
          code: "IMAGE_MULTIPART_INVALID",
          statusCode: 400,
          cause: error,
        }),
      );
      return;
    }

    let image: ImageSearchImageInput | undefined;
    let message: string | undefined;
    let conversationId: string | undefined;
    let settled = false;
    const filePromises: Array<Promise<void>> = [];

    const fail = (error: ImageSearchError) => {
      if (settled) {
        return;
      }

      settled = true;
      request.unpipe(busboy);
      busboy.removeAllListeners();
      reject(error);
    };

    busboy.on("file", (fieldName, stream, info) => {
      if (fieldName !== "image") {
        stream.resume();
        fail(
          new ImageSearchError("Unexpected file field.", {
            code: "IMAGE_UNEXPECTED_FIELD",
            statusCode: 400,
          }),
        );
        return;
      }

      const filePromise = collectImageStream(stream, info, maxImageBytes)
        .then((input) => {
          image = input;
        })
        .catch((error: unknown) => {
          fail(mapMultipartError(error));
        });
      filePromises.push(filePromise);
    });

    busboy.on("field", (fieldName, value) => {
      try {
        if (fieldName === "message") {
          message = normalizeOptionalText(value, "message", MESSAGE_MAX_CHARS);
          return;
        }

        if (fieldName === "conversationId") {
          conversationId = normalizeConversationId(value);
          return;
        }

        throw new ImageSearchError("Unexpected form field.", {
          code: "IMAGE_UNEXPECTED_FIELD",
          statusCode: 400,
        });
      } catch (error) {
        fail(mapMultipartError(error));
      }
    });

    busboy.on("filesLimit", () => {
      fail(
        new ImageSearchError("Only one image file is supported.", {
          code: "IMAGE_UNEXPECTED_FIELD",
          statusCode: 400,
        }),
      );
    });
    busboy.on("fieldsLimit", () => {
      fail(
        new ImageSearchError("Too many form fields.", {
          code: "IMAGE_UNEXPECTED_FIELD",
          statusCode: 400,
        }),
      );
    });
    busboy.on("error", (error) => {
      fail(
        new ImageSearchError("Multipart request is invalid.", {
          code: "IMAGE_MULTIPART_INVALID",
          statusCode: 400,
          cause: error,
        }),
      );
    });
    busboy.on("finish", () => {
      if (settled) {
        return;
      }

      Promise.all(filePromises)
        .then(() => {
          if (settled) {
            return;
          }

          if (!image) {
            reject(
              new ImageSearchError("Missing image field.", {
                code: "IMAGE_REQUIRED",
                statusCode: 400,
              }),
            );
            return;
          }

          settled = true;
          resolve({
            image,
            ...(message ? { message } : {}),
            ...(conversationId ? { conversationId } : {}),
          });
        })
        .catch((error: unknown) => {
          fail(mapMultipartError(error));
        });
    });

    request.pipe(busboy);
  });
}

function collectImageStream(
  stream: NodeJS.ReadableStream,
  info: FileInfo,
  maxImageBytes: number,
): Promise<ImageSearchImageInput> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;

    stream.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;

      if (totalBytes > maxImageBytes) {
        tooLarge = true;
      } else {
        chunks.push(buffer);
      }
    });
    stream.on("limit", () => {
      tooLarge = true;
    });
    stream.on("error", (error) => {
      reject(
        new ImageSearchError("Image upload failed.", {
          code: "IMAGE_MULTIPART_INVALID",
          statusCode: 400,
          cause: error,
        }),
      );
    });
    stream.on("end", () => {
      if (tooLarge) {
        reject(
          new ImageSearchError("Image file is too large.", {
            code: "IMAGE_TOO_LARGE",
            statusCode: 413,
          }),
        );
        return;
      }

      resolve({
        buffer: Buffer.concat(chunks),
        mimeType: info.mimeType,
      });
    });
  });
}

function normalizeOptionalText(
  value: string,
  fieldName: string,
  maxChars: number,
): string | undefined {
  const normalized = value.replace(/\s+/gu, " ").trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (Array.from(normalized).length > maxChars) {
    throw new ImageSearchError(`${fieldName} is too long.`, {
      code: "IMAGE_MULTIPART_INVALID",
      statusCode: 400,
    });
  }

  return normalized;
}

function normalizeConversationId(value: string): string | undefined {
  const normalized = normalizeOptionalText(
    value,
    "conversationId",
    CONVERSATION_ID_MAX_CHARS,
  );

  if (!normalized) {
    return undefined;
  }

  if (!CONVERSATION_ID_PATTERN.test(normalized)) {
    throw new ImageSearchError(
      "conversationId can only include letters, numbers, -, _, and .",
      {
        code: "IMAGE_MULTIPART_INVALID",
        statusCode: 400,
      },
    );
  }

  return normalized;
}

function mapMultipartError(error: unknown): ImageSearchError {
  if (error instanceof ImageSearchError) {
    return error;
  }

  return new ImageSearchError("Multipart request is invalid.", {
    code: "IMAGE_MULTIPART_INVALID",
    statusCode: 400,
    cause: error,
  });
}
