import { rethrowIfAborted } from "../../lib/abort";
import type { CartDto } from "../cart/cart.types";
import type { LlmClient, LlmGenerateRequest } from "../llm/llm.types";
import type {
  CheckoutActionResult,
  CheckoutIntentDetection,
  MockShippingAddress,
  PendingCheckoutDraft,
} from "../orders/checkout.types";
import type { OrderRecord } from "../orders/order.types";
import {
  normalizeLlmText,
  parseJsonObject,
  stripCodeFence,
} from "./llm-output-utils";

export interface CheckoutResponseServiceOptions {
  llmClient: LlmClient;
}

export interface CheckoutResponseInput {
  question: string;
  intent: Extract<CheckoutIntentDetection, { isCheckoutIntent: true }>;
  checkoutAction: CheckoutActionResult;
  cartSnapshot?: CartDto;
  draft?: PendingCheckoutDraft;
  order?: OrderRecord;
  requestId?: string;
  abortSignal?: AbortSignal;
}

const CHECKOUT_RESPONSE_MAX_COMPLETION_TOKENS = 512;
const CHECKOUT_RESPONSE_MAX_CHARS = 180;

export class CheckoutResponseService {
  constructor(private readonly options: CheckoutResponseServiceOptions) {}

  async generate(input: CheckoutResponseInput): Promise<string> {
    const directAnswer = createDeterministicCheckoutAnswer(input);
    if (directAnswer) {
      return directAnswer;
    }

    try {
      const response = await this.options.llmClient.generate({
        messages: buildCheckoutResponsePrompt(input),
        temperature: 0,
        maxCompletionTokens: CHECKOUT_RESPONSE_MAX_COMPLETION_TOKENS,
        requestId: input.requestId,
        abortSignal: input.abortSignal,
      });

      return normalizeAnswer(parseCheckoutResponseOutput(response.text)) ?? "";
    } catch (error) {
      rethrowIfAborted(input.abortSignal, error);
      return "";
    }
  }
}

function buildCheckoutResponsePrompt(
  input: CheckoutResponseInput,
): LlmGenerateRequest["messages"] {
  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的结算回复生成器。",
        "只根据后端事实生成用户可见的中文 assistant 回复。",
        "checkoutAction.status 是权威状态。",
        "只有 order_created 可以说订单已生成或已完成下单。",
        "draft_created、needs_confirmation、address_updated、draft_updated 和 summarize_checkout 要引导用户确认、更新结算信息或取消。",
        "如果用户只是说要修改地址但没有给出新值，且 draft.savedAddresses 里有可切换的保存地址，要优先询问是否切换到该保存地址；没有保存地址时才请用户发送新地址。",
        "如果用户只是说要修改电话、收货人、配送或支付方式但没有给出新值，要直接请用户发送新的具体内容，不要要求先确认当前信息。",
        "empty_cart 只能说明购物车没有已勾选的结算商品。",
        "expired 要请用户重新汇总或重新结算。",
        "failed 不能假装成功。",
        "回复中不要出现“模拟”、fake 或 mock。",
        "不要编造优惠、真实支付、真实配送、物流、发票、库存锁定或真实手机号。",
        "金额字段只使用 totalText、subtotalText、feeText 或 priceText，不要把 cents 数字当成人民币元。",
        "不要输出 markdown、商品卡片或 required object 以外的 JSON。",
        "只输出 JSON object：{\"answer\":\"...\"}。answer 为 1-3 句短中文，不超过 180 个中文字符。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        message: input.question,
        intent: {
          action: input.intent.action,
          confidence: input.intent.confidence,
          addressText: input.intent.addressText,
          checkoutPatch: input.intent.checkoutPatch,
        },
        checkoutAction: summarizeCheckoutActionForPrompt(input.checkoutAction),
        changedFields: input.checkoutAction.changedFields,
        cartSummary: input.cartSnapshot
          ? {
              totalCount: input.cartSnapshot.summary.totalCount,
              selectedCount: input.cartSnapshot.summary.selectedCount,
              selectedTotalText: formatCheckoutMoney(
                input.cartSnapshot.summary.selectedTotalCents,
              ),
              currency: input.cartSnapshot.summary.currency,
            }
          : undefined,
        draft: input.draft
          ? {
              id: input.draft.id,
              items: input.draft.items.map((item, index) => ({
                ordinal: index + 1,
                name: item.productName,
                brand: item.brand,
                category: item.category,
                unitPriceText: formatCheckoutMoney(item.unitPriceCents),
                quantity: item.quantity,
                subtotalText: formatCheckoutMoney(item.subtotalCents),
              })),
              summary: summarizeCheckoutSummaryForPrompt(input.draft.summary),
              address: input.draft.address,
              savedAddresses: input.draft.savedAddresses,
              selectedDeliveryMethod: summarizeDeliveryForPrompt(
                input.draft.selectedDeliveryMethod,
              ),
              selectedPaymentMethod: input.draft.selectedPaymentMethod,
              deliveryOptions: input.draft.deliveryOptions.map((option) => ({
                type: option.type,
                label: option.label,
                feeText: formatCheckoutMoney(option.feeCents),
                etaText: option.etaText,
              })),
              paymentOptions: input.draft.paymentOptions,
              expiresAt: input.draft.expiresAt,
            }
          : undefined,
        order: input.order
          ? {
              id: input.order.id,
              displayOrderNumber: toDisplayCheckoutOrderNumber(
                input.order.orderNumber,
              ),
              totalText: formatCheckoutMoney(input.order.totalCents),
              itemCount: input.order.items.length,
              address: {
                recipient: input.order.shippingName,
                phoneMasked: input.order.shippingPhoneMasked,
                fullAddress: input.order.shippingAddress,
              },
            }
          : undefined,
      }),
    },
  ];
}

