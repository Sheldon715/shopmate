import type { Request } from "express";
import type { AsrAudioInput } from "./asr.types";
import { AsrError } from "./asr.types";

export async function readMultipartAudio(
  request: Request,
  maxBytes: number,
): Promise<AsrAudioInput> {
  const contentType = request.get("content-type") ?? "";
  const boundary = parseBoundary(contentType);

  if (!boundary) {
    throw new AsrError("Request must be multipart/form-data.", {
      code: "ASR_AUDIO_REQUIRED",
      statusCode: 400,
    });
  }

  const body = await readRequestBody(request, maxBytes);
  const part = findAudioPart(body, boundary);

  if (!part) {
    throw new AsrError("Missing audio field.", {
      code: "ASR_AUDIO_REQUIRED",
      statusCode: 400,
    });
  }

  return part;
}

function parseBoundary(contentType: string): string | undefined {
  const match = /(?:^|;\s*)boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return match?.[1] ?? match?.[2]?.trim();
}

async function readRequestBody(
  request: Request,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > maxBytes + 1024 * 64) {
      throw new AsrError("Audio file is too large.", {
        code: "ASR_AUDIO_TOO_LARGE",
        statusCode: 413,
      });
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function findAudioPart(
  body: Buffer,
  boundary: string,
): AsrAudioInput | undefined {
  const marker = Buffer.from(`--${boundary}`);
  let cursor = 0;

  while (cursor < body.length) {
    const partStart = body.indexOf(marker, cursor);

    if (partStart === -1) {
      return undefined;
    }

    const headersStart = partStart + marker.length;
    const partEnd = body.indexOf(marker, headersStart);

    if (partEnd === -1) {
      return undefined;
    }

    const segment = body.subarray(headersStart, partEnd);
    const headerEnd = segment.indexOf(Buffer.from("\r\n\r\n"));

    if (headerEnd !== -1) {
      const headerText = segment.subarray(0, headerEnd).toString("utf8");
      const content = trimPartContent(segment.subarray(headerEnd + 4));
      const headers = parseHeaders(headerText);
      const disposition = headers.get("content-disposition") ?? "";

      if (parseFieldName(disposition) === "audio") {
        return {
          buffer: content,
          mimeType: headers.get("content-type") ?? "application/octet-stream",
          filename: parseFilename(disposition),
        };
      }
    }

    cursor = partEnd;
  }

  return undefined;
}

function trimPartContent(content: Buffer): Buffer {
  let end = content.length;

  if (end >= 2 && content[end - 2] === 13 && content[end - 1] === 10) {
    end -= 2;
  }

  return content.subarray(0, end);
}

function parseHeaders(headerText: string): Map<string, string> {
  const headers = new Map<string, string>();

  for (const line of headerText.split("\r\n")) {
    const separator = line.indexOf(":");

    if (separator === -1) {
      continue;
    }

    headers.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }

  return headers;
}

function parseFilename(disposition: string): string | undefined {
  return /filename="([^"]+)"/.exec(disposition)?.[1];
}

function parseFieldName(disposition: string): string | undefined {
  return /(?:^|;\s*)name="([^"]+)"/.exec(disposition)?.[1];
}
