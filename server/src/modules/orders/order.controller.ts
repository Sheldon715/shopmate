import type { Request, Response } from "express";
import { fail, ok } from "../../types/api-response";
import { DEMO_CART_USER_KEY } from "../cart/cart.service";
import { PendingCheckoutStore } from "../chat/pending-checkout.store";
import {
  mapOrderToDto,
  mapPendingCheckoutDraftToSnapshot,
} from "./order.mapper";
import {
  CheckoutCartChangedError,
  CheckoutEmptyCartError,
  CheckoutExpiredError,
  CheckoutProductUnavailableError,
  CheckoutRequestError,
  OrderNotFoundError,
  DEFAULT_CHECKOUT_CONVERSATION_ID,
  OrderService,
  parseMockCheckoutBody,
  parseMockCheckoutConfirmBody,
  parseOrderIdParam,
  parseProductCheckoutBody,
} from "./order.service";

const orderService = new OrderService();
const pendingCheckoutStore = new PendingCheckoutStore();

export async function getOrderController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const orderId = parseOrderIdParam(request.params.orderId);
    const order = await orderService.getOrder(orderId);

    response.json(ok(order));
  } catch (error) {
    handleOrderError(error, response);
  }
}

export async function createMockCheckoutController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const input = parseMockCheckoutBody(request.body);
    const conversationId = input.conversationId ?? DEFAULT_CHECKOUT_CONVERSATION_ID;
    const draft = await orderService.createPendingCheckout({ conversationId });
    pendingCheckoutStore.save(draft);

    response.status(201).json(ok({
      draft,
      checkoutAction: {
        type: "start_checkout",
        status: "draft_created",
        draftId: draft.id,
        selectedCount: draft.summary.selectedCount,
        totalCents: draft.summary.totalCents,
        address: draft.address,
        cartRefreshRequired: false,
        draft: mapPendingCheckoutDraftToSnapshot(draft),
      },
    }));
  } catch (error) {
    handleOrderError(error, response);
  }
}

export async function createProductCheckoutController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const input = parseProductCheckoutBody(request.body);
    const conversationId = input.conversationId ?? DEFAULT_CHECKOUT_CONVERSATION_ID;
    const draft = await orderService.createProductCheckout({
      conversationId,
      productId: input.productId,
    });
    pendingCheckoutStore.save(draft);

    response.status(201).json(ok({
      draft,
      checkoutAction: {
        type: "start_checkout",
        status: "draft_created",
        draftId: draft.id,
        selectedCount: draft.summary.selectedCount,
        totalCents: draft.summary.totalCents,
        address: draft.address,
        cartRefreshRequired: false,
        draft: mapPendingCheckoutDraftToSnapshot(draft),
      },
    }));
  } catch (error) {
    handleOrderError(error, response);
  }
}

export async function confirmMockCheckoutController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const input = parseMockCheckoutConfirmBody(request.body);
    const conversationId = input.conversationId ?? DEFAULT_CHECKOUT_CONVERSATION_ID;
    const lookup = pendingCheckoutStore.get({
      conversationId,
      userKey: DEMO_CART_USER_KEY,
    });

    if (lookup.status === "expired") {
      throw new CheckoutExpiredError();
    }

    if (lookup.status !== "found") {
      throw new CheckoutRequestError("没有待确认的订单");
    }

    if (lookup.draft.id !== input.draftId) {
      throw new CheckoutRequestError("draftId 与当前待确认订单不匹配");
    }

    const order = await orderService.confirmPendingCheckout(
      lookup.draft,
      lookup.draft.source === "buy_now" ? "buy_now" : "cart_button",
      {
        shipping: input.shipping,
        deliveryMethodType: input.deliveryMethodType,
        paymentMethodType: input.paymentMethodType,
      },
    );
    pendingCheckoutStore.clear({
      conversationId,
      userKey: DEMO_CART_USER_KEY,
    });
    const orderDto = mapOrderToDto(order);

    response.status(201).json(ok({
      order: orderDto,
      checkoutAction: {
        type: "confirm_checkout",
        status: "order_created",
        draftId: lookup.draft.id,
        orderId: orderDto.id,
        orderNumber: orderDto.orderNumber,
        selectedCount: lookup.draft.summary.selectedCount,
        totalCents: orderDto.totalCents,
        address: orderDto.shippingAddress,
        cartRefreshRequired: lookup.draft.source !== "buy_now",
      },
    }));
  } catch (error) {
    handleOrderError(error, response);
  }
}

export async function cancelMockCheckoutController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const input = parseMockCheckoutBody(request.body);
    const conversationId = input.conversationId ?? DEFAULT_CHECKOUT_CONVERSATION_ID;
    const lookup = pendingCheckoutStore.clear({
      conversationId,
      userKey: DEMO_CART_USER_KEY,
    });

    response.json(ok({
      checkoutAction: {
        type: "cancel_checkout",
        status: lookup.status === "expired" ? "expired" : "cancelled",
        draftId: lookup.status === "missing" ? undefined : lookup.draft.id,
        cartRefreshRequired: false,
      },
    }));
  } catch (error) {
    handleOrderError(error, response);
  }
}

function handleOrderError(error: unknown, response: Response): void {
  if (error instanceof CheckoutRequestError) {
    response.status(400).json(fail(error.code, error.message));
    return;
  }

  if (error instanceof CheckoutEmptyCartError) {
    response.status(409).json(fail(error.code, "购物车没有可结算商品"));
    return;
  }

  if (error instanceof CheckoutExpiredError) {
    response.status(409).json(fail(error.code, "待确认订单已过期，请重新结算"));
    return;
  }

  if (error instanceof CheckoutProductUnavailableError) {
    response.status(409).json(fail(error.code, "部分商品当前不可结算"));
    return;
  }

  if (error instanceof CheckoutCartChangedError) {
    response.status(409).json(fail(error.code, "购物车商品已变化，请刷新后再试"));
    return;
  }

  if (error instanceof OrderNotFoundError) {
    response.status(404).json(fail(error.code, "订单不存在"));
    return;
  }

  console.error("Order API error:", toSafeOrderLogError(error));
  response.status(500).json(fail("INTERNAL_ERROR", "服务端暂时无法处理订单"));
}

function toSafeOrderLogError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  return {
    name: error.name,
    message: error.message,
  };
}
