import { Router } from "express";
import {
  getProductDetailController,
  listProductsController,
} from "./product.controller";

export const productRouter = Router();

productRouter.get("/", listProductsController);
productRouter.get("/:id", getProductDetailController);
