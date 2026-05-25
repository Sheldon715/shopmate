# Ecommerce Agent Dataset V3 Schema

## 1. 文件结构

```text
ecommerce_agent_dataset_v3/
  {category_code}/
    data/
      {product_id}.json
    images/
      {product_id}_main.jpg
  dataset_summary.json
  README.md
```

`category_code` 映射：

| 中文品类 | 目录名 |
| --- | --- |
| 数码电子 | `digital` |
| 服饰运动 | `clothes` |
| 美妆护肤 | `beauty` |
| 食品饮料 | `food` |
| 家用电器 | `home_appliance` |
| 办公学习 | `office_study` |
| 母婴用品 | `mom_baby` |

## 2. 商品 JSON 完整格式

```json
{
  "product_id": "p_home_airfryer_002",
  "data_version": "v1",
  "source_type": "synthetic_desensitized",
  "status": "active",
  "title": "苏泊尔 KJ50D 空气炸锅",
  "brand": "苏泊尔",
  "category": "家用电器",
  "sub_category": "厨房电器",
  "category_path": ["家用电器", "厨房电器"],
  "price_info": {
    "currency": "CNY",
    "base_price": 299.0,
    "price_range": [299.0, 319.0],
    "promotion": null
  },
  "skus": [
    {
      "sku_id": "s_p_home_airfryer_002_1",
      "properties": {
        "容量": "5L",
        "颜色": "黑色",
        "控制方式": "触控"
      },
      "price": 299.0,
      "inventory": {
        "available": true,
        "stock_level": "unknown"
      }
    }
  ],
  "image": {
    "path": "home_appliance/images/p_home_airfryer_002_main.jpg",
    "role": "main",
    "caption": "苏泊尔 KJ50D 空气炸锅 的占位商品主图，用于开发阶段展示商品类型和标题。",
    "visual_tags": ["家用电器", "厨房电器", "占位图", "主图"]
  },
  "attributes": {
    "适用人群": ["家庭用户", "厨房新手"],
    "使用场景": ["家庭简餐", "周末聚餐"],
    "核心卖点": ["容量更大", "触控菜单", "适合家庭"],
    "不适合": ["单人小厨房", "专业烘焙用户"],
    "注意事项": ["体积比 4L 款更大，购买前需要确认台面空间"]
  },
  "pros_cons": {
    "pros": ["容量更大", "触控菜单"],
    "cons": ["单人小厨房", "体积比 4L 款更大，购买前需要确认台面空间"]
  },
  "decision_factors": {
    "recommend_when": ["容量更大", "触控菜单"],
    "avoid_when": ["单人小厨房", "专业烘焙用户"],
    "compare_with": ["p_home_airfryer_001", "p_home_airfryer_003"]
  },
  "content_blocks": [
    {
      "block_id": "p_home_airfryer_002_spec_001",
      "block_type": "spec",
      "title": "规格与价格",
      "content": "苏泊尔 KJ50D 空气炸锅 属于家用电器/厨房电器，品牌为苏泊尔，价格范围为 299.0-319.0 CNY，共 2 个 SKU。",
      "keywords": ["规格", "价格", "SKU"]
    }
  ],
  "review_summary": {
    "rating_avg": 4.0,
    "positive_points": ["容量更大", "触控菜单"],
    "negative_points": ["单人小厨房", "体积比 4L 款更大，购买前需要确认台面空间"],
    "common_complaints": ["单人小厨房"]
  },
  "raw_knowledge": {
    "marketing_description": "...",
    "official_faq": [
      {
        "question": "...",
        "answer": "..."
      }
    ],
    "user_reviews": [
      {
        "nickname": "user_001",
        "rating": 5,
        "content": "..."
      }
    ]
  }
}
```

## 3. 顶层字段

