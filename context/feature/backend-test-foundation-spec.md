# Backend Test Foundation

## 概述

把后端测试脚本从占位命令升级为可运行的 Vitest 测试地基。目标不是立刻追求高覆盖率，而是在 RAG / SSE 铺开前先把最容易回归的纯函数、mapper、参数校验和 response helper 固定住。

当前后端已经有 catalog pipeline、product mapper / service / API response helper 等稳定可测逻辑，适合开始补第一批轻量测试。

## 范围

本 spec 负责：

- 接入 Vitest。
- 新增最小测试配置。
- 把 `server/package.json` 的 `test` 从占位命令改成真实测试命令。
- 增加第一批不依赖真实 PostgreSQL / LLM / 向量库的单元测试。
- 同步更新 feature skill 的测试说明。

不负责：

- 大规模覆盖率目标。
- 真实 PostgreSQL integration test。
- Android UI / network 测试。
- RAG 质量评估测试，交给 `rag-evaluation-spec.md`。
- E2E 测试框架。

## 文件

预计新增：

- `server/vitest.config.ts`
- `server/src/modules/products/product.mapper.test.ts`
- `server/src/modules/products/product.service.test.ts`
- `server/src/types/api-response.test.ts`
- 可选：`server/src/lib/catalog/catalog-pipeline.test.ts`

预计修改：

- `server/package.json`
- `.agents/skills/feature/actions/test.md`
- 如有必要，`context/coding-standards.md` 或 `context/spec-implementation-order.md` 中关于后端测试的说明。

## 依赖与命令

新增 dev dependency：

- `vitest`

`server/package.json` 脚本：

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Windows 默认命令：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

## 第一批测试

### Product Mapper

覆盖：

- `moneyToCents` 正常转换，例如 `199.99 -> 19999`。
- `moneyToCents` 拒绝负数、`NaN` 和无限值。
- `mapNormalizedProductToUpsertInput` 能把价格、SKU、source metadata 和 JSONB 字段映射出来。
- `mapProductToCardDto` 能正确生成卡片字段和 `available`。
- `mapProductToDetailDto` 能保留详情字段。

### Product Service 参数校验

覆盖：

- `parseProductListQuery({})` 生成默认 `limit=20`、`offset=0`。
- `limit` 大于 50 或小于 1 时抛 `ProductQueryError`。
- 非整数价格参数抛 `ProductQueryError`。
- `minPriceCents > maxPriceCents` 抛 `ProductQueryError`。
- `parseProductIdParam` 拒绝空 id。

不要在这批测试中调用真实 `listProducts` / `getProductDetail` 数据库路径。

### API Response Helper

覆盖：

- `ok(data)` 返回 `{ success: true, data }`。
- `fail(code, message)` 返回稳定 error code 和 message。

### Catalog Pipeline（可选）

如果 fixture 准备成本低，可以补：

- normalized JSONL 读写 helper。
- validation report 对 0 errors 的判断。

如果需要大量 raw fixture，就先不做，避免测试地基变成数据工程任务。

## 实现规则

- 测试优先使用小型 inline fixture，不复制整份商品数据。
- 不在测试中读取真实 `.env`、连接真实 PostgreSQL、调用模型 API 或向量库。
- 测试文件放在被测文件旁边，使用 `*.test.ts`。
- 只测试公共导出函数；如果私有 helper 很重要，先通过公共函数覆盖。
- 不为了测试暴露不合理 API；但可以把确实稳定、值得复用的 helper 导出。
- 测试输出应能在 Windows PowerShell 下通过 `npm.cmd test` 运行。

## Feature Skill 同步

`.agents/skills/feature/actions/test.md` 需要更新为：

- 后端代码变更：先运行 `cd server && npm.cmd run build`。
- 如果 Vitest 已配置：再运行 `cd server && npm.cmd test`。
- docs-only 变更不要求跑 Vitest。
- 如果测试失败，记录失败命令和关键错误，不要把失败伪装成通过。

## 验收标准

- `server/package.json` 有真实 `test` 命令。
- `npm.cmd test` 会运行 Vitest，而不是输出占位文本。
- 第一批 product mapper / service query / API response helper 测试通过。
- 测试不依赖真实 PostgreSQL、LLM API、embedding API 或向量库。
- `cd server && npm.cmd test` 通过。
- `cd server && npm.cmd run build` 通过。
- feature skill 的 test action 不再说后端测试只能跳过。
