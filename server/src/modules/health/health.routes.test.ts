import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { app } from "../../app";

describe("GET /api/health", () => {
  it("returns a lightweight health payload without external dependencies", async () => {
    const response = await requestApp("/api/health");

    expect(response.status).toBe(200);
    expect(response.contentType).toContain("application/json");
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: "ok",
        service: "shopmate-api",
      },
    });
    expect(response.body.data.uptimeSeconds).toEqual(expect.any(Number));
    expect(new Date(response.body.data.timestamp).toString()).not.toBe(
      "Invalid Date",
    );
  });
});

async function requestApp(
  path: string,
): Promise<{
  status: number;
  contentType: string;
  body: {
    success?: boolean;
    data?: {
      status?: string;
      service?: string;
      uptimeSeconds?: number;
      timestamp?: string;
    };
  };
}> {
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    const text = await response.text();

    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body: JSON.parse(text) as {
        success?: boolean;
        data?: {
          status?: string;
          service?: string;
          uptimeSeconds?: number;
          timestamp?: string;
        };
      },
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
