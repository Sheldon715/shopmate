import type { ProductCardDto } from "../products/product.types";
import type {
  ChatCheckoutActionPayload,
  ChatDonePayload,
  ChatComparisonResultPayload,
  ChatErrorPayload,
  ChatMessageDeltaPayload,
  ChatProductCardsPayload,
  ChatStreamContractEvent,
} from "./chat.types";

export interface ChatContractFixture {
  name: string;
  description: string;
  events: ChatStreamContractEvent[];
}

const commutingHeadphonesCard: ProductCardDto = {
  id: "product_001",
  name: "通勤蓝牙耳机 A",
  brand: "示例品牌",
  category: "数码电子",
  subCategory: "真无线耳机",
  priceCents: 19900,
  priceRangeCents: {
    min: 17900,
    max: 21900,
  },
  currency: "CNY",
  imagePath: "/images/product_001.png",
  ratingAvg: 4.6,
  tags: ["通勤", "蓝牙"],
  available: true,
};

const fallbackHeadphonesCard: ProductCardDto = {
  id: "product_002",
  name: "长续航降噪耳机 B",
  brand: "示例品牌",
  category: "数码电子",
  subCategory: "真无线耳机",
  priceCents: 45900,
  priceRangeCents: {
    min: 42900,
    max: 49900,
  },
  currency: "CNY",
  imagePath: "/images/product_002.png",
  ratingAvg: 4.4,
  tags: ["降噪", "长续航"],
  available: true,
};

const successMessageDeltas: ChatMessageDeltaPayload[] = [
  {
    text: "For commuting, choose lightweight Bluetooth headphones with ANC, long battery life, and stable fit. ",
    index: 0,
  },
  {
    text: "This option keeps the budget near 500 CNY and stays comfortable for daily travel.",
    index: 1,
  },
];

const successProductCards: ChatProductCardsPayload = {
  items: [commutingHeadphonesCard],
};

const successDone: ChatDonePayload = {
  recommendedProductIds: ["product_001"],
  fallbackUsed: false,
  retrieval: {
    candidateCount: 3,
    returnedProductIds: ["product_001"],
    llm: {
      decisionPrimary: {
        enabled: true,
        provider: "openai",
        model: "gpt-5.4-mini",
      },
      decisionFallback: {
        enabled: true,
        provider: "openai",
        model: "gpt-5.4",
      },
      answer: {
        enabled: true,
        provider: "openai",
        model: "gpt-5.4-mini",
      },
    },
  },
  contextMemory: {
    conversationId: "local-chat-session-1",
    lastIntent: "推荐通勤蓝牙耳机",
    constraints: {
      category: "数码电子",
      subCategory: "真无线耳机",
      maxPriceCents: 50000,
      preferenceTerms: ["轻量"],
      avoidTerms: [],
    },
    lastRecommendedProductIds: ["product_001"],
  },
};

const emptyAnswerFallbackMessageDelta: ChatMessageDeltaPayload = {
  text: "这次没有确认到可靠的库内推荐。你可以补充预算、用途或偏好，我再继续筛选。",
  index: 0,
};

const emptyAnswerFallbackProductCards: ChatProductCardsPayload = {
  items: [],
};

const emptyAnswerFallbackDone: ChatDonePayload = {
  recommendedProductIds: [],
  fallbackUsed: true,
  fallbackReason: "LLM_ERROR",
  retrieval: {
    candidateCount: 2,
    returnedProductIds: [],
  },
};

const errorPayload: ChatErrorPayload = {
  code: "CHAT_STREAM_ERROR",
  message: "Chat stream failed.",
  retryable: true,
};

const noProductMessageDelta: ChatMessageDeltaPayload = {
  text: "这个条件下我在库里还没找到合适商品。你可以放宽预算、补充用途或偏好，我再继续帮你筛。",
  index: 0,
};

const noProductCards: ChatProductCardsPayload = {
  items: [],
};

const noProductDone: ChatDonePayload = {
  recommendedProductIds: [],
  fallbackUsed: true,
  fallbackReason: "NO_CANDIDATES",
  retrieval: {
    candidateCount: 0,
    returnedProductIds: [],
  },
};

const clarificationMessageDelta: ChatMessageDeltaPayload = {
  text: "你更看重拍照、续航、预算还是性价比？告诉我一两个重点，我再帮你筛。",
  index: 0,
};

const clarificationProductCards: ChatProductCardsPayload = {
  items: [],
};

