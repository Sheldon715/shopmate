const REMOVABLE_PATTERNS = [
  /本数据集保留真实品牌与产品名，?便于后续查找对应商品图片和构建商品详情页[。；;]?/gu,
  /便于后续查找对应商品图片和构建商品详情页[。；;]?/gu,
  /便于后续查找对应商品图片[。；;]?/gu,
  /构建商品详情页[。；;]?/gu,
  /导购信息经过脱敏和结构化整理，?/gu,
  /真实品牌\s*/gu,
  /价格、SKU、评论和 FAQ 为比赛数据集模拟内容，不代表实时售价或真实用户反馈[。；;]?/gu,
  /价格、SKU、评论和 FAQ 为比赛数据[。；;]?/gu,
  /本商品数据来自 synthetic\/desensitized 脱敏商品数据集，仅用于课程 Demo 和检索实验[。；;]?/giu,
  /本商品数据来自 synthetic\/desensitized[。；;]?/giu,
  /仅用于课程 Demo 和检索实验[。；;]?/giu,
  /是[^。；;]{1,80}下的商品详情页数据[。；;]?/gu,
  /商品详情页数据[。；;]?/gu,
  /用于开发阶段展示商品类型和标题[。；;]?/gu,
  /的占位商品主图[。；;]?/gu,
  /占位商品主图[。；;]?/gu,
] as const;

const LOW_VALUE_TERMS = new Set([
  "占位图",
  "主图",
  "详情页",
  "商品介绍",
]);

const LOW_VALUE_BLOCK_TYPES = new Set(["visual"]);

export function cleanRagDocumentText(value: string): string {
  let cleaned = value;

  for (const pattern of REMOVABLE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned
    .replace(/\s*([，,])\s*([。；;])/gu, "$2")
    .replace(/[，,]\s*([。；;])/gu, "$1")
    .replace(/\s+/gu, " ")
    .replace(/\s*([。；;，,])\s*/gu, "$1")
    .replace(/^[。；;，,\s]+|[。；;，,\s]+$/gu, "")
    .trim();
}

export function cleanRagDocumentTextArray(values: string[]): string[] {
  return uniqueNonEmptyStrings(values.map(cleanRagDocumentText));
}

export function cleanRagDocumentKeywordArray(values: string[]): string[] {
  return uniqueNonEmptyStrings(
    values
      .map((value) => cleanRagDocumentText(value))
      .filter((value) => !LOW_VALUE_TERMS.has(value)),
  );
}

export function shouldSkipRagContentBlock(blockType: string): boolean {
  return LOW_VALUE_BLOCK_TYPES.has(blockType.trim().toLowerCase());
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
