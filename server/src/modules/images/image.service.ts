import path from "node:path";

const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const PRODUCT_IMAGE_PREFIX = "/images/products";

export interface ProductImageFile {
  absolutePath: string;
  contentType: string;
}

export function resolvePublicProductImagePath(
  imagePath: string | null,
  publicImageBaseUrl?: string,
): string | null {
  const trimmed = imagePath?.trim();

  if (!trimmed) {
    return null;
  }

  if (isHttpUrl(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }

  const relativePath = normalizeProductImageRelativePath(trimmed);

  if (!relativePath) {
    return null;
  }

  const publicPath = `${PRODUCT_IMAGE_PREFIX}/${toUrlPath(relativePath)}`;

  if (!publicImageBaseUrl) {
    return publicPath;
  }

  return `${publicImageBaseUrl.replace(/\/+$/u, "")}${publicPath}`;
}

export function resolveProductImageFile(
  staticImageRoot: string,
  category: string,
  filename: string,
): ProductImageFile | null {
  const relativePath = normalizeProductImageRelativePath(
    `${category}/images/${filename}`,
  );

  if (!relativePath) {
    return null;
  }

  const root = path.resolve(staticImageRoot);
  const absolutePath = path.resolve(root, ...relativePath.split("/"));

  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  return {
    absolutePath,
    contentType: contentTypeForExtension(path.extname(filename)),
  };
}

function normalizeProductImageRelativePath(value: string): string | null {
  if (
    value.includes("\\")
    || value.includes("\0")
    || path.isAbsolute(value)
  ) {
    return null;
  }

  const parts = value.split("/");

  if (parts.length !== 3 || parts[1] !== "images") {
    return null;
  }

  const [category, _images, filename] = parts;

  if (!isSafeSegment(category) || !isSafeSegment(filename)) {
    return null;
  }

  const extension = path.extname(filename).toLowerCase();

  if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    return null;
  }

  return `${category}/images/${filename}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value) && value !== "."
    && value !== "..";
}

function toUrlPath(relativePath: string): string {
  return relativePath.split("/").map(encodeURIComponent).join("/");
}

function contentTypeForExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
