# Current Feature: Conversational Cart Add

## 状态

In Progress

## 目标

- 支持用户在聊天中用自然语言把最近推荐商品加入购物车，例如“把第二个加进去”。
- 后端识别加购意图，并只基于当前会话最近推荐的库内商品定位 `productId`。
- 支持序号表达、单商品“这个”表达和明确商品名片段匹配；歧义或缺少上下文时主动澄清，不误加。
- 后端复用现有 `CartService.addItem` 完成加购，并在 SSE `done` 中可选返回 `cartAction`。
- Android 解析 `done.cartAction`，成功加购后刷新购物车状态，同时保持聊天回复和最近商品卡片稳定。
- 加购执行前先由 LLM 判断 AI 操作意图；LLM 否定、输出无效或异常时不执行加购，确认后不调用 vector search / RAG 生成，失败、缺目标和歧义都作为普通 assistant 回复展示。

## 待办清单

- [x] 新增后端 cart command 类型、识别与目标定位服务，并补单元测试。
- [x] 扩展聊天类型、RAG chat service、SSE done payload 和 contract fixture，接入 `cartAction`。
- [x] 确保 cart command 成功、歧义、缺上下文、序号越界、商品不可用等路径行为正确。
- [x] 扩展 Android chat stream contract / parser / ViewModel，处理 optional `cartAction`。
- [x] 在主界面接收成功加购 side effect 后刷新 `CartViewModel`。
- [x] 补齐后端和 Android 对应测试，覆盖 spec 要求的关键路径。
- [x] 运行后端 `npm.cmd test`、`npm.cmd run build` 与 Android `testDebugUnitTest`、`build`，记录结果。

## 备注

