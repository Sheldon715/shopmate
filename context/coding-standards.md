# 抖选选 — 代码规范

> 本文档定义本项目的代码组织、命名、类型、接口、数据库、Android、后端、RAG、测试和提交前检查规范。  
> 当前技术栈：Android Native + Kotlin、Node.js + TypeScript + Express、PostgreSQL、Qdrant、SSE、JWT。

---

## 1. 通用原则

- 代码应优先保证可读性、可维护性和可解释性。
- 不写无关功能。
- 不做需求外重构。
- 不提交调试代码、无用注释、无用文件。
- 核心逻辑必须有必要注释。
- RAG、Prompt 构造、向量检索、SSE 流式返回、购物车状态变更等关键逻辑必须保持结构清晰。
- 所有输入必须校验。
- 所有外部服务调用必须有错误处理。
- 所有 API 返回格式应保持一致。
- 不在代码中硬编码密钥、API Key、数据库连接串、JWT Secret。

---

## 2. 项目目录结构

推荐仓库结构：

```text
shopmate/
  client/
    android/

  server/
    src/
      app.ts
      server.ts

      config/
      modules/
      db/
      scripts/
      types/
      utils/

  data/
    raw/
    processed/

  docs/
    project-overview.md
    current-feature.md
    ai-interaction.md
    coding-standards.md

  README.md
```

目录职责：

| 目录                    | 职责                                |
| --------------------- | --------------------------------- |
| `client/android/`     | Android 原生 App                    |
| `server/`             | Node.js + TypeScript + Express 后端 |
| `data/raw/`           | 原始商品数据                            |
| `data/processed/`     | 清洗后的商品数据                          |
| `docs/`               | 项目文档                              |
| `server/src/scripts/` | 数据导入、embedding 生成、reindex 脚本      |

---

## 3. TypeScript 后端规范

## 3.1 TypeScript 基础规则

* 必须启用 strict mode。
* 禁止使用 `any`，除非有明确原因并写注释。
* 不确定类型使用 `unknown`，再进行类型收窄。
* API 请求体、响应体、数据库模型、服务返回值必须定义类型。
* 能通过类型推断表达清楚的地方可以省略显式类型。
* 公共类型统一放在 `types/` 或对应模块的 `*.types.ts` 中。
* 不使用隐式 `any`。
* 不使用未处理的 Promise。
* 不忽略 TypeScript 编译错误。

示例：

```ts
interface ProductResponse {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string;
  stock: number;
}

---

## 3.2 后端模块组织

后端按业务模块组织：

```text
server/src/modules/
  auth/
  users/
  products/
  chat/
  cart/
  orders/
  vector/
```

每个模块推荐结构：

```text
module-name/
  module.controller.ts
  module.service.ts
  module.routes.ts
  module.types.ts
  module.test.ts
```

示例：

```text
products/
  product.controller.ts
  product.service.ts
  product.routes.ts
  product.types.ts
  product.test.ts
