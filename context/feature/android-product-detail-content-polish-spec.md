# Android Product Detail Content Polish

## 概述

在商品详情真实 API 接通后，整理真实商品字段在 Android 详情页中的展示方式，让页面看起来像“导购整理后的商品详情”，而不是直接把测试字段、seed 文案或内部属性名展示出来。

本 spec 只做 Android 商品详情内容映射和文案 polish。不新增 API，不改 RAG 检索，不做购物车真实接口，也不做远程图片加载。

## 范围

本 spec 负责：

- 调整 `ProductDetailMapper` 的字段优先级和文案生成。
- 优化 `pros`、`cons`、`recommendWhen`、`avoidWhen`、`attributes` 到详情页卡片的映射。
- 让“AI 推荐理由”优先使用更自然的商品优势 / 适用场景文案。
- 把风险、限制、注意事项放到适合的位置，避免像测试字段直出。
- 清理 seed / demo 数据中的生硬表达，例如“功效描述明确”“适用场景清楚”“只追求最低价格”“不应替代医疗建议”等直接作为亮点展示。
- 保持现有详情页视觉结构和 Preview 可用。

不负责：

- 后端 `ProductDetailDto` 改造。
- 新增 RAG 推荐上下文字段。
- 远程图片加载。
- 购物车 API。
- 收藏真实状态。
- 商品详情页大规模 UI 重排。
- 医疗 / 功效承诺判断。

## 前置条件

先完成：

- `android-product-api-integration-spec.md`

当前应已有：

- `ProductDetailDto`
- `ProductDetailMapper.kt`
- `ProductDetailUi`
- `ProductDetailScreen`
- 真实 `GET /api/products/:id` 链路

## 轻量 Field Audit

实现前先做一个本地抽样，不需要单独 research 文档：

- 抽 5-10 个真实商品，尽量覆盖美妆、数码、食品、服饰等不同类目。
- 查看字段：
  - `marketingDescription`
  - `attributes`
  - `pros`
  - `cons`
  - `recommendWhen`
  - `avoidWhen`
  - `skus`
- 记录哪些字段适合做亮点，哪些适合做注意事项，哪些属于模板废话。

这个 audit 只服务本 spec 的 mapper 调整，不产出 `docs/*research*`。

## 文件

预计修改：

