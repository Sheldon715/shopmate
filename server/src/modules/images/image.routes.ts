import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { Router } from "express";
import { getEnv } from "../../lib/env";
import { fail } from "../../types/api-response";
import { resolveProductImageFile } from "./image.service";

export interface ProductImageRouterOptions {
  staticImageRoot: string;
}

export function createProductImageRouter(
  options: ProductImageRouterOptions,
): Router {
  const router = Router();

  router.get("/:category/images/:filename", async (request, response) => {
    const image = resolveProductImageFile(
      options.staticImageRoot,
      request.params.category,
      request.params.filename,
    );

    if (!image) {
      response.status(404).json(fail("IMAGE_NOT_FOUND", "商品图片不存在"));
      return;
    }

    try {
      await access(image.absolutePath, constants.R_OK);
    } catch {
      response.status(404).json(fail("IMAGE_NOT_FOUND", "商品图片不存在"));
      return;
    }

    response.type(image.contentType);
    response.sendFile(image.absolutePath, (error) => {
      if (error && !response.headersSent) {
        response.status(404).json(fail("IMAGE_NOT_FOUND", "商品图片不存在"));
      }
    });
  });

  router.use((_request, response) => {
    response.status(404).json(fail("IMAGE_NOT_FOUND", "商品图片不存在"));
  });

  return router;
}

export const productImageRouter = createProductImageRouter({
  staticImageRoot: getEnv().staticImageRoot,
});