```

---

## 3.3 Controller 规范

Controller 只负责 HTTP 层逻辑：

* 读取 request 参数
* 调用 service
* 返回 response
* 设置 HTTP status code
* 处理基础错误映射

Controller 不应：

* 直接访问数据库
* 直接调用 Qdrant
* 直接调用 LLM
* 直接构造复杂 Prompt
* 写复杂业务逻辑

示例职责划分：

```text
controller → service → repository / external client
```

---

## 3.4 Service 规范

Service 负责业务逻辑。

典型 service：

```text
auth.service.ts
product.service.ts
cart.service.ts
chat.service.ts
rag.service.ts
vector-search.service.ts
embedding.service.ts
qdrant.service.ts
```

Service 要求：

* 函数保持单一职责。
* 外部依赖通过参数或模块封装。
* 复杂逻辑拆分为 helper。
* 关键业务分支需要注释。
* 返回值类型明确。
* 可单元测试。

---

## 3.5 Route 规范

Route 文件只负责注册路由和中间件。

示例：

```ts
router.post("/login", authController.login);
router.get("/me", authMiddleware, authController.me);
```

不得在 route 文件中写业务逻辑。

---

## 4. Express API 规范

## 4.1 URL 命名

使用 REST 风格路径。

示例：

```text
POST   /api/auth/register
POST   /api/auth/login
GET    /api/products
GET    /api/products/:id
POST   /api/chat/stream
GET    /api/cart
POST   /api/cart/items
PATCH  /api/cart/items/:itemId
DELETE /api/cart/items/:itemId
```

规则：

* 路径使用小写。
* 多单词使用 kebab-case。
* 资源名使用复数。
* 不在 URL 中使用动词，除非是特殊操作，例如 `/reindex-all`。

---

## 4.2 API 响应格式

普通 JSON API 使用统一响应格式：

```ts
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
```

成功示例：

```json
{
  "success": true,
  "data": {
    "id": "product_001",
    "name": "控油洁面乳"
  }
}
```

失败示例：

```json
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "商品不存在"
  }
}
```

---

## 4.3 HTTP 状态码

| 状态码   | 使用场景          |
| ----- | ------------- |
| `200` | 请求成功          |
| `201` | 创建成功          |
| `400` | 请求参数错误        |
| `401` | 未登录或 Token 无效 |
| `403` | 无权限           |
| `404` | 资源不存在         |
| `409` | 数据冲突          |
| `500` | 服务端错误         |

---

## 4.4 输入校验

所有外部输入必须校验。

推荐使用：

```text
Zod
```

需要校验：

* request body
* query params
* route params
* pagination 参数
* 商品筛选条件
* 购物车数量
* 登录注册参数
* RAG 查询参数

示例：

```ts
const addCartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive()
});
```

---

## 5. PostgreSQL 规范

## 5.1 数据库职责

PostgreSQL 是结构化业务数据主库，负责存储：

* 用户
* 商品
* 会话
* 消息
* 购物车
* 订单
* 订单项

Qdrant 只负责向量检索，不作为商品主数据源。

---

## 5.2 表命名

表名使用 snake_case 复数形式。

示例：

```text
users
products
chat_sessions
messages
carts
cart_items
orders
order_items
```

字段名使用 snake_case。

示例：

```text
created_at
updated_at
image_url
password_hash
total_amount
```

---

## 5.3 主键与外键

* 主键统一使用 `id`。
* 外键使用 `[table]_id`。
* 需要建立外键约束。
* 删除行为需要明确设计，避免误删用户关键数据。

示例：

```text
cart_items.product_id → products.id
cart_items.cart_id → carts.id
messages.session_id → chat_sessions.id
```

---

## 5.4 时间字段

业务表默认包含：

```text
created_at
updated_at
```

订单、消息等不可修改记录可以只有 `created_at`。

---

## 5.5 价格字段

价格不得使用浮点数。

推荐使用：

```text
price_cents INTEGER
```

或：

```text
price DECIMAL(10, 2)
```

MVP 如使用人民币整数价格，可使用：

```text
price INTEGER
```

但需要在文档中说明单位。

---

## 5.6 数据一致性

规则：

* 商品结构化数据以 PostgreSQL 为准。
* 商品卡片展示必须使用 PostgreSQL 回查结果。
* Qdrant payload 只用于检索过滤和候选召回。
* 商品更新后必须触发向量重建。
* 商品删除后必须删除对应 Qdrant 向量。
* 订单价格应保存价格快照，避免商品后续改价影响历史订单。

---

## 6. Qdrant 向量数据库规范

## 6.1 Collection 命名

商品向量 collection 命名：

```text
products
```

如后续支持图片向量，可拆分为：

```text
product_text_vectors
product_image_vectors
```

MVP 使用：

```text
products
```

---

## 6.2 Vector Point 结构

每个商品对应一个向量点。

```text
id: productId
vector: embedding
payload:
  productId
  name
  category
  brand
  price
  tags
  stock
```

规则：

* `productId` 必须与 PostgreSQL `products.id` 一致。
* payload 不存完整商品详情。
* payload 可存用于过滤的轻量字段。
* 检索后必须回查 PostgreSQL。

---

## 6.3 向量写入规则

商品新增或更新后：

```text
构造商品知识文本
→ 生成 embedding
→ upsert 到 Qdrant
```

商品删除后：

```text
删除 PostgreSQL 商品
→ 删除 Qdrant 对应 point
```

如同步失败，需要记录日志，并允许通过 reindex 脚本修复。

---

## 6.4 向量检索规则

检索逻辑集中在：

```text
server/src/modules/vector/vector-search.service.ts
```

不得在 controller 中直接调用 Qdrant。

检索函数推荐形式：

```ts
searchProducts(query: ProductSearchQuery): Promise<ProductSearchResult[]>
```

检索结果需要包含：

```ts
interface ProductSearchResult {
  productId: string;
  score: number;
}
```

完整商品信息由 Product Service 回查 PostgreSQL 获取。

---

## 7. RAG 代码规范

## 7.1 模块拆分

RAG 相关逻辑必须拆分：

```text
chat/
  rag.service.ts
  prompt.builder.ts

