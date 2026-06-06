# Current Feature: AI Checkout Backend Patch Contract

## 状态

Complete

## 目标

- 将聊天侧 AI 下单从单一地址更新升级为结构化 checkout draft patch contract。
- 新增推荐 action `update_checkout`，同时兼容旧 `update_address` / `addressText` 输出。
- 支持通过对话更新收货人、手机号、详细地址、配送方式和支付方式。
- 后端对 shipping / delivery / payment patch 做校验和 allowlist 约束，金额、配送费和支付状态仍以后端 draft / order 为准。
- `done.checkoutAction` 保持兼容，并返回完整 draft snapshot 供 Android 后续订单草稿卡片渲染。
- 确认前不创建订单，确认后才创建 order / order_items 快照并触发购物车刷新。

## 待办清单

- [x] 扫描现有 checkout intent、command、response、pending draft store、orders service / mapper / controller 和相关测试，确认当前 contract 与数据结构。
- [x] 扩展 `CheckoutIntentService` 的 action / schema / prompt 解析，支持 `checkoutPatch`、`update_checkout`、旧 `update_address` 兼容和低置信 fallback。
- [x] 扩展 checkout / order 类型，新增 `CheckoutPatchInput`、`CheckoutDraftSnapshot`、`CheckoutChangedField` 和 `draft_updated` 等稳定 contract。
- [x] 在 `CheckoutCommandService` 中新增 `updateCheckout` 路径，兼容旧地址更新，并保证没有 pending draft 时不 mutation。
- [x] 在 `OrderService` 中实现 pending draft patch 更新、shipping 校验、delivery / payment allowlist 校验、配送费和 total 重新计算。
- [x] 增加 draft snapshot mapper，避免直接泄露内部 pending store 类型。
- [x] 更新 `CheckoutResponseService` prompt，让 LLM 基于 `changedFields` 和 draft snapshot 生成用户可见回复，并避免“mock / fake / 模拟”等 UI 词。
- [x] 补齐后端测试：intent patch、command draft update、order draft 校验、Chat SSE `done.checkoutAction` snapshot 和旧字段兼容。
- [x] 运行 `cd server; npm.cmd test` 和 `cd server; npm.cmd run build`，记录真实结果。

## 备注

- Spec 来源：`context/feature/ai-checkout-backend-patch-contract-spec.md`。
- 范围：本轮只做后端 contract 和 LLM intent / command / order draft patch，不新增 Android 聊天订单卡片，不新增独立 `checkout_action` SSE event。
- 业务边界：LLM 只负责识别 checkout intent 和结构化 patch；商品、价格、配送费、支付状态、订单创建和购物车刷新都必须由后端校验后的业务逻辑决定。
- 兼容要求：保留旧 `done.checkoutAction` 字段、旧 `update_address` action 和旧 `addressText` fallback；如果结构化 patch 与 `addressText` 同时存在，优先使用结构化 patch。
- 安全要求：没有 checkout intent 不进入 command；没有 pending draft 不允许确认直接创建订单；没有用户明确确认不创建 order；手机号保存和日志输出必须脱敏。
- 验证重点：`CheckoutIntentService`、`CheckoutCommandService`、`OrderService`、Chat SSE contract，以及 `checkoutAction.draft` 是否包含 address、items、summary、selected delivery / payment、options 和 expiresAt。
- 实现记录：`PendingCheckoutDraft` 新增 selected delivery / payment，`CheckoutActionResult` 保留旧顶层字段并新增 `draft` snapshot 和 `changedFields`；聊天侧 `update_checkout` 与旧 `update_address` 共用后端 patch 校验路径。
- Review 修复：修复 LLM 只输出部分 `checkout_patch.shipping` 字段时 undefined own-key 被误当成待更新字段的问题；parser 只返回有值字段，OrderService 忽略 undefined patch 字段但继续拒绝空字符串。
- 验证结果：`cd server; npm.cmd test -- --run src/modules/orders/order.service.test.ts src/modules/chat/checkout-command.service.test.ts src/modules/chat/checkout-intent.service.test.ts src/modules/chat/rag.service.test.ts` 通过，4 个 test files、88 个 tests。
- 验证结果：`cd server; npm.cmd test` 通过，55 个 test files、406 个 tests。
- 验证结果：`cd server; npm.cmd run build` 通过。

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
- 代码扫描 Quick Wins（四）：完成 provider 错误脱敏、query rewrite timeout 取消、Product API offset 上限、research skill 同步、Android 聊天 LazyColumn 渲染和语音输入无障碍补强，并抽出 query rewrite race helper 收口 `RagChatService` 职责；通过后端 test / build、Android testDebugUnitTest 和带 demo HTTPS property 的 Android build 验证。
- 图片找货后端解释接口：新增 `POST /api/image-search/interpret` multipart 后端入口、Busboy 图片校验、OpenAI-compatible 视觉意图 provider wrapper、`VisualIntent` 规范化和业务动作安全门；通过后端目标测试、全量 test、build 和 staged diff check 验证，真实 provider live smoke 因未配置 vision model 未跑。
- 图片找货 Chat/RAG 集成：把图片解释结果返回的内部 `chatMessage`、filters 和低敏 `imageSearch` metadata 接入现有 Chat SSE，Android 成功路径调用 `POST /api/chat/stream` 且用户气泡仍显示原始图片请求；后端继续通过 LLM intent、allowlist、comparison、cartAction、clarification 和 negative constraint gates 约束业务动作。通过后端 test / build、Android testDebugUnitTest 和带 demo HTTPS property 的 Android build 验证。
- Android 图片找货上传入口：在聊天输入区接入 Photo Picker 单图附件、输入框内图片入口、预览删除和重试状态，新增 Android 图片压缩重编码与 multipart interpret client；成功复用 Chat SSE，失败 / 低置信保留输入且不进入后续 history。通过 Android `testDebugUnitTest` 和带 HTTPS base URL 的 `build` 验证，真实 provider smoke 未跑。
- 图片找货评估闭环：新增 V1 小样本图片评估 cases、真实 provider runner、结果 JSONL、结构校验和评估报告；V1.1 对齐图片找货类目到商品库真实类目，确认小家电 case 恢复库内召回，当前不建议启动 V2 image embedding；通过后端 evaluation validate、全量 test 和 build 验证。
- 图片找货 V2 图片向量索引：新增商品主图 image documents、image embedding client、独立 Qdrant image collection、V2 vector-search endpoint、索引 / 评估脚本和真实索引产物；全量写入 175 条 image vectors，真实 V2 evaluation 5 条商品 case top-1 与 V1 对齐，并补充 Android 拍照入口和 V2 上传 MIME / 文件头校验；通过后端 build / 全量 test、Android testDebugUnitTest / build、真实上传 smoke 和 Qdrant count 验证。
- Mock Checkout Agent Flow：新增 mock order / order_items、pending checkout、LLM checkout intent / response、Chat SSE `checkoutAction`、Android checkout contract 和购物车确认面板；聊天入口支持多轮地址修改 / 确认下单，购物车按钮走独立确认面板并记录 `source=cart_button`。通过后端全量 test / build、Android testDebugUnitTest / 带 demo HTTPS URL build、真实 Chat SSE smoke 和真实 cart-button checkout API smoke 验证。
- Android Checkout Detail Page：新增独立确认订单页、地址编辑 / 本地地址簿、配送 / 支付选择、金额明细和提交成功页；后端扩展 checkout draft / confirm contract，保存 shipping / delivery / payment 快照并保持商品金额以后端 draft 为准。通过后端 test / build、Android testDebugUnitTest 和带 demo HTTPS URL 的 Android build 验证。
