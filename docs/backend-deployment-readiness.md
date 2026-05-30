# 后端部署 Readiness Runbook

本文档记录 ShopMate 后端进入课程 demo 部署前需要确认的最小步骤。目标是让 Android demo APK 能访问一个稳定的 HTTPS API，同时保留本地同 Wi-Fi 备用演示方式。

## 本地开发启动

```powershell
cd server
npm.cmd install
npm.cmd run dev
```

默认端口是 `3000`。模拟器可通过 Android debug 配置访问 `http://10.0.2.2:3000/`。

真机同 Wi-Fi 调试时，先确认电脑和手机在同一网络，然后让后端监听所有网卡：

```powershell
$env:HOST="0.0.0.0"
$env:PORT="3000"
cd server
npm.cmd run dev
```

Android debug base URL 使用电脑局域网 IP，例如 `http://192.168.x.x:3000/`。不要把局域网 IP 写死进 demo / release 代码。

## Production Build / Start

```powershell
cd server
npm.cmd ci
npm.cmd run build
npm.cmd start
```

云平台通常会注入 `PORT`，`HOST` 可以留空，让 Node 使用平台默认 listen 行为。只有本地 Wi-Fi 或特定平台要求时再设置 `HOST=0.0.0.0`。

## 环境变量

必需或常用变量：

```text
NODE_ENV=production
PORT=<platform-provided-port>
HOST=
LOG_LEVEL=info
CORS_ALLOWED_ORIGINS=

DATABASE_URL=<provided-by-deployment-env>
QDRANT_URL=<provided-by-deployment-env>
QDRANT_API_KEY=<provided-by-deployment-env>
EMBEDDING_BASE_URL=<provided-by-deployment-env>
EMBEDDING_API_KEY=<provided-by-deployment-env>
EMBEDDING_MODEL=<provider-model>
LLM_BASE_URL=<provided-by-deployment-env>
LLM_API_KEY=<provided-by-deployment-env>
LLM_MODEL=<provider-model>

SHOPMATE_STATIC_IMAGE_ROOT=./data/raw/ecommerce_agent_dataset_v3
PUBLIC_IMAGE_BASE_URL=
```

规则：

- 真实密钥、数据库 URL、Qdrant key、LLM key、embedding key 只能放部署平台环境变量或本地 `.env`。
- 不提交真实 `.env`。
- `.env.example` 只保留空值或安全示例。
- 当前 Android 原生请求不依赖 CORS；`CORS_ALLOWED_ORIGINS` 只给后续 Web 调试页或管理页使用，多个 origin 用逗号分隔。

## 数据准备

首次部署或重建数据后按顺序执行：

```powershell
cd server
npm.cmd run db:migrate
npm.cmd run catalog:import
npm.cmd run rag:documents
npm.cmd run rag:index
```

如果没有真实 PostgreSQL、Qdrant、embedding provider 或对应 key，上述命令不能声明通过。先补齐部署环境变量，再执行真实 smoke test。

## Smoke Test

健康检查不依赖数据库、Qdrant、LLM 或 embedding：

```powershell
curl.exe http://localhost:3000/api/health
```

商品接口：

```powershell
curl.exe "http://localhost:3000/api/products?limit=1"
curl.exe http://localhost:3000/api/products/<product-id>
```

商品图片：

```powershell
curl.exe http://localhost:3000/images/products/beauty/images/p_beauty_001_main.jpg --output NUL
```

购物车接口：

```powershell
curl.exe http://localhost:3000/api/cart
```

Chat SSE：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"message\":\"推荐一款适合通勤的耳机\",\"topK\":5,\"maxRecommendedProducts\":3}" http://localhost:3000/api/chat/stream
```

## 云平台待提供

真正部署前需要用户或平台提供：

- 公网 HTTPS API URL。
- PostgreSQL URL。
- Qdrant URL / key。
- LLM provider base URL / key / model。
- Embedding provider base URL / key / model。
- 如有 Web 调试页，再提供允许访问 API 的 exact origin。

这些值不能写入 Git、文档截图、Android `BuildConfig` 默认值或后端日志。

## 当前 Readiness 边界

已覆盖的最小能力：

- `GET /api/health` 可用于平台 health check。
- `PORT` / `HOST` 行为明确。
- 可选 CORS allowlist 默认关闭，开启后只精确匹配 origin。
- `/images/products/{category}/images/{filename}` 只服务允许的图片扩展名。
- Product / Chat 商品卡片返回可被 Android 请求的 `imagePath`，或在 `PUBLIC_IMAGE_BASE_URL` 存在时返回绝对 URL。

未覆盖的生产级能力：

- 真实云账号购买和平台配置。
- 生产级监控、告警、自动扩缩容。
- 正式登录、鉴权和用户隔离。
- 对象存储 / CDN 迁移。
- Google Play 上架。
