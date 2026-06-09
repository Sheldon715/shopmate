import type { Product } from "./product.types";

const MAX_PRODUCT_DISPLAY_NAME_CHARS = 20;

const PRODUCT_TYPE_MARKERS = [
  "黑白激光一体机",
  "墨仓式一体机",
  "加墨式一体机",
  "真无线蓝牙耳机",
  "多功能早餐机",
  "壁挂式空调",
  "空气净化器",
  "即热饮水机",
  "台式净饮机",
  "无线吸尘器",
  "滚筒洗衣机",
  "人体工学椅",
  "电动升降桌",
  "多功能双肩背包",
  "空气炸锅",
  "养生壶",
  "电炖盅",
  "破壁料理机",
  "智能电饭煲",
  "防晒乳",
  "隔离露",
  "特护霜",
  "修复霜",
  "肌底液",
  "精华露",
  "精华液",
  "化妆水",
  "爽肤水",
  "洁面乳",
  "蜜粉饼",
  "粉底液",
  "卸妆油",
  "唇釉",
  "眼霜",
  "面膜",
  "眉笔",
  "短袖上衣",
  "速干短袖",
  "运动长裤",
  "运动短裤",
  "跑步鞋",
  "篮球鞋",
  "徒步鞋",
  "瑜伽裤",
  "户外裤",
  "双肩背包",
  "棒球帽",
  "鸭舌帽",
  "智能手机",
  "专业版",
  "标准版",
  "旗舰版",
  "青春版",
  "轻享版",
  "笔记本电脑",
  "平板电脑",
  "显示器",
  "无线键盘",
  "机械键盘",
  "笔记本",
  "文件框",
  "文件柜",
  "收纳盒",
  "活页笔记本",
  "方便面",
  "气泡水",
  "功能饮料",
  "纯牛奶",
  "酸牛奶",
  "乌龙茶",
  "茉莉花茶",
  "黑咖啡",
  "速溶咖啡",
  "生抽",
  "老抽",
  "每日坚果",
  "肉松饼",
  "沐浴露",
  "身体乳",
  "护臀膏",
  "辅食勺",
  "安全勺",
  "叉勺套装",
  "婴儿睡袋",
  "布书",
  "叠叠杯",
  "健身架",
  "婴儿推车",
].sort((a, b) => b.length - a.length);

const DESCRIPTOR_SUFFIX_MARKERS = [
  "高倍",
  "修护",
  "提亮",
  "控油",
  "防水",
  "防汗",
  "清爽",
  "户外",
  "面部",
  "身体",
  "敏感肌",
  "易敏肌",
  "适用",
  "保湿",
  "补水",
  "淡纹",
  "紧致",
  "抗初老",
  "抗皱",
  "维稳",
  "强韧",
  "细腻",
  "毛孔",
  "肤色",
  "温和",
  "清洁",
  "底妆",
  "持妆",
  "遮瑕",
  "定妆",
  "显色",
  "防晕染",
  "持久",
  "轻薄",
  "水感",
  "大容量",
  "便携",
  "家用",
  "厨房",
  "早餐",
  "一人食",
];

export function buildProductDisplayName(product: Product): string {
  const rawName = cleanWhitespace(product.name);
  const fallback = rawName || "未命名商品";
  const rawCandidate = extractCoreDisplayName(
    rawName,
    product.brand,
    product.category,
    product.subCategory,
  );
  const displayName = shortenProductName(trimProductName(rawCandidate ?? fallback));

  return displayName || "未命名商品";
}

function extractCoreDisplayName(
  value: string,
  brand: string,
  category: string,
  subCategory: string | null,
): string | null {
  const cleaned = cleanWhitespace(value).replace(/[（(][^）)]{1,24}[）)]/gu, "");

  if (cleaned.length === 0) {
    return null;
  }

  const coreStart = cleaned.startsWith(brand) ? brand.length : 0;
  const productTypeCandidate = extractThroughFirstMarker(
    cleaned,
    PRODUCT_TYPE_MARKERS,
    coreStart,
    { includeMarker: true },
  );

  if (productTypeCandidate) {
    return productTypeCandidate;
  }

  const categoryMarkers = [category, subCategory ?? ""]
    .flatMap((item) => item.split(/[ /]+/u))
    .filter((item) => item.length >= 2);
  const categoryCandidate = extractThroughFirstMarker(
    cleaned,
    categoryMarkers,
    coreStart,
    { includeMarker: true },
  );

  if (categoryCandidate) {
    return categoryCandidate;
  }

  return extractThroughFirstMarker(
    cleaned,
    DESCRIPTOR_SUFFIX_MARKERS,
    coreStart,
    { includeMarker: false },
  ) ?? cleaned;
}

function extractThroughFirstMarker(
  value: string,
  markers: string[],
  coreStart: number,
  options: { includeMarker: boolean },
): string | null {
  let bestEnd: number | null = null;

  for (const marker of markers) {
    const index = value.indexOf(marker, coreStart);

    if (index < coreStart) {
      continue;
    }

    const end = options.includeMarker ? index + marker.length : index;

    bestEnd = bestEnd === null ? end : Math.min(bestEnd, end);
  }

  if (bestEnd === null) {
    return null;
  }

  const candidate = trimProductName(value.slice(0, bestEnd));
  return candidate.length >= 4 ? candidate : null;
}

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function trimProductName(value: string): string {
  return cleanWhitespace(value).replace(/^[ ·\-_\/｜|，,。；;]+|[ ·\-_\/｜|，,。；;]+$/gu, "");
}

function shortenProductName(value: string): string {
  if (value.length <= MAX_PRODUCT_DISPLAY_NAME_CHARS) {
    return value;
  }

  const softBreak = ["（", "(", " ", "·", "-", "｜", "|"]
    .map((marker) => value.indexOf(marker))
    .filter((index) => index >= 4 && index <= MAX_PRODUCT_DISPLAY_NAME_CHARS)
    .sort((a, b) => a - b)[0];

  return trimProductName(value.slice(0, softBreak ?? MAX_PRODUCT_DISPLAY_NAME_CHARS));
}
