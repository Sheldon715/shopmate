# Backend Deployment Readiness

## 概述

补齐 ShopMate 后端的课程 demo 部署基础，让后端可以作为公网 HTTPS API 被 Android demo APK 稳定访问。

本 spec 不要求马上完成真实云部署，也不处理生产级运维。它负责把 Express 后端整理到“可以部署、可以健康检查、可以 smoke test、不会泄露密钥”的状态。

如果执行过程中需要真实云平台账号、真实公网域名、真实数据库连接串、Qdrant key、LLM key 或 embedding key，必须停下来问用户，不要硬写、不要编造。

## 范围

本 spec 负责：

- 新增 `GET /api/health`。
- 明确 `PORT` / `HOST` 行为，支持本地 Wi-Fi 和云平台启动。
- 补齐 deployment 相关环境变量和 `.env.example`。
- 增加可选 CORS allowlist，服务后续 Web 调试页或管理页。
- 明确并实现最小商品图片 serving 方案。
- 写一份后端部署 readiness 文档，记录 build / start / migrate / import / index / smoke test。
- 确认日志不会输出真实 key、数据库 URL、Qdrant key、prompt 或 `.env`。

不负责：

- 真实购买云服务器或配置云平台账号。
- 把真实 API key 写入 repo。
- Google Play 上架。
- Android 图片加载 UI。
- RAG 算法优化、query rewrite、rerank。
- 生产级 observability、监控告警、自动扩缩容。
- 正式登录、鉴权、用户隔离。

## 前置条件

先完成：

- `android-runtime-config-spec.md`
- `product-api-spec.md`
- `chat-sse-api-spec.md`
- `rag-chat-service-spec.md`
- `android-cart-api-foundation-spec.md`
- `deployment-readiness-research.md`

当前后端应已有：

- `npm.cmd run build`
- `npm.cmd start`
- `POST /api/chat/stream`
- `GET /api/products/:id`
- `GET /api/cart` 等 cart API
- `.env.example`

## 当前状态

已存在：

- `server/package.json` 中有 `build` 和 `start`。
- `server/src/server.ts` 从 env 读取 `PORT`。
- `server/src/app.ts` 挂载 `/api/chat`、`/api/products`、`/api/cart`。
- `/` 返回基础运行文本。
- `.env.example` 已列出 PostgreSQL、Qdrant、embedding、LLM 和 RAG 变量。

需要补齐：

- 专门的 `GET /api/health`。
- 可选 `HOST` 配置或清楚的 listen 行为说明。
- 可选 CORS allowlist。
- 商品图片公开访问路径。
- 部署 runbook 和 smoke test 命令。

## Health Check

新增：

- `server/src/modules/health/health.routes.ts`
- 如需要，新增 `server/src/modules/health/health.controller.ts`
- 在 `server/src/app.ts` 挂载到 `/api/health`

响应示例：

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "shopmate-api",
    "uptimeSeconds": 123,
    "timestamp": "2026-05-30T00:00:00.000Z"
  }
}
```

要求：

- health check 不依赖 LLM、embedding、Qdrant 或 PostgreSQL。
- health check 不输出任何 env value。
- 云平台 health check path 优先使用 `/api/health`。
- 如果后续要做 readiness endpoint，再另起 `/api/readiness`，不要把本 spec 扩大成全量依赖检查。

## HOST / PORT

修改：

- `server/src/lib/env.ts`
- `server/src/server.ts`
- `.env.example`

建议：

- `PORT` 继续默认 `3000`。
- 新增可选 `HOST`。
- 本地同 Wi-Fi demo 可设置 `HOST=0.0.0.0`。
- 云平台通常只需要平台注入的 `PORT`，`HOST` 可留空。

实现要求：

- `HOST` 为空时保持 Node / 平台默认 listen 行为。
- `HOST` 有值时调用 `app.listen(port, host, callback)`。
- 启动日志只打印 host / port，不打印敏感环境变量。

## CORS Allowlist

Android 原生请求不依赖浏览器 CORS，因此 CORS 不是 Android demo 的 blocker。

但为后续 Web 调试页、文档站 smoke page 或管理页预留：

- 新增 env：`CORS_ALLOWED_ORIGINS`
- 多个 origin 用逗号分隔。
- 为空时不额外开放 CORS。

实现方案：

- 可以使用 `cors` package。
- 如果安装依赖，需要同步更新 `server/package.json` 和 lockfile。
- 只允许精确匹配 allowlist 中的 origin。
- 不要在带 credential 的 API 上无脑使用 `*`。
- 当前没有 auth / cookie 时，先不要开启 credentials。

建议新增：

- `server/src/middleware/cors.ts`
- `server/src/middleware/cors.test.ts`

## Static Product Images

目标：

- 后端能服务当前脱敏商品数据里的图片文件。
- Android 后续可以通过 `imagePath` / `imageUrl` 加载真实或占位图片。
- 不暴露 raw data JSON、`.env` 或其他非图片文件。

当前数据形态：

- normalized catalog 中的 `image_path` 通常类似：
  - `beauty/images/p_beauty_001_main.jpg`
  - `office_study/images/p_office_storage_004_main.jpg`

推荐最小方案：

- 新增公开前缀：`/images/products/`
- 新增 env：
  - `SHOPMATE_STATIC_IMAGE_ROOT`
  - 默认指向项目内 `data/raw/ecommerce_agent_dataset_v3`
  - `PUBLIC_IMAGE_BASE_URL` 可选，用于未来 CDN 或对象存储

服务规则：

- 只允许访问形如 `{category}/images/{filename}` 的图片路径。
- 拒绝 `..`、绝对路径、非 `images` 目录、非图片扩展名。
- 支持常见扩展名：`.jpg`、`.jpeg`、`.png`、`.webp`。
- 找不到文件返回 404，不暴露本机绝对路径。

建议新增：

- `server/src/modules/images/image.routes.ts`
- `server/src/modules/images/image.service.ts`
- `server/src/modules/images/image.service.test.ts`

Product DTO 处理：

- `product.mapper.ts` 中的 `imagePath` 应变成 Android 可访问路径。
- 如果原始 `imagePath` 已是 `http://` 或 `https://`，直接保留。
- 如果 `PUBLIC_IMAGE_BASE_URL` 存在，返回绝对 URL。
- 否则返回相对公开路径，例如：
  - `/images/products/beauty/images/p_beauty_001_main.jpg`