vector/
  embedding.service.ts
  qdrant.service.ts
  vector-search.service.ts
```

职责：

| 文件                         | 职责                     |
| -------------------------- | ---------------------- |
| `embedding.service.ts`     | 调用 embedding 模型        |
| `qdrant.service.ts`        | 封装 Qdrant client       |
| `vector-search.service.ts` | 商品向量检索                 |
| `rag.service.ts`           | 串联检索、回查、Prompt、LLM     |
| `prompt.builder.ts`        | 构造系统 Prompt 和用户 Prompt |

---

## 7.2 Prompt 构造规范

Prompt 构造必须集中在：

```text
prompt.builder.ts
```

不得在 controller 或 route 中散写 Prompt 字符串。

Prompt 中必须包含：

* 角色定义
* 商品来源约束
* 禁止编造规则
* 输出格式要求
* 无结果处理规则
* 商品卡片数据与文本回复的关系

涉及价格、库存、优惠、商品功效时，必须以检索结果和 PostgreSQL 数据为准。

---

## 7.3 RAG 安全规则

RAG 代码必须处理：

* 空检索结果
* 商品被删除
* 商品库存为 0
* Qdrant 检索失败
* Embedding API 失败
* LLM API 失败
* LLM 输出格式异常
* 用户输入为空或过长

不得在没有商品检索结果时强行生成商品推荐。

---

## 7.4 Chunking 规则

MVP 使用单商品单 Chunk：

```text
1 个商品 = 1 个知识文本 = 1 条向量
```

如果后续商品详情变长，再拆分为：

```text
商品基础信息 chunk
商品详情 chunk
评论摘要 chunk
场景标签 chunk
```

Chunking 策略变化时必须更新文档。

---

## 8. SSE 流式接口规范

## 8.1 SSE 事件类型

聊天流式接口使用 SSE。

事件类型：

```text
message_delta
product_cards
tool_result
done
error
```

说明：

| 事件              | 用途              |
| --------------- | --------------- |
| `message_delta` | AI 回复文本增量       |
| `product_cards` | 商品卡片数据          |
| `tool_result`   | 加购、删除、修改数量等操作结果 |
| `done`          | 流式响应结束          |
| `error`         | 流式响应错误          |

---

## 8.2 SSE 错误处理

SSE 接口必须处理：

* 客户端断开连接
* LLM API 中断
* RAG 检索失败
* JSON 序列化失败
* 超时

发生错误时发送：

```text
event: error
data: {"code":"STREAM_ERROR","message":"回复生成失败，请稍后重试"}
```

随后关闭连接。

---

## 8.3 SSE 代码边界

SSE 工具函数放在：

```text
server/src/utils/sse.ts
```

不在业务代码中重复写 header 和 event 序列化逻辑。

---

## 9. Android Kotlin 规范

## 9.1 语言规则

* 使用 Kotlin。
* 避免不必要的 nullable 类型。
* Nullable 类型必须显式处理。
* 不使用 `!!`，除非有明确原因。
* 数据模型使用 `data class`。
* 常量放在 `object` 或 companion object 中。
* 函数保持单一职责。

---

## 9.2 Android 目录组织

推荐结构：

```text
client/android/app/src/main/java/.../
  auth/
  chat/
  products/
  cart/
  orders/
  network/
  common/
  ui/
