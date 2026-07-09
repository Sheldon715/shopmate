import { getDatabasePool } from "../../lib/db/pool";
import { getEnv } from "../../lib/env";
import { createLlmLaneClients } from "../llm/llm-lanes";
import { findProductById, findProducts } from "./product.repository";
import {
  mapProductToCardDto,
  mapProductToDetailDto,
} from "./product.mapper";
import {
  type ProductDisplayCopy,
  ProductDisplayCopyGenerationService,
  type ProductDisplayCopyGenerator,
} from "./product-display-copy-generation.service";
import type {
  Product,
  ProductCardDto,
  ProductDetailDto,
  ProductListQuery,
} from "./product.types";

export const PRODUCT_QUERY_DEFAULT_LIMIT = 20;
export const PRODUCT_QUERY_MAX_LIMIT = 50;
export const PRODUCT_QUERY_MAX_OFFSET = 1000;

export interface ProductDetailOptions {
  displayCopyGenerator?: ProductDisplayCopyGenerator;
}

let defaultDisplayCopyGenerator: ProductDisplayCopyGenerator | undefined;

export class ProductQueryError extends Error {
  readonly code = "INVALID_PRODUCT_QUERY";

  constructor(message: string) {
    super(message);
    this.name = "ProductQueryError";
  }
}

export class ProductNotFoundError extends Error {
  readonly code = "PRODUCT_NOT_FOUND";

  constructor(productId: string) {
    super(`商品不存在：${productId}`);
    this.name = "ProductNotFoundError";
  }
}

export class ProductDetailCopyGenerationError extends Error {
  readonly code = "PRODUCT_DETAIL_COPY_GENERATION_FAILED";
  readonly cause?: unknown;

  constructor(productId: string, cause?: unknown) {
    super(`商品详情页导购文案生成失败：${productId}`);
    this.name = "ProductDetailCopyGenerationError";
    this.cause = cause;
  }
}

function readStringParam(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value) || typeof value !== "string") {
    throw new ProductQueryError(`${fieldName} 参数格式不正确`);
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function readIntegerParam(
  value: unknown,
  fieldName: string,
): number | undefined {
  const rawValue = readStringParam(value, fieldName);

  if (rawValue === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new ProductQueryError(`${fieldName} 必须是非负整数`);
  }

  const parsed = Number(rawValue);

  if (!Number.isSafeInteger(parsed)) {
    throw new ProductQueryError(`${fieldName} 超出可用范围`);
  }

  return parsed;
}

export function parseProductListQuery(
  query: Record<string, unknown>,
): ProductListQuery {
  const minPriceCents = readIntegerParam(
    query.minPriceCents,
    "minPriceCents",
  );
  const maxPriceCents = readIntegerParam(
    query.maxPriceCents,
    "maxPriceCents",
  );
  const limit = readIntegerParam(query.limit, "limit")
    ?? PRODUCT_QUERY_DEFAULT_LIMIT;
  const offset = readIntegerParam(query.offset, "offset") ?? 0;

  if (limit < 1 || limit > PRODUCT_QUERY_MAX_LIMIT) {
    throw new ProductQueryError(
      `limit 必须在 1 到 ${PRODUCT_QUERY_MAX_LIMIT} 之间`,
    );
  }

  if (offset > PRODUCT_QUERY_MAX_OFFSET) {
    throw new ProductQueryError(
      `offset 不能大于 ${PRODUCT_QUERY_MAX_OFFSET}`,
    );
  }

  if (minPriceCents !== undefined && maxPriceCents !== undefined) {
    if (minPriceCents > maxPriceCents) {
      throw new ProductQueryError("minPriceCents 不能大于 maxPriceCents");
    }
  }

  return {
    q: readStringParam(query.q, "q"),
    category: readStringParam(query.category, "category"),
    subCategory: readStringParam(query.subCategory, "subCategory"),
    brand: readStringParam(query.brand, "brand"),
    minPriceCents,
    maxPriceCents,
    limit,
    offset,
  };
}

export function parseProductIdParam(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProductQueryError("商品 id 参数格式不正确");
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ProductQueryError("商品 id 不能为空");
  }

  return trimmed;
}

export async function listProducts(
  query: ProductListQuery,
): Promise<ProductCardDto[]> {
  const products = await findProducts(getDatabasePool(), query);
  const { publicImageBaseUrl } = getEnv();

  return products.map((product) =>
    mapProductToCardDto(product, { publicImageBaseUrl })
  );
}

export async function getProductDetail(
  productId: string,
  options: ProductDetailOptions = {},
): Promise<ProductDetailDto> {
  const product = await findProductById(getDatabasePool(), productId);

  if (!product) {
    throw new ProductNotFoundError(productId);
  }

  const generatedCopy = await generateProductDetailCopy(
    product,
    options.displayCopyGenerator ?? getDefaultDisplayCopyGenerator(),
  );

  return mapProductToDetailDto(product, {
    publicImageBaseUrl: getEnv().publicImageBaseUrl,
    recommendationReason: generatedCopy.detailReason,
    recommendationHighlights: generatedCopy.detailHighlights,
    displayName: generatedCopy.displayName,
    displayTags: generatedCopy.displayTags,
    displaySpecs: generatedCopy.displaySpecs,
    suitabilityText: generatedCopy.suitabilityText,
  });
}

function getDefaultDisplayCopyGenerator(): ProductDisplayCopyGenerator {
  if (!defaultDisplayCopyGenerator) {
    defaultDisplayCopyGenerator = new ProductDisplayCopyGenerationService({
      llmClient: createLlmLaneClients().answer,
    });
  }

  return defaultDisplayCopyGenerator;
}

async function generateProductDetailCopy(
  product: Product,
  generator: ProductDisplayCopyGenerator,
): Promise<Required<Pick<
  ProductDisplayCopy,
  | "detailReason"
  | "detailHighlights"
  | "displayName"
  | "displayTags"
  | "displaySpecs"
  | "suitabilityText"
>>> {
  try {
    const copies = await generator.generate({
      products: [product],
      surface: "product_detail",
    });
    const copy = copies.get(product.id);
    const detailHighlights = copy?.detailHighlights ?? [];
    const displayTags = copy?.displayTags ?? [];
    const displaySpecs = copy?.displaySpecs ?? [];

    if (
      !copy?.detailReason
      || detailHighlights.length === 0
      || !copy.displayName
      || displayTags.length === 0
      || displaySpecs.length < 4
      || !copy.suitabilityText
    ) {
      throw new ProductDetailCopyGenerationError(
        product.id,
        "missing_detail_copy",
      );
    }

    return {
      detailReason: copy.detailReason,
      detailHighlights,
      displayName: copy.displayName,
      displayTags,
      displaySpecs,
      suitabilityText: copy.suitabilityText,
    };
  } catch (error) {
    if (error instanceof ProductDetailCopyGenerationError) {
      throw error;
    }

    throw new ProductDetailCopyGenerationError(product.id, error);
  }
}
