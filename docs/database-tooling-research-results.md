# 数据库工具 Research 结果

## 结论

Phase 1 主方案：`pg` + 纯 SQL migrations + 少量 TypeScript helper。  
备选方案：`Drizzle ORM`，只在团队明确需要类型安全 query builder、并愿意承担额外 schema/migration 工具时再上。  
不建议 Phase 1 直接选 `Prisma`、`Kysely` 或 `Knex` 作为主线。

当前仓库的事实很清楚：

- `server/src` 里只有 `app.ts` 和 `server.ts`，后端还只是 Express scaffold。
- `server/package.json` 只有 `express`，没有任何数据库依赖。
- `server/tsconfig.json` 已启用 `strict: true`，所以类型边界要清晰，但不代表一定要先上 ORM。
- 原始数据集有 100 个商品 JSON，`v3` 有 175 个商品 JSON，规模还在“手写 SQL 完全够用”的区间。
- `v3` 已经包含更完整的商品、SKU、内容块、评论摘要和验证信息，Phase 1 的主要任务是把这批数据稳妥导入并可重建，而不是先搭一个厚 ORM 层。

## 为什么是 `pg` + SQL

1. 最小依赖重量。现在最缺的是数据库连接、迁移和导入脚本，不是复杂对象映射。
2. 更适合 import / reset / rebuild。商品导入、验证、重建和回滚都更像数据工程任务，直接 SQL 最容易做成幂等流程。
3. 对后续 RAG / 商品 API / 购物车 API 更少阻力。后面会频繁写筛选、聚合、事务、回查和快照写入，raw SQL 最不容易和这些需求打架。
4. 更符合当前数据形态。商品数据已经是“结构化主字段 + 嵌套属性 + 多 SKU + 内容块”的混合形态，SQL + 少量 JSONB 比先套一层 ORM 更自然。

`node-postgres` 的官方用法也支持这个思路：常规查询走单个 `Pool`，事务则显式 `pool.connect()` / `BEGIN` / `COMMIT` / `ROLLBACK`。这正适合本项目的导入脚本和后续仓储层。

## 方案对比

| 方案 | 适配度 | 备注 | 结论 |
| --- | --- | --- | --- |
| `pg` + SQL migrations | 最高 | 依赖最少，导入/回重建最直接，SQL 控制最完整 | 主方案 |
| Drizzle | 高 | SQL-first，类型安全，比 Prisma 轻；还能保留自写 SQL | 备选 |
| Prisma | 中 | 生成客户端、迁移和 Studio 很完整，但对当前小规模 catalog 偏重 | 暂缓 |
| Kysely | 中 | 查询层很强、几乎无负担，但迁移还是要另配工具 | 暂缓 |
| Knex | 中低 | 成熟、能做迁移，但在 strict TS 下不如前面几项顺手 | 不选 |

### 为什么暂不选 Prisma

- Prisma 的 schema-first + generated client 很强，但现在的瓶颈不是“缺少高级 ORM 能力”，而是“先把数据导入和重建做稳”。
- 这个阶段仍然要写导入脚本、验证脚本和重建脚本，Prisma 不会替你消灭这些工作，只会再加一层 schema/client/codegen 的同步成本。
- 如果后面 product/cart/chat 的模型稳定下来，Prisma 仍然可以再评估，但现在不是最省心的起点。

### 为什么暂不选 Kysely

- Kysely 的 query builder 很优秀，而且官方也支持 optional migrations。
- 但它本质上更像“查询层的精致工具”，迁移和数据重建仍然需要单独设计。
- 对 Phase 1 来说，这会把工具链拆成两段，反而不如 `pg + SQL` 一步到位。

### 为什么暂不选 Knex

- Knex 的迁移和事务能力足够用。
- 但这个仓库强调 strict TypeScript，Knex 在类型体验上不如 Drizzle / Kysely，收益不够大。
- 在这个项目里，它更像一个“能用但不最优”的折中。

## 最小工具链

建议 Phase 1 先固定成这条链：