| 字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `product_id` | string | 是 | 全局唯一。格式建议：`p_{category_code}_{number}` 或可读商品组 ID，如 `p_home_airfryer_002`。 | 商品主键。用于检索引用、去重、详情页跳转、关联对比商品。 |
| `data_version` | string | 是 | 当前固定为 `v1`。 | 区分数据版本，便于重建索引。 |
| `source_type` | string | 是 | 当前固定为 `synthetic_desensitized`。 | 标识数据来源，提醒系统价格、评论等为模拟/脱敏数据。 |
| `status` | string | 是 | `active` 或 `inactive`。当前均为 `active`。 | 推荐和索引前可过滤非 active 商品。 |
| `title` | string | 是 | 商品/SPU 名。只放品牌、型号、商品类型，不放 SKU 规格。 | 高权重检索字段，用于商品名召回和答案引用。 |
| `brand` | string | 是 | 品牌名。新增数据使用真实品牌。 | 品牌过滤、品牌偏好匹配。 |
| `category` | string | 是 | 一级中文品类。 | 品类路由和过滤。 |
| `sub_category` | string | 是 | 二级中文品类。 | 子类召回，如“空气炸锅”“键盘”。 |
| `category_path` | string[] | 是 | `[category, sub_category]`。 | 层级分类过滤、前端面包屑。 |
| `price_info` | object | 是 | 见第 5 节。 | 预算过滤、价格解释。 |
| `skus` | object[] | 是 | 见第 6 节。 | 规格匹配、变体价格、颜色/尺寸/容量查询。 |
| `image` | object | 是 | 见第 7 节。 | 图片路径、视觉文本索引。 |
| `attributes` | object | 是 | 见第 8 节。 | 导购推荐核心字段。 |
| `pros_cons` | object | 是 | 见第 9 节。 | 推荐理由和避坑提醒。 |
| `decision_factors` | object | 是 | 见第 10 节。 | 推荐/不推荐条件和对比商品扩展。 |
| `content_blocks` | object[] | 是 | 见第 11 节。 | 主要 RAG chunk 来源。 |
| `review_summary` | object | 是 | 见第 12 节。 | 评价摘要、差评点、口碑解释。 |
| `raw_knowledge` | object | 是 | 见第 13 节。 | 长文详情、FAQ、用户评论。 |

## 4. SPU/SKU 规则

`title` 是 SPU 级商品名，不放具体规格。

```text
正确：苏泊尔 KJ50D 空气炸锅
错误：苏泊尔 KJ50D 空气炸锅 5L
```

SKU 级信息放在 `skus[].properties`：

```json
{
  "容量": "5L",
  "颜色": "黑色",
  "控制方式": "触控"
}
```

当前已校验：

```text
title 中 SKU 规格命中数：0
```

## 5. `price_info`

```json
{
  "currency": "CNY",
  "base_price": 299.0,
  "price_range": [299.0, 319.0],
  "promotion": null
}
```

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `currency` | string | 是 | 当前为 `CNY`。 | 价格单位展示和归一化。 |
| `base_price` | number | 是 | 商品基础价格。 | 预算过滤，如“300 元以内”。 |
| `price_range` | number[] | 是 | `[最低 SKU 价格, 最高 SKU 价格]`。 | 回答“价格范围”“不同规格多少钱”。 |
| `promotion` | string/null | 是 | 当前为 `null`，不写实时优惠。 | 稳定促销信息；当前不用于实时折扣判断。 |

说明：

```text
新增商品价格为模拟数据，不代表真实售价。
```

## 6. `skus`

```json
[
  {
    "sku_id": "s_p_home_airfryer_002_1",
    "properties": {
      "容量": "5L",
      "颜色": "黑色",
      "控制方式": "触控"
    },
    "price": 299.0,
    "inventory": {
      "available": true,
      "stock_level": "unknown"
    }
  }
]
```

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `sku_id` | string | 是 | 全局唯一。建议格式：`s_{product_id}_{number}`。 | SKU 唯一标识。 |
| `properties` | object | 是 | 规格键值对。键可为容量、颜色、尺码、版本、控制方式等。 | 用户问具体规格时使用。 |
| `price` | number | 是 | 当前 SKU 价格。 | SKU 级价格回答。 |
| `inventory` | object | 是 | 见下表。 | 可售状态和库存粗粒度信息。 |

