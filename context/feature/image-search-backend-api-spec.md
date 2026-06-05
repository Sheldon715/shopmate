# 图片找货后端解释接口 Spec

## 概述

本 spec 实现图片找货 V1 的后端入口：新增 `POST /api/image-search/interpret`，接收 Android 上传的商品图片和可选补充文字，调用 vision-capable model 做图片理解，输出结构化 `visualIntent`、内部 `chatMessage` 和可选 `filters`。

V1 采用 research 推荐的 `VLM-first` 路线：

```text
用户图片 + 可选文字
-> VLM 只做视觉理解
-> visualIntent schema 校验
-> 生成普通文本 query / filters
-> 后续交给现有 Chat SSE / RAG / PostgreSQL 回查
```

本 spec 只负责“图片解释成导购查询意图”，不直接生成最终回复、不调用购物车动作、不改 Qdrant 索引。

## 背景

当前 ShopMate 已有成熟的文字导购主链路：

- `POST /api/chat/stream` 接收 `message`、`conversationId`、`history`、`recentProductIds`、`filters` 等 JSON 字段。
- 后端已有 RAG、query rewrite、comparison、cartAction、负向约束、PostgreSQL 商品回查和 Chat SSE contract。
- Android 已有 ASR multipart 上传模式，provider key 只在后端保存。
- 当前 RAG corpus 只有文本 documents，没有 image document / image vector collection。

因此图片找货第一版不应该直接把图片向量检索、hybrid rerank 和 Android UI 都塞进同一个实现。后端先提供一个稳定、可 mock、可测试的图片解释接口。

## 目标

- 新增 `server/src/modules/image-search/` 后端模块。
- 新增 `POST /api/image-search/interpret` multipart endpoint。
- 支持 `image` 文件字段和可选 `message`、`conversationId` 文本字段。
- 校验 JPEG / PNG / WebP、文件大小、空文件和 magic bytes。
- 新增 mockable `VisualIntentClient`，隔离真实 provider 调用。
- 将 VLM 输出解析为固定 `VisualIntent` schema。
- 对低置信、非商品图和隐私风险图返回稳定错误或澄清状态。
- 从 `visualIntent` 生成内部 `chatMessage` 和可选 Chat filters。
- 后端不长期保存用户图片，不记录 base64、原始图片路径、完整 provider 原始响应。
- `.env.example` 增加图片识别相关占位配置，不提交真实 key。

## 不做

- 不实现 Android 图片选择、预览或上传 UI。
- 不新增 `POST /api/chat/image-stream`。
- 不改造现有 `POST /api/chat/stream` 为 multipart。
- 不生成最终导购回复。
- 不执行 cartAction、comparison 或 checkout。
- 不重建 Qdrant text index。
- 不新增 image embedding collection。
- 不把图片中的文字直接当成购物车或业务动作。
- 不把用户上传图片写入 `data/raw/`、`data/processed/`、docs、Git、测试 fixture 或日志。

## API Contract

### Endpoint

```text
POST /api/image-search/interpret
Content-Type: multipart/form-data
```

### Request fields

```text
image: required JPEG / PNG / WebP file
message: optional user text
conversationId: optional chat conversation id
```

### Success response

```json
{
  "success": true,
  "data": {
    "visualIntent": {
      "is_product_search": true,
      "detected_category": "数码电子",
      "detected_brand_text": null,
      "visual_attributes": ["真无线耳机", "充电盒"],
      "colors": ["黑色"],
      "materials": [],
      "use_case": "通勤",
      "constraints": ["便宜一点"],
      "search_query": "黑色真无线蓝牙耳机，适合通勤，价格更便宜",
      "confidence": "medium",
      "clarification_question": null
    },
    "chatMessage": "图片找货：黑色真无线蓝牙耳机，适合通勤，价格更便宜",
    "filters": {
      "category": "数码电子"
    },
    "imageSearchMode": "vlm_first"
  }
}
```

### Unsupported media response

```json
{
  "success": false,
  "error": {
    "code": "IMAGE_UNSUPPORTED_MEDIA_TYPE",
    "message": "暂不支持该图片格式。"
  }
}
```

### Low confidence response

低置信不进入 Chat / RAG。后端可以返回 success，但明确标记需要澄清：

```json
{
  "success": true,
  "data": {
    "visualIntent": {
      "is_product_search": true,
      "detected_category": null,
      "detected_brand_text": null,
      "visual_attributes": [],
      "colors": [],
      "materials": [],
      "use_case": null,
      "constraints": [],
      "search_query": "",
      "confidence": "low",
      "clarification_question": "我没看清具体商品，可以换一张更清晰的商品主体图，或者补充想找的类型。"
    },
    "chatMessage": null,
    "filters": null,
    "imageSearchMode": "vlm_first"
  }
}
```

## VisualIntent Schema

```ts
export interface VisualIntent {
  is_product_search: boolean;
  detected_category: string | null;
  detected_brand_text: string | null;
  visual_attributes: string[];
  colors: string[];
  materials: string[];
  use_case: string | null;
  constraints: string[];
  search_query: string;
  confidence: "high" | "medium" | "low";
  clarification_question: string | null;
}
```

