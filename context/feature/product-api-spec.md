# Product API

## 概述

在 `product-schema-spec.md` 完成后，实现第一版商品查询 API。目标是让 Android、后续 RAG 回查和购物车引用都从 PostgreSQL 读取商品展示数据，不再依赖 mock data 或 raw JSON。

本 spec 只做商品列表、详情和基础搜索 / 筛选接口，不实现 RAG、购物车或 Android 接入。

## 范围

本 spec 负责：

- 新增 products 模块的 routes / controller / service 查询链路。
- 实现商品列表接口，支持关键词、类目、品牌、价格范围过滤。
- 实现商品详情接口。
- 使用统一 `ApiResponse<T>` 返回格式。
- 对 query params 和 path params 做输入校验。

不负责：

- 商品导入和表结构，已由 `product-schema-spec.md` 处理。
- 向量检索、RAG 排序和 LLM 回复。
- 购物车加购。
- Android 网络层接入。

## 接口

### `GET /api/products`

返回商品卡片列表。

Query params：

- `q`：关键词，匹配商品名、品牌、类目、二级类目和描述。
- `category` / `subCategory` / `brand`：精确过滤。
- `minPriceCents` / `maxPriceCents`：整数价格范围。
- `limit` / `offset`：分页，`limit` 默认 20，最大 50。

默认只返回 `status = active` 或当前数据集中可展示的商品。排序第一版保持稳定即可，例如 `name ASC, id ASC`；RAG 排序不在本 spec。

### `GET /api/products/:id`

返回单个商品详情。不存在时返回 `404 PRODUCT_NOT_FOUND`。

## 返回结构

所有 JSON API 使用 `context/coding-standards.md` 里的 `ApiResponse<T>` 格式。

列表项 `ProductCardDto` 至少包含：`id`、`name`、`brand`、`category`、`subCategory`、`priceCents`、`priceRangeCents`、`currency`、`imagePath`、`ratingAvg`、`tags`、`available`。

详情 `ProductDetailDto` 在卡片字段基础上增加：`marketingDescription`、`skus`、`attributes`、`pros`、`cons`、`recommendWhen`、`avoidWhen`、`reviewSummary`、`officialFaq`、`contentBlocks`。

## 文件

预计新增：

- `server/src/modules/products/product.routes.ts`
- `server/src/modules/products/product.controller.ts`
- `server/src/modules/products/product.service.ts`

复用或扩展：

- `server/src/modules/products/product.types.ts`
- `server/src/modules/products/product.repository.ts`
- `server/src/app.ts`

如项目还没有统一 response helper，可以新增轻量 helper；不要为了本 spec 引入大型框架。

## 实现规则

- controller 只处理 HTTP 参数、状态码和错误映射。
- service 负责组合查询条件和 DTO 转换。
- repository 只访问 PostgreSQL，必须使用参数化 SQL。
- 不在 API 中读取 `data/raw/` 或 `data/processed/`。
- 不从向量库返回价格、库存、图片等商品事实。
- `limit`、`offset`、价格参数必须校验并限制范围。
- `subCategory` 使用 camelCase query param，数据库字段仍为 `sub_category`。

## 错误

- 参数非法：`400 INVALID_PRODUCT_QUERY`
- 商品不存在：`404 PRODUCT_NOT_FOUND`
- 服务端异常：`500 INTERNAL_ERROR`

错误信息可以中文展示，但 error code 必须稳定，方便 Android 和后续测试判断。

## 验收标准

- `GET /api/products` 返回统一格式和商品卡片字段。
- `GET /api/products?q=防晒` 能返回匹配商品。
- `GET /api/products?category=数码电子&maxPriceCents=50000` 能按条件过滤。
- `GET /api/products/:id` 返回详情字段和 SKU 列表。
- 不存在的 id 返回 `404 PRODUCT_NOT_FOUND`。
- API 查询只从 PostgreSQL 读取商品数据。
- `cd server && npm.cmd run build` 通过。
