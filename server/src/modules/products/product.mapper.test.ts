import { describe, expect, it } from "vitest";
import type { NormalizedProduct } from "../../lib/catalog/types";
import {
  mapNormalizedProductToUpsertInput,
  mapProductToCardDto,
  mapProductToDetailDto,
  moneyToCents,
} from "./product.mapper";
import { buildProductDisplayName } from "./product-display-copy";
import type { Product } from "./product.types";

function createNormalizedProduct(): NormalizedProduct {
  return {
    product_id: "prod_cleanser_001",
    status: "active",
    name: "清透控油洁面乳",
    brand: "示例品牌",
    category: "美妆护肤",
    sub_category: "洁面",
    category_path: ["美妆护肤", "洁面"],
    currency: "CNY",
    base_price: 199.99,
    price_range: [199.99, 219.5],
    image_path: "beauty/images/prod_cleanser_001_main.png",
    image_caption: "洁面乳主图",
    visual_tags: ["控油", "温和"],
    skus: [
      {
        sku_id: "sku_cleanser_001",
        properties: { size: "150ml", texture: "乳状" },
        price: 199.99,
        available: true,
        stock_level: "in_stock",
      },
    ],
    attributes: {
      skin_type: ["油皮", "混油"],
      texture: ["乳状"],
    },
    pros: ["清洁力温和", "控油"],
    cons: ["容量较小"],
    recommend_when: ["油皮日常洁面"],
    avoid_when: ["极干皮"],
    compare_with: ["prod_cleanser_002"],
    content_blocks: [
      {
        block_id: "usage",
        block_type: "usage",
        title: "使用场景",
        content: "适合早晚洁面。",
        keywords: ["洁面", "控油"],
      },
    ],
    review_summary: {
      rating_avg: 4.7,
      positive_points: ["清爽"],
      negative_points: ["价格偏高"],
      common_complaints: [],
    },
    marketing_description: "适合油皮的温和洁面乳。",
    official_faq: [
      {
        question: "敏感肌能用吗？",
        answer: "建议先局部测试。",
      },
    ],
    user_reviews: [
      {
        nickname: "demo_user",
        rating: 5,
        content: "洗后不紧绷。",
      },
    ],
    knowledge_text: "商品名:清透控油洁面乳\n类目:美妆护肤",
    source: {
      source_dataset: "ecommerce_agent_dataset_v3",
      source_version: "v3",
      source_type: "synthetic_desensitized",
      data_version: "catalog_v1",
      is_desensitized: true,
      ingest_batch_id: "catalog_test_batch",
      source_path: "beauty/data/prod_cleanser_001.json",
    },
  };
}

function createProduct(overrides: Partial<Product> = {}): Product {
  const product: Product = {
    id: "prod_cleanser_001",
    status: "active",
    name: "清透控油洁面乳",
    brand: "示例品牌",
    category: "美妆护肤",
    subCategory: "洁面",
    imagePath: "beauty/images/prod_cleanser_001_main.png",
    imageCaption: "洁面乳主图",
    currency: "CNY",
    basePriceCents: 19999,
    priceMinCents: 19999,
    priceMaxCents: 21950,
    marketingDescription: "适合油皮的温和洁面乳。",
    knowledgeText: "商品名:清透控油洁面乳\n类目:美妆护肤",
    ratingAvg: 4.7,
    categoryPath: ["美妆护肤", "洁面"],
    visualTags: ["控油", "温和"],
    attributes: {
      skin_type: ["油皮", "混油"],
      texture: ["乳状"],
    },
    pros: ["清洁力温和", "控油"],
    cons: ["容量较小"],
    recommendWhen: ["油皮日常洁面"],
    avoidWhen: ["极干皮"],
    compareWith: ["prod_cleanser_002"],
    reviewSummary: {
      rating_avg: 4.7,
      positive_points: ["清爽"],
      negative_points: ["价格偏高"],
      common_complaints: [],
    },
    contentBlocks: [
      {
        block_id: "usage",
        block_type: "usage",
        title: "使用场景",
        content: "适合早晚洁面。",
        keywords: ["洁面", "控油"],
      },
    ],
    officialFaq: [
      {
        question: "敏感肌能用吗？",
        answer: "建议先局部测试。",
      },
    ],
    userReviews: [
      {
        nickname: "demo_user",
        rating: 5,
        content: "洗后不紧绷。",
      },
    ],
    normalizedPayload: { product_id: "prod_cleanser_001" },
    sourceDataset: "ecommerce_agent_dataset_v3",
    sourceVersion: "v3",
    sourceType: "synthetic_desensitized",
    dataVersion: "catalog_v1",
    isDesensitized: true,
    ingestBatchId: "catalog_test_batch",
    sourcePath: "beauty/data/prod_cleanser_001.json",
    skus: [
      {
        id: "sku_cleanser_001",
        productId: "prod_cleanser_001",
        properties: { size: "150ml", texture: "乳状" },
        priceCents: 19999,
        currency: "CNY",
        available: true,
        stockLevel: "in_stock",
        sortOrder: 0,
      },
    ],
  };

  return {
    ...product,
    ...overrides,
  };
}

