import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { app } from "./app";

describe("app API error handling", () => {
  it("returns the unified API response for unknown API routes", async () => {
    const response = await requestApp("/api/missing-route");

    expect(response.status).toBe(404);
    expect(response.contentType).toContain("application/json");
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "API_NOT_FOUND",
        message: "API route not found: /api/missing-route",
      },
    });
  });

  it("returns the unified API response for malformed JSON bodies", async () => {
    const response = await requestApp("/api/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{",
    });

    expect(response.status).toBe(400);
    expect(response.contentType).toContain("application/json");
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    });
  });
});

async function requestApp(
  path: string,
  init: RequestInit = {},
): Promise<{
  status: number;
  contentType: string;
  body: unknown;
}> {
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}${path}`,
      init,
    );
    const text = await response.text();

    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body: JSON.parse(text) as unknown,
    };
  } finally {
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
}
