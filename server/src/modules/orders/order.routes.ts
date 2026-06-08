import { Router } from "express";
import {
  cancelMockCheckoutController,
  confirmMockCheckoutController,
  createMockCheckoutController,
  createProductCheckoutController,
  getOrderController,
} from "./order.controller";

export const orderRouter = Router();

orderRouter.get("/:orderId", getOrderController);
orderRouter.post("/mock-checkout", createMockCheckoutController);
orderRouter.post("/mock-checkout/product", createProductCheckoutController);
orderRouter.post("/mock-checkout/confirm", confirmMockCheckoutController);
orderRouter.post("/mock-checkout/cancel", cancelMockCheckoutController);