```

职责：

| 目录          | 职责                    |
| ----------- | --------------------- |
| `auth/`     | 登录注册                  |
| `chat/`     | 对话页、消息状态、流式回复         |
| `products/` | 商品卡片、详情页              |
| `cart/`     | 购物车                   |
| `orders/`   | 模拟订单                  |
| `network/`  | API client、SSE client |
| `common/`   | 通用工具、通用 UI 状态         |
| `ui/`       | 主题、基础组件               |

---

## 9.3 UI 规范

当前项目可使用 Jetpack Compose 或 XML View。
如新建项目，推荐 Jetpack Compose。

UI 规则：

* 页面组件保持单一职责。
* 商品卡片组件可复用。
* 对话消息组件支持文本和商品卡片混合展示。
* 加载、错误、空状态需要明确。
* 不在 UI 组件中直接写网络请求。
* 颜色、间距、字体应统一管理。
* 不使用硬编码散落样式值。

---

## 9.4 状态管理

对话页至少区分以下状态：

```text
idle
loading
streaming
success
error
```

购物车至少区分：

```text
loading
loaded
updating
error
```

状态应由 ViewModel 或等价层管理。

---

## 9.5 网络请求规范

网络请求必须统一封装。

推荐结构：

```text
ApiClient
AuthRepository
ChatRepository
ProductRepository
CartRepository
OrderRepository
```

UI 层不得直接调用底层 HTTP client。

---

## 9.6 Android 错误处理

客户端需要处理：

* 网络不可用
* 登录过期
* SSE 中断
* 后端返回错误
* 商品不存在
* 加购失败
* 购物车为空
* 订单创建失败

用户可见错误信息应简洁，不展示后端 stack trace。

---

## 10. 命名规范

## 10.1 TypeScript 命名

| 类型      | 规则                   | 示例                   |
| ------- | -------------------- | -------------------- |
| 文件      | kebab-case 或模块约定     | `product.service.ts` |
| 函数      | camelCase            | `searchProducts`     |
| 变量      | camelCase            | `productList`        |
| 常量      | SCREAMING_SNAKE_CASE | `MAX_SEARCH_RESULTS` |
| 类型 / 接口 | PascalCase           | `ProductResponse`    |
| 类       | PascalCase           | `ProductService`     |

---

## 10.2 Kotlin 命名

| 类型         | 规则                   | 示例              |
| ---------- | -------------------- | --------------- |
| 文件         | PascalCase 或功能名      | `ChatScreen.kt` |
| Class      | PascalCase           | `ChatViewModel` |
| Function   | camelCase            | `sendMessage`   |
| Variable   | camelCase            | `cartItems`     |
| Constant   | SCREAMING_SNAKE_CASE | `BASE_URL`      |
| Composable | PascalCase           | `ProductCard`   |

---

## 10.3 数据库命名

| 类型 | 规则                | 示例                         |
| -- | ----------------- | -------------------------- |
| 表  | snake_case 复数     | `cart_items`               |
| 字段 | snake_case        | `product_id`               |
| 索引 | `idx_table_field` | `idx_products_category`    |
| 外键 | `fk_table_field`  | `fk_cart_items_product_id` |

---

## 11. 错误处理规范

## 11.1 后端错误

后端使用统一错误格式：

```ts
{
  success: false,
  error: {
    code: "ERROR_CODE",
    message: "User friendly message"
  }
}
```

内部错误需要记录日志，但不直接返回 stack trace。

---

## 11.2 错误码命名

错误码使用 SCREAMING_SNAKE_CASE。

示例：

```text
INVALID_INPUT
UNAUTHORIZED
PRODUCT_NOT_FOUND
CART_ITEM_NOT_FOUND
VECTOR_SEARCH_FAILED
LLM_REQUEST_FAILED
STREAM_INTERRUPTED
```

---

## 11.3 日志规则

需要记录：

* API 错误
* 数据库错误
* Qdrant 错误
* Embedding API 错误
* LLM API 错误
* SSE 中断
* 数据导入失败
* reindex 失败

不得记录：

* 密码
* JWT token
* API key
* 用户敏感信息

---

## 12. 鉴权与安全规范

* 密码必须 hash 后存储。
* JWT Secret 必须来自环境变量。
* 需要鉴权的接口必须验证 token。
* 用户只能访问自己的会话、购物车和订单。
* 后端不得信任客户端传入的 userId。
* 商品价格、库存、订单金额必须以后端数据库为准。
* 不允许客户端直接决定订单总价。
* 所有环境变量写入 `.env.example` 示例，不写真实值。

---

## 13. 环境变量规范

环境变量命名使用 SCREAMING_SNAKE_CASE。

示例：

```text
PORT=
DATABASE_URL=
JWT_SECRET=
QDRANT_URL=
QDRANT_API_KEY=
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
EMBEDDING_BASE_URL=
EMBEDDING_API_KEY=
EMBEDDING_MODEL=
```

规则：

* `.env` 不提交。
* `.env.example` 可提交。
* 不在代码中写真实 key。
* 不在文档中写真实 key。
* 本地、测试、生产环境变量分开管理。

---

## 14. 依赖管理规范

## 14.1 后端依赖

新增 npm 依赖前需要说明用途。

后端依赖记录在：

```text
server/package.json
```

常见依赖类型：

| 类型     | 示例             |
| ------ | -------------- |
| Web 框架 | Express        |
| 校验     | Zod            |
| 数据库    | pg 或 ORM       |
| 向量库    | Qdrant client  |
| 鉴权     | jsonwebtoken   |
| 测试     | Vitest         |
| 日志     | pino / winston |

不得引入与当前架构冲突的大型框架，除非项目决定调整架构。

---

## 14.2 Android 依赖

新增 Android 依赖前需要说明用途。

依赖记录在：

```text
client/android/app/build.gradle
```

或：

```text
client/android/build.gradle
```

新增依赖需要关注：

* minSdk
* targetSdk
* 网络权限
* 构建时间
* 与现有 UI 技术栈是否冲突

---

## 15. 测试规范

## 15.1 后端测试

后端使用：

```text
Vitest
```

测试目标：

* service
* utility
* prompt builder
* vector search wrapper
* cart service
* auth helper
* data parser

测试文件命名：

```text
*.test.ts
```

测试文件与实现文件放在同目录。

示例：

```text
cart.service.ts
cart.service.test.ts
```

需要 mock：

* PostgreSQL client
* Qdrant client
* LLM client
* Embedding client
* JWT helper
* network client

---

## 15.2 Android 测试

MVP 阶段优先保证：

```text
./gradlew build
```

或 Windows：

```text
gradlew.bat build
```

如添加测试，优先测试：

* ViewModel
* Repository
* API client
* 数据转换函数

不默认添加复杂 UI 自动化测试，除非项目明确需要。

---

## 16. 提交前检查

后端提交前执行：

```bash
cd server
npm run lint
npm run build
npm test
```

如果测试尚未配置，至少执行：

```bash
cd server
npm run lint
npm run build
```

Android 提交前执行：

```bash
cd client/android
./gradlew build
```

Windows：

```bash
cd client/android
gradlew.bat build
```

文档变更需检查：

```text
Markdown 标题层级
目录链接
代码块语言标记
路径是否与项目结构一致
```

---

## 17. 代码质量要求

* 无未使用 import。
* 无未使用变量。
* 无无意义 console log。
* 无注释掉的大段旧代码。
* 无重复实现。
* 无硬编码 magic number，必要时提取常量。
* 函数不宜过长，复杂函数需要拆分。
* 文件职责清晰。
* 模块边界清晰。
* 对外 API 类型清晰。
* 错误处理路径完整。

---

## 18. 注释规范

需要注释的场景：

* RAG 流程关键步骤
* Prompt 构造规则
* 向量检索过滤逻辑
* SSE 事件发送逻辑
* PostgreSQL 与 Qdrant 同步逻辑
* 购物车自然语言操作映射逻辑
* 非显然的错误处理
* 非显然的性能优化

不需要注释的场景：

* 明显变量赋值
* 明显 getter / setter
* 与代码重复的注释

---

## 19. 文档同步规则

以下变更必须同步文档：

* API 变更
* 数据模型变更
* Qdrant payload 结构变更
* RAG 流程变更
* Prompt 规则变更
* Android 页面结构变更
* 新增依赖
* 新增环境变量
* 启动方式变更
* 测试方式变更

相关文档：

```text
docs/project-overview.md
docs/current-feature.md
docs/ai-interaction.md
docs/coding-standards.md
README.md
```

---

## 20. 当前项目默认标准

| 项目       | 标准                             |
| -------- | ------------------------------ |
| 客户端      | Android Native + Kotlin        |
| UI       | Jetpack Compose 优先，XML View 可选 |
| 后端       | Node.js + TypeScript + Express |
| 数据库      | PostgreSQL                     |
| 向量数据库    | Qdrant                         |
| 流式通信     | SSE                            |
| 鉴权       | JWT                            |
| 后端测试     | Vitest                         |
| 后端校验     | Zod                            |
| 文档语言     | 中文                             |
| 商品数据主源   | PostgreSQL                     |
| 向量检索     | Qdrant                         |
| 商品展示数据   | PostgreSQL 回查结果                |
| RAG 关键代码 | 必须模块化并有必要注释                    |
