import type { VectorSearchFilters } from "../vector/vector-search.types";
import type { ChatContextMemorySummary } from "./chat-context-memory.types";
import type {
  ClarificationDecision,
  ClarificationSlot,
} from "./clarification.types";

export interface ClarificationServiceInput {
  question: string;
  contextMemory?: ChatContextMemorySummary;
  filters?: VectorSearchFilters;
}

interface BroadCategoryRule {
  terms: readonly string[];
  question: string;
  missingSlots: readonly ClarificationSlot[];
}

const NO_CLARIFICATION: ClarificationDecision = {
  needsClarification: false,
  missingSlots: [],
};

const BROAD_CATEGORY_RULES = [
  {
    terms: ["手机", "智能手机"],
    question: "你更看重拍照、续航、预算还是性价比？告诉我一两个重点，我再帮你筛。",
    missingSlots: ["budget", "priority"],
  },
  {
    terms: ["电脑", "笔记本", "平板"],
    question: "你主要用于学习办公、游戏设计还是轻薄便携？预算大概多少？",
    missingSlots: ["budget", "use_case", "priority"],
  },
  {
    terms: ["耳机", "蓝牙耳机", "降噪耳机"],
    question: "你更看重降噪、续航、佩戴舒适还是预算？告诉我一两个重点，我再帮你筛。",
    missingSlots: ["budget", "priority", "use_case"],
  },
  {
    terms: ["护肤品", "护肤", "美妆", "洗面奶", "洁面", "防晒", "防晒霜", "面霜", "精华", "水乳"],
    question: "你的肤质、预算和想改善的功效是什么？告诉我一两个重点，我再帮你筛。",
    missingSlots: ["audience", "budget", "priority"],
  },
  {
    terms: ["跑鞋", "运动鞋", "鞋子"],
    question: "你主要跑步、通勤还是健身？更看重缓震、轻量还是预算？",
    missingSlots: ["use_case", "priority", "budget"],
  },
  {
    terms: ["食品", "零食", "饮料", "生活用品", "家居"],
    question: "你偏好什么口味、预算和使用场景？告诉我一两个重点，我再帮你筛。",
    missingSlots: ["priority", "budget", "use_case"],
  },
] as const satisfies readonly BroadCategoryRule[];

const RECOMMENDATION_INTENT_PATTERN =
  /推荐|有什么|有啥|想买|买一|买个|帮我|找一|看看|选一|来一|哪个好/u;
const BROAD_ACCEPTANCE_PATTERN =
  /随便|任意|都可以|无所谓|直接推荐|先推荐|先给我|给我几个|先看看|先来/u;
const BUDGET_PATTERN =
  /预算|(\d{1,6})\s*(?:元|块)?\s*(?:以内|以下|左右)|(?:不超过|低于|小于|少于|大概|约)\s*(\d{1,6})/u;
const USE_CASE_PATTERN =
  /通勤|上班|学习|办公|游戏|拍照|旅行|出差|宿舍|跑步|慢跑|健身|户外|日常|夏天|冬天|送礼|约会/u;
const PRIORITY_PATTERN =
  /拍照|续航|性价比|轻量|轻薄|便携|缓震|耐磨|降噪|音质|舒适|控油|保湿|补水|美白|防晒|温和|不刺激|低糖|无糖|好吃|口味|性能|散热/u;
const AUDIENCE_PATTERN =
  /学生|学生党|油皮|干皮|混油|敏感肌|老人|儿童|宝宝|男生|女生|妈妈|上班族|新手|孕妇/u;

export class ClarificationService {
  decide(input: ClarificationServiceInput): ClarificationDecision {
    const question = input.question.trim();
    const rule = findBroadCategoryRule(question);

    if (!rule || !hasRecommendationIntent(question)) {
      return NO_CLARIFICATION;
    }

    if (
      acceptsBroadRecommendation(question)
      || hasEnoughContext({
        question,
        contextMemory: input.contextMemory,
        filters: input.filters,
      })
    ) {
      return NO_CLARIFICATION;
    }

    return {
      needsClarification: true,
      question: rule.question,
      missingSlots: [...rule.missingSlots],
    };
  }
}

function findBroadCategoryRule(question: string): BroadCategoryRule | undefined {
  return BROAD_CATEGORY_RULES.find((rule) =>
    rule.terms.some((term) => question.includes(term))
  );
}

function hasRecommendationIntent(question: string): boolean {
  return RECOMMENDATION_INTENT_PATTERN.test(question);
}

function acceptsBroadRecommendation(question: string): boolean {
  return BROAD_ACCEPTANCE_PATTERN.test(question);
}

function hasEnoughContext(input: ClarificationServiceInput): boolean {
  const constraints = input.contextMemory?.constraints;
  const filters = input.filters;

  return Boolean(
    BUDGET_PATTERN.test(input.question)
      || USE_CASE_PATTERN.test(input.question)
      || PRIORITY_PATTERN.test(input.question)
      || AUDIENCE_PATTERN.test(input.question)
      || (constraints?.minPriceCents ?? filters?.minPriceCents) !== undefined
      || (constraints?.maxPriceCents ?? filters?.maxPriceCents) !== undefined
      || Boolean(constraints?.brand ?? filters?.brand)
      || hasItems(constraints?.preferenceTerms)
      || hasItems(constraints?.avoidTerms)
      || hasItems(filters?.tagsAny)
      || hasItems(filters?.avoidTerms)
  );
}

function hasItems(value: readonly string[] | undefined): boolean {
  return value !== undefined && value.length > 0;
}