- Spec 来源：`context/feature/conversational-cart-add-spec.md`。
- 前置依赖已列为：`chat-context-memory-spec.md`、`active-clarification-spec.md`、`android-cart-api-foundation-spec.md`。
- 第一版在后端通过 LLM cart intent 处理自然语言加购命令，Android 不在 UI 层硬编码商品序号到 product id 的业务规则。
- 当前仍使用 demo user cart；登录用户购物车隔离不在本 spec 范围内。
- 本 spec 不包含删除购物车商品、修改数量、结算 / 下单 / 支付、复杂 LLM tool calling、真实商品对比页加购和“便宜的那个”这类比较推理。
- Product cards 要求：加购成功、缺目标或歧义时尽量保留最近推荐商品卡片；没有最近推荐时返回空卡片。
- Android 追加修复：聊天界面发送自然语言加购命令时保留当前商品推荐卡片，避免卡片先消失再随回复重新出现；普通新推荐 / 搜索消息仍可清空旧卡片。
- Android 追加修复：保留旧推荐卡片时，新一轮加购消息显示在卡片下方，避免用户消息插到卡片上方造成顺序错乱。
- Android 稳定版修复：商品卡片改为锚定到具体 assistant 消息，后续继续发送消息时不会重新漂到最新消息上方；聊天内容变化时自动滚动到最新位置。
- 后端稳定版修复：支持“第一个也是”这类带序号的继续加购追问，并按最近推荐卡片顺序定位商品；加购路径显式保留最近推荐顺序，避免数据库回查顺序影响“第几个”的含义。
- Android 稳定版补强：自动滚动等待下一帧布局后再滚到底，减少新消息发送后停留在旧位置的问题。
- 后端 AI 意图修复：新增 LLM cart intent 分类器，旧关键词 / 正则不再单独决定加购；它们只在 LLM 确认加购后用于目标和数量兜底，且最终仍限定在最近推荐商品 allowlist 内。
- 验证记录：
  - `cd server && npm.cmd run build` 通过。
  - `cd server && npm.cmd test` 通过，26 个 test files / 154 个 tests。
  - `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest` 通过。
  - `cd client/android && .\gradlew.bat --no-daemon build` 通过。
  - 追加修复后重新运行 `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest` 通过。
  - 卡片显示顺序修复后重新运行 `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest` 通过。
  - 稳定版聊天卡片锚点 / 自动滚动修复后重新运行 `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest` 通过。
  - 最终稳定版目标测试：`cd server && npm.cmd test -- --run src/modules/chat/cart-command.service.test.ts src/modules/chat/rag.service.test.ts src/modules/chat/chat.controller.test.ts src/modules/chat/chat-contract.fixture.test.ts` 通过，4 个 test files / 40 个 tests。
  - 最终稳定版目标测试：`cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.ui.chat.ChatViewModelTest" --tests "com.shopmate.app.data.chat.ChatStreamEventParserTest"` 通过。
  - 最终稳定版全量验证：`cd server && npm.cmd test` 通过，26 个 test files / 157 个 tests。
  - 最终稳定版全量验证：`cd server && npm.cmd run build` 通过。
  - 最终稳定版全量验证：`cd client/android && .\gradlew.bat --no-daemon build` 通过。
  - AI 意图修复目标测试：`cd server && npm.cmd test -- --run src/modules/chat/cart-command.service.test.ts src/modules/chat/cart-command-intent.service.test.ts src/modules/chat/rag.service.test.ts` 通过，3 个 test files / 29 个 tests。
  - AI 意图修复全量验证：`cd server && npm.cmd test` 通过，27 个 test files / 160 个 tests。
  - AI 意图修复全量验证：`cd server && npm.cmd run build` 通过。
  - Complete 前全量验证：`cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest` 通过。
  - Complete 前全量验证：`cd client/android && .\gradlew.bat --no-daemon build` 通过。

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
- 商品查询 API：新增 `/api/products` 列表和详情接口，支持关键词、类目、品牌、价格和分页过滤，统一 `ApiResponse<T>` 返回格式，并通过后端 build、占位 test、PostgreSQL 本地烟测和错误码验证。
- 代码扫描 Quick Wins 与安全清理：移除仓库内淘宝 storage state，补充生成数据与登录态忽略规则，新增 ShopMate 语境的 code-scanner / auth-auditor agent，修正 feature test 与 list-components workflow，并补上 Android 加购按钮无障碍标签、购物相关占位反馈和顶层页面状态保存；通过 TOML 解析和 `cd client/android && .\gradlew.bat build` 验证。
- 后端测试地基：接入 Vitest 和真实后端 `test` / `test:watch` 脚本，新增 product mapper、service 参数校验与 API response helper 单元测试，同步 feature test 说明，并通过 `cd server && npm.cmd run build` 与 `cd server && npm.cmd test` 验证。
- Vector RAG Documents：新增 RAG document 类型、builder、测试和 `rag:documents` 脚本，默认从 PostgreSQL 生成 `product-documents.jsonl` 与 `document-manifest.json`，支持 processed fallback、dry-run 和 limit，并通过 `cd server && npm.cmd test`、`cd server && npm.cmd run build` 验证。
- Vector Qdrant Index：接入 provider-neutral embedding wrapper、Qdrant collection / payload indexes、`rag:index` / `rag:search` 脚本和 `VectorSearchService`，完成 fake embedding / filter / payload mapping 单元测试，并通过后端 test、build、Qdrant Cloud 小批量索引与搜索联调。
- Vector Search Evaluation：新增固定离线检索评估集、`rag:evaluate` 脚本、vector evaluation 服务和 Vitest 测试，记录全量 Qdrant 索引 manifest 与评估结果；通过后端 test / build，`rag:evaluate` 达到 7/8 passed，剩余“不要含酒精”反选语义留给后续 negative constraint spec。
- LLM Client：新增 provider-neutral `LlmClient`、OpenAI-compatible Chat Completions adapter、LLM env config / validation、固定错误映射、mock client 和 Vitest 覆盖；通过 `cd server && npm.cmd test`、`cd server && npm.cmd run build`，并完成 Ark 真实 smoke test。
- RAG Chat Service：新增 `server/src/modules/chat/` 编排层，串联向量检索、PostgreSQL 商品回查、RAG prompt、LLM JSON parser 和稳定 fallback，确保商品卡片来自 PostgreSQL DTO；通过 `cd server && npm.cmd test` 与 `cd server && npm.cmd run build` 验证。
- Chat SSE API：新增 `POST /api/chat/stream` 流式接口，请求校验、SSE writer、chat controller 和 route 挂载，按 `message_delta`、`product_cards`、`done`、`error` 输出事件，并通过 `cd server && npm.cmd test` 与 `cd server && npm.cmd run build` 验证。
- Chat Contract Fixtures：新增后端聊天 SSE contract fixture、稳定 payload 类型和 fixture 对齐测试，固定 success、fallback、error 与 no product stream 场景；通过 `cd server && npm.cmd test` 与 `cd server && npm.cmd run build` 验证。
- RAG Evaluation Cases：新增第一轮 Chat SSE 黑盒测试 case 集，覆盖 8 个问题、P0 / P1 风险、短历史追问、filter / no result / grounding / comparison 观察点，并通过 Node 脚本验证 JSON 结构、唯一 caseId、合法 filter 字段和期望商品 ID。
- Chat SSE 与 RAG LLM 调用修复：修复 `request.close` 误触发 SSE abort、移除当前 Ark 模型不支持的 JSON response_format，并提高 RAG completion token 上限；通过 `cd server && npm.cmd test` 与 `cd server && npm.cmd run build` 验证。
- 代码扫描后续修复：补齐 Express 统一 API 404 / JSON parse error 返回，修复 SSE backpressure 和 abortSignal 向 embedding / Qdrant 透传，优化 RAG evaluation 批量商品回查与缓存，并同步 Vitest、工具说明和 Android UI reviewer prompt；通过 `cd server && npm.cmd test` 与 `cd server && npm.cmd run build` 验证。
- Refactor Scanner 高优先级重构：抽取 RAG 脚本 CLI 与 JSON / JSONL 文件工具、Android Figma frame 缩放 helper 和 SSE 测试解析 helper，保留原有行为边界；通过后端 test / build、RAG dry-run smoke 和 Android build 验证。
- Android Network Client：新增 Android 网络层基础，接入 OkHttp SSE、kotlinx.serialization、可配置 base URL、ChatStreamClient 和本地单元测试；通过 `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest` 与 `cd client/android && .\gradlew.bat --no-daemon build` 验证。
- Android 聊天 API 集成：将聊天推荐页接入真实 `POST /api/chat/stream`，新增 Repository / ViewModel / UI state、商品卡片 mapper、错误重试和加载状态，并通过 Android 单测 / build 与后端 test / build 验证。
- Android 商品详情 API 集成：新增 Product API client、DTO、repository、mapper、ProductDetailViewModel 和 state-driven 详情页，推荐卡片使用真实 productId 请求 `/api/products/:id`，支持 loading / 404 / 网络失败 / 解析失败状态，并将详情页顶部收口为仅左上角返回按钮；通过 `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest` 与 `cd client/android && .\gradlew.bat --no-daemon build` 验证。
- Android Main Chat App Flow：将主聊天入口 composer 接入共享 `ChatViewModel`，发送后直接进入真实聊天结果视图，支持商品卡片跳转真实详情、新聊天清空会话、本地内存历史记录与恢复、侧边栏历史全量滚动展示；通过 `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest` 与 `cd client/android && .\gradlew.bat --no-daemon build` 验证。
- Android 商品详情内容文案打磨：优化真实商品详情字段到推荐理由、亮点、规格和选择建议的映射，过滤 seed / demo 模板话术和注意事项误入亮点的问题，调整详情页推荐理由卡片与规格卡片的稳定显示，并补充 mapper 单元测试；通过 `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.data.products.ProductDetailMapperTest"` 与 `cd client/android && .\gradlew.bat --no-daemon build` 验证。
- Android Cart API Foundation：新增后端 `cart_items` migration 和购物车 API，Android 接入真实 CartApiClient / Repository / ViewModel / CartScreen 状态，推荐与详情页加购改为真实请求并按结果提示成功或失败，同时补充侧边栏历史重命名 / 删除交互；通过 `cd server && npm.cmd test`、`cd server && npm.cmd run build`、`cd client/android && .\gradlew.bat --no-daemon build` 验证。
- 代码扫描 Quick Wins（二）：拆分 Android JSON API / SSE 网络 client 超时配置，修复购物车仓库取消处理，补齐 CartApiClient 关键端点和错误响应测试，并为聊天 RAG filter 增加数组数量、单项长度、trim / dedupe 校验；通过 `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest`、`cd client/android && .\gradlew.bat --no-daemon build`、`cd server && npm.cmd test`、`cd server && npm.cmd run build` 验证。
- Android Runtime Config：拆分 debug / demo / release API Base URL 配置，支持 debug Gradle property 覆盖真机同 Wi-Fi 地址，将 cleartext HTTP 限定到 debug manifest overlay，并补充 URL 配置单元测试；通过 Android runtime config 单测、`build`、`assembleDebug assembleDemo` 和 merged manifest / BuildConfig 检查验证。
- Backend Deployment Readiness：新增后端健康检查、HOST / PORT 启动配置、可选 CORS allowlist、商品图片公开访问路径和部署 readiness runbook，统一 Product API / Chat 商品卡片图片路径映射；通过 `cd server && npm.cmd test` 与 `cd server && npm.cmd run build` 验证。
- Chat Context Memory：新增 Android 稳定 `conversationId` 与后端短期会话记忆，合并最近意图、预算 / 类目 / 偏好等约束用于 RAG 检索和 prompt，并通过后端 test / build、Android testDebugUnitTest / build、RAG search 与本地 chat stream smoke 验证。
- Active Clarification：新增主动澄清规则，在宽泛推荐问题进入 RAG 前返回 `NEEDS_CLARIFICATION`，扩展 SSE done payload / contract fixture / Android parser 与 ViewModel 处理，并让澄清后的下一轮回答复用同一会话记忆；通过后端 test / build、Android testDebugUnitTest / build 与本地 Chat SSE smoke 验证。