describe("moneyToCents", () => {
  it("converts decimal money values into cents", () => {
    expect(moneyToCents(199.99, "price")).toBe(19999);
  });

  it("rejects negative, NaN, and infinite values", () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => moneyToCents(value, "price")).toThrow(
        "price must be a non-negative finite number.",
      );
    }
  });
});

describe("mapNormalizedProductToUpsertInput", () => {
  it("maps price, SKU, source metadata, and JSONB fields", () => {
    const input = mapNormalizedProductToUpsertInput(createNormalizedProduct());

    expect(input.product).toMatchObject({
      id: "prod_cleanser_001",
      basePriceCents: 19999,
      priceMinCents: 19999,
      priceMaxCents: 21950,
      sourceDataset: "ecommerce_agent_dataset_v3",
      sourceVersion: "v3",
      sourceType: "synthetic_desensitized",
      dataVersion: "catalog_v1",
      isDesensitized: true,
      ingestBatchId: "catalog_test_batch",
      sourcePath: "beauty/data/prod_cleanser_001.json",
      attributes: {
        skin_type: ["油皮", "混油"],
        texture: ["乳状"],
      },
    });
    expect(input.product.normalizedPayload).toMatchObject({
      product_id: "prod_cleanser_001",
    });
    expect(input.skus).toEqual([
      {
        id: "sku_cleanser_001",
        productId: "prod_cleanser_001",
        properties: { size: "150ml", texture: "乳状" },
        priceCents: 19999,
        currency: "CNY",
        available: true,
        stockLevel: "in_stock",
        sortOrder: 0,
      },
    ]);
  });
});

