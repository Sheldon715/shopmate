import type { Request, Response } from "express";
import { fail, ok } from "../../types/api-response";
import {
  getProductDetail,
  listProducts,
  parseProductIdParam,
  parseProductListQuery,
  ProductDetailCopyGenerationError,
  ProductNotFoundError,
  ProductQueryError,
} from "./product.service";

function logUnexpectedError(error: unknown): void {
  console.error("Product API error:", error);
}

export async function listProductsController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const query = parseProductListQuery(request.query);
    const products = await listProducts(query);

    response.json(ok(products));
  } catch (error) {
    if (error instanceof ProductQueryError) {
      response.status(400).json(fail(error.code, error.message));
      return;
    }

    logUnexpectedError(error);
    response.status(500).json(fail("INTERNAL_ERROR", "服务端暂时无法查询商品"));
  }
}

export async function getProductDetailController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const productId = parseProductIdParam(request.params.id);
    const product = await getProductDetail(productId);

    response.json(ok(product));
  } catch (error) {
    if (error instanceof ProductQueryError) {
      response.status(400).json(fail(error.code, error.message));
      return;
    }

    if (error instanceof ProductNotFoundError) {
      response.status(404).json(fail(error.code, "商品不存在"));
      return;
    }

    if (error instanceof ProductDetailCopyGenerationError) {
      response.status(502).json(fail(
        error.code,
        "商品详情页导购文案生成失败，请稍后重试",
      ));
      return;
    }

    logUnexpectedError(error);
    response.status(500).json(fail("INTERNAL_ERROR", "服务端暂时无法查询商品"));
  }
}
