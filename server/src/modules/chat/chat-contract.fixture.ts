import type { ProductCardDto } from "../products/product.types";
import type {
  ChatDonePayload,
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

const emptyAnswerFallbackProductCards: ChatProductCardsPayload = {
  items: [fallbackHeadphonesCard],
};

const emptyAnswerFallbackDone: ChatDonePayload = {
  recommendedProductIds: ["product_002"],
  fallbackUsed: true,
  fallbackReason: "LLM_ERROR",
  retrieval: {
    candidateCount: 2,
    returnedProductIds: ["product_002"],
  },
};

const errorPayload: ChatErrorPayload = {
  code: "CHAT_STREAM_ERROR",
  message: "Chat stream failed.",
  retryable: true,
};

const noProductMessageDelta: ChatMessageDeltaPayload = {
  text: "暂时没有找到匹配商品。你可以换一个更具体的需求，比如品类、预算或使用场景。",
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
    description: "No message delta, fallback product cards, and done.",
    events: [
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
} satisfies Record<string, ChatContractFixture>;

export const chatContractFixtureList = Object.values(chatContractFixtures);