const clarificationDone: ChatDonePayload = {
  recommendedProductIds: [],
  fallbackUsed: true,
  fallbackReason: "NEEDS_CLARIFICATION",
  clarification: {
    missingSlots: ["budget", "priority"],
  },
  retrieval: {
    candidateCount: 0,
    returnedProductIds: [],
  },
};

const comparisonClarificationMessageDelta: ChatMessageDeltaPayload = {
  text: "你想比较哪两款商品？",
  index: 0,
};

const comparisonClarificationProductCards: ChatProductCardsPayload = {
  items: [],
};

const comparisonClarificationDone: ChatDonePayload = {
  recommendedProductIds: [],
  fallbackUsed: true,
  fallbackReason: "COMPARISON_TARGET_CLARIFICATION",
  clarification: {
    missingSlots: [],
  },
  retrieval: {
    candidateCount: 0,
    returnedProductIds: [],
  },
};

const cartAddMessageDelta: ChatMessageDeltaPayload = {
  text: "加购已完成。",
  index: 0,
};

const cartAddProductCards: ChatProductCardsPayload = {
  items: [commutingHeadphonesCard],
};

const cartAddDone: ChatDonePayload = {
  recommendedProductIds: ["product_001"],
  fallbackUsed: false,
  retrieval: {
    candidateCount: 1,
    returnedProductIds: ["product_001"],
  },
  cartAction: {
    type: "add",
    status: "success",
    productId: "product_001",
    productName: "通勤蓝牙耳机 A",
    quantity: 1,
    message: "已加入购物车",
  },
};

const checkoutAction: ChatCheckoutActionPayload = {
  type: "start_checkout",
  status: "draft_created",
  draftId: "draft_1",
  selectedCount: 1,
  totalCents: 19900,
  address: {
    label: "默认地址",
    recipient: "ShopMate 用户",
    phoneMasked: "138****0000",
    fullAddress: "ShopMate 收货点",
  },
  cartRefreshRequired: false,
  draft: {
    id: "draft_1",
    source: "cart",
    status: "pending",
    address: {
      label: "默认地址",
      recipient: "ShopMate 用户",
      phoneMasked: "138****0000",
      fullAddress: "ShopMate 收货点",
    },
    items: [{
      cartItemId: "item_001",
      productId: "product_001",
      productName: "通勤蓝牙耳机 A",
      brand: "示例品牌",
      category: "数码电子",
      unitPriceCents: 19900,
      quantity: 1,
      subtotalCents: 19900,
      imagePath: "/images/product_001.png",
    }],
    summary: {
      itemCount: 1,
      selectedCount: 1,
      subtotalCents: 19900,
      shippingFeeCents: 0,
      totalCents: 19900,
      currency: "CNY",
    },
    selectedDeliveryMethod: {
      type: "standard",
      label: "标准配送",
      feeCents: 0,
    },
    selectedPaymentMethod: {
      type: "wechat",
      label: "微信支付",
      status: "not_charged",
    },
    deliveryOptions: [{
      type: "standard",
      label: "标准配送",
      feeCents: 0,
      etaText: "预计 2-4 天送达",
    }],
    paymentOptions: [{
      type: "wechat",
      label: "微信支付",
    }],
    expiresAt: "2026-06-06T00:15:00.000Z",
  },
  changedFields: [],
};

const checkoutMessageDelta: ChatMessageDeltaPayload = {
  text: "我先汇总已勾选商品，请确认是否生成订单。",
  index: 0,
};

const checkoutProductCards: ChatProductCardsPayload = {
  items: [],
};

const checkoutDone: ChatDonePayload = {
  recommendedProductIds: [],
  fallbackUsed: false,
  retrieval: {
    candidateCount: 1,
    returnedProductIds: ["product_001"],
  },
  checkoutAction,
};

const comparisonMessageDelta: ChatMessageDeltaPayload = {
  text: "我把这两款按通勤肤感、防晒稳定性和预算做了对比。",
  index: 0,
};

const comparisonProductCards: ChatProductCardsPayload = {
  items: [commutingHeadphonesCard, fallbackHeadphonesCard],
};

