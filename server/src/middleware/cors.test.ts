import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { createCorsMiddleware } from "./cors";

describe("createCorsMiddleware", () => {
  it("echoes an exact allowed origin without credentials", async () => {
    const response = await requestWithCors({
      allowedOrigins: ["https://demo.example"],
      origin: "https://demo.example",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://demo.example",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("does not add CORS headers for unlisted origins", async () => {
    const response = await requestWithCors({
      allowedOrigins: ["https://demo.example"],
      origin: "https://other.example",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("handles allowed preflight requests", async () => {
    const response = await requestWithCors({
      allowedOrigins: ["https://demo.example"],
      origin: "https://demo.example",
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Headers": "Content-Type,X-Demo",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://demo.example",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type,X-Demo",
    );
  });
});

async function requestWithCors(options: {
  allowedOrigins: string[];
  origin: string;
  method?: string;
  headers?: Record<string, string>;
}): Promise<Response> {
  const app = express();

  app.use(createCorsMiddleware(options.allowedOrigins));
  app.all("/demo", (_request, response) => {
    response.json({ ok: true });
  });

  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;

    return await fetch(`http://127.0.0.1:${address.port}/demo`, {
      method: options.method ?? "GET",
      headers: {
        Origin: options.origin,
        ...options.headers,
      },
    });
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
