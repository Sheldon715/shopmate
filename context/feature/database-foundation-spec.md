# Database Foundation

## 概述

这是 Phase 1 的数据库地基 spec。目标不是先堆 ORM，而是把 PostgreSQL、`pg`、纯 SQL migrations、数据导入入口和 provenance 约定先稳定下来，方便后续 `product-seed-data-spec.md`、`product-schema-spec.md` 和 `product-api-spec.md` 继续往上接。

当前阶段的主方案是 `pg` + SQL migrations + 少量 TypeScript helper。Drizzle 只作为未来备选，不进入主线。

## 范围

本 spec 只做数据库基础设施，不做完整商品业务表和 API：

- 做 PostgreSQL 连接池和环境变量加载
- 做 SQL migration 目录和执行器
- 做原始数据到 processed 数据的规范化 / 校验 / 导入脚本入口
- 做导入批次和来源溯源的基础记录
- 预留后续 product / sku / cart / chat 扩展位

不做：

- Prisma / Kysely / Knex 主路径接入
- product API
- cart API
- chat API
- RAG / 向量库接入

## 需求

- 使用 PostgreSQL 作为运行时主库。
- 使用 `pg` 的连接池作为数据库访问主入口。
- 使用纯 SQL migrations 维护 schema 版本。
- 增加一个轻量的数据库初始化与迁移执行层。
- `data/raw/` 保持原始输入不变，`data/processed/` 只放导入前后的派生工件。
- 当前阶段以 `ecommerce_agent_dataset_v3` 作为 canonical source；导师原始数据保留为参考、对照和 lineage 来源。
- 对同一商品或同一来源记录，当前导入默认采用 `v3`；如回看导师原始数据，必须显式标记为参考来源，并保留 lineage。
- 所有导入都要带 batch / source metadata，方便回溯和重建。
- 脚本要支持 dry-run 和 strict 模式。

## 文件

预计新增 / 修改：

- `server/src/lib/db/pool.ts`
- `server/src/lib/db/migrate.ts`
- `server/src/lib/db/migrations/0001_init.sql`
- `server/src/lib/env.ts`
- `server/src/scripts/normalize-products.ts`
- `server/src/scripts/validate-products.ts`
- `server/src/scripts/import-products.ts`
- `server/src/scripts/migrate-db.ts`
- `server/src/scripts/rebuild-db.ts`
- `server/src/scripts/seed-dev.ts`（可选，后续小型 demo fixture 再补）
- `server/package.json`

## 数据策略

### 原始数据

- `data/raw/ecommerce_agent_dataset_v3/`：队友整理后的增强版数据，作为 Phase 1 当前主输入和 canonical source。
- `data/raw/ecommerce_agent_dataset/`：导师原始数据，保留为参考、对照和 lineage 来源。
- 原始 JSON、图片和目录结构都要保留，不要手工改写成另一份人工 catalog。

### 处理后数据

`data/processed/` 只放派生工件，建议至少包含：

- `catalog/products.normalized.jsonl`
- `catalog/import-manifest.json`
- `catalog/validation-report.json`
- `catalog/duplicate-report.json`

### 来源字段

处理和导入流程要记录这些信息：

- `source_dataset`
- `source_version`
- `source_type`
- `data_version`
- `is_desensitized`
- `ingest_batch_id`
- `source_path`

## 数据库基础表

本 spec 先建立基础表，不展开完整 product 业务模型：

- `schema_migrations`：记录 SQL migration 版本
- `catalog_import_batches`：记录每次导入的来源、状态、数量、错误数和时间

`catalog_import_batches` 至少应保留：

- `id`
- `source_dataset`
- `source_version`
- `data_version`
- `source_path`
- `dry_run`
- `status`
- `raw_item_count`
- `processed_item_count`
- `error_count`
- `started_at`
- `finished_at`
- `notes`

## 脚本

### `normalize-products.ts`

- 读取 `data/raw/ecommerce_agent_dataset_v3/` 作为默认主输入
- 保留导师原始数据的参考和 lineage 对照空间，但默认不从旧数据集生成 catalog
- 如后续合并导师原始数据与 `v3`，必须记录来源优先级和字段覆盖规则
- 去重
- 生成标准化的 `jsonl` 或等价导入清单
- 不直接写业务表

### `validate-products.ts`

- 校验 schema、必填字段、重复 `product_id` / `sku_id`
- 校验价格、类目、图片路径和来源字段
- 输出 validation report

### `import-products.ts`

- 读取 processed 清单
- 使用事务写入数据库
- 支持 dry-run
- 支持重跑时幂等处理
- 记录 import batch

### `rebuild-db.ts`

- 重新跑 migrations
- 重新 normalize / validate / import
- 让本地数据库可以一键回到可演示状态

## 环境变量

本地 `.env` 至少要有；本次不提交 `.env.example`：

- `PORT`
- `DATABASE_URL`
- `NODE_ENV`
- `LOG_LEVEL`
- `SHOPMATE_RAW_DATA_DIR`
- `SHOPMATE_PROCESSED_DATA_DIR`
- `IMPORT_DRY_RUN`
- `IMPORT_STRICT`

## 代码约定

- 数据库访问统一走一个共享 `Pool`
- migration 只管 DDL，不夹带大批量商品数据
- seed 只放小型稳定 demo fixture，不混进完整 catalog
- import / validate / rebuild 都必须输出清晰日志
- 严禁把真实密钥、连接串、JWT Secret 写进代码或文档

## 验收标准

- `cd server && npm run build` 通过
- 可以通过一个命令初始化数据库基础结构
- 可以生成 processed 数据清单和校验报告
- 可以记录每次导入批次和来源
- `data/raw/` 不被改写
- `data/processed/` 中有规范化输出
- 不引入 Prisma / Kysely / Knex 主线依赖
- 不泄露任何真实密钥或连接串

## 下一步

这个 spec 完成后，再继续拆：

1. `product-seed-data-spec.md`
2. `product-schema-spec.md`
3. `product-api-spec.md`
