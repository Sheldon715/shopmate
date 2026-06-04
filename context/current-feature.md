# Current Feature: Comparison Target Consistency and Performance

## 状态

Complete

## 目标

- 修复最近商品序号对比的目标错位问题，确保“前两个”“第一个和第三个”按 Android 当前可见商品卡顺序解析。
- 保持 LLM comparison intent 权威，Android 只回传当前可见商品 id 作为指代上下文，不直接决定对比行为。
- 对比目标不足、越界、超过两款、下架或歧义时走 LLM 澄清，不猜商品、不回落普通推荐。
- 对比 generation 失败或超时时返回安全基础事实对比，不再只显示“这次没有生成可靠推荐说明。”
- 优化最近商品读取和对比 generation 慢路径，保留 comparison timing 方便继续定位瓶颈。
- 对比 generation 慢路径期间在 LLM comparison intent 确认且目标可执行后立刻流出预设短提示，Android 继续显示 loading 气泡直到 `comparison_result` 返回。

## 待办清单

- [x] 新增 `recentProductIds` Chat SSE request 字段，完成后端解析、trim、dedupe、数量和长度限制。
- [x] Android `ChatViewModel` 发送消息时捕获当前商品卡 id 顺序，并通过 repository / request DTO 回传后端。
- [x] 后端 comparison intent、prefetch、target resolution 使用同一组 recent ids，优先 request 可见卡片顺序，回退 context memory。
- [x] 补齐显式序号解析：前两个、第一个和第三个、第 1 个和第 3 个、第二个和第三个，越界时澄清。
- [x] 为 comparison generation error / invalid / timeout 增加安全基础事实 `comparison_result` fallback，保持 `fallbackUsed=true`。
- [x] 压缩 comparison generation facts / timeout，并确认 timing 包含 comparison 关键阶段。
- [x] 补充后端单元测试：request 解析、request recent ids 优先、越界澄清、generation fallback、现有 comparison 回归。
- [x] 补充 Android 单元测试：repository 发送 `recentProductIds`、comparison follow-up 使用当前商品卡顺序且锚点不漂移。
- [x] 运行 `cd server; npm.cmd test`。
- [x] 运行 `cd server; npm.cmd run build`。
- [x] 运行 `cd client/android; .\gradlew.bat --no-daemon testDebugUnitTest`。
- [x] 运行 `cd client/android; .\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/`。
- [x] 后端 comparison generation 在 SSE streaming 模式下从同一次 LLM JSON 输出提前抽取 `answer` 并写入 `message_delta`。
- [x] 保持过渡回答由 LLM 生成，不新增固定“正在对比中”模板，不新增 SSE event。
- [x] 确认 Android 现有 streaming/loading 气泡在 `comparison_result` 前持续显示，必要时补单测。
- [x] 运行相关后端 / Android 目标测试。
- [x] 第二版实现：轻量等待语与正式 comparison JSON 并行，等待语失败或超时时静默跳过，不再从正式 JSON `answer` 抽取首句提示。
- [x] 第三版实现：轻量等待语先占用一个极短前置窗口，抢不到就跳过，再启动正式 comparison JSON，避免等待态和正式结果同到。
- [x] 放宽正式 comparison JSON 的维度、facts 和 token 预算，让结果保持 3-5 个有信息量的维度。
- [x] 补充后端测试覆盖等待语成功、失败和超窗跳过。
- [x] 运行 `cd server; npm.cmd test -- rag.service.test.ts comparison-generation.service.test.ts`。
- [x] 运行 `cd server; npm.cmd run build`。
- [x] 第四版实现：等待语窗口调长到真实模型可命中，不再因为 1s 超时几乎永远不显示。
- [x] 第四版实现：正式 comparison JSON 改为质量优先，要求 4-6 个维度、更完整 cell / conclusion / highlights。
- [x] 更新后端测试覆盖新等待窗口与更高详情预算。
- [x] 运行 `cd server; npm.cmd test -- rag.service.test.ts comparison-generation.service.test.ts`。
- [x] 运行 `cd server; npm.cmd run build`。
- [x] 跑真实 LLM comparison streaming smoke，确认等待语、`comparison_result` 和详情维度。
- [x] 第五版实现：移除独立轻量等待语 LLM 调用，改为 comparison intent + target resolution 通过后立即写预设 `message_delta`。
- [x] 第五版实现：Android 在已有 assistant 文本且仍 streaming 时继续显示 loading 气泡，直到 `comparison_result` / `done`。
- [x] 更新后端 / Android 测试覆盖预设句顺序和 loading 气泡状态。
- [x] 运行目标测试与后端 build。
- [x] 修复对比详情“推荐亮点”误用商品卡 fallback 推荐理由的问题。
- [x] 后端强制无明确偏好时清空 `recommendedProductId` 和 `highlights`，避免模型越界输出推荐信号。
- [x] 补充并运行后端 / Android 目标测试。

