import { Router } from "express";
import {
  cancelMockCheckoutController,
  confirmMockCheckoutController,
  createMockCheckoutController,
  getOrderController,
} from "./order.controller";

export const orderRouter = Router();

orderRouter.get("/:orderId", getOrderController);
orderRouter.post("/mock-checkout", createMockCheckoutController);
orderRouter.post("/mock-checkout/confirm", confirmMockCheckoutController);
orderRouter.post("/mock-checkout/cancel", cancelMockCheckoutController);
