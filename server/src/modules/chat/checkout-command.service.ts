import { throwIfAborted, rethrowIfAborted } from "../../lib/abort";
import { DEMO_CART_USER_KEY } from "../cart/cart.service";
import type { CartDto } from "../cart/cart.types";
import {
  CheckoutEmptyCartError,
  CheckoutExpiredError,
  CheckoutProductUnavailableError,
  CheckoutRequestError,
  OrderService,
} from "../orders/order.service";
import type {
  CheckoutActionResult,
  CheckoutActionType,
  CheckoutChangedField,
  CheckoutIntentDetection,
  CheckoutPatchInput,
  PendingCheckoutDraft,
} from "../orders/checkout.types";
import { mapPendingCheckoutDraftToSnapshot } from "../orders/order.mapper";
import type { OrderRecord } from "../orders/order.types";
import type { RagChatRequest, RagChatResult } from "./chat.types";
import { CheckoutResponseService } from "./checkout-response.service";
import { PendingCheckoutStore, type PendingCheckoutLookup } from "./pending-checkout.store";

export interface CheckoutCommandServiceOptions {
  orderService?: OrderService;
  pendingCheckoutStore?: PendingCheckoutStore;
  checkoutResponseService: CheckoutResponseService;
  userKey?: string;
}

export interface CheckoutCommandExecuteInput {
  question: string;
  conversationId?: string;
  cartSnapshot?: CartDto;
  intent: Extract<CheckoutIntentDetection, { isCheckoutIntent: true }>;
  pendingCheckout: PendingCheckoutLookup;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export class CheckoutCommandService {
  private readonly orderService: OrderService;
  private readonly pendingCheckoutStore: PendingCheckoutStore;
  private readonly checkoutResponseService: CheckoutResponseService;
  private readonly userKey: string;

  constructor(options: CheckoutCommandServiceOptions) {
    this.orderService = options.orderService ?? new OrderService();
    this.pendingCheckoutStore =
      options.pendingCheckoutStore ?? new PendingCheckoutStore();
    this.checkoutResponseService = options.checkoutResponseService;
    this.userKey = options.userKey ?? DEMO_CART_USER_KEY;
  }

  getPendingCheckout(input: {
    conversationId?: string;
  }): PendingCheckoutLookup {
    return this.pendingCheckoutStore.get({
      conversationId: input.conversationId,
      userKey: this.userKey,
    });
  }

  async execute(input: CheckoutCommandExecuteInput): Promise<RagChatResult> {
    if (
      input.intent.confidence === "low"
      || input.intent.action === "unknown"
      || input.intent.needsConfirmation
    ) {
      const type = toCheckoutActionType(input.intent.action);

      return this.createResult(input, {
        checkoutAction: input.pendingCheckout.status === "found"
          ? checkoutActionFromDraft(
            type,
            "needs_confirmation",
            input.pendingCheckout.draft,
          )
          : {
            type,
            status: "needs_confirmation",
            selectedCount: input.cartSnapshot?.summary.selectedCount,
            totalCents: input.cartSnapshot?.summary.selectedTotalCents,
          },
        draft: input.pendingCheckout.status === "found"
          ? input.pendingCheckout.draft
          : undefined,
      });
    }

    switch (input.intent.action) {
      case "start_checkout":
        return this.startCheckout(input);
      case "summarize_checkout":
        return this.summarizeCheckout(input);
      case "update_checkout":
        return this.updateCheckout(input, "update_checkout");
      case "update_address":
        return this.updateCheckout(input, "update_address");
      case "cancel_checkout":
        return this.cancelCheckout(input);
      case "confirm_checkout":
        return this.confirmCheckout(input);
    }
  }

  private async startCheckout(
    input: CheckoutCommandExecuteInput,
  ): Promise<RagChatResult> {
    try {
      throwIfAborted(input.abortSignal);
      const draft = await this.orderService.createPendingCheckout({
        conversationId: input.conversationId,
      });
      throwIfAborted(input.abortSignal);
      this.pendingCheckoutStore.save(draft);

      return this.createResult(input, {
        checkoutAction: checkoutActionFromDraft(
          "start_checkout",
          "draft_created",
          draft,
        ),
        draft,
      });
    } catch (error) {
      return this.createFailureResult(input, "start_checkout", error);
    }
  }

  private async summarizeCheckout(
    input: CheckoutCommandExecuteInput,
  ): Promise<RagChatResult> {
    if (input.pendingCheckout.status === "found") {
      return this.createResult(input, {
        checkoutAction: checkoutActionFromDraft(
          "summarize_checkout",
          "needs_confirmation",
          input.pendingCheckout.draft,
        ),
        draft: input.pendingCheckout.draft,
      });
    }

    if (input.pendingCheckout.status === "expired") {
      return this.createResult(input, {
        checkoutAction: checkoutActionFromDraft(
          "summarize_checkout",
          "expired",
          input.pendingCheckout.draft,
        ),
        draft: input.pendingCheckout.draft,
      });
    }

    return this.startCheckout(input);
  }

  private async updateCheckout(
    input: CheckoutCommandExecuteInput,
    actionType: Extract<CheckoutActionType, "update_checkout" | "update_address">,
  ): Promise<RagChatResult> {
    const lookup = input.pendingCheckout;

    if (lookup.status === "expired") {
      return this.createResult(input, {
        checkoutAction: checkoutActionFromDraft(
          actionType,
          "expired",
          lookup.draft,
        ),
        draft: lookup.draft,
      });
    }

    if (lookup.status !== "found") {
      return this.createResult(input, {
        checkoutAction: {
          type: actionType,
          status: "failed",
        },
      });
    }

    const patch = checkoutPatchFromIntent(input.intent);

    if (!patch) {
      return this.createResult(input, {
        checkoutAction: checkoutActionFromDraft(
          actionType,
          "needs_confirmation",
          lookup.draft,
        ),
        draft: lookup.draft,
      });
    }

    try {
      const updateResult = this.orderService.updatePendingCheckoutDraft(
        lookup.draft,
        patch,
      );
      this.pendingCheckoutStore.save(updateResult.draft);
      const status = updateResult.changedFields.length === 1
          && updateResult.changedFields[0] === "shipping"
        ? "address_updated"
        : "draft_updated";

      return this.createResult(input, {
        checkoutAction: checkoutActionFromDraft(
          actionType,
          status,
          updateResult.draft,
          updateResult.changedFields,
        ),
        draft: updateResult.draft,
      });
    } catch (error) {
      return this.createFailureResult(input, actionType, error, lookup.draft);
    }
  }

  private async cancelCheckout(
    input: CheckoutCommandExecuteInput,
  ): Promise<RagChatResult> {
    const lookup = this.pendingCheckoutStore.clear({
      conversationId: input.conversationId,
      userKey: this.userKey,
    });

    if (lookup.status === "expired") {
      return this.createResult(input, {
        checkoutAction: checkoutActionFromDraft(
          "cancel_checkout",
          "expired",
          lookup.draft,
        ),
        draft: lookup.draft,
      });
    }

    return this.createResult(input, {
      checkoutAction: {
        type: "cancel_checkout",
        status: "cancelled",
      },
      draft: lookup.status === "found" ? lookup.draft : undefined,
    });
  }

  private async confirmCheckout(
    input: CheckoutCommandExecuteInput,
  ): Promise<RagChatResult> {
    const lookup = input.pendingCheckout;

    if (lookup.status === "expired") {
      return this.createResult(input, {
        checkoutAction: checkoutActionFromDraft(
          "confirm_checkout",
          "expired",
          lookup.draft,
        ),
        draft: lookup.draft,
      });
    }

    if (lookup.status !== "found") {
      return this.createResult(input, {
        checkoutAction: {
          type: "confirm_checkout",
          status: "failed",
        },
      });
    }

    try {
      throwIfAborted(input.abortSignal);
      const order = await this.orderService.confirmPendingCheckout(
        lookup.draft,
        "chat_agent",
      );
      throwIfAborted(input.abortSignal);
      this.pendingCheckoutStore.clear({
        conversationId: input.conversationId,
        userKey: this.userKey,
      });

      return this.createResult(input, {
        checkoutAction: {
          ...checkoutActionFromDraft(
            "confirm_checkout",
            "order_created",
            lookup.draft,
          ),
          orderId: order.id,
          orderNumber: order.orderNumber,
          cartRefreshRequired: true,
        },
        draft: lookup.draft,
        order,
      });
    } catch (error) {
      return this.createFailureResult(input, "confirm_checkout", error, lookup.draft);
    }
  }

  private async createFailureResult(
    input: CheckoutCommandExecuteInput,
    type: CheckoutActionType,
    error: unknown,
    draft?: PendingCheckoutDraft,
  ): Promise<RagChatResult> {
    rethrowIfAborted(input.abortSignal, error);

    if (error instanceof CheckoutEmptyCartError) {
      return this.createResult(input, {
        checkoutAction: {
          type,
          status: "empty_cart",
          selectedCount: input.cartSnapshot?.summary.selectedCount ?? 0,
          totalCents: 0,
        },
        draft,
      });
    }

    if (error instanceof CheckoutExpiredError) {
      return this.createResult(input, {
        checkoutAction: draft
          ? checkoutActionFromDraft(type, "expired", draft)
          : { type, status: "expired" },
        draft,
      });
    }

    if (error instanceof CheckoutProductUnavailableError) {
      return this.createResult(input, {
        checkoutAction: draft
          ? checkoutActionFromDraft(type, "failed", draft)
          : { type, status: "failed" },
        draft,
      });
    }

    if (error instanceof CheckoutRequestError) {
      return this.createResult(input, {
        checkoutAction: draft
          ? checkoutActionFromDraft(type, "failed", draft)
          : { type, status: "failed" },
        draft,
      });
    }

    return this.createResult(input, {
      checkoutAction: draft
        ? checkoutActionFromDraft(type, "failed", draft)
        : { type, status: "failed" },
      draft,
    });
  }

  private async createResult(
    input: CheckoutCommandExecuteInput,
    result: {
      checkoutAction: CheckoutActionResult;
      draft?: PendingCheckoutDraft;
      order?: OrderRecord;
    },
  ): Promise<RagChatResult> {
    const answer = await this.checkoutResponseService.generate({
      question: input.question,
      intent: input.intent,
      checkoutAction: result.checkoutAction,
      cartSnapshot: input.cartSnapshot,
      draft: result.draft,
      order: result.order,
      requestId: input.requestId,
      abortSignal: input.abortSignal,
    });

    return {
      answer,
      recommendedProductIds: [],
      productCards: [],
      fallbackUsed: false,
      retrieval: {
        candidateCount: result.draft?.items.length ?? input.cartSnapshot?.items.length ?? 0,
        returnedProductIds: result.draft?.items.map((item) => item.productId) ?? [],
      },
      checkoutAction: result.checkoutAction,
    };
  }
}

function checkoutActionFromDraft(
  type: CheckoutActionType,
  status: CheckoutActionResult["status"],
  draft: PendingCheckoutDraft,
  changedFields?: CheckoutChangedField[],
): CheckoutActionResult {
  return {
    type,
    status,
    draftId: draft.id,
    selectedCount: draft.summary.selectedCount,
    totalCents: draft.summary.totalCents,
    address: draft.address,
    cartRefreshRequired: false,
    draft: mapPendingCheckoutDraftToSnapshot(draft),
    changedFields,
  };
}

function toCheckoutActionType(action: string): CheckoutActionType {
  return action === "start_checkout"
      || action === "confirm_checkout"
      || action === "update_checkout"
      || action === "update_address"
      || action === "cancel_checkout"
      || action === "summarize_checkout"
    ? action
    : "summarize_checkout";
}

function checkoutPatchFromIntent(
  intent: Extract<CheckoutIntentDetection, { isCheckoutIntent: true }>,
): CheckoutPatchInput | undefined {
  const patch = intent.checkoutPatch;

  if (
    patch?.shipping
    || patch?.deliveryMethodType
    || patch?.paymentMethodType
  ) {
    return {
      shipping: patch.shipping,
      deliveryMethodType: patch.deliveryMethodType,
      paymentMethodType: patch.paymentMethodType,
    };
  }

  if (intent.addressText?.trim()) {
    return {
      shipping: {
        fullAddress: intent.addressText,
      },
    };
  }

  return undefined;
}
