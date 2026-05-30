import type { LlmMessage } from "../llm/llm.types";
import type { Product } from "../products/product.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";
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
  contextMemory?: ChatContextMemorySummary;
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
        "会话记忆只能辅助理解当前用户问题，不能覆盖用户最新表达，也不能当作商品事实来源。",
        "如果没有合适商品，可以说明暂时没有合适推荐，不要硬推荐。",
        "answer 要适合移动端聊天列表展示：最多 70 个中文字符，用 1 句话概括推荐方向，不要逐条复述商品名、价格或详细参数。",
        "商品优势、限制、参数和长解释交给 product_cards 或商品详情页承载，answer 只做简短导购引导。",
        "只输出 JSON object，格式为 {\"answer\":\"string\",\"recommended_product_ids\":[\"product_id\"]}。",
        "recommended_product_ids 只能使用候选列表中的 product_id。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `用户问题：${truncateText(input.question.trim(), 1000)}`,
        formatHistory(history),
        formatContextMemory(input.contextMemory),
        formatCandidates(input.candidates),
      ].filter((section) => section.length > 0).join("\n\n"),
    },
  ];
}

function formatContextMemory(
  memory: ChatContextMemorySummary | undefined,
): string {
  if (!memory) {
    return "";
  }

  const constraints = [
    memory.constraints.category ? `类目：${memory.constraints.category}` : "",
    memory.constraints.subCategory
      ? `子类目：${memory.constraints.subCategory}`
      : "",
    memory.constraints.brand ? `品牌：${memory.constraints.brand}` : "",
    memory.constraints.minPriceCents !== undefined
      ? `最低预算：${formatCny(memory.constraints.minPriceCents)}`
      : "",
    memory.constraints.maxPriceCents !== undefined
      ? `预算上限：${formatCny(memory.constraints.maxPriceCents)}`
      : "",
    memory.constraints.preferenceTerms.length > 0
      ? `偏好：${formatList(memory.constraints.preferenceTerms)}`
      : "",
    memory.constraints.avoidTerms.length > 0
      ? `已记录否定词：${formatList(memory.constraints.avoidTerms)}`
      : "",
  ].filter((line) => line.length > 0);

  const lines = [
    "当前会话记忆：",
    `- 最近意图：${memory.lastIntent ?? "无"}`,
    `- 已知约束：${constraints.length > 0 ? constraints.join("；") : "无"}`,
    `- 上一轮推荐商品：${formatList(memory.lastRecommendedProductIds)}`,
  ];

  return lines.join("\n");
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

function formatCny(priceCents: number): string {
  return `${Math.round(priceCents / 100)} 元`;
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
