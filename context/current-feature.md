# Current Feature: Comparison RAG Output

## 状态

Complete

## 目标

- 将现有 mock 商品对比升级为真实 RAG / LLM 对比链路。
- 用户能在主聊天中通过“帮我对比这两款”“对比第一款和第二款”等自然语言触发商品对比。
- 后端新增 LLM comparison intent 和 comparison generation，基于库内商品事实生成结构化对比结果。
- SSE 返回真实 `comparison_result` payload，普通 RAG / 澄清 / 购物车流程不发送对比事件。
- Android 聊天页展示对比入口，并让 `ProductComparisonScreen` 正式运行路径消费真实对比 state。
- 模型不可用、输出无效、目标不足或 product id 不在 allowlist 时，不生成预设对比表。

## 待办清单

- [x] 后端新增 `ComparisonIntentService`，让 LLM 判断 comparison intent、目标来源、序号 / 名称和用户关注点。
- [x] 在 `RagChatService.answer()` 中按购物车 intent、negative constraint、comparison intent、clarification / RAG 的优先级接入对比流程。
- [x] 实现对比目标解析：最近推荐商品、用户提到的商品名 / 品牌、category search 候选，并做 active product、去重、数量和 negative constraint 校验。
- [x] 新增 `ComparisonGenerationService`，让 LLM 基于已校验商品事实生成 `answer`、维度、cells、高亮和推荐结论。
- [x] 对 comparison generation 输出做 schema、长度、cell 覆盖、product id allowlist 和推荐商品合法性校验。
- [x] 扩展 SSE contract，新增 `comparison_result` event，并补 comparison success fixture / 顺序测试。
- [x] 确保 comparison result 不写入 popular query cache，普通 RAG / clarification / cart action 不受影响。
- [x] Android 扩展 `ChatStreamContract`、`ChatStreamEventParser` 和对应测试，解析 `comparison_result`。
- [x] Android 新增 comparison UI state / mapper，`ChatViewModel` 收到对比结果后暴露“查看对比”入口。
- [x] 改造 `ProductComparisonScreen` 和导航 route，让正式路径使用真实 `ComparisonUi`，mock 只保留给 Preview。
- [x] 验证窄屏对比表不横向溢出，缺失或非法 comparison payload 不打开对比页。
- [x] 运行后端验证：`cd server && npm.cmd test`、`cd server && npm.cmd run build`。
- [x] 运行 Android 验证：`cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest`、`cd client/android && .\gradlew.bat --no-daemon build`。
- [x] 用 spec 中的两轮 Chat SSE smoke test 确认 `comparison_result`、真实商品卡片和 allowlist 行为。

## 备注

