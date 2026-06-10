import { describe, expect, it } from "vitest";
import {
  cleanRagDocumentKeywordArray,
  cleanRagDocumentText,
  cleanRagDocumentTextArray,
  shouldSkipRagContentBlock,
} from "./rag-document-text-cleaner";

describe("cleanRagDocumentText", () => {
  it("removes dataset, demo, source, and process phrases from embedding text", () => {
    const cleaned = cleanRagDocumentText(
      "小熊电炖盅 是真实品牌 小熊 旗下的家用电器/厨房小电商品，本数据集保留真实品牌与产品名，便于后续查找对应商品图片和构建商品详情页。导购信息经过脱敏和结构化整理，主要卖点包括小容量、宿舍友好。价格、SKU、评论和 FAQ 为比赛数据集模拟内容，不代表实时售价或真实用户反馈。",
    );

    expect(cleaned).toContain("小熊电炖盅");
    expect(cleaned).toContain("小容量");
    expect(cleaned).toContain("宿舍友好");
    expect(cleaned).not.toContain("本数据集保留真实品牌");
    expect(cleaned).not.toContain("后续查找对应商品图片");
    expect(cleaned).not.toContain("导购信息经过脱敏");
    expect(cleaned).not.toContain("比赛数据集模拟内容");
  });

  it("keeps real product facts while removing production-only visual text", () => {
    const cleaned = cleanRagDocumentText(
      "苏泊尔 SF40FC776 电饭煲 4L 的占位商品主图，用于开发阶段展示商品类型和标题。适合早餐制作、一人食，价格范围为 199-222 元。",
    );

    expect(cleaned).toContain("苏泊尔 SF40FC776 电饭煲 4L");
    expect(cleaned).toContain("早餐制作");
    expect(cleaned).toContain("一人食");
    expect(cleaned).toContain("199-222 元");
    expect(cleaned).not.toContain("占位商品主图");
    expect(cleaned).not.toContain("开发阶段");
  });

  it("removes generated product-detail scaffolding without leaving broken sentence glue", () => {
    const cleaned = cleanRagDocumentText(
      "小熊 DDZ-C06A1 电炖盅 是家用电器/厨房小电下的商品详情页数据。它的核心特点包括小容量、宿舍友好，适合一人食。",
    );

    expect(cleaned).toBe("小熊 DDZ-C06A1 电炖盅 它的核心特点包括小容量、宿舍友好，适合一人食");
    expect(cleaned).not.toContain("下的它");
    expect(cleaned).not.toContain("商品详情页数据");
  });
});

describe("cleanRagDocumentTextArray", () => {
  it("dedupes and drops empty values after cleanup", () => {
    expect(cleanRagDocumentTextArray([
      "小容量",
      "小容量 ",
      "仅用于课程 Demo 和检索实验",
      "宿舍友好",
    ])).toEqual(["小容量", "宿舍友好"]);
  });
});

describe("cleanRagDocumentKeywordArray", () => {
  it("removes visual and production tags from keywords", () => {
    expect(cleanRagDocumentKeywordArray([
      "详情页",
      "卖点",
      "商品介绍",
      "占位图",
      "小容量",
    ])).toEqual(["卖点", "小容量"]);
  });
});

describe("shouldSkipRagContentBlock", () => {
  it("skips visual content blocks", () => {
    expect(shouldSkipRagContentBlock("visual")).toBe(true);
    expect(shouldSkipRagContentBlock("scenario")).toBe(false);
  });
});
