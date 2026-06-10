import type { Product } from "../products/product.types";

type AliasRule = {
  matches: string[];
  aliases: string[];
};

const ALIAS_RULES: AliasRule[] = [
  {
    matches: ["洁面", "洗面奶", "洁面乳", "控油洁面"],
    aliases: ["洗面奶", "洁面乳", "洁面", "控油洁面", "油皮清洁"],
  },
  {
    matches: ["防晒", "防晒霜", "防晒乳", "隔离露"],
    aliases: ["防晒霜", "防晒乳", "通勤防晒", "户外防晒", "不含酒精防晒"],
  },
  {
    matches: ["真无线耳机", "蓝牙耳机", "无线耳机", "半入耳", "开放式", "不塞耳朵"],
    aliases: ["蓝牙耳机", "无线耳机", "耳机", "半入耳", "开放式", "不塞耳朵"],
  },
  {
    matches: ["厨房小电", "早餐制作", "一人食", "租房党", "宿舍友好", "小容量", "节省台面"],
    aliases: ["小家电", "小电器", "厨房电器", "一人食", "租房", "宿舍", "宿舍小电器", "省空间", "小容量"],
  },
  {
    matches: ["办公外设", "键盘", "低噪", "静音", "不吵室友"],
    aliases: ["键盘", "安静键盘", "低噪键盘", "宿舍键盘", "不吵室友"],
  },
  {
    matches: ["空气护理", "空气净化器", "除味", "卧室空气", "租房空气"],
    aliases: ["空气净化器", "空气护理", "除味", "卧室空气", "租房空气"],
  },
  {
    matches: ["跑步鞋", "跑鞋", "运动鞋", "训练鞋", "轻量", "缓震", "耐穿"],
    aliases: ["跑鞋", "运动鞋", "训练鞋", "轻量", "缓震", "耐穿"],
  },
];

export function buildRagDocumentAliases(product: Product): string[] {
  const haystack = createAliasHaystack(product);
  const aliases: string[] = [];

  for (const rule of ALIAS_RULES) {
    if (rule.matches.some((marker) => haystack.includes(marker))) {
      aliases.push(...rule.aliases);
    }
  }

  return uniqueNonEmptyStrings(aliases);
}

function createAliasHaystack(product: Product): string {
  return [
    product.name,
    product.brand,
    product.category,
    product.subCategory,
    ...product.categoryPath,
    ...product.visualTags,
    ...Object.keys(product.attributes),
    ...Object.values(product.attributes).flat(),
    ...product.recommendWhen,
    ...product.avoidWhen,
    ...product.pros,
    ...product.cons,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();

    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}
