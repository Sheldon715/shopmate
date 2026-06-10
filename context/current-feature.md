# Current Feature: RAG Document and Embedding Text Cleanup

## 状态

Complete

## 目标

- 校准 `retrieval-baseline-cases.json` 中 `dorm-small-appliance-paraphrases` 的 expected product set，并在报告中写清商品事实依据。
- 清理进入 RAG document / embedding text / snippet 的 dataset、demo、source、process 和图片占位等污染文本，同时保留真实商品事实。
- 新增每个 active product 的 `product_profile` 主文档，并将旧 `content_block` 粗粒度类型映射到更明确的 docType。
- 新增 deterministic 中文 alias / natural language tags，优先覆盖 baseline 中的洁面、防晒、耳机、厨房小电、办公外设、空气护理和跑鞋场景。
- 重建 RAG documents 与 Qdrant index，复跑 baseline，并在 `docs/rag-tuning-report.md` 输出 E0 -> E1 对比。

## 待办清单

- [x] 复核 `retrieval-baseline-traces.jsonl` 中 `一人食省空间小家电` 的 top hits，并回查商品事实判断 `p_home_kitchen_004` / `002` / `001` 是否应进入 expected set。
- [x] 按事实更新 `data/processed/rag/retrieval-baseline-cases.json`，并准备报告中的 Expected Set Audit 说明。
- [x] 新增 `rag-document-text-cleaner.ts` 与单测，清理污染短语、视觉生产标签和低价值内容块关键词，确认真实品牌、价格、规格、场景、限制和评论事实不被误删。
- [x] 新增 `rag-document-aliases.ts` 与单测，覆盖 baseline 高价值类目，保证 alias 去重、trim、不产生空值或过宽噪音词。
- [x] 重构 `rag-document.builder.ts` / types / mapper 测试：生成 `product_profile`，映射 `product_specs`、`selling_points`、`use_cases`、`constraints`、`faq`、`reviews_summary`，并停止生成 raw `description` 文档。
- [x] 同步 Qdrant payload、vector search trace、RAG debug trace 等相关 docType 类型；如只需 keyword payload index，保持写入兼容。
- [x] 运行目标后端测试：`npm.cmd test -- rag-document-text-cleaner.test.ts rag-document-aliases.test.ts rag-document.builder.test.ts` 与相关 trace / baseline evaluator 测试。
- [x] 运行 `npm.cmd run build` 和必要的全量 `npm.cmd test`。
- [x] 运行 `npm.cmd run rag:documents`，检查 `product-documents.jsonl`、`document-manifest.json` 中的污染文本、docType 分布和 product_profile 覆盖。
- [x] 在外部服务可用时运行 `npm.cmd run rag:index -- --recreate` 与 `npm.cmd run rag:baseline ...`，更新 index manifest、baseline results/traces 和 `docs/rag-tuning-report.md`。
- [x] 在报告中补充 `E1 Document / Embedding Cleanup` 小节，记录 expected audit、document text changes、before/after metrics、remaining failures 和 next recommended spec。

## 备注