`inventory` 子字段：

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `available` | boolean | 是 | `true` / `false`。 | 判断该 SKU 是否可推荐。 |
| `stock_level` | string | 是 | `low` / `medium` / `high` / `unknown`。当前多为 `unknown`。 | 粗粒度库存提示，不做精确库存回答。 |

## 7. `image`

```json
{
  "path": "home_appliance/images/p_home_airfryer_002_main.jpg",
  "role": "main",
  "caption": "苏泊尔 KJ50D 空气炸锅 的占位商品主图，用于开发阶段展示商品类型和标题。",
  "visual_tags": ["家用电器", "厨房电器", "占位图", "主图"]
}
```

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `path` | string | 是 | 英文相对路径。用 `dataset_root + path` 加载。 | 前端展示图片；后续真实图替换时保持路径稳定。 |
| `role` | string | 是 | 当前固定为 `main`。 | 标识图片角色。 |
| `caption` | string | 是 | 图片文本描述。 | 可作为视觉文本参与索引。 |
| `visual_tags` | string[] | 是 | 图片标签。 | 后续多模态/视觉筛选使用。 |

当前版本只使用单图字段 `image`，不使用 `images` 数组。

## 8. `attributes`

```json
{
  "适用人群": ["家庭用户", "厨房新手"],
  "使用场景": ["家庭简餐", "周末聚餐"],
  "核心卖点": ["容量更大", "触控菜单", "适合家庭"],
  "不适合": ["单人小厨房", "专业烘焙用户"],
  "注意事项": ["体积比 4L 款更大，购买前需要确认台面空间"]
}
```

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `适用人群` | string[] | 是 | 目标用户短语。 | 匹配“适合学生/租房/妈妈/宝宝”等需求。 |
| `使用场景` | string[] | 是 | 使用场景短语。 | 匹配“通勤/小户型/送礼/办公”等场景。 |
| `核心卖点` | string[] | 是 | 商品优势短语。 | 生成推荐理由。 |
| `不适合` | string[] | 是 | 不推荐人群或场景。 | 过滤不合适商品，生成避坑提醒。 |
| `注意事项` | string[] | 是 | 购买前提醒。 | 回答“有什么要注意”“有什么坑”。 |

## 9. `pros_cons`

```json
{
  "pros": ["容量更大", "触控菜单"],
  "cons": ["单人小厨房", "体积比 4L 款更大，购买前需要确认台面空间"]
}
```

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `pros` | string[] | 是 | 优点短语。 | 推荐理由。 |
| `cons` | string[] | 是 | 缺点或限制短语。 | 避坑、比较、风险提醒。 |

## 10. `decision_factors`

```json
{
  "recommend_when": ["容量更大", "触控菜单"],
  "avoid_when": ["单人小厨房", "专业烘焙用户"],
  "compare_with": ["p_home_airfryer_001", "p_home_airfryer_003"]
}
```

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `recommend_when` | string[] | 是 | 推荐条件。 | 判断商品是否匹配用户需求。 |
| `avoid_when` | string[] | 是 | 不推荐条件。 | 触发风险提醒或过滤。 |
| `compare_with` | string[] | 是 | 同类商品 `product_id` 数组。 | 对比推荐时扩展候选商品。 |

## 11. `content_blocks`

```json
[
  {
    "block_id": "p_home_airfryer_002_spec_001",
    "block_type": "spec",
    "title": "规格与价格",
    "content": "苏泊尔 KJ50D 空气炸锅 属于家用电器/厨房电器，品牌为苏泊尔，价格范围为 299.0-319.0 CNY，共 2 个 SKU。",
    "keywords": ["规格", "价格", "SKU"]
  }
]
```

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `block_id` | string | 是 | 内容块唯一 ID。 | RAG 文档 ID 的一部分。 |
| `block_type` | string | 是 | 内容类型，见下方枚举。 | 检索后重排和回答组织。 |
| `title` | string | 是 | 块标题。 | 帮助展示和增强索引文本。 |
| `content` | string | 是 | 块正文。 | 主要向量检索文本。 |
| `keywords` | string[] | 是 | 关键词数组。 | 可拼入索引文本，也可作为 metadata。 |