## 备注

- Spec 来源：`context/feature/comparison-target-consistency-performance-spec.md`。
- 触发原因：截图显示“对比前两个”没有生成 `comparison_result`，以及“第一个和第三个”可能比较到用户当前屏幕之外的商品。
- 行为边界：LLM comparison intent 仍是权威；`recentProductIds` 只是当前可见商品卡顺序上下文，后端必须回查 active 商品并做 allowlist 校验。
- Contract 边界：不新增 SSE event；新增 request 字段必须可选，旧客户端不传时继续使用 context memory。
- Fallback 边界：安全基础事实对比只能展示库内事实，不生成推荐高亮、购买建议或模型式结论。
- 性能边界：本 feature 优化 comparison 专用慢路径，不重新定义普通 RAG 首 token 或 Android 打字机体验。
- 体验边界：用户最新要求改为 LLM comparison intent 仍负责是否进入对比；一旦目标可执行，代码可以发送固定短提示作为等待反馈，但不能绕过 intent、target resolution、active 商品回查或 allowlist 校验。
- 验证计划：以后端目标测试覆盖 target resolution 和 fallback；以 Android 单测覆盖请求上下文和锚点；最后跑后端 test / build 与 Android test / build。
- 收口记录（2026-06-04）：后端补齐 `recentProductIds` request 解析测试、request visible ids 优先测试、越界澄清测试和 generation fallback 测试；comparison generation 保持每商品最多 5 条 facts / 120 字，但将预算修正为 35s timeout、1600 completion tokens，避免真实模型输出被截断。
- 修复记录（2026-06-04）：comparison generation 返回截断或 malformed JSON 时统一归类为 `LLM_INVALID_OUTPUT`，并返回安全基础事实 `comparison_result`，避免落到普通 `LLM_ERROR` 推荐失败文案。
- 根因记录（2026-06-04）：真实模型诊断显示 LLM 未整体故障；“对比前两个”在 960 completion tokens 下 `finishReason=length`，JSON 被截断，导致持续进入基础事实 fallback。修复方向是恢复正常结构化对比优先，基础事实只做保底。
- Smoke 记录（2026-06-04）：编译后服务 mock 截断 JSON 路径返回 `fallbackReason=LLM_INVALID_OUTPUT`、`hasComparisonResult=true`，基础维度为 `brand_category` / `price` / `facts`；修复后真实 LLM + `RagChatService.answer("对比前两个")` 返回 `fallbackUsed=false`、`hasComparisonResult=true`、3 个正常对比维度。
- 验证结果（2026-06-04）：`cd server; npm.cmd test` 通过（42 files / 327 tests），`cd server; npm.cmd run build` 通过，`cd client/android; .\gradlew.bat --no-daemon testDebugUnitTest` 通过，`cd client/android; .\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/` 通过。
- 体验修复记录（2026-06-04）：comparison generation 的同一次 LLM JSON 流式输出会先抽取 `answer` 写入 `message_delta`；Android 保持 assistant `isStreaming=true` 和 `isSending=true` 到 `done`，所以过渡回答显示后仍继续等待 `comparison_result`。
- 验证结果（2026-06-04）：`cd server; npm.cmd test -- rag.service.test.ts comparison-generation.service.test.ts` 通过（2 files / 75 tests），`cd server; npm.cmd run build` 通过，`cd client/android; .\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.ui.chat.ChatViewModelTest"` 通过。
- 二版修复记录（2026-06-04）：上一版仍依赖正式 comparison JSON 的 `answer` 字段作为首句提示，真实 smoke 会被完整 JSON 生成速度拖慢；本轮改为独立轻量 LLM 等待语与正式结构化对比并行，等待语只在正式结果完成前抢首个 `message_delta`，失败、空输出或超时会静默跳过，正式 `comparison_result` 继续按原流程返回。
- 验证结果（2026-06-04）：`cd server; npm.cmd test -- rag.service.test.ts comparison-generation.service.test.ts` 通过（2 files / 76 tests），`cd server; npm.cmd run build` 通过，`cd server; npm.cmd test` 通过（42 files / 329 tests）；本轮只改后端 comparison 生成 / 编排与后端测试，未重新运行 Android 检查。
- 三版修复记录（2026-06-04）：已将等待语从“与正式 JSON 并行竞速”调整为“正式 JSON 前的极短前置窗口”；若等待语 1s 内成功，先写一条 `message_delta`，若失败、空输出或超窗则跳过并立即进入正式 `comparison_result` 生成。
- 三版验证结果（2026-06-04）：`cd server; npm.cmd test -- rag.service.test.ts comparison-generation.service.test.ts` 通过（2 files / 77 tests），`cd server; npm.cmd run build` 通过；本轮只改后端 comparison 生成 / 编排与后端测试，未重新运行 Android 检查。
- 四版调整记录（2026-06-04）：等待语前置窗口与 provider timeout 调整为 8s；真实 provider 诊断显示等待语在 80 / 120 / 160 completion tokens 下返回 `LLM_EMPTY_RESPONSE`，240 tokens 可返回短等待语，所以等待语预算调为 240。正式 comparison JSON 恢复质量优先，要求 4-6 个维度，放宽 cell / conclusion / highlights / facts 预算，并增加 `comparison_waiting_answer_*` timing。
- 四版验证结果（2026-06-04）：`cd server; npm.cmd test -- rag.service.test.ts comparison-generation.service.test.ts` 通过（2 files / 78 tests），`cd server; npm.cmd run build` 通过；真实 Chat SSE smoke 使用 `message="对比前两个"` 与 `recentProductIds=["p_beauty_006","p_beauty_023"]` 返回等待语 `message_delta` 约 11.66s，`comparison_result` 约 28.63s，`fallbackUsed=false`，正式对比 4 个维度。
- 五版调整计划（2026-06-04）：真实体验仍然认为等待语过慢；本轮把等待语 LLM 调用移除，改为 LLM comparison intent + 目标解析通过后立即发送固定短提示，正式对比仍由 LLM JSON 生成。
- 五版验证结果（2026-06-04）：`cd server; npm.cmd test -- rag.service.test.ts comparison-generation.service.test.ts` 通过（2 files / 75 tests），`cd server; npm.cmd run build` 通过，`cd client/android; .\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.ui.chat.ChatViewModelTest"` 通过。
- 六版修复计划（2026-06-04）：截图显示“推荐亮点”在没有真实 comparison highlights 时展示了商品卡 fallback `推荐理由：品牌 · 类目，当前可选。`；本轮改为只展示真实 `comparison_result.highlights`，并在后端无明确偏好时清空推荐信号。
- 六版验证结果（2026-06-04）：`cd server; npm.cmd test -- comparison-generation.service.test.ts` 通过，`cd server; npm.cmd run build` 通过，`cd client/android; .\gradlew.bat --no-daemon testDebugUnitTest --tests "com.shopmate.app.ui.comparison.ProductComparisonScreenTest" --tests "com.shopmate.app.ui.chat.ChatViewModelTest"` 通过。

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
- Comparison RAG Output：新增真实商品对比链路，后端用 LLM comparison intent / generation 基于库内商品事实输出 `comparison_result`，Android 聊天页展示对比入口并让独立对比详情页消费真实 state；收口为仅支持两款商品对比，补齐入口稳定性、两款契约、UI 自适应和返回链路验证。
- Negative Constraint Fact Evaluation：新增商品事实冲突判定 helper，统一 Chat 负向约束过滤与离线 evaluator，修复 free-from 安全证据误判；补充耳机佩戴形态结构化数据并重建 catalog / RAG documents / vector manifest，复跑后端 test / build、离线评估和 Chat SSE 评估。
- RAG Query Rewrite：新增 LLM 驱动的检索 query 改写服务，在 cart / negative constraint / comparison / clarification 之后、popular cache 和 vector search 之前生成 retrieval query；原始 question 仍用于用户可见回复，cache key 和离线 evaluator 增加 rewrite metadata，并通过后端全量 test / build、baseline 与 rewrite 模式 `rag:evaluate` 验证。
- RAG Negative Fact Metadata：新增负向事实 metadata 提取与 Qdrant payload，写入 free-from / risk / wearing style 字段；将负向约束转成结构化 vector filters，修复“不含酒精”和“不要入耳式”召回误伤，并通过后端全量 test / build、RAG documents / index 重建、14/14 离线评估和 Chat SSE smoke 验证。
- Comparison Ambiguous Clarification：新增 comparison target resolution gate，目标不足、过多、无效或歧义时返回 LLM 澄清并跳过普通 RAG；最近推荐刚好两款时直接生成 `comparison_result`，并补齐 SSE contract、Android fallback、Chat evaluation case 和后端回归测试。
- RAG Gradio Evaluation Workbench：新增仓库根目录本地 Gradio 内部评估工作台，支持 CSV 批量 Chat SSE 评估、中文仪表盘、人工评分、可选 LLM 初评、单条调试、证据摘要、首 token / 总耗时指标和 JSONL / CSV / summary 留档；通过 Gradio self-test、后端 test / build、Playwright 页面 smoke 和 3 条 live sample smoke 验证。
- Voice LLM ASR Upgrade：新增后端 `POST /api/asr/transcribe` 云端转写接口和 Android 录音上传链路，ASR 成功后复用现有聊天 / RAG 流程，失败或空结果不触发 RAG；修复主界面长按语音首次录音被切页打断，并补充后端 ASR 与 Android ASR 相关测试。
- 首 Token 优化：新增 OpenAI-compatible LLM streaming、RAG SSE 真实流式 `message_delta`、阶段 timing metadata、prompt / token 压缩和普通推荐 intent 候选预筛；通过后端 test / build 与直接 Chat SSE smoke 验证，冷路径首 token 从约 39.3s 降至约 14.04s，缓存重复查询约 7.93s。
- 首 Token 体验回归修复：移除后端固定安全预响应，统一由 Android 本地 streaming/loading 气泡承担等待反馈，后端首条 `message_delta` 保持为真实业务回答；补充后端真实首 delta 与 Android 多意图等待态测试。
- 对比追问商品卡锚点修复：泛化 Android 对最近双商品比较追问的识别，修复“对比前两个”时商品卡片重新挂到新问题下面的问题；通过 ChatViewModel 单测验证。
- 对比回答首 Token 优化：压缩 comparison generation prompt 和商品 facts，上调并行度；最近推荐对比在 intent 阶段并行预取商品上下文，命名商品对比并行查找目标，并补充 comparison timing 与后端回归测试。
- RAG Pipeline 并行首 Token 优化：新增原 query 检索与 query rewrite 并行竞速、rewrite 超时降级、retrieval strategy / timing metadata、Android 本地等待气泡回归、Gradio 下载路径修复，并顺手修复“对比前两个”两维度 comparison 输出容错；通过后端目标测试 / 全量 test / build、Android testDebugUnitTest / 带 demo URL build、Gradio self-test 验证。
- Comparison Target Consistency and Performance：新增 Android 可见商品顺序 `recentProductIds` 回传和后端 request 优先解析，修复显式序号对比目标漂移与越界澄清，generation 失败时返回安全基础事实 `comparison_result`，并压缩对比生成慢路径；通过后端 test / build 与 Android testDebugUnitTest / 带 demo URL build 验证。
