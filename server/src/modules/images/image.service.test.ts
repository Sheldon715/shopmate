import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveProductImageFile,
  resolvePublicProductImagePath,
} from "./image.service";

describe("resolvePublicProductImagePath", () => {
  it("keeps existing HTTP image URLs unchanged", () => {
    expect(resolvePublicProductImagePath("https://cdn.example/a.jpg")).toBe(
      "https://cdn.example/a.jpg",
    );
  });

  it("keeps existing public absolute paths unchanged", () => {
    expect(resolvePublicProductImagePath("/images/product_001.png")).toBe(
      "/images/product_001.png",
    );
  });

  it("maps safe raw dataset image paths to the public product prefix", () => {
    expect(
      resolvePublicProductImagePath("beauty/images/p_beauty_001_main.jpg"),
    ).toBe("/images/products/beauty/images/p_beauty_001_main.jpg");
  });

  it("prepends PUBLIC_IMAGE_BASE_URL when provided", () => {
    expect(
      resolvePublicProductImagePath(
        "beauty/images/p_beauty_001_main.jpg",
        "https://api.example/",
      ),
    ).toBe("https://api.example/images/products/beauty/images/p_beauty_001_main.jpg");
  });

  it("rejects traversal, non-image, and non-images-directory paths", () => {
    expect(resolvePublicProductImagePath("../.env")).toBeNull();
    expect(resolvePublicProductImagePath("beauty/images/readme.txt")).toBeNull();
    expect(resolvePublicProductImagePath("beauty/data/p_001.jpg")).toBeNull();
  });
});

describe("resolveProductImageFile", () => {
  it("resolves safe image requests inside the static image root", () => {
    const root = path.resolve("data/raw/ecommerce_agent_dataset_v3");
    const image = resolveProductImageFile(
      root,
      "beauty",
      "p_beauty_001_main.jpg",
    );

    expect(image).toEqual({
      absolutePath: path.join(root, "beauty", "images", "p_beauty_001_main.jpg"),
      contentType: "image/jpeg",
    });
  });

  it("rejects unsafe or unsupported requests", () => {
    const root = path.resolve("data/raw/ecommerce_agent_dataset_v3");

    expect(resolveProductImageFile(root, "..", ".env")).toBeNull();
    expect(resolveProductImageFile(root, "beauty", "readme.txt")).toBeNull();
    expect(resolveProductImageFile(root, "beauty/images", "a.jpg")).toBeNull();
  });
});