不要在 Android UI 层猜 raw data 目录。

## 环境变量

`.env.example` 补充或确认：

```text
NODE_ENV=development
PORT=3000
HOST=
LOG_LEVEL=info
CORS_ALLOWED_ORIGINS=

SHOPMATE_STATIC_IMAGE_ROOT=./data/raw/ecommerce_agent_dataset_v3
PUBLIC_IMAGE_BASE_URL=
```

保持已有敏感变量为空示例：

- `DATABASE_URL`
- `QDRANT_API_KEY`
- `EMBEDDING_API_KEY`
- `LLM_API_KEY`
- `JWT_SECRET`（如果后续 auth 启用）

规则：

- `.env.example` 只能放示例值。
- 不修改或提交真实 `.env`。
- 不把真实 key 写入 docs、截图、平台日志或 Android BuildConfig。

## 部署 Readiness 文档

新增：

- `docs/backend-deployment-readiness.md`

至少包含：

- 本地启动：
  - `cd server && npm.cmd run dev`
  - `HOST=0.0.0.0` 的本地 Wi-Fi 用法说明。
- production build / start：
  - `npm ci`
  - `npm run build`
  - `npm start`
- 数据准备：
  - `npm run db:migrate`
  - `npm run catalog:import`
  - `npm run rag:documents`
  - `npm run rag:index`
- smoke test：
  - `GET /api/health`
  - `GET /api/products?limit=1`
  - `GET /api/products/:id`
  - `POST /api/chat/stream`
  - `GET /api/cart`
- 云平台待用户提供项：
  - API URL
  - PostgreSQL URL
  - Qdrant URL / key
  - LLM / embedding provider key

文档中不写真实密钥。

## 文件

预计新增：

- `server/src/modules/health/health.routes.ts`
- `server/src/modules/health/health.routes.test.ts`
- `server/src/modules/images/image.routes.ts`
- `server/src/modules/images/image.service.ts`
- `server/src/modules/images/image.service.test.ts`
- `server/src/middleware/cors.ts`（如果实现 CORS）
- `server/src/middleware/cors.test.ts`（如果实现 CORS）
- `docs/backend-deployment-readiness.md`

预计修改：

- `server/src/app.ts`
- `server/src/server.ts`
- `server/src/lib/env.ts`
- `server/src/modules/products/product.mapper.ts`
- `.env.example`
- `server/package.json` / lockfile（如果新增 `cors`）

不修改：

- Android 代码。
- RAG 检索逻辑。
- LLM prompt。
- 真实 `.env`。

## 运行与验证

必须运行：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

建议本地 smoke：

```powershell
cd server
npm.cmd run dev
```

然后另开终端：

```powershell
curl.exe http://localhost:3000/api/health
curl.exe "http://localhost:3000/api/products?limit=1"
curl.exe http://localhost:3000/images/products/beauty/images/p_beauty_001_main.jpg --output NUL
```

Chat SSE smoke：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"message\":\"推荐一款适合通勤的耳机\",\"topK\":5,\"maxRecommendedProducts\":3}" http://localhost:3000/api/chat/stream
```

如果真实 provider key、数据库或 Qdrant 不可用：

- 不编造通过结果。
- 在 `docs/backend-deployment-readiness.md` 中记录 blocker。
- 停下来请用户提供所需服务或确认跳过真实云 smoke。

## 完成标准

- `GET /api/health` 可用，且不依赖外部 provider。
- `PORT` / `HOST` 行为明确，本地 Wi-Fi demo 有配置说明。
- `.env.example` 包含 deployment 需要的非敏感变量。
- CORS allowlist 可选、可控，没有无脑开放 credential wildcard。
- Product API / Chat product card 返回的图片路径可被后端公开访问，或明确返回绝对 HTTPS URL。
- 部署 readiness 文档包含 build、start、migration、import、index、smoke test。
- `npm.cmd test` 和 `npm.cmd run build` 通过，或记录真实失败原因。
- 没有真实 API key、数据库 URL、Qdrant key、JWT secret、prompt 或 `.env` 泄露到 repo。
