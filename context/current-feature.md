# 当前功能：商品查询 API

## 状态

进行中

## 目标

- 新增 products 模块的 routes / controller / service 查询链路。
- 实现 `GET /api/products` 商品列表接口，支持关键词、类目、品牌、价格范围和分页过滤。
- 实现 `GET /api/products/:id` 商品详情接口，不存在时返回稳定错误码。
- 使用统一 `ApiResponse<T>` JSON 返回格式。
- 校验 query params 和 path params，保持错误码稳定，方便 Android 和后续测试判断。

## 待办事项

- [x] 新增 `server/src/modules/products/product.routes.ts`。
- [x] 新增 `server/src/modules/products/product.controller.ts`。
- [x] 新增 `server/src/modules/products/product.service.ts`。
- [x] 扩展 `product.types.ts`，补齐列表、详情、查询参数和错误类型。
- [x] 复用或扩展 `product.repository.ts`，只通过参数化 SQL 读取 PostgreSQL。
- [x] 复用或扩展 `product.mapper.ts`，生成 `ProductCardDto` 和 `ProductDetailDto`。
- [x] 在 `server/src/app.ts` 挂载 `/api/products` 路由。
- [x] 校验 `q`、`category`、`subCategory`、`brand`、`minPriceCents`、`maxPriceCents`、`limit`、`offset` 和 `:id`。
- [x] 验证 `GET /api/products` 返回统一格式和商品卡片字段。
- [x] 验证 `GET /api/products?q=防晒` 能返回匹配商品。
- [x] 验证 `GET /api/products?category=数码电子&maxPriceCents=50000` 能按条件过滤。
- [x] 验证 `GET /api/products/:id` 返回详情字段和 SKU 列表。
- [x] 验证不存在的 id 返回 `404 PRODUCT_NOT_FOUND`。
- [x] 运行 `cd server && npm.cmd run build`。

## 备注

- 规格来源：`context/feature/product-api-spec.md`。
- 本 spec 只做商品列表、详情和基础搜索 / 筛选接口，不实现 RAG、购物车或 Android 接入。
- 商品导入和表结构已由 `product-schema-spec.md` 处理，本功能不得从 `data/raw/` 或 `data/processed/` 读取 API 数据。
- 默认只返回 `status = active` 或当前数据集中可展示的商品；排序第一版保持稳定，例如 `name ASC, id ASC`。
- `subCategory` 使用 camelCase query param，数据库字段仍为 `sub_category`。
- 错误码要求：参数非法 `400 INVALID_PRODUCT_QUERY`；商品不存在 `404 PRODUCT_NOT_FOUND`；服务端异常 `500 INTERNAL_ERROR`。
- 验证记录：`cd server && npm.cmd run build` 通过；`cd server && npm.cmd test` 仍是当前占位命令，输出 `No tests configured yet`。
- 本地烟测记录：`GET /api/products?limit=1`、`GET /api/products?q=防晒&limit=5`、详情接口和不存在 id 均返回预期格式；`数码电子&maxPriceCents=50000` 返回成功空列表，因为当前 PostgreSQL 数据中 `数码电子` 最低 `price_min_cents` 为 `149900`。

## 历史记录

- 初始化前后端技术栈骨架：完成 Android Kotlin + Jetpack Compose 与 Node.js + TypeScript + Express 最小工程初始化，补充 README 与 Git 忽略配置，并通过后端构建与 Android `assembleDebug` 验证。
- 开发顺序规划文档：新增 `context/spec-implementation-order.md`，梳理 Phase 2 之后的 spec 实现顺序、research 插入点、依赖关系和近期队列。
- 开发顺序规划文档中文化：将 `context/spec-implementation-order.md` 从英文改为中文，保留原有结构、文件名和开发顺序。
- Figma 驱动开发顺序调整：根据欢迎页、主聊天页、侧边栏、推荐结果、商品对比、详情页和购物车设计，将近期队列调整为 Android UI 先行，并补充 UI model、mock data 与前后端契约 spec。
- Figma 复现 research prompt：新增 `context/research/figma-to-compose-reproduction-research.md`，用于后续通过 Figma MCP 获取设计上下文、截图和资产，并产出 Compose 复现计划。
- Android 引导页：新增 `context/feature/android-onboarding-spec.md`，用 Jetpack Compose 复现 Figma onboarding 首屏，接入 Shopmate Buddy 本地资源、CTA、底部价值点和 Android Studio Preview，并通过 `cd client/android && .\gradlew.bat build` 验证。
- Android 主题基础：新增 `ShopMateTheme`、共享颜色 / 圆角 / 背景和基础按钮组件，重构 onboarding 复用主题层，并通过 `cd client/android && .\gradlew.bat build` 验证。
- Android 聊天输入栏：新增可复用 `ChatComposer` 组件和语音、图片、发送图标，提交聊天输入栏 spec，并补上 Android 主题基础 spec，通过 `cd client/android && .\gradlew.bat build` 验证。
- Android mock UI 数据：新增 prompt suggestion、商品卡片、商品详情、购物车和历史聊天 mock UI model，补齐 `MockShopMateData`，并为后续页面复用提供数据底座。
- Android 主聊天入口页：复现主聊天页，接入 onboarding CTA、本地 screen state、prompt panel 和 `ChatComposer`，让首页能够直接进入对话。
- Android 侧边栏历史抽屉：实现左侧历史抽屉，接入历史聊天 mock 数据、遮罩关闭、新聊天返回和图标资源。
- Android 聊天推荐页：实现蓝牙耳机推荐结果页，从侧边栏历史入口进入，展示用户气泡、AI 回复、商品推荐卡和底部输入栏。
- Android 商品卡组件：抽取可复用 `ProductCard`，让推荐结果页改用组件渲染商品列表，并支持 enabled / disabled 状态。
- Android 商品对比页：实现防晒商品对比页 mock 版，展示用户气泡、AI 回复、两个商品卡、对比表和推荐结论。
- Android 商品详情页：实现商品详情页 mock 版，支持推荐页商品卡跳转、收藏 toggle、not found 状态和底部购买栏。
- Android 购物车页：实现购物车页，支持本地选择、数量加减、删除、合计和空状态，仍使用 `MockShopMateData.cartItems`。
- Android 首轮 UI 打磨：统一安全区、滚动 / padding、键盘避让、按钮状态和 Preview，修复第一轮页面的重叠、溢出和小屏问题。
- Android Compose 共享组件抽取：新增顶部操作栏、圆形图标按钮、聊天气泡和 elevated surface 共享组件，统一页面背景光晕，调整聊天 / 详情滚动层与侧边栏层级，并通过 `cd client/android && .\gradlew.bat build installDebug` 验证。
- 数据库基础设施：新增 PostgreSQL `pg` 连接池、SQL migration 执行器、catalog normalize / validate / import / rebuild 脚本，以 `ecommerce_agent_dataset_v3` 作为 175 条商品 canonical source，生成 processed 工件并记录真实 PostgreSQL import batch。
- 商品结构化主库：新增 `products` / `product_skus` migration、商品类型 / mapper / repository，并扩展 `catalog:import` 幂等导入 175 条 products 和 736 条 SKUs；通过后端 build、两次 import 幂等验证和数据库计数复核。