1. `pg` 连接池。
2. 纯 SQL migrations。
3. `zod` 或等价输入校验。
4. `data/processed` 里的标准化导入清单。
5. `server/src/scripts/` 里的 import / validate / seed / reset 脚本。
6. PostgreSQL 作为运行时主库，`data/raw` 只做源数据留档。

推荐原则：

- migration 只管 DDL，不塞商品数据。
- seed 只放稳定的 demo fixture，不放完整 catalog。
- import 专门负责 catalog ingestion。
- rebuild = migrate + import + validate + 可选 seed。

## 数据分工

### `data/raw/`

只放原始输入，保持不可变：

- `ecommerce_agent_dataset/`：导师原始数据。
- `ecommerce_agent_dataset_v3/`：队友整理后的增强版数据。
- 原始图片、原始 JSON、原始目录结构都保留，不要手工改写。

### `data/processed/`

只放导入前后的派生工件，不作为人工编辑区。建议至少保留：

- `catalog/products.normalized.jsonl`
- `catalog/products.validation-report.json`
- `catalog/import-manifest.json`
- `catalog/duplicate-report.json`

### PostgreSQL

作为运行时主库，保存：

- 商品结构化查询数据
- SKU 变体
- 导入批次和来源信息
- 后续 cart / chat 的业务数据

### `server/src/scripts/`

只放命令型脚本，不放业务逻辑大杂烩。

## Canonical source 策略

当前实现决策已经调整：`ecommerce_agent_dataset_v3/` 已完整，Phase 1 以 `v3` 作为 canonical source。

原因是 `v3` 已经包含 175 条商品、7 个品类、统一英文目录、完整 SKU、内容块、评论摘要和验证信息，更适合作为后续 Product Schema / RAG / API 的稳定输入。导师原始数据 `ecommerce_agent_dataset/` 保留为参考、对照和 lineage 来源，不再作为默认导入基准。

正确做法是：

1. 以 `product_id` 作为稳定主键。
2. 以 `v3` 记录作为当前导入基准。
3. 导师原始数据只用于参考、校验和 lineage 对照。
4. 如果同一商品在两边都存在，当前默认优先 `v3`；任何回填旧数据字段都必须显式记录规则。
5. 在 processed manifest 和数据库里记录 provenance，而不是复制两份 catalog。

建议记录的来源字段：

- `source_dataset`：`ecommerce_agent_dataset` / `ecommerce_agent_dataset_v3`
- `source_version`：`original` / `v3`
- `data_version`：内部规范版本，例如 `catalog_v1`
- `source_type`：如 `synthetic_desensitized`
- `is_desensitized`：布尔标记
- `ingest_batch_id`：本次导入批次
- `source_path`：原始文件路径

## 最小脚本集

建议 `server/src/scripts/` 至少有这 5 个：

1. `normalize-products.ts`
   - 读 `data/raw`
   - 合并字段
   - 去重
   - 输出 `data/processed` 的标准化清单

2. `validate-products.ts`
   - 校验 schema
   - 检查重复 `product_id` / `sku_id`
   - 检查价格、类目、图片路径、来源字段
   - 生成校验报告

3. `import-products.ts`
   - 读 processed 清单
   - 事务化写入 PostgreSQL
   - 支持 upsert
   - 支持分批导入

4. `seed-dev.ts`
   - 只放稳定 demo fixture
   - 不重复导入 catalog
   - 例如后续的 demo user、默认设置、测试会话

5. `reset-db.ts` / `rebuild-db.ts`
   - 清空目标表
   - 重新跑 migrations
   - 重新 import
   - 必要时再 seed

`import-products.ts` 和 `rebuild-db.ts` 应该是最重要的两个命令：前者负责日常导入，后者负责把数据库一键拉回可演示状态。

## `.env.example` 建议

Phase 1 建议只放真正会用到的变量，不要提前把 Qdrant / LLM / Embedding 全塞进去。