const comparisonResult: ChatComparisonResultPayload = {
  id: "comparison-demo-1",
  title: "通勤耳机对比",
  query: "帮我对比这两款，哪个更适合通勤",
  productIds: ["product_001", "product_002"],
  dimensions: [
    {
      id: "comfort",
      label: "佩戴",
      cells: [
        {
          productId: "product_001",
          value: "更轻便，适合每天通勤。",
          highlight: true,
        },
        {
          productId: "product_002",
          value: "机身略重，长时间佩戴压力更大。",
        },
      ],
    },
    {
      id: "battery",
      label: "续航",
      cells: [
        {
          productId: "product_001",
          value: "日常通勤够用。",
        },
        {
          productId: "product_002",
          value: "续航更长，适合长途。",
          highlight: true,
        },
      ],
    },
    {
      id: "budget",
      label: "预算",
      cells: [
        {
          productId: "product_001",
          value: "价格更接近 200 元预算。",
          highlight: true,
        },
        {
          productId: "product_002",
          value: "价格更高，适合预算放宽。",
        },
      ],
    },
  ],
  recommendedProductId: "product_001",
  conclusion: "如果主要是日常通勤并控制预算，优先看通勤蓝牙耳机 A；如果更在意长续航，再看耳机 B。",
  highlights: [
    {
      productId: "product_001",
      label: "通勤预算",
      text: "更轻便，价格也更贴近日常通勤预算。",
    },
  ],
};

const comparisonDone: ChatDonePayload = {
  recommendedProductIds: ["product_001", "product_002"],
  fallbackUsed: false,
  retrieval: {
    candidateCount: 2,
    returnedProductIds: ["product_001", "product_002"],
  },
};

export const chatContractFixtures = {
  successStream: {
    name: "success stream",
    description: "Two message deltas, product cards, and a done event.",
    events: [
      { eventName: "message_delta", payload: successMessageDeltas[0] },
      { eventName: "message_delta", payload: successMessageDeltas[1] },
      { eventName: "product_cards", payload: successProductCards },
      { eventName: "done", payload: successDone },
    ],
  },
  emptyAnswerFallback: {
    name: "empty answer fallback",
    description: "A fallback message, empty product cards, and done.",
    events: [
      { eventName: "message_delta", payload: emptyAnswerFallbackMessageDelta },
      { eventName: "product_cards", payload: emptyAnswerFallbackProductCards },
      { eventName: "done", payload: emptyAnswerFallbackDone },
    ],
  },
  errorStream: {
    name: "error stream",
    description: "A sanitized retryable stream error.",
    events: [
      { eventName: "error", payload: errorPayload },
    ],
  },
  noProductStream: {
    name: "no product stream",
    description: "A message delta, empty product cards, and done.",
    events: [
      { eventName: "message_delta", payload: noProductMessageDelta },
      { eventName: "product_cards", payload: noProductCards },
      { eventName: "done", payload: noProductDone },
    ],
  },
  clarificationStream: {
    name: "clarification stream",
    description: "A clarification question, no product cards, and a done event.",
    events: [
      { eventName: "message_delta", payload: clarificationMessageDelta },
      { eventName: "product_cards", payload: clarificationProductCards },
      { eventName: "done", payload: clarificationDone },
    ],
  },
  comparisonClarificationStream: {
    name: "comparison clarification stream",
    description: "A comparison target clarification, no product cards, and a done event.",
    events: [
      { eventName: "message_delta", payload: comparisonClarificationMessageDelta },
      { eventName: "product_cards", payload: comparisonClarificationProductCards },
      { eventName: "done", payload: comparisonClarificationDone },
    ],
  },
  cartAddStream: {
    name: "cart add stream",
    description: "A cart add assistant message, product cards, and cartAction done payload.",
    events: [
      { eventName: "message_delta", payload: cartAddMessageDelta },
      { eventName: "product_cards", payload: cartAddProductCards },
      { eventName: "done", payload: cartAddDone },
    ],
  },
  checkoutStream: {
    name: "checkout stream",
    description: "A checkout action event, assistant message, product cards, and compatible done payload.",
    events: [
      { eventName: "checkout_action", payload: checkoutAction },
      { eventName: "message_delta", payload: checkoutMessageDelta },
      { eventName: "product_cards", payload: checkoutProductCards },
      { eventName: "done", payload: checkoutDone },
    ],
  },
  comparisonStream: {
    name: "comparison stream",
    description: "A comparison assistant message, product cards, comparison_result, and done.",
    events: [
      { eventName: "message_delta", payload: comparisonMessageDelta },
      { eventName: "product_cards", payload: comparisonProductCards },
      { eventName: "comparison_result", payload: comparisonResult },
      { eventName: "done", payload: comparisonDone },
    ],
  },
} satisfies Record<string, ChatContractFixture>;

export const chatContractFixtureList = Object.values(chatContractFixtures);