校验规则：

- `search_query` 最大 300 字；当 `confidence` 不是 `low` 且 `is_product_search=true` 时必须非空。
- 数组字段 trim、去重，每个数组最多 12 项。
- 单个属性字符串最大 80 字。
- `detected_category` 只能映射到 ShopMate 已知类目；不能让 VLM 发明类目。
- `detected_brand_text` 只能作为弱信号；最终品牌事实以 PostgreSQL 为准。
- `confidence=low` 不进入商品检索。
- `is_product_search=false` 不进入商品检索。

## 推荐实现

新增文件：

```text
server/src/modules/image-search/image-search.types.ts
server/src/modules/image-search/image-search.config.ts
server/src/modules/image-search/image-search.multipart.ts
server/src/modules/image-search/visual-intent.client.ts
server/src/modules/image-search/image-search.service.ts
server/src/modules/image-search/image-search.controller.ts
server/src/modules/image-search/image-search.routes.ts
server/src/modules/image-search/*.test.ts
```

可能修改：

```text
server/src/app.ts
server/src/lib/env.ts
.env.example
server/package.json
```

### Multipart

图片第一版建议使用 Multer 或 Busboy，不继续扩大手写 parser：

- `memoryStorage()` 或等价内存模式。
- 字段名固定为 `image`。
- `limits.fileSize` 默认 5 MB。
- 只接受 `image/jpeg`、`image/png`、`image/webp`。
- 用 magic bytes 做基本 sniffing。
- 拒绝 SVG、HEIC、PDF、ZIP 和空文件。
- 不使用原始文件名做日志或存储。

### Provider wrapper

```ts
export interface VisualIntentClient {
  interpret(input: {
    image: { buffer: Buffer; mimeType: string };
    userText?: string;
    requestId?: string;
    abortSignal?: AbortSignal;
  }): Promise<VisualIntent>;
}
```

实现前必须复核当前 provider 官方文档：

- 图片输入字段格式。
- 是否支持 base64 data URL。
- vision model 是否支持 JSON 输出或结构化输出。
- 图片大小、格式、限流、费用和隐私条款。
- 当前账号是否有 vision model 权限。

### Config

`.env.example` 增加占位：

```text
IMAGE_SEARCH_PROVIDER=disabled
IMAGE_SEARCH_BASE_URL=
IMAGE_SEARCH_API_KEY=
IMAGE_SEARCH_MODEL=
IMAGE_SEARCH_TIMEOUT_MS=25000
IMAGE_SEARCH_MAX_IMAGE_BYTES=5242880
IMAGE_SEARCH_MAX_COMPLETION_TOKENS=700
IMAGE_SEARCH_ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp
```

说明：

- `IMAGE_SEARCH_PROVIDER=disabled` 时 endpoint 返回稳定配置错误，不假装识别图片。
- 可以复用 `LLM_BASE_URL` / `LLM_API_KEY`，但 `IMAGE_SEARCH_MODEL` 必须独立配置。
- 不把真实 key 写入 docs、logs、tests 或 git。

## 安全与隐私

- Android 后续会做重新编码和去 EXIF，但后端仍必须假设输入不可信。
- 不长期保存用户图片。
- 不记录 base64、完整 provider request、完整 provider response、原始文件名。
- 日志只记录 requestId、文件大小、MIME、耗时、错误码和 confidence 等低敏信息。
- 检测到人脸、证件、订单、地址、二维码、支付码、条形码等，V1 默认拒绝或要求换商品主体图。
- 图片中的文字不能直接触发加购、删除、下单、对比等业务动作。

## 测试计划

后端单测：

- config 读取和默认 disabled 行为。
- multipart 缺少 image 字段。
- unsupported MIME 拒绝。
- magic bytes 和 mimetype 不一致拒绝。
- 超大文件拒绝。
- empty file 拒绝。
- provider timeout 返回稳定错误。
- provider JSON schema 解析。
- `confidence=low` 不生成 `chatMessage`。
- `is_product_search=false` 不生成 `chatMessage`。
- `detected_category` 只允许映射到已知类目。
- `detected_brand_text` 不变成强制品牌事实。

集成测试：

- mock `VisualIntentClient` 返回 medium confidence，controller 返回 `visualIntent`、`chatMessage`、`filters`。
- mock privacy refusal，controller 不进入检索态。

## 验收标准

- `POST /api/image-search/interpret` 在 provider disabled 时有稳定错误。
- multipart 校验覆盖格式、大小、空文件和字段名。
- mock provider 的成功响应能生成 `chatMessage` 和 filters。
- low confidence / non-product / privacy cases 不进入 Chat / RAG。
- 响应不包含图片 base64 或 provider 原始响应。
- 旧 Chat SSE endpoint 行为不变。

## 验证命令

```powershell
cd server
npm.cmd test
npm.cmd run build
```

如果真实 provider 未配置，记录为“provider live smoke 未跑”，但 mock 测试和 build 必须通过。
