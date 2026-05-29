import { Router } from "express";
import {
  addCartItemController,
  deleteCartItemController,
  getCartController,
  selectAllCartItemsController,
  updateCartItemController,
} from "./cart.controller";

export const cartRouter = Router();

cartRouter.get("/", getCartController);
cartRouter.post("/items", addCartItemController);
cartRouter.patch("/items/:itemId", updateCartItemController);
cartRouter.delete("/items/:itemId", deleteCartItemController);
cartRouter.post("/select-all", selectAllCartItemsController);
