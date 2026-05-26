# Product Schema

## 概述

在 database foundation 和 product seed data 之后，建立第一版商品结构化主库。目标是让 PostgreSQL 成为商品展示、详情、对比、购物车引用和后续 RAG 回查的唯一结构化事实来源。

本 spec 只做 schema、TypeScript 类型、mapper / repository 和 import 扩展，不实现 HTTP API。

## 范围

本 spec 负责：

- 新增 `products` 和 `product_skus` 表。
- 把 `products.normalized.jsonl` 映射到 PostgreSQL。
- 定义商品业务类型、DB row 类型和 API DTO 的基础类型。
- 扩展 `catalog:import`，从只记录 batch 变成幂等 upsert 商品和 SKU。

不负责：

- 商品列表 / 详情路由，交给 `product-api-spec.md`。
- RAG document 表、embedding 和向量库索引。
- cart / order 表。
- Android 接口接入。

## 数据库表

新增 migration：

- `server/src/lib/db/migrations/0002_products.sql`

`products` 必须支持：

- 主键：`id`，来自 `NormalizedProduct.product_id`
- 展示字段：`name`、`brand`、`category`、`sub_category`、`image_path`、`image_caption`
- 价格字段：`currency`、`base_price_cents`、`price_min_cents`、`price_max_cents`
- 导购字段：`marketing_description`、`knowledge_text`、`rating_avg`
- JSONB 字段：`category_path`、`visual_tags`、`attributes`、`pros`、`cons`、`recommend_when`、`avoid_when`、`compare_with`、`review_summary`、`content_blocks`、`official_faq`、`user_reviews`、`normalized_payload`
- 来源字段：`source_dataset`、`source_version`、`source_type`、`data_version`、`is_desensitized`、`ingest_batch_id`、`source_path`
- 时间字段：`created_at`、`updated_at`

`product_skus` 必须支持：

- 主键：`id`，来自 `NormalizedSku.sku_id`
- 外键：`product_id -> products.id`
- SKU 字段：`properties`、`price_cents`、`currency`、`available`、`stock_level`、`sort_order`
- 时间字段：`created_at`、`updated_at`

价格必须转成 cents 入库，不使用浮点数作为数据库金额字段。

## 索引

第一版至少建立：

- `idx_products_status`
- `idx_products_category`
- `idx_products_sub_category`
- `idx_products_brand`
- `idx_products_price_range`
- `idx_products_ingest_batch`
- `idx_product_skus_product_id`

可选建立 `name` / `marketing_description` 的全文或 trigram 索引，但第一版基础搜索可以先用参数化 `ILIKE`。

## TypeScript 文件

预计新增：

- `server/src/modules/products/product.types.ts`
- `server/src/modules/products/product.mapper.ts`
- `server/src/modules/products/product.repository.ts`

预计修改：

- `server/src/scripts/import-products.ts`

类型边界：

- `ProductRow` / `ProductSkuRow` 表示数据库 row。
- `Product` / `ProductSku` 表示 service 内部领域对象。
- `ProductCardDto` / `ProductDetailDto` 可以先定义在 types 中，供后续 API spec 复用。
- mapper 负责 `NormalizedProduct -> upsert input`、cents 转换、JSONB 字段整理。

## Import 扩展

`catalog:import` 新流程：

- 读取 `products.normalized.jsonl`、`import-manifest.json` 和 validation report。
- strict 模式下 validation error 大于 0 时停止。
- 在同一个 transaction 中记录 `catalog_import_batches` 并 upsert `products` / `product_skus`。
- 同一 `ingest_batch_id` 重跑必须幂等。
- 删除旧 SKU 前必须限定在当前 product id 范围内，不能清空全表。
- 导入完成后输出 product count 和 sku count。

## 映射规则

- `product_id -> products.id`
- `name`、`brand`、`category`、`sub_category` 原样入库。
- `base_price`、`price_range[]` 转为 cents。
- `skus[].price` 转为 cents。
- `review_summary.rating_avg -> rating_avg`
- `source.ingest_batch_id -> ingest_batch_id`
- 原 normalized 商品保留到 `normalized_payload`，方便后续调试和 RAG 重建。

## 验收标准

- migration 可以创建 `products` 和 `product_skus`。
- `catalog:import` 可以导入 175 条 products 和 736 条 SKUs。
- 重复运行 `catalog:import` 不产生重复商品或 SKU。
- `products.ingest_batch_id` 与 manifest 中的 `ingest_batch_id` 一致。
- `product_skus.product_id` 有外键约束。
- 价格字段以 cents 保存。
- `cd server && npm.cmd run build` 通过。
