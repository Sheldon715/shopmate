# 图片找货 V2 图片向量索引 Spec

## 概述

本 spec 是图片找货 V2。它在 VLM-first 跑通并完成小样本评估后，为商品主图建立独立 image embedding collection，让用户上传图片可以进行视觉相似检索，再通过 PostgreSQL 回查商品事实。

V2 推荐路线：

```text
商品主图
-> image_main documents
-> image embeddings
-> shopmate_product_image_documents

用户图片
-> image embedding
-> Qdrant image search
-> product ids
-> PostgreSQL active products 回查
-> Chat / LLM 生成解释
```

## 启动条件

只有满足以下条件才进入本 spec：

- `image-search-backend-api-spec.md` 已实现并可 mock 测试。
- `android-image-search-upload-spec.md` 已让图片能进入导购闭环。
- `image-search-evaluation-spec.md` 至少覆盖 6-10 个 cases。
- 评估证明 VLM-first 的主要短板是视觉相似召回，而不是 provider 配置、上传、Chat filters 或现有 RAG bug。

## 目标

- 为 175 个 active products 的主图生成 `image_main` document。
- 建立独立 Qdrant collection：`shopmate_product_image_documents`。
- 使用 image embedding provider 为商品主图生成向量。
- 支持用户上传图片生成 image embedding 并检索相似商品。
- 检索结果只返回 product ids / scores，商品事实仍由 PostgreSQL 回查。
- 保留 VLM-first 作为默认或 fallback 路线；image vector 先做可开关策略。
- 增加 V2 evaluation 结果，与 V1 VLM-first 对比。

## 不做

- 不替换现有 text RAG collection。
- 不把 image vectors 混进当前 text collection。
- 不做 hybrid rerank；那属于 V3。
- 不训练自有模型。
- 不做库外图片搜索。
- 不长期保存用户上传图片。
- 不让 image embedding score 直接生成商品事实。

## 数据结构

新增 image document：

```ts
interface ProductImageDocument {
  docId: `product:${string}:image:main`;
  productId: string;
  docType: "image_main";
  imagePath: string;
  visualCaption: string;
  visualTags: string[];
  category: string;
  subCategory?: string | null;
  brand?: string | null;
  status: "active" | "inactive";
  available: boolean;
  sourceDataset: string;
  sourceVersion: string;
  dataVersion: string;
  imageHash: string;
}
```

Qdrant payload：

```text
product_id
doc_type=image_main
image_path
visual_caption
visual_tags
category
sub_category
brand
status
available
price_min_cents
price_max_cents
image_embedding_model
image_embedding_dimensions
image_hash
ingest_batch_id
```

## Collection 设计

推荐独立 collection：

```text
shopmate_product_image_documents
```

理由：

- 当前 text collection 已稳定服务 RAG。
- image embedding 维度、模型、payload 生命周期可能不同。
- 独立 collection 更容易重建、清理和评估。
- V3 hybrid 可以在 service 层合并 text hits 和 image hits。

不推荐 V2 直接改现有 collection 为 named vectors，因为这会触及当前 text RAG wrapper、payload mapper、evaluation 和索引重建。

## 推荐文件

后端新增：

```text
server/src/modules/rag/image-documents.ts
server/src/modules/rag/image-embedding.client.ts
server/src/modules/rag/image-vector-store.ts
server/src/modules/image-search/image-vector-search.service.ts
server/src/modules/rag/*.test.ts
server/src/modules/image-search/*.test.ts
```

数据输出：

```text
data/processed/rag/image-document-manifest.json
data/processed/rag/image-documents.jsonl
data/processed/rag/image-vector-index-report.json
```

脚本视项目现有命名接入：

```text
server/scripts/build-image-documents.ts
server/scripts/index-image-documents.ts
server/scripts/evaluate-image-search.ts
```

## Provider 配置

`.env.example` 可增加：

```text
IMAGE_EMBEDDING_PROVIDER=disabled
IMAGE_EMBEDDING_BASE_URL=
IMAGE_EMBEDDING_API_KEY=
IMAGE_EMBEDDING_MODEL=doubao-embedding-vision-250615
IMAGE_EMBEDDING_DIMENSIONS=
IMAGE_VECTOR_COLLECTION=shopmate_product_image_documents
```

实现前复核：

- image embedding endpoint 格式。
- 输入图片是 URL、base64、binary 还是 provider-specific。
- 模型输出维度。
- Qdrant vector size 和 distance。
- 价格、限流、缓存策略。

## Search 流程

用户图片向量检索：

1. 校验图片格式、大小和隐私边界。
2. 调用 image embedding provider。
3. 搜索 `shopmate_product_image_documents`。
4. 使用 payload 中 product ids 回查 PostgreSQL active products。
5. 丢弃 inactive / unavailable / 不存在商品。
6. 返回 product ids、similarity scores 和低敏 metadata。
7. 交给 Chat / LLM 生成可解释导购回复。

注意：

- image vector hit 只代表视觉相似，不代表库存、价格、正品、功效或适配。
- 商品事实必须回查 PostgreSQL。
- 没有足够 hits 时 fallback 到 VLM-first 或澄清。

## 测试计划

文档生成：

- 每个 active product 至多一个 `image_main` document。
- image path 存在且格式受支持。
- `docId` 稳定。
- `imageHash` 稳定。
- payload 不含完整商品详情长文本。

Vector store：

- collection 创建参数正确。
- vector dimensions 和模型配置一致。
- upsert payload 包含必要字段。
- search filter 能过滤 inactive / unavailable。
- stale product id 回查失败时丢弃。

Search service：

- mock image embedding 返回固定 vector。
- mock Qdrant hits 映射为 product ids。
- PostgreSQL 回查后只返回 active products。
- image vector 搜不到时 fallback。

Evaluation：

- 与 V1 cases 对比 returned product ids。
- 记录 V1 / V2 win、loss、tie。

## 验收标准

- 商品主图 image documents 可稳定生成。
- 独立 image vector collection 可 dry-run 创建和 upsert。
- 用户图片可通过 image embedding 找到相似 product ids。
- 返回商品仍来自 PostgreSQL active products。
- V2 evaluation 能证明至少部分 case 比 V1 更好，或明确说明不值得继续。

## 验证命令

```powershell
cd server
npm.cmd run build
npm.cmd test
```

如果新增脚本：

```powershell
cd server
npm.cmd run rag:image-documents -- --dry-run
npm.cmd run rag:image-index -- --dry-run
```

真实 Qdrant / provider 写入只在环境配置齐全时运行；未配置时记录为 skipped。