`block_type` 可选值：

```text
spec
selling_point
scenario
limitation
sku
visual
faq
review_positive
review_negative
comparison
after_sale
```

建议：

```text
content_blocks 是主要 RAG chunk 来源。
建议每个 content_block 单独入库。
```

推荐 RAG document：

```json
{
  "doc_id": "p_home_airfryer_002:p_home_airfryer_002_spec_001",
  "text": "标题: 苏泊尔 KJ50D 空气炸锅\n品牌: 苏泊尔\n品类: 家用电器/厨房电器\n内容: ...",
  "metadata": {
    "product_id": "p_home_airfryer_002",
    "block_id": "p_home_airfryer_002_spec_001",
    "block_type": "spec",
    "title": "苏泊尔 KJ50D 空气炸锅",
    "brand": "苏泊尔",
    "category": "家用电器",
    "sub_category": "厨房电器",
    "base_price": 299.0
  }
}
```

## 12. `review_summary`

```json
{
  "rating_avg": 4.0,
  "positive_points": ["容量更大", "触控菜单"],
  "negative_points": ["单人小厨房", "体积比 4L 款更大，购买前需要确认台面空间"],
  "common_complaints": ["单人小厨房"]
}
```

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `rating_avg` | number | 是 | 1-5 分。 | 口碑排序和评价概览。 |
| `positive_points` | string[] | 是 | 好评点。 | 回答“优点是什么”。 |
| `negative_points` | string[] | 是 | 差评点或限制。 | 回答“缺点是什么”。 |
| `common_complaints` | string[] | 是 | 常见抱怨。 | 回答“差评集中在哪里”。 |

## 13. `raw_knowledge`

```json
{
  "marketing_description": "商品详情长文。",
  "official_faq": [
    {
      "question": "苏泊尔 KJ50D 空气炸锅 适合哪些使用场景？",
      "answer": "更适合家庭简餐、周末聚餐..."
    }
  ],
  "user_reviews": [
    {
      "nickname": "user_001",
      "rating": 5,
      "content": "用了几天感觉容量更大确实明显..."
    }
  ]
}
```

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `marketing_description` | string | 是 | 商品详情长文。 | 详情页展示；可作为补充 chunk。 |
| `official_faq` | object[] | 是 | FAQ 数组。 | 问答型检索。 |
| `user_reviews` | object[] | 是 | 评论数组。 | 评论检索、口碑总结、缺点挖掘。 |

`official_faq[]` 子字段：

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `question` | string | 是 | 用户可能问的问题。 | 可作为 query-like 文本提升召回。 |
| `answer` | string | 是 | 对应回答。 | FAQ 答案依据。 |

`user_reviews[]` 子字段：

| 子字段 | 类型 | 是否必填 | 格式要求 | RAG 作用 |
| --- | --- | --- | --- | --- |
| `nickname` | string | 是 | 脱敏昵称，如 `user_001`。 | 展示用，不用于身份识别。 |
| `rating` | number | 是 | 1-5 分。 | 评论情感和评分聚合。 |
| `content` | string | 是 | 评论正文。 | 用户体验、缺点、口碑检索。 |

建议切分：

```text
content_blocks：每块一个文档
official_faq：每个 Q&A 一个文档
user_reviews：每条评论一个文档，或按商品聚合
marketing_description：每个商品一个文档
```

## 14. 校验结果

```text
json_files: 175
validation_error_count: 0
title 中 SKU 规格命中数: 0
product_id 唯一: 是
sku_id 唯一: 是
image.path 存在: 是
顶层字段结构一致: 是
```