- `client/android/app/src/main/java/com/shopmate/app/data/products/ProductDetailMapper.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductDetailUi.kt`（仅在现有字段不够表达时）
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`（只更新 Preview 文案，不改业务逻辑）

不修改：

- `ProductApiClient`
- `ProductRepository`
- `ProductDetailViewModel`
- 后端商品 API
- Chat / RAG 代码

## 文案原则

详情页文案必须：

- 以真实字段为依据，不编造商品功效、库存、折扣或适用人群。
- 避免直接展示内部测试话术：
  - “功效描述明确”
  - “适用场景清楚”
  - “便于按肤质筛选”
  - “希望获得医疗效果的用户”
  - “不应替代医疗建议”
- 避免把负面限制放进“亮点”。
- 避免所有商品都显示同一套模板话术。
- 对敏感/功效类商品保持保守表达，例如“建议先做局部测试”“效果因人而异”。

## Mapper 优先级

`ProductDetailDto -> ProductDetailUi` 调整为：

### Recommendation Reason

优先级：

1. 从 `pros` 中选择非模板、可读的优势。
2. 补充 `recommendWhen` 中的使用场景。
3. 如果以上都不够，使用 `marketingDescription` 的首句或前 60-90 字。
4. 最后 fallback 到品牌 + 类目 + 可用状态。

不要只返回“品牌 · 类目，当前可选”。

建议格式：

```text
这款更适合想要{场景/需求}的用户，主要亮点是{优势1}、{优势2}。
```

如果没有足够信息：

```text
这款商品信息较完整，可以结合价格、规格和适用场景继续比较。
```

### Highlights

亮点优先级：

1. `pros` 中的具体优势。
2. `attributes["核心卖点"]`。
3. `recommendWhen` 中的具体场景。
4. `marketingDescription` 中可读短句。

过滤：

- 过滤模板词：“功效描述明确”“适用场景清楚”“便于按肤质筛选”。
- 过滤与注意/限制相关的句子。
- 最多 3 条。
- 每条尽量不超过 24 个中文字符；超出时可截断或用更短字段替代。

### Specs

规格卡片优先级：

1. `attributes["适用人群"]` -> label: `适用人群`
2. `attributes["使用场景"]` -> label: `使用场景`
3. SKU 规格摘要 -> label: `规格`
4. `brand` -> label: `品牌`
5. `category/subCategory` -> label: `品类`

规则：

- 最多 4 个卡片。
- label 不直接使用难懂字段名。
- value 过长时选择前 1-2 个短项。
- 不把“注意事项”“不适合”放进规格卡片。

### Suitability / Caution

`suitedForText` 不再只拼：

```text
适合：...；谨慎选择：...
```

改成更自然的两类文案：

- 有适用场景：
  ```text
  适合{人群/场景}，尤其是{使用场景}。
  ```
- 有注意事项：
  ```text
  如果你{avoidWhen/cons}，建议先谨慎比较或降低预期。
  ```

如果两者都有，可以组合成 1-2 句，但不要超过 UI 卡片可显示范围。

### Description

`description` 使用：

1. `marketingDescription`，清理过长段落。
2. 如果为空，使用品牌 / 类目 fallback。

规则：

- 不展示 “页面 mock 阶段”“测试数据”“商品详情页数据”。
- 可保留真实商品使用建议，但避免太长。
- 第一版不做全文展开。

## Template Filtering

新增 helper：

```kotlin
private fun String.isTemplateLikeProductCopy(): Boolean
```

至少过滤：

- `功效描述明确`
- `适用场景清楚`
- `便于按肤质筛选`
- `希望获得医疗效果`
- `不应替代医疗建议`
- `商品详情页数据`
- `页面 mock`
- `测试数据`

注意：过滤不是删除所有风险提醒；风险提醒应该进入 caution 文案，而不是亮点。

## ProductDetailScreen 文案

保留布局，但可以微调标题：

- `AI 推荐理由`：如果当前没有 RAG 上下文，可改为 `导购推荐理由` 或保留 `AI 推荐理由` 但文案必须保守。
- `适合你如果`：可改为 `适合场景` 或 `选择建议`。

要求：

- 卡片高度不变或只做极小调整。
- 文案不要溢出父容器。
- Preview 仍然覆盖 success / error / compact。

## RAG 推荐上下文边界

当前 Product Detail API 没有携带“用户刚才为什么点进来”的 RAG 上下文。

因此第一版：

- 不强行从聊天页把整段 assistant answer 传给详情页。
- 不把 RAG prompt / snippets / full answer 存进详情页 state。
- “AI 推荐理由”只基于商品自身字段生成保守文案。

后续如果要展示“基于你刚才的问题推荐”，另拆 spec，定义从聊天结果到详情页的 recommendation context contract。

## 测试

如果 Android unit test 可用，覆盖：

- `ProductDetailMapper` 会过滤模板亮点。
- `pros` / `recommendWhen` 生成自然推荐理由。
- `cons` / `avoidWhen` 不进入 highlights。
- `attributes["适用人群"]`、`attributes["使用场景"]` 能生成规格卡片。
- 缺少 pros / attributes 时有保守 fallback。
- 美妆类注意事项进入 caution 文案，而不是亮点。
- 长文案不会生成超长 highlight。

如果不新增测试：

- 至少手动用 3-5 个不同类目商品检查详情页文案。
- 运行 Android build。

## 手动验证

建议手测商品：

- 一个美妆护肤商品。
- 一个数码商品。
- 一个食品 / 生活类商品。
- 一个属性较少的商品。

检查：

- 推荐理由不像 “品牌 · 类目，当前可选”。
- 亮点不是模板字段。
- 注意事项没有被放进亮点。
- 规格卡片可读。
- 页面没有文字重叠或溢出。

## 验收标准

- 商品详情页展示更自然的推荐理由、亮点、规格和适用建议。
- `pros`、`recommendWhen` 优先用于正向理由。
- `cons`、`avoidWhen` 优先用于注意 / 谨慎选择。
- `attributes` 被整理为可读规格，不直接暴露内部字段感。
- 模板 seed 文案不会作为亮点直出。
- 不新增 API、不改 RAG、不做购物车、不做远程图片加载。
- Preview 仍可用。
- `cd client/android && .\gradlew.bat build` 通过。
- 如新增 Android unit tests，相关测试通过。
