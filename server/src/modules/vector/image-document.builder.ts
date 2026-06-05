import { createHash } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { isProductAvailable } from "../products/product-availability";
import type { Product } from "../products/product.types";
import type {
  ProductImageDocument,
  SkippedProductImageDocument,
} from "./image-document.types";

export interface BuildProductImageDocumentsOptions {
  staticImageRoot: string;
}

export interface BuildProductImageDocumentsResult {
  documents: ProductImageDocument[];
  skipped: SkippedProductImageDocument[];
}

export async function buildProductImageDocuments(
  products: Product[],
  options: BuildProductImageDocumentsOptions,
): Promise<BuildProductImageDocumentsResult> {
  const documents: ProductImageDocument[] = [];
  const skipped: SkippedProductImageDocument[] = [];

  for (const product of products) {
    const imagePath = product.imagePath?.trim();

    if (!imagePath) {
      skipped.push({
        productId: product.id,
        reason: "missing_image_path",
      });
      continue;
    }

    const imageMimeType = detectSupportedImageMimeType(imagePath);

    if (!imageMimeType) {
      skipped.push({
        productId: product.id,
        imagePath,
        reason: "unsupported_image_type",
      });
      continue;
    }

    const imageFilePath = resolveImageFilePath(options.staticImageRoot, imagePath);
    const imageBytes = await readImageFileOrNull(imageFilePath);

    if (!imageBytes) {
      skipped.push({
        productId: product.id,
        imagePath,
        reason: "missing_image_file",
      });
      continue;
    }

    documents.push(createProductImageDocument({
      product,
      imagePath,
      imageMimeType,
      imageHash: hashImage(imageBytes),
    }));
  }

  return { documents, skipped };
}

export function createProductImageDocument(input: {
  product: Product;
  imagePath: string;
  imageMimeType: string;
  imageHash: string;
}): ProductImageDocument {
  const caption = createVisualCaption(input.product);

  return {
    docId: `product:${input.product.id}:image:main`,
    productId: input.product.id,
    docType: "image_main",
    imagePath: input.imagePath,
    imageMimeType: input.imageMimeType,
    visualCaption: caption,
    visualTags: input.product.visualTags,
    category: input.product.category,
    subCategory: input.product.subCategory,
    brand: input.product.brand,
    status: input.product.status,
    available: isProductAvailable(input.product),
    sourceDataset: input.product.sourceDataset,
    sourceVersion: input.product.sourceVersion,
    dataVersion: input.product.dataVersion,
    ingestBatchId: input.product.ingestBatchId,
    priceMinCents: input.product.priceMinCents,
    priceMaxCents: input.product.priceMaxCents,
    imageHash: input.imageHash,
  };
}

export function resolveImageFilePath(
  staticImageRoot: string,
  imagePath: string,
): string {
  const root = path.resolve(staticImageRoot);
  const resolved = path.resolve(root, imagePath);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Image path escapes static image root: ${imagePath}`);
  }

  return resolved;
}

export function detectSupportedImageMimeType(
  imagePath: string,
): string | undefined {
  const extension = path.extname(imagePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return undefined;
}

function createVisualCaption(product: Product): string {
  const caption = product.imageCaption?.trim();

  return [
    caption && `图片说明: ${caption}`,
    `商品名: ${product.name}`,
    `品牌: ${product.brand}`,
    `类目: ${product.category}${product.subCategory ? ` / ${product.subCategory}` : ""}`,
    product.visualTags.length > 0
      ? `视觉标签: ${product.visualTags.join("、")}`
      : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

async function readImageFileOrNull(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error
    && "code" in error
    && (error as { code?: unknown }).code === "ENOENT"
  );
}

function hashImage(imageBytes: Buffer): string {
  return createHash("sha256").update(imageBytes).digest("hex");
}