- Spec 来源：`context/feature/comparison-rag-output-spec.md`。
- 实现顺序参考 `context/spec-implementation-order.md` 第 28 项：该 feature 属于进阶加分阶段，前置的 RAG、商品详情真实 API、主聊天 App flow、否定约束和购物车自然语言管理已在历史记录中完成。
- LLM-first 边界：comparison intent、对比维度、每格文案、推荐结论和用户可见说明都应由 LLM 基于库内商品事实生成；代码只负责候选、schema、长度、allowlist、active 商品和安全校验。
- 目标解析边界：最近推荐商品只能来自 `contextMemory.lastRecommendedProductIds`；商品名 / 品牌必须回查 PostgreSQL active products；少于 2 个商品或候选歧义时应澄清，不自动猜。
- 对比范围边界：第一版只支持 2 个商品对比；如果用户要求 3 个或更多商品，后端不生成对比表，由 LLM 自然说明目前只支持两款并请用户选出两款。不做真实 reranker、图片找货、多轮复杂决策树或把对比表塞进普通 assistant 文本。
- SSE 第一版优先使用独立 `comparison_result` event，事件顺序建议为 `message_delta` -> `product_cards` -> `comparison_result` -> `done`。
- Android 边界：Android 不根据关键词判断对比意图；如果 comparison payload 缺字段或校验失败，不打开对比页，只保留普通 assistant 回复。
- Smoke test 需要先用同一 `conversationId` 触发普通推荐，再追问“帮我对比这两款，哪个更适合油皮通勤”。
- 本轮实现：后端新增 comparison intent / generation 服务，`RagChatService` 在 negative constraint 后、clarification / 普通 RAG 前接入 comparison 分支；`comparison_result` 只在结构化生成成功时随 SSE 输出，模型错误或输出无效时保留普通商品卡片 fallback，不写入 popular query cache。
- 本轮实现：Android 扩展 `comparison_result` DTO / parser / mapper / ViewModel state，聊天页显示“查看对比”入口，`ProductComparisonScreen` 与导航 route 可消费真实 `ComparisonUi`，mock 数据只保留为 Preview / fallback。
- 验证通过：`cd server && npm.cmd test`（35 files / 234 tests passed）、`cd server && npm.cmd run build`。
- 验证通过：`cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.data.chat.ChatStreamEventParserTest" --tests "com.shopmate.app.ui.chat.ChatViewModelTest"`、`cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest`、`cd client/android && .\gradlew.bat --no-daemon -PSHOPMATE_DEMO_API_BASE_URL=https://api.example.test/ build`。
- 验证说明：`cd client/android && .\gradlew.bat --no-daemon build` 在未提供 `SHOPMATE_DEMO_API_BASE_URL` 时按既有 demo fail-fast 规则失败；带显式 HTTPS demo URL 的 build 已通过。
- Smoke 通过：本地两轮 Chat SSE 使用显式 UTF-8 body，第一轮推荐返回真实商品 `p_beauty_006` / `p_beauty_023` 并写入 `contextMemory.lastRecommendedProductIds`；第二轮追问“帮我对比这两款，哪个更适合油皮通勤”返回 `comparison_result`，事件顺序为 `message_delta` -> `product_cards` -> `comparison_result` -> `done`。
- Smoke 调整：PowerShell `Invoke-WebRequest` 直接传 JSON 字符串时中文 body 会导致本地 smoke 失真；本轮 smoke 改用 `[System.Text.Encoding]::UTF8.GetBytes($body)`。comparison generation 增加 60s LLM timeout，避免结构化对比在默认 30s provider timeout 下误落入 `LLM_ERROR` fallback。
- 体验修复：手机对比场景已确认后端会返回 `comparison_result`；Android 原先把“查看对比”入口渲染在商品卡片之后，容易被两张大卡挤到首屏下方，看起来像未触发。本轮已调整为先显示 comparison action，再显示商品卡片。
- 体验修复：对比追问不再把上一轮推荐商品卡挪到最新回复下方；`ChatViewModel` 对“对比这两款 / 这两个 / 第一款第二款”等追问保留原 `productCardsAnchorMessageId`。聊天页现在只保留轻量“打开对比详情”入口，完整对比进入独立详情页；`ProductComparisonScreen` 已去掉聊天气泡 / 输入框 / 侧边栏，改为纵向详情页 section，商品名称、参数值、亮点和结论不再使用省略号截断。
- 体验修复验证通过：`cd client/android && .\gradlew.bat --no-daemon :app:compileDebugKotlin`、`cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.ui.chat.ChatViewModelTest"`、`cd client/android && .\gradlew.bat --no-daemon -PSHOPMATE_DEMO_API_BASE_URL=https://api.example.test/ build`。
- 范围收口：comparison intent / generation / RAG target resolution / Android mapper 都已改为“刚好两款”契约；用户要求三款或更多时保留 LLM 生成的澄清说明，不创建 `comparison_result`。`ProductComparisonScreen` 的核心参数区改为每个维度下商品 1 / 商品 2 两格并列，文本自然换行撑高。
- 范围收口验证通过：`cd server && npm.cmd test -- comparison-intent.service.test.ts comparison-generation.service.test.ts rag.service.test.ts`、`cd server && npm.cmd test`（35 files / 237 tests passed）、`cd server && npm.cmd run build`、`cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.ui.chat.ChatViewModelTest"`、`cd client/android && .\gradlew.bat --no-daemon :app:compileDebugKotlin`、`cd client/android && .\gradlew.bat --no-daemon -PSHOPMATE_DEMO_API_BASE_URL=https://api.example.test/ build`。
- 入口消失修复：对比追问保留上一轮商品卡时，如果本轮 `product_cards` 为空或与 UI 锚点时序不一致，`ChatViewModel` 不再清空原商品卡；comparison mapper 会用本轮 stream 商品卡、当前商品卡和已保存 comparison 商品组成候选池，避免后端已返回 `comparison_result` 但“打开对比详情”入口消失。验证通过：`cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.ui.chat.ChatViewModelTest"`、`cd client/android && .\gradlew.bat --no-daemon :app:compileDebugKotlin`。
- 对比详情 UI 修复：`ProductComparisonScreen` 的对比商品、核心参数和推荐亮点都改为商品 1 / 商品 2 两列并列等高卡片；推荐亮点区给两款商品都显示商品编号，缺少 LLM highlight 时用商品推荐理由兜底。comparison generation prompt / parser 收紧“更优”规则：每个维度最多一个 `highlight=true`，只有用户有明确优先需求且单款明显更适合时才标；没有用户优先需求时服务层清空维度 highlight，LLM 同一维度误标两款更优时解析层全部清掉。验证通过：`cd server && npm.cmd test -- comparison-generation.service.test.ts`、`cd server && npm.cmd test`（35 files / 239 tests passed）、`cd server && npm.cmd run build`、`cd client/android && .\gradlew.bat --no-daemon :app:compileDebugKotlin`、`cd client/android && .\gradlew.bat --no-daemon -PSHOPMATE_DEMO_API_BASE_URL=https://api.example.test/ build`。
- Review 修复：Android comparison mapper 重新收紧为必须有刚好 2 个 `productIds`，且两个 id 都能映射到当前候选商品；不再用当前商品卡或推荐理由兜底生成对比详情。正式运行路径找不到真实 `comparisonId` 时返回聊天页，不再展示 mock 防晒对比。后端最近推荐超过两款且用户未明确序号时改为澄清，不静默截断前两款；comparison generation 至少要求 3 个完整维度。验证通过：`cd server && npm.cmd test -- comparison-generation.service.test.ts rag.service.test.ts chat-contract.fixture.test.ts`（3 files / 57 tests passed）、`cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.ui.chat.ChatViewModelTest"`、`cd client/android && .\gradlew.bat --no-daemon :app:compileDebugKotlin`。
- 对比详情 UI 调整：核心参数和推荐亮点卡片不再重复显示商品名；对比商品卡的 1 / 2 序号从图片内部移到整体卡片左上角；商品品类 / 子类改为绿色 tag 横向排列，空间不足时自然换行；移除“查看商品”按钮，改为点击商品图片或商品名进入详情。商品详情返回链路改为保留来源页，从对比页进入详情后返回同一个对比页，从聊天页进入详情后返回聊天页。验证通过：`cd client/android && .\gradlew.bat --no-daemon :app:compileDebugKotlin`。
- 入口偶发消失修复：Android 在每次发送前记录当前商品卡作为对比候选池，comparison mapper 会同时使用本轮 stream 商品卡、当前商品卡、发送前商品卡和已保存 comparison 商品，避免本轮空 `product_cards` 或时序抖动导致合法 `comparison_result` 被丢弃；对比追问期间聊天页始终保留上一轮商品卡原锚点，不被本轮对比商品卡替换。后端 recent recommendation 对比复核触发条件补充“第二个和第三个 / 2和3 / 二和三”等序号组合，避免第一跳 LLM 偶尔漏判后走普通 RAG。
- Review 修复：comparison intent 第一跳如果返回 `is_comparison=true` 但 `confidence=low`，且用户消息带有最近推荐对比线索，也会进入 focused LLM 复核，避免明确序号对比被低置信度分支直接关掉。验证通过：`cd server && npm.cmd test -- comparison-intent.service.test.ts`（1 file / 8 tests passed）。
- 入口再次消失修复：对“对比一下第二个和第三个 / 第2个和第3个 / 2和3”这类明确序号对比，若两轮 comparison intent LLM 偶尔都漏判为普通 RAG，后端会在确认最近推荐数量足够后只兜底解析目标为 `recent_recommendations` 的两个序号，仍由 LLM 生成对比标题、维度、亮点和结论；同时会修正 LLM 把明确序号错抽成 `category_search` 等不合规 target 的情况。验证通过：`cd server && npm.cmd test -- comparison-intent.service.test.ts`（1 file / 11 tests passed）、`cd server && npm.cmd run build`。

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
- Conversational Cart Add：新增 LLM cart intent 判断、后端最近推荐商品 allowlist 加购、SSE `cartAction`、Android 购物车刷新 side effect 和聊天卡片稳定锚点；通过后端 test / build 与 Android testDebugUnitTest / build 验证。
- Conversational Cart Add Response Generation：新增 `CartActionResponseService`，让加购结果 assistant 回复由 LLM 根据 `cartAction` 和库内商品上下文生成；模型失败时只返回最小状态消息，保持 `cartAction` contract 和 Android 刷新逻辑不变。通过后端目标测试、全量 test 与 build；未修改 Android contract。
- Active Clarification LLM Intent：新增 `ClarificationIntentService`，让模型判断是否需要澄清并输出用户可见 `clarification_question`；规则只提供候选品类 / 缺失槽位，短品类词也能进入 LLM intent，且模型无效时继续原 RAG 流程。通过后端目标测试、全量 test 与 build；未修改 Android contract。
- RAG Chat Response Generation：新增 `RagResponseGenerationService`，让无候选商品说明由 LLM 生成可继续聊天的导购回复；RAG LLM error、invalid output 和非法 product id 路径只返回结构化状态和库内候选卡片，Android 对已有 assistant 文案的 no-candidates 结果不再显示“重新输入”错误卡。通过后端 test / build 与 Android build 验证。
- Voice Input Composer UI：在正式语音输入前完成聊天输入框 UI 前置改造，支持左侧文字 / 语音切换、中间输入 / 按住说话胶囊、右侧独立发送按钮，移除图片入口并对齐顶部操作栏尺寸；通过 Android build 验证。
- Android Voice Input：接入 Android `SpeechRecognizer` 语音输入、运行时录音权限、按住说话胶囊、识别中 pending 用户气泡和语音 transcript 直发聊天链路；修复权限后自动录音、首次按住卡波形、新聊天页提前跳转等真机反馈问题，并通过 `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest` 与 `cd client/android && .\gradlew.bat --no-daemon build` 验证。
- Popular Query Cache：新增后端进程内 TTL / LRU 热门查询缓存，普通 RAG 请求在 cart intent 与 clarification intent 之后查缓存，命中后仍回查 active 商品并重建商品卡片；缓存 key 纳入 query / filters / topK / 模型 / prompt / RAG 数据版本 / 可见边界，且只缓存安全 success 与 LLM 生成的 no-candidates 回复。通过后端 test / build 验证。
- 代码扫描后续修复（三）：修复 RAG 否定约束进入 vector filter、SSE abort 被 LLM wrapper 吞掉后继续写状态、Android 首次录音授权不自动开始、demo / release 默认无效 API 地址、Android app-local 忽略规则和 README 启动说明，并先抽出 `PopularQueryCacheCoordinator` 降低 `RagChatService` 职责；通过后端目标测试 / 全量 test / build、Android `testDebugUnitTest`、默认 `assembleDemo` fail-fast 和带显式 HTTPS URL 的 Android build 验证。
- Refactor Scanner 高优先级重构：抽取 Android 商品展示格式化 / placeholder helper、后端 Chat LLM 输出解析工具和商品可售判定 helper，收口 catalog JSON / JSONL helper，并修正 repo-local feature workflow 文档；通过后端 test / build、Android testDebugUnitTest、带 demo URL 的 Android build 和 diff check 验证。
- Android 语音输入回归修复：修复主聊天入口页语音按住后看不到识别中气泡的问题，语音监听 / 识别时进入聊天流，并固定 SpeechRecognizer 使用 `zh-CN` 识别中文；通过 Android 目标单测、完整 `testDebugUnitTest` 与 `assembleDebug` 验证。
- Negative Constraint RAG：新增 LLM negative constraint intent、会话记忆负向约束、向量 must_not、检索后商品事实过滤和 RAG prompt 排除约束展示；自然语言否定约束不再由正则作为权威判断，最终 `productCards` 只来自过滤后的候选。通过后端目标测试、全量 test、build、JSON 校验和本地 Chat SSE smoke 验证。
- Cart Natural Language Management：新增聊天自然语言购物车管理，支持查看、加购、删除、改数量、勾选 / 取消勾选和清空确认；后端基于当前购物车快照、最近推荐 allowlist 和 active 商品事实解析目标，Android 根据成功 mutation 的 `cartAction` 刷新购物车；通过后端 test / build、Android testDebugUnitTest / build 和本地 Chat SSE smoke 验证。
