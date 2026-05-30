import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { createProductImageRouter } from "./image.routes";

describe("productImageRouter", () => {
  it("serves safe product image files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "shopmate-images-"));

    try {
      await mkdir(path.join(root, "beauty", "images"), { recursive: true });
      await writeFile(
        path.join(root, "beauty", "images", "p_beauty_001_main.jpg"),
        "demo image",
      );
    } catch {
      await rm(root, { recursive: true, force: true });
      throw new Error("failed to create image fixture");
    }

    try {
      const response = await requestImage(
        root,
        "/images/products/beauty/images/p_beauty_001_main.jpg",
      );

      expect(response.status).toBe(200);
      expect(response.contentType).toContain("image/jpeg");
      expect(response.body).toBe("demo image");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unsupported files without exposing filesystem paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "shopmate-images-"));

    try {
      const response = await requestImage(
        root,
        "/images/products/beauty/images/secret.txt",
      );

      expect(response.status).toBe(404);
      expect(response.body).toContain("IMAGE_NOT_FOUND");
      expect(response.body).not.toContain(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function requestImage(
  staticImageRoot: string,
  imagePath: string,
): Promise<{
  status: number;
  contentType: string;
  body: string;
}> {
  const app = express();

  app.use(
    "/images/products",
    createProductImageRouter({ staticImageRoot }),
  );

  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}${imagePath}`,
    );

    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body: await response.text(),
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