| 变量 | 用途 | 建议 |
| --- | --- | --- |
| `PORT` | Express 监听端口 | 必需 |
| `DATABASE_URL` | PostgreSQL 连接串 | 必需 |
| `NODE_ENV` | 开发 / 测试 / 生产分支 | 必需 |
| `LOG_LEVEL` | 日志级别 | 建议 |
| `SHOPMATE_RAW_DATA_DIR` | 原始数据根目录 | 建议 |
| `SHOPMATE_PROCESSED_DATA_DIR` | processed 输出目录 | 建议 |
| `IMPORT_DRY_RUN` | 仅校验不落库 | 建议 |
| `IMPORT_STRICT` | 校验失败即退出 | 建议 |

后续 Phase 2 / 3 再补：

- `QDRANT_URL`
- `QDRANT_API_KEY`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `EMBEDDING_BASE_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`

## 需要预留的 schema 字段

### Product

建议至少预留这些字段：

- `id` / `product_id`：稳定文本主键
- `title`
- `brand`
- `category`
- `sub_category`
- `status`
- `price_cents`
- `price_min_cents`
- `price_max_cents`
- `currency`
- `image_path`
- `image_caption`
- `tags`
- `search_text`
- `source_type`
- `source_dataset`
- `source_version`
- `data_version`
- `ingest_batch_id`
- `attributes` (`jsonb`)
- `pros_cons` (`jsonb`)
- `decision_factors` (`jsonb`)
- `review_summary` (`jsonb`)
- `raw_payload` (`jsonb`)
- `created_at`
- `updated_at`
- `deleted_at`

### SKU

- `sku_id`
- `product_id`
- `properties` (`jsonb`)
- `price_cents`
- `currency`
- `available`
- `stock_level`
- `sort_order`
- `source_version`

### Cart

后面再建表，但字段最好提前想好：

- `cart_id`
- `user_id`
- `status`
- `currency`
- `created_at`
- `updated_at`

`cart_items` 需要保留快照字段，避免商品改价后污染历史购物车：

- `product_id`
- `sku_id`
- `quantity`
- `unit_price_cents_snapshot`
- `title_snapshot`
- `image_snapshot`
- `sku_snapshot`
- `metadata`

### Chat

建议提前预留：

- `session_id`
- `user_id`
- `title`
- `context_summary`
- `role`
- `message_type`
- `content`
- `tool_name`
- `tool_payload`
- `tool_result`
- `product_cards`
- `metadata`
- `created_at`

## 风险

1. 过早引入 ORM。
   会把本来很简单的 Phase 1 变成 schema / client / migration / codegen 四套同步问题。

2. 原始数据和 `v3` 数据被当成两套主 catalog。
   容易重复计数、重复导入、重复检索。

3. price 继续用浮点数。
   购物车、订单和对比页后面会被精度问题咬住。

4. import、validate、seed 混在一起。
   重建时很难判断是数据问题还是脚本问题。

5. schema 只存展示字段，不存来源和快照字段。
   后面 cart / chat / RAG 一接进来就会返工。

## 下一步应拆的 spec

建议后续按这个顺序拆：

1. `database-foundation-spec.md`
2. `product-seed-data-spec.md`
3. `product-schema-spec.md`
4. `product-api-spec.md`

如果 Phase 1 要继续往下推进，数据库 foundation spec 应该先把迁移目录、连接池封装、数据导入脚本入口和 `.env.example` 定死，再进入 product schema 和 API。

## 参考资料

### 本地文件

- `context/project-overview.md`
- `context/coding-standards.md`
- `context/ai-interaction.md`
- `context/spec-implementation-order.md`
- `server/package.json`
- `server/src/app.ts`
- `server/src/server.ts`
- `server/tsconfig.json`
- `data/raw/ecommerce_agent_dataset/`
- `data/raw/ecommerce_agent_dataset_v3/README.md`
- `data/raw/ecommerce_agent_dataset_v3/dataset_summary.json`

### 官方文档

- [node-postgres](https://node-postgres.com/)
- [Prisma ORM](https://www.prisma.io/docs/orm)
- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate)
- [Prisma Client](https://www.prisma.io/docs/orm/prisma-client)
- [Drizzle ORM migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle ORM custom migrations / seed](https://orm.drizzle.team/docs/kit-custom-migrations)
- [Kysely](https://www.kysely.dev/)
- [Knex.js](https://knexjs.org/)
- [PostgreSQL docs](https://www.postgresql.org/docs/current/)