- Spec 来源：`context/feature/rag-document-embedding-cleanup-spec.md`。
- 上游基线：`RAG Debug Trace and Evaluation Baseline` 已完成，E0 为 24 条 query 中 23 条通过，唯一失败是 `dorm-small-appliance-paraphrases` / `一人食省空间小家电`。
- 范围边界：本阶段只处理 expected set 校准、document / embedding text cleanup、docType 责任拆分、product_profile 和 deterministic alias；不改 Android UI、Chat SSE contract、cart / checkout / comparison / clarification 业务逻辑，不通过 prompt 掩盖检索问题。
- 明确非目标：不做 keyword / BM25 / sparse retrieval、hybrid retrieval、candidate merge、rule-based reranker，也不为了分数删除失败 case。
- 验证重点：E1 的 recall@10、MRR@10、paraphrase overlap@10 不低于 E0；constraint satisfaction、negative constraint accuracy 保持 1.000；stale hit rate 保持 0.000。
- 外部依赖：Qdrant / embedding 不可用时先完成 documents 和 tests，并在报告中明确 index / baseline 未完成原因，不编造 E1 指标。
- 实施记录：`rag:index -- --recreate` 首次超过 10 分钟工具超时，但后台进程继续执行并已等待完成；`vector-index-manifest.json` 已更新为 1889/1889 indexed。
- E1 结果：baseline 24/24 通过，recall@5/10/20 = 1.000，MRR@10 = 1.000，candidate overlap@10 = 0.935，constraint / negative / no-result 均保持 1.000，stale hit rate = 0.000。
- 文档检查：`product-documents.jsonl` 当前 1889 docs，175/175 active product 均有 `product_profile`，未检出本 spec 指定的 dataset/demo/process/visual 污染 marker。
- 已执行验证：目标 Vitest 7 个文件 42 个测试通过；后端全量 `npm.cmd test` 61 个文件 484 个测试通过；`npm.cmd run build` 通过。

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
- AI Checkout Backend Patch Contract：新增聊天侧结构化 checkout draft patch contract，支持 `update_checkout`、旧 `update_address` 兼容、shipping / delivery / payment 后端校验、draft snapshot 与 changedFields；通过后端全量 test 和 build 验证。
- Android Chat Checkout Draft Card：新增 Android 聊天订单草稿卡片，解析 `checkoutAction.draft`，支持草稿创建 / 更新 / 取消 / 过期 / 失败 / 提交状态展示，卡片可进入 `CheckoutScreen(draftId)` 并通过聊天确认或取消下单；通过 Android `testDebugUnitTest` 和带 demo HTTPS URL 的 build 验证。
- Checkout Realtime SSE Event：新增独立 `checkout_action` SSE event，Android 可在 `done` 前同步 checkout draft 状态并对 `done.checkoutAction` 去重；同时修复下单成功后草稿卡残留和购物车合计金额截断问题。通过后端 test / build、Android `testDebugUnitTest`、带 demo HTTPS URL 的 Android build 和本地 Chat SSE smoke 验证。
- Android Buddy Lottie Motion：新增 `ShopMateBuddyMotion`、Home 到 Chat 的 Buddy 视觉桥接、本地 Lottie raw 动效和 PNG fallback，聊天等待态顶部 Buddy 可切换 Thinking；补充过渡控制器单元测试，并通过 Android `testDebugUnitTest` 和带 demo HTTPS URL 的 build 验证。
- Android State Lottie Feedback：新增统一 `ShopMateLottieStateIndicator`、4 个本地状态 Lottie 资源和 resource 映射测试，接入聊天等待、语音 listening / transcribing、图片解释 / 搜索 busy 状态；根据反馈优化语音条提示、上滑取消和动效占比，并将 Android app 名称与 launcher icon 更新为“抖选选”。通过 Android `testDebugUnitTest`、带 demo HTTPS URL 的 build 和 diff check 验证。
- Android Home Prompt Carousel：将 Home prompt 从 4 条升级为 8 条可循环匀速滚动中文建议，覆盖推荐、预算、反选、图片找货、对比、购物车 checkout 等入口；统一 Home / 推荐页顶部按钮、composer、聊天气泡阅读尺度，修正键盘避让、顶部按钮亮斑、Buddy 透明头像与键盘开合 Lottie morph；新增 `MockShopMateDataTest`，并通过 Android `testDebugUnitTest` 与带 demo HTTPS URL 的 `build` 验证。
- Android Loading Skeleton Polish：新增共享 skeleton / pulse 占位，统一商品图、商品详情、购物车、checkout 和对比页 loading / empty / fallback 视觉；调整购物车空状态、顶部推荐卡箭头和 Home Buddy 键盘开合闪烁，并通过 Android `testDebugUnitTest` 与带 demo HTTPS URL 的 `build` 验证。
- Android Product Card Rich Interaction：新增商品卡、详情页、对比页和购物车的加购 / 操作反馈，详情页立即购买改为单品 `buy_now` checkout，购物车商品可进入详情；通过后端 test / build、Android `testDebugUnitTest` 与带 demo HTTPS URL 的 `build` 验证。
- Android Entry Global Feedback Polish：统一入口、图片找货、购物车操作、checkout 和语音权限等全局临时反馈，图片来源改为 ShopMate 主题弹窗，恢复入口 / 购物车返回按压反馈，收口状态卡装饰语义和完整路由恢复链路；通过 Android 路由 helper 单测、全量 `testDebugUnitTest` 和带 demo HTTPS URL 的 `build` 验证。
- Android Motion Transition Polish：新增统一 motion token、按压反馈 helper 和 Compose animation 依赖，覆盖主路径页面进入、侧边栏抽屉、聊天状态、商品卡、对比、商品详情、购物车和 checkout 的轻量动效；按反馈调整 sidebar 阅读尺度并修复商品详情长标题裁切，通过 Android `testDebugUnitTest` 与带 demo HTTPS URL 的 `build` 验证。
- Chat / RAG / UI 稳定性修复：建立稳定性回归矩阵，修复 RAG contract、主动澄清、多轮上下文串味、推荐理由污染、商品展示名清洗、Android 商品卡 / 详情页 / 历史锚点、购物车价格和自然语言 checkout；补充数据 / RAG 工件与后端 / Android 回归测试，并通过后端 test/build、Android testDebugUnitTest 和 demo URL build 验证。
- RAG Debug Trace and Evaluation Baseline：新增内部 `RagDebugTrace`、baseline evaluator、`rag:baseline` CLI、grouped baseline cases、正式 `retrieval-baseline-results.jsonl` / `retrieval-baseline-traces.jsonl` 与 `docs/rag-tuning-report.md`；保持现有 Chat SSE contract 不变，并通过后端全量 test / build 与真实 baseline 跑通验证，当前 24 条 query 中 23 条通过、1 条 `vector_retrieval_failure` 留给后续 document / embedding text cleanup。