describe("mapProductToCardDto", () => {
  it("maps card fields and derives availability from SKUs", () => {
    const card = mapProductToCardDto(createProduct());

    expect(card).toEqual({
      id: "prod_cleanser_001",
      name: "清透控油洁面乳",
      brand: "示例品牌",
      category: "美妆护肤",
      subCategory: "洁面",
      priceCents: 19999,
      priceRangeCents: {
        min: 19999,
        max: 21950,
      },
      currency: "CNY",
      imagePath: "/images/products/beauty/images/prod_cleanser_001_main.png",
      ratingAvg: 4.7,
      tags: ["控油", "温和"],
      available: true,
      recommendationReason: "推荐理由：油皮日常洁面，适合油皮，适合混油。",
    });
  });

  it("builds recommendation reasons from fit facts instead of brand/category templates", () => {
    const card = mapProductToCardDto(createProduct({
      brand: "示例品牌",
      category: "美妆护肤",
      subCategory: "洁面",
      recommendWhen: ["油皮日常洁面", "夏天早晚清洁"],
      attributes: {
        skin_type: ["油皮"],
      },
      pros: ["洗后不紧绷"],
      visualTags: ["控油"],
    }));

    expect(card.recommendationReason).toContain("油皮日常洁面");
    expect(card.recommendationReason).toContain("适合油皮");
    expect(card.recommendationReason).not.toContain("示例品牌 · 美妆护肤");
    expect(card.recommendationReason).not.toContain("当前可选");
  });

  it("keeps caution facts out of recommendation reasons", () => {
    const card = mapProductToCardDto(createProduct({
      recommendWhen: ["通勤久戴"],
      attributes: {
        "适用人群": ["学生党"],
        "注意事项": ["过敏人群谨慎选择"],
        "不适合": ["专业竞技跑者"],
      },
      pros: ["轻便耐穿"],
      visualTags: [],
    }));

    expect(card.recommendationReason).toContain("通勤久戴");
    expect(card.recommendationReason).toContain("适合学生党");
    expect(card.recommendationReason).not.toContain("过敏");
    expect(card.recommendationReason).not.toContain("专业竞技跑者");
  });

  it("uses marketing facts when structured fields only contain placeholder facts", () => {
    const card = mapProductToCardDto(createProduct({
      name: "珊珂洗颜专科绵润泡沫洁面乳",
      brand: "珊珂",
      recommendWhen: ["功效描述明确", "适用场景清楚"],
      attributes: {
        "适用人群": ["日常护肤用户", "关注肤感的人群"],
        "使用场景": ["日常护理"],
        "核心卖点": ["功效描述明确", "便于按肤质筛选"],
      },
      pros: ["功效描述明确", "适用场景清楚"],
      visualTags: ["美妆护肤", "洁面", "主图"],
      marketingDescription:
        "珊珂洗颜专科绵润泡沫洁面乳主打绵密细腻的泡沫清洁体验，核心添加蚕丝蛋白精华与双重透明质酸，既能深入毛孔带走油脂污垢，又能在清洁后留下水润保护膜。适合中性、混合性皮肤日常使用。",
    }));

    expect(card.recommendationReason).toContain("主打绵密细腻的泡沫清洁体验");
    expect(card.recommendationReason).toContain("深入毛孔带走油脂污垢");
    expect(card.recommendationReason).not.toContain("珊珂洗颜专科");
    expect(card.recommendationReason).not.toContain("功效描述明确");
    expect(card.recommendationReason).not.toContain("适用场景清楚");
    expect(card.recommendationReason).not.toContain("日常护肤用户");
  });

  it("keeps dataset housekeeping copy out of recommendation reasons", () => {
    const dirtyCopies = [
      "本数据集保留真实品牌与产品名",
      "便于后续查找对应商品图片和构建商品详情页",
      "导购信息经过脱敏和结构化整理",
      "价格、SKU、评论和 FAQ 为比赛数据集模拟内容，不代表实时售价或真实用户反馈",
    ];
    const card = mapProductToCardDto(createProduct({
      name: "小熊电炖盅",
      brand: "小熊",
      category: "家用电器",
      subCategory: "厨房小电",
      recommendWhen: dirtyCopies,
      attributes: {
        "核心卖点": dirtyCopies,
      },
      pros: dirtyCopies,
      visualTags: ["家用电器", "厨房小电", "主图"],
      marketingDescription:
        "小熊 DDZ-C06A1 电炖盅 是真实品牌 小熊 旗下的家用电器/厨房小电商品，本数据集保留真实品牌与产品名，便于后续查找对应商品图片和构建商品详情页。导购信息经过脱敏和结构化整理，主要卖点包括适合炖汤、小容量、宿舍友好，适合早餐制作、一人食。价格、SKU、评论和 FAQ 为比赛数据集模拟内容，不代表实时售价或真实用户反馈。",
    }));

    expect(card.recommendationReason).toContain("适合炖汤");
    expect(card.recommendationReason).toContain("小容量");
    expect(card.recommendationReason).not.toContain("本数据集");
    expect(card.recommendationReason).not.toContain("真实品牌");
    expect(card.recommendationReason).not.toContain("后续查找");
    expect(card.recommendationReason).not.toContain("脱敏");
    expect(card.recommendationReason).not.toContain("模拟内容");
  });

  it("keeps image and category housekeeping tags out of public card DTOs", () => {
    const card = mapProductToCardDto(createProduct({
      brand: "352",
      category: "家用电器",
      subCategory: "空气护理",
      visualTags: [
        "家用电器",
        "空气护理",
        "占位图",
        "主图",
        "场景明确",
        "适用场景清楚",
        "除甲醛",
        "大空间",
        "长效滤芯可替换覆盖卧室客厅",
        "除甲醛",
      ],
    }));

    expect(card.tags).toEqual(["除甲醛", "大空间", "长效滤芯可替换覆盖卧室客"]);
    expect(card.tags.every((tag) => Array.from(tag).length <= 12)).toBe(true);
  });

  it("builds short public tags from marketing facts when visual tags are only housekeeping", () => {
    const card = mapProductToCardDto(createProduct({
      name: "雅诗兰黛特润修护肌活精华露淡纹紧致保湿夜间修护抗初老精华",
      brand: "雅诗兰黛",
      category: "美妆护肤",
      subCategory: "精华",
      visualTags: ["美妆护肤", "精华", "主图"],
      attributes: {
        "适用人群": ["日常护肤用户", "关注肤感的人群"],
        "使用场景": ["日常护理", "换季护理"],
        "核心卖点": ["功效描述明确", "适用场景清楚"],
      },
      pros: ["功效描述明确", "适用场景清楚"],
      recommendWhen: ["功效描述明确", "适用场景清楚"],
      marketingDescription:
        "雅诗兰黛特润修护肌活精华露（小棕瓶）是品牌经典抗初老单品，主打夜间肌底修护。搭配透明质酸锁水保湿，猴面包树籽提取物淡纹紧致。适合25+有干纹细纹、熬夜后暗沉的抗初老人群，夜间护肤时使用效果更佳。",
    }));

    expect(card.tags).toEqual(["夜间肌底修护", "锁水保湿", "淡纹紧致"]);
    expect(card.tags).not.toContain("美妆护肤");
    expect(card.tags).not.toContain("主图");
    expect(card.tags).not.toContain("功效描述明确");
  });

  it("keeps public tag fallback grounded in short product facts across categories", () => {
    const card = mapProductToCardDto(createProduct({
      name: "小熊电炖盅适合炖汤小容量宿舍友好早餐制作一人食",
      brand: "小熊",
      category: "家用电器",
      subCategory: "厨房小电",
      visualTags: ["家用电器", "厨房小电", "主图"],
      attributes: {
        "核心卖点": ["规格容易比较"],
        "使用场景": ["规格选择清楚"],
      },
      pros: ["规格容易比较"],
      recommendWhen: ["规格选择清楚"],
      marketingDescription:
        "小熊电炖盅，主要卖点包括适合炖汤、小容量、宿舍友好，适合早餐制作、一人食。",
    }));

    expect(card.tags).toEqual(["小容量", "宿舍友好", "早餐制作"]);
    expect(card.tags.every((tag) => Array.from(tag).length <= 12)).toBe(true);
    expect(card.tags).not.toContain("规格容易比较");
    expect(card.tags).not.toContain("厨房小电");
  });

  it("uses useful fit facts instead of SKU dataset notices for card reasons", () => {
    const dirtyNotice = "价格、SKU、评论和 FAQ 为比赛数据集模拟内容，不代表实时售价或真实用户反馈";
    const card = mapProductToCardDto(createProduct({
      name: "欧珀人像十六代专业版",
      brand: "欧珀",
      category: "数码电子",
      subCategory: "智能手机",
      recommendWhen: [dirtyNotice],
      attributes: {
        "核心卖点": [dirtyNotice],
        "适用人群": ["学生", "上班族"],
        "使用场景": ["办公学习", "影音娱乐"],
      },
      pros: [dirtyNotice],
      visualTags: ["数码电子", "智能手机"],
      marketingDescription: `${dirtyNotice}。`,
    }));

    expect(card.recommendationReason).toContain("适合办公学习");
    expect(card.recommendationReason).toContain("适合学生");
    expect(card.recommendationReason).not.toContain("SKU");
    expect(card.recommendationReason).not.toContain("FAQ");
    expect(card.recommendationReason).not.toContain("实时售价");
    expect(card.recommendationReason).not.toContain("真实用户反馈");
  });

  it("keeps generic generated placeholder facts out of fallback card reasons", () => {
    const card = mapProductToCardDto(createProduct({
      name: "三只松鼠每日坚果",
      brand: "三只松鼠",
      category: "食品饮料",
      subCategory: "坚果/零食",
      recommendWhen: ["口味信息明确", "规格容易比较"],
      attributes: {
        "核心卖点": ["口味信息明确", "规格容易比较", "场景适用性强"],
        "使用场景": ["日常食用", "办公室补给"],
      },
      pros: ["口味信息明确", "规格容易比较"],
      visualTags: ["食品饮料", "坚果/零食", "主图"],
      marketingDescription:
        "这款每日坚果适合办公室补给，也适合作为日常食用的小包装零食。",
    }));

    expect(card.recommendationReason).toContain("适合日常食用");
    expect(card.recommendationReason).toContain("适合办公室补给");
    expect(card.recommendationReason).not.toContain("口味信息明确");
    expect(card.recommendationReason).not.toContain("规格容易比较");
    expect(card.recommendationReason).not.toContain("场景适用性强");
  });

  it("maps raw catalog SEO titles to concise display names across categories", () => {
    const examples: Array<{
      product: Product;
      displayName: string;
    }> = [
      {
        product: createProduct({
          name: "巴黎欧莱雅新多重防护隔离露水感轻薄高倍防晒修护提亮",
          brand: "巴黎欧莱雅",
          category: "美妆护肤",
          subCategory: "防晒",
          marketingDescription:
            "巴黎欧莱雅新多重防护隔离露，主打水感轻薄质地，上脸瞬间推开成膜。",
        }),
        displayName: "巴黎欧莱雅新多重防护隔离露",
      },
      {
        product: createProduct({
          name: "安热沙金灿倍护防晒乳高倍防水防汗清爽户外面部身体防晒",
          brand: "安热沙",
          category: "美妆护肤",
          subCategory: "防晒",
          marketingDescription:
            "安热沙金灿倍护防晒乳（经典金瓶）是户外防晒的明星产品，核心采用品牌特有的Aqua Booster EX遇水增强技术。",
        }),
        displayName: "安热沙金灿倍护防晒乳",
      },
      {
        product: createProduct({
          name: "小熊多功能早餐机",
          brand: "小熊",
          category: "家用电器",
          subCategory: "厨房小电",
          marketingDescription:
            "小熊 DSL-A02W1 多功能早餐机 是真实品牌 小熊 旗下的家用电器/厨房小电商品。",
        }),
        displayName: "小熊多功能早餐机",
      },
      {
        product: createProduct({
          name: "小熊电炖盅适合炖汤小容量宿舍友好早餐制作一人食",
          brand: "小熊",
          category: "家用电器",
          subCategory: "厨房小电",
          marketingDescription:
            "小熊电炖盅，适合炖汤、小容量、宿舍友好，适合早餐制作、一人食。",
        }),
        displayName: "小熊电炖盅",
      },
      {
        product: createProduct({
          name: "兰蔻眼霜淡纹紧致抗初老清爽保湿适用熬夜人群",
          brand: "兰蔻",
          category: "美妆护肤",
          subCategory: "眼霜",
          marketingDescription:
            "兰蔻眼霜主打淡纹紧致，适合熬夜后的眼周护理。",
        }),
        displayName: "兰蔻眼霜",
      },
      {
        product: createProduct({
          name: "苹果手机十七专业版十九代专业芯片全网通旗舰手机",
          brand: "Apple 苹果",
          category: "数码电子",
          subCategory: "智能手机",
          marketingDescription:
            "苹果手机十七专业版是高性能旗舰手机，适合重度影像和创作用户。",
        }),
        displayName: "苹果手机十七专业版",
      },
    ];

    for (const example of examples) {
      const card = mapProductToCardDto(example.product);

      expect(card.name).toBe(example.displayName);
      expect(card.name.length).toBeLessThanOrEqual(20);
      expect(card.name).not.toMatch(/高倍|修护提亮|防水防汗|专业芯片/u);
    }
  });

  it("does not reuse the product title as recommendation facts", () => {
    const card = mapProductToCardDto(createProduct({
      name: "巴黎欧莱雅新多重防护隔离露水感轻薄高倍防晒修护提亮",
      brand: "巴黎欧莱雅",
      category: "美妆护肤",
      subCategory: "防晒",
      recommendWhen: ["巴黎欧莱雅新多重防护隔离露", "适合清爽肤感"],
      pros: ["巴黎欧莱雅新多重防护隔离露", "水感轻薄质地"],
      attributes: {
        "核心卖点": ["巴黎欧莱雅新多重防护隔离露", "上脸瞬间推开成膜"],
      },
      marketingDescription:
        "巴黎欧莱雅新多重防护隔离露，主打水感轻薄质地，上脸瞬间推开成膜，无厚重黏腻感。",
    }));

    expect(card.name).toBe("巴黎欧莱雅新多重防护隔离露");
    expect(card.recommendationReason).toContain("适合清爽肤感");
    expect(card.recommendationReason).toContain("水感轻薄质地");
    expect(card.recommendationReason).not.toContain("推荐理由：巴黎欧莱雅新多重防护隔离露");
  });

  it("does not fall back to a marketing summary that repeats the title", () => {
    const card = mapProductToCardDto(createProduct({
      name: "小熊电炖盅适合炖汤小容量宿舍友好早餐制作一人食",
      brand: "小熊",
      category: "家用电器",
      subCategory: "厨房小电",
      recommendWhen: [],
      pros: [],
      attributes: {},
      visualTags: ["家用电器", "厨房小电"],
      marketingDescription:
        "小熊电炖盅适合炖汤小容量宿舍友好早餐制作一人食。",
    }));

    expect(card.name).toBe("小熊电炖盅");
    expect(card.recommendationReason).not.toContain("小熊电炖盅");
    expect(card.recommendationReason).toBe("推荐理由：库内有货，可结合预算和使用场景继续比较。");
  });
});