function createDeterministicCheckoutAnswer(
  input: CheckoutResponseInput,
): string | undefined {
  if (
    input.checkoutAction.status === "needs_confirmation"
    && input.intent.clarificationQuestion?.trim()
  ) {
    return input.intent.clarificationQuestion.trim();
  }

  if (input.checkoutAction.status === "draft_created") {
    return createDraftSummaryAnswer(input);
  }

  if (
    input.checkoutAction.status === "needs_confirmation"
    && input.draft
    && (input.intent.action === "summarize_checkout"
      || input.checkoutAction.type === "summarize_checkout")
  ) {
    return createDraftSummaryAnswer(input);
  }

  if (input.checkoutAction.status === "order_created") {
    const orderNumber = input.checkoutAction.orderNumber
      ? `，订单号 ${toDisplayCheckoutOrderNumber(input.checkoutAction.orderNumber)}`
      : "";
    const totalText = formatCheckoutMoney(
      input.checkoutAction.totalCents ?? input.order?.totalCents,
    );

    return totalText
      ? `订单已提交${orderNumber}，合计 ${totalText}。`
      : `订单已提交${orderNumber}。`;
  }

  if (input.checkoutAction.status === "cancelled") {
    return "已取消这次结算草稿。";
  }

  if (input.checkoutAction.status === "empty_cart") {
    return "购物车里暂时没有已勾选的可结算商品。你可以先勾选商品，或告诉我想下单哪一款。";
  }

  if (input.checkoutAction.status === "expired") {
    return "这张订单草稿已经过期了。你可以重新说“结算购物车”或“下单第一款”，我再帮你生成新的草稿。";
  }

  if (
    input.checkoutAction.status === "address_updated"
    || input.checkoutAction.status === "draft_updated"
  ) {
    const changedFields = input.checkoutAction.changedFields ?? [];
    const shipping = input.intent.checkoutPatch?.shipping;

    if (changedFields.includes("shipping") && shipping?.phone?.trim()) {
      return "手机号已更新到这张订单草稿里了。确认收货地址、配送和支付方式无误后，可以说“提交订单”。";
    }

    if (changedFields.includes("shipping") && shipping?.savedAddressId?.trim()) {
      const addressText = input.checkoutAction.address?.fullAddress?.trim();

      return addressText
        ? `收货地址已改为「${addressText}」。确认配送和支付方式无误后，可以说“提交订单”。`
        : "收货地址已更新到这张订单草稿里了。确认配送和支付方式无误后，可以说“提交订单”。";
    }
  }

  const action = input.intent.action;
  if (
    input.checkoutAction.status !== "needs_confirmation"
    || (action !== "update_checkout" && action !== "update_address")
    || hasConcreteCheckoutPatch(input.intent)
  ) {
    return undefined;
  }

  const normalizedQuestion = input.question.replace(/\s+/g, "");

  if (/电话|手机号|手机|号码/.test(normalizedQuestion)) {
    return "可以，直接把新的手机号发我，我会更新这张订单草稿；确认无误后再说“提交订单”。";
  }

  if (/地址|收货点|宿舍|小区|公寓|公司/.test(normalizedQuestion)) {
    const savedAddress = findAlternateSavedAddress(input.draft);

    if (savedAddress) {
      return `可以，你还有一个已保存地址「${formatSavedAddressOption(savedAddress)}」，要把这张订单草稿改到这个地址吗？也可以直接发新的收货地址。`;
    }

    return "可以，直接把新的收货地址发我，我会更新这张订单草稿；确认无误后再说“提交订单”。";
  }

  if (/收货人|姓名|名字|联系人/.test(normalizedQuestion)) {
    return "可以，直接告诉我新的收货人姓名，我会更新这张订单草稿；确认无误后再提交。";
  }

  if (/配送|快递|加急|标准/.test(normalizedQuestion)) {
    return "可以，直接说要改成哪种配送方式，我会更新这张订单草稿；确认无误后再提交。";
  }

  if (/支付|微信|支付宝|银行卡/.test(normalizedQuestion)) {
    return "可以，直接说要改成哪种支付方式，我会更新这张订单草稿；确认无误后再提交。";
  }

  return "可以修改，直接把新的收货人、手机号、地址、配送或支付方式发我，我会更新这张订单草稿。";
}

