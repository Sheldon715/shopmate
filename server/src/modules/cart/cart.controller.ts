import type { Request, Response } from "express";
import { fail, ok } from "../../types/api-response";
import {
  CartItemNotFoundError,
  CartProductNotFoundError,
  CartProductUnavailableError,
  CartRequestError,
  CartService,
  parseAddCartItemBody,
  parseCartItemIdParam,
  parsePatchCartItemBody,
  parseSelectAllBody,
} from "./cart.service";

const cartService = new CartService();

function logUnexpectedError(error: unknown): void {
  console.error("Cart API error:", error);
}

export async function getCartController(
  _request: Request,
  response: Response,
): Promise<void> {
  try {
    const cart = await cartService.getCart();

    response.json(ok(cart));
  } catch (error) {
    logUnexpectedError(error);
    response.status(500).json(fail("INTERNAL_ERROR", "服务端暂时无法读取购物车"));
  }
}

export async function addCartItemController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const input = parseAddCartItemBody(request.body);
    const cart = await cartService.addItem(input);

    response.status(201).json(ok(cart));
  } catch (error) {
    handleCartError(error, response);
  }
}

export async function updateCartItemController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const itemId = parseCartItemIdParam(request.params.itemId);
    const input = parsePatchCartItemBody(request.body);
    const cart = await cartService.updateItem(itemId, input);

    response.json(ok(cart));
  } catch (error) {
    handleCartError(error, response);
  }
}

export async function deleteCartItemController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const itemId = parseCartItemIdParam(request.params.itemId);
    const cart = await cartService.deleteItem(itemId);

    response.json(ok(cart));
  } catch (error) {
    handleCartError(error, response);
  }
}

export async function selectAllCartItemsController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const selected = parseSelectAllBody(request.body);
    const cart = await cartService.selectAll(selected);

    response.json(ok(cart));
  } catch (error) {
    handleCartError(error, response);
  }
}

function handleCartError(error: unknown, response: Response): void {
  if (error instanceof CartRequestError) {
    response.status(400).json(fail(error.code, error.message));
    return;
  }

  if (error instanceof CartProductNotFoundError) {
    response.status(404).json(fail(error.code, "商品不存在"));
    return;
  }

  if (error instanceof CartProductUnavailableError) {
    response.status(409).json(fail(error.code, "商品当前不可加购"));
    return;
  }

  if (error instanceof CartItemNotFoundError) {
    response.status(404).json(fail(error.code, "购物车项不存在"));
    return;
  }

  logUnexpectedError(error);
  response.status(500).json(fail("INTERNAL_ERROR", "服务端暂时无法更新购物车"));
}
