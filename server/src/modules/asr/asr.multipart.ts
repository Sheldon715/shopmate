import type { Request } from "express";
import Busboy from "busboy";
import type { FileInfo } from "busboy";
import type { AsrAudioInput } from "./asr.types";
import { AsrError } from "./asr.types";

export function readMultipartAudio(
  request: Request,
  maxBytes: number,
): Promise<AsrAudioInput> {
  const contentType = request.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return Promise.reject(
      new AsrError("Request must be multipart/form-data.", {
        code: "ASR_AUDIO_REQUIRED",
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
          fileSize: maxBytes,
          fields: 0,
        },
      });
    } catch (error) {
      reject(
        new AsrError("Multipart request is invalid.", {
          code: "ASR_AUDIO_REQUIRED",
          statusCode: 400,
          cause: error,
        }),
      );
      return;
    }

    let audio: AsrAudioInput | undefined;
    let settled = false;
    const filePromises: Array<Promise<void>> = [];

    const fail = (error: AsrError) => {
      if (settled) {
        return;
      }

      settled = true;
      request.unpipe(busboy);
      busboy.removeAllListeners();
      reject(error);
    };

    busboy.on("file", (fieldName, stream, info) => {
      if (fieldName !== "audio") {
        stream.resume();
        return;
      }

      const filePromise = collectAudioStream(stream, info, maxBytes)
        .then((input) => {
          audio = input;
        })
        .catch((error: unknown) => {
          fail(mapMultipartError(error));
        });
      filePromises.push(filePromise);
    });

    busboy.on("field", () => {
      fail(
        new AsrError("Unexpected form field.", {
          code: "ASR_AUDIO_REQUIRED",
          statusCode: 400,
        }),
      );
    });

    busboy.on("filesLimit", () => {
      fail(
        new AsrError("Only one audio file is supported.", {
          code: "ASR_AUDIO_REQUIRED",
          statusCode: 400,
        }),
      );
    });

    busboy.on("fieldsLimit", () => {
      fail(
        new AsrError("Unexpected form field.", {
          code: "ASR_AUDIO_REQUIRED",
          statusCode: 400,
        }),
      );
    });

    busboy.on("error", (error) => {
      fail(
        new AsrError("Multipart request is invalid.", {
          code: "ASR_AUDIO_REQUIRED",
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

          if (!audio) {
            reject(
              new AsrError("Missing audio field.", {
                code: "ASR_AUDIO_REQUIRED",
                statusCode: 400,
              }),
            );
            return;
          }

          settled = true;
          resolve(audio);
        })
        .catch((error: unknown) => {
          fail(mapMultipartError(error));
        });
    });

    request.pipe(busboy);
  });
}

function collectAudioStream(
  stream: NodeJS.ReadableStream,
  info: FileInfo,
  maxBytes: number,
): Promise<AsrAudioInput> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;

    stream.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;

      if (totalBytes > maxBytes) {
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
        new AsrError("Audio upload failed.", {
          code: "ASR_AUDIO_REQUIRED",
          statusCode: 400,
          cause: error,
        }),
      );
    });

    stream.on("end", () => {
      if (tooLarge) {
        reject(
          new AsrError("Audio file is too large.", {
            code: "ASR_AUDIO_TOO_LARGE",
            statusCode: 413,
          }),
        );
        return;
      }

      resolve({
        buffer: Buffer.concat(chunks),
        mimeType: info.mimeType,
        filename: info.filename,
      });
    });
  });
}

function mapMultipartError(error: unknown): AsrError {
  if (error instanceof AsrError) {
    return error;
  }

  return new AsrError("Multipart request is invalid.", {
    code: "ASR_AUDIO_REQUIRED",
    statusCode: 400,
    cause: error,
  });
}