function createDraftSummaryAnswer(input: CheckoutResponseInput): string {
  const selectedCount =
    input.checkoutAction.selectedCount
    ?? input.draft?.summary.selectedCount
    ?? input.cartSnapshot?.summary.selectedCount
    ?? 0;
  const totalText = formatCheckoutMoney(
    input.checkoutAction.totalCents
      ?? input.draft?.summary.totalCents
      ?? input.cartSnapshot?.summary.selectedTotalCents,
  );
  const countText = selectedCount > 0
    ? `当前是 ${selectedCount} 件商品`
    : "当前已生成结算草稿";
  const totalSegment = totalText ? `、合计 ${totalText}` : "";

  return `已为你生成结算草稿，${countText}${totalSegment}。请确认是否继续，或告诉我需要修改的收货信息、配送方式或支付方式。`;
}

function summarizeCheckoutActionForPrompt(
  action: CheckoutActionResult,
): Record<string, unknown> {
  return {
    type: action.type,
    status: action.status,
    draftId: action.draftId,
    orderId: action.orderId,
    orderNumber: action.orderNumber
      ? toDisplayCheckoutOrderNumber(action.orderNumber)
      : undefined,
    selectedCount: action.selectedCount,
    totalText: formatCheckoutMoney(action.totalCents),
    address: action.address,
    cartRefreshRequired: action.cartRefreshRequired,
    changedFields: action.changedFields,
  };
}

function summarizeCheckoutSummaryForPrompt(
  summary: PendingCheckoutDraft["summary"],
): Record<string, unknown> {
  return {
    itemCount: summary.itemCount,
    selectedCount: summary.selectedCount,
    subtotalText: formatCheckoutMoney(summary.subtotalCents),
    shippingFeeText: formatCheckoutMoney(summary.shippingFeeCents),
    totalText: formatCheckoutMoney(summary.totalCents),
    currency: summary.currency,
  };
}

function summarizeDeliveryForPrompt(input: {
  type: string;
  label: string;
  feeCents: number;
}): Record<string, unknown> {
  return {
    type: input.type,
    label: input.label,
    feeText: formatCheckoutMoney(input.feeCents),
  };
}

function hasConcreteCheckoutPatch(
  intent: Extract<CheckoutIntentDetection, { isCheckoutIntent: true }>,
): boolean {
  if (intent.addressText?.trim()) {
    return true;
  }

  const patch = intent.checkoutPatch;
  const shipping = patch?.shipping;

  return Boolean(
    shipping?.recipient?.trim()
      || shipping?.phone?.trim()
      || shipping?.fullAddress?.trim()
      || shipping?.savedAddressId?.trim()
      || patch?.deliveryMethodType?.trim()
      || patch?.paymentMethodType?.trim(),
  );
}

function findAlternateSavedAddress(
  draft: PendingCheckoutDraft | undefined,
): MockShippingAddress | undefined {
  const currentAddressId = draft?.address.id?.trim();
  const currentFullAddress = draft?.address.fullAddress.trim();

  return draft?.savedAddresses?.find((address) => {
    const addressId = address.id?.trim();
    const fullAddress = address.fullAddress.trim();

    if (fullAddress.length === 0) {
      return false;
    }

    if (currentAddressId && addressId === currentAddressId) {
      return false;
    }

    return !currentFullAddress || fullAddress !== currentFullAddress;
  });
}

function formatSavedAddressOption(address: MockShippingAddress): string {
  const label = address.tag?.trim()
    || address.label.trim()
    || "保存地址";
  const fullAddress = address.fullAddress.trim();

  return fullAddress ? `${label}：${fullAddress}` : label;
}

function parseCheckoutResponseOutput(rawText: string): string | undefined {
  const payload = parseJsonObject(stripCodeFence(rawText));
  return typeof payload.answer === "string" ? payload.answer : undefined;
}

function normalizeAnswer(value: string | undefined): string | undefined {
  const normalized = normalizeLlmText(value, {
    maxChars: CHECKOUT_RESPONSE_MAX_CHARS,
  });

  return normalized ? removeForbiddenCheckoutTerms(normalized) : undefined;
}

function removeForbiddenCheckoutTerms(value: string): string {
  return value
    .replace(/\bMOCK-[A-Za-z0-9-]+\b/g, (match) =>
      toDisplayCheckoutOrderNumber(match)
    )
    .replace(/模拟订单/g, "订单")
    .replace(/模拟结算/g, "结算")
    .replace(/模拟/g, "")
    .replace(/\bfake\b/gi, "")
    .replace(/\bmock\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatCheckoutMoney(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const amount = value / 100;
  const amountText = Number.isInteger(amount)
    ? amount.toFixed(0)
    : amount.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "");

  return `¥${amountText}`;
}

function toDisplayCheckoutOrderNumber(orderNumber: string): string {
  if (!orderNumber.toUpperCase().startsWith("MOCK-")) {
    return orderNumber;
  }

  return orderNumber.split("-").at(-1)?.trim() || orderNumber;
}
