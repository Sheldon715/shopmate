# 数据库工具 Research

## Output

`docs/database-tooling-research-results.md`

## Research

调查 ShopMate Phase 1 的数据库工具链选择，给出后端数据层的最小可落地方案。

当前后端只有 Node.js + TypeScript + Express 的最小 scaffold，没有数据库依赖；商品数据已经放入 `data/raw/`，其中 `ecommerce_agent_dataset_v3` 是队友整理后的增强版数据，导师原始数据仍然保留。研究要解决数据库选型、迁移、导入、清洗、验证和环境变量规划，不要直接进入 schema 编码实现。

本次 research 要回答：

- Phase 1 更适合 `pg` + SQL migrations，还是轻量 ORM / query builder（例如 Prisma、Drizzle、Kysely、Knex）？
- 哪种方案在当前数据规模下最省心，且以后接 RAG、商品 API 和购物车 API 时最不容易返工？
- `data/raw/`、`data/processed/`、PostgreSQL 表、导入脚本和重建脚本应该怎么分工？
- 导师原始数据与队友整理的 `v3` 数据应该如何处理：哪个作为 canonical source，是否需要合并、去重、补字段、记录 `source_version`？
- `server/src/scripts/` 里最少应该有哪些脚本：import、seed、validate、reset / rebuild。
- 需要哪些环境变量和 `.env.example` 字段。
- 数据库 schema 需要为后续 `product`、`sku`、`cart`、`chat` 扩展预留哪些字段。
- 如果选定 ORM / query builder，理由是什么；如果不选，为什么原生 `pg` 更适合。

## Include

### 当前现状

- `server/package.json`
- `server/src/app.ts`
- `server/src/server.ts`
- `server/tsconfig.json`
- `context/project-overview.md`
- `context/coding-standards.md`
- `context/ai-interaction.md`
- `context/spec-implementation-order.md`
- `data/raw/ecommerce_agent_dataset_v3/README.md`
- `data/raw/ecommerce_agent_dataset_v3/dataset_summary.json`
- `data/raw/` 下现有导师原始数据目录，如果存在也要一起看

### 必须分析的决策维度

- 依赖重量和维护成本
- TypeScript strict mode 兼容性
- migration / rollback / reset 的可操作性
- seed / import / validate 脚本的写法
- 对 `products`、`categories`、`skus`、`images`、`attributes`、未来 RAG 字段的表达能力
- 写测试和写脚本的难易度
- 对几百条商品数据规模的适配度
- 如何表达 `source_type`、`data_version`、脱敏标记和导入来源

### 输出要求

- 给出一个明确推荐：主方案 + 备选方案
- 解释为什么当前不选其他方案
- 给出 Phase 1 最小工具链建议
- 给出最小脚本集和目录布局建议
- 说明如何处理导师原始数据和 `v3` 数据
- 列出风险，以及下一步该拆哪些 spec，例如 `database-foundation-spec.md`、`product-seed-data-spec.md`、`product-schema-spec.md`、`product-api-spec.md`

### 研究约束

- 只写研究文档，不改源码
- 重点看官方文档和本地仓库文件
- 如果需要第三方资料，优先用 Context7 MCP 查官方文档
- 不要假设已经必须上 ORM，也不要默认一定要手写 SQL，必须基于本项目现状给结论

## Sources

- `@context/project-overview.md`
- `@context/coding-standards.md`
- `@context/ai-interaction.md`
- `@context/spec-implementation-order.md`
- `@server/package.json`
- `@server/src/app.ts`
- `@server/src/server.ts`
- `@server/tsconfig.json`
- `@data/raw/ecommerce_agent_dataset_v3/README.md`
- `@data/raw/ecommerce_agent_dataset_v3/dataset_summary.json`
- `@data/raw/`
- `Context7 MCP`
- 必要时官方文档：PostgreSQL、Node.js、Express、`pg`、Prisma、Drizzle、Kysely、Knex
