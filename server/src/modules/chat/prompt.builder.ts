import type { LlmMessage } from "../llm/llm.types";
import type { Product } from "../products/product.types";
import type {
  ChatHistoryMessage,
  RetrievedProductContext,
} from "./chat.types";

export const MAX_SHORT_HISTORY_MESSAGES = 4;
export const MAX_HISTORY_CONTENT_CHARS = 500;
const MAX_PRODUCT_SUMMARY_CHARS = 360;
const MAX_SNIPPET_CHARS = 280;
const MAX_SNIPPETS_PER_PRODUCT = 3;

export interface BuildRagPromptInput {
  question: string;
  shortHistory?: ChatHistoryMessage[];
  candidates: RetrievedProductContext[];
  generatedAt?: Date;
}

export function buildRagPrompt(input: BuildRagPromptInput): LlmMessage[] {
  const currentDate = toIsoDate(input.generatedAt ?? new Date());
  const history = normalizeChatHistory(input.shortHistory ?? []);

  return [
    {
      role: "system",
      content: [
        "你是 ShopMate 的商品推荐助手。",
        `当前日期：${currentDate}。`,
        "商品数据来自脱敏 / synthetic / curated demo catalog，不能当作实时电商库存或实时价格。",
        "你只能基于候选商品回答，不能编造候选列表外的商品。",
        "不要编造价格、库存、优惠、折扣、功效、认证或物流时效。",
        "PostgreSQL 商品字段是事实来源；vector snippets 只用于解释上下文，不能覆盖商品字段。",
        "如果没有合适商品，可以说明暂时没有合适推荐，不要硬推荐。",
        "只输出 JSON object，格式为 {\"answer\":\"string\",\"recommended_product_ids\":[\"product_id\"]}。",
        "recommended_product_ids 只能使用候选列表中的 product_id。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `用户问题：${truncateText(input.question.trim(), 1000)}`,
        formatHistory(history),
        formatCandidates(input.candidates),
      ].filter((section) => section.length > 0).join("\n\n"),
    },
  ];
}

export function normalizeChatHistory(
  history: ChatHistoryMessage[],
): ChatHistoryMessage[] {
  return history
    .slice(-MAX_SHORT_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: truncateText(message.content.trim(), MAX_HISTORY_CONTENT_CHARS),
    }))
    .filter((message) => message.content.length > 0);
}

function formatHistory(history: ChatHistoryMessage[]): string {
  if (history.length === 0) {
    return "";
  }

  return [
    "必要短历史：",
    ...history.map((message, index) =>
      `${index + 1}. ${message.role}: ${message.content}`,
    ),
  ].join("\n");
}

function formatCandidates(candidates: RetrievedProductContext[]): string {
  if (candidates.length === 0) {
    return "候选商品：无。";
  }

  return [
    "候选商品：",
    ...candidates.map((candidate, index) =>
      formatCandidate(candidate, index + 1),
    ),
  ].join("\n\n");
}

function formatCandidate(
  candidate: RetrievedProductContext,
  index: number,
): string {
  const product = candidate.product;
  const lines = [
    `${index}. product_id: ${product.id}`,
    `   name: ${product.name}`,
    `   brand: ${product.brand}`,
    `   category: ${product.category}`,
    `   sub_category: ${product.subCategory ?? "无"}`,
    `   price_range_cents: ${product.priceMinCents}-${product.priceMaxCents} ${product.currency}`,
    `   available: ${isProductAvailable(product)}`,
    `   tags: ${formatList(product.visualTags)}`,
    `   recommend_when: ${formatList(product.recommendWhen)}`,
    `   avoid_when: ${formatList(product.avoidWhen)}`,
    `   summary: ${truncateText(product.marketingDescription, MAX_PRODUCT_SUMMARY_CHARS)}`,
    "   vector_snippets:",
    ...formatSnippets(candidate.snippets),
  ];

  return lines.join("\n");
}

function formatSnippets(snippets: string[]): string[] {
  const values = snippets
    .map((snippet) => truncateText(snippet.trim(), MAX_SNIPPET_CHARS))
    .filter((snippet) => snippet.length > 0)
    .slice(0, MAX_SNIPPETS_PER_PRODUCT);

  if (values.length === 0) {
    return ["     - 无"];
  }

  return values.map((snippet, index) => `     - ${index + 1}. ${snippet}`);
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join("、") : "无";
}

function isProductAvailable(product: Product): boolean {
  return product.skus.length === 0
    ? product.status === "active"
    : product.skus.some((sku) => sku.available);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