describe("buildProductDisplayName", () => {
  it("falls back to a concise raw title when no type marker is available", () => {
    expect(buildProductDisplayName(createProduct({
      name: "某品牌超级长长长长长长长商品标题测试样例",
      brand: "某品牌",
      category: "其他",
      subCategory: "其他",
      marketingDescription: "",
    }))).toHaveLength(20);
  });
});

describe("mapProductToDetailDto", () => {
  it("keeps detail fields from the product model", () => {
    const product = createProduct();
    const detail = mapProductToDetailDto(product);

    expect(detail).toMatchObject({
      id: "prod_cleanser_001",
      marketingDescription: "适合油皮的温和洁面乳。",
      skus: product.skus,
      attributes: product.attributes,
      pros: product.pros,
      cons: product.cons,
      recommendWhen: product.recommendWhen,
      avoidWhen: product.avoidWhen,
      reviewSummary: product.reviewSummary,
      officialFaq: product.officialFaq,
      contentBlocks: product.contentBlocks,
    });
  });

  it("can map image paths to an absolute public image base URL", () => {
    const detail = mapProductToDetailDto(createProduct(), {
      publicImageBaseUrl: "https://api.example",
    });

    expect(detail.imagePath).toBe(
      "https://api.example/images/products/beauty/images/prod_cleanser_001_main.png",
    );
  });
});
