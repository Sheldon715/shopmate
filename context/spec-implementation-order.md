# Spec 实现顺序

## 目标

本文档记录抖选选 / ShopMate 的推荐开发顺序。新的主线按课题说明会的评审逻辑重排：

```text
基础必做闭环 -> 移动端演示 / 部署准备 -> 加分入门 -> 加分进阶 -> 加分挑战
```

原因是课题评审首先看端到端链路是否跑通：Android 原生 App 能发送文字、后端完成 RAG 检索、模型生成流式回复、回复中展示可点击商品卡片，并且不编造商品信息。基础闭环稳定之后，先补最小移动端演示和部署准备，再挑 1-2 个加分方向做深，比同时铺开很多高级功能更合理。

当前项目已经采用 **Android UI / Figma 还原 + mock data 先行** 的方式跑出了可演示外壳。后续不能继续只堆 UI，需要尽快转向真实数据、RAG、SSE 和前后端契约，把 mock 演示升级成可运行的课程 Demo。

## 课题分层

### 基础必做

基础功能是必须完成项，也是后续所有加分项的地基。

| 能力 | 课题要求 | ShopMate 落地 |
| --- | --- | --- |
| 原生客户端 | iOS 或 Android 原生 App | Android Kotlin + Jetpack Compose |
| 文本对话 | 对话窗口，支持发送文字 | 主聊天页 + `ChatComposer` |
| 流式回复 | 接收并渲染 AI 流式回复 | Express SSE + Android 流式渲染 |
| 商品卡片 | 回复中包含可点击商品卡片 | `ProductCard` + 商品详情页 |
| 后端 RAG | 集成向量检索，实现 RAG 基本链路 | 先通过 `rag-stack-research.md` 决定 Chroma / Qdrant / pgvector 与 Node / Python 边界 |
| 商品数据 | 50-100 条脱敏电商数据，后续可能扩展到几百条 | `data/raw/` -> `data/processed/` -> 结构化 DB + 选定向量库 |
| 可靠性 | 检索库内商品，不编造价格、库存、优惠 | Prompt 约束 + PostgreSQL 回查 |

### 加分入门

完成基础闭环和基础移动端演示准备后，优先做入门加分，因为投入较小、演示收益明显。

| 方向 | 入门功能 | 推荐程度 |
| --- | --- | --- |
| 对话智能与 RAG | 多轮上下文记忆 | 最高，直接增强导购体验 |
| 业务闭环 | 对话式加购 | 最高，把推荐连接到购物车 |
| 多模态 | 语音输入 | 中等，可选做 |
| 工程质量 | 热门查询缓存 | 中等，基础链路稳定后再做 |

### 加分进阶

进阶功能要求 Agent 处理更复杂的语义或结构化操作，应建立在真实 RAG 和购物车 API 之上。

| 方向 | 进阶功能 | 推荐程度 |
| --- | --- | --- |
| 对话智能与 RAG | 反选与排除 | 最高，体现否定语义理解 |
| 业务闭环 | 购物车管理 | 高，配合自然语言 CRUD 演示 |
| 多模态 | TTS 语音播报 | 中等，视觉 Demo 已强时再做 |
| 工程质量 | 首 Token 优化 | 中等，需要先有可测量的 SSE 链路 |

### 加分挑战

挑战项不宜过早开始。评审看重深度，建议只选择 1-2 个方向深入。

| 方向 | 挑战功能 | 进入条件 |
| --- | --- | --- |
| 对话智能与 RAG | 多商品对比决策 | 基础 RAG + 对比 UI 已接真实数据 |
| 业务闭环 | 下单确认流程 | 购物车 API 与自然语言管理已稳定 |
| 多模态 | 拍照找货 | 基础文本 RAG 已稳定，并完成图片上传 / 识别 research |
| 工程质量 | 端侧体验打磨 | Demo 主链路已经可运行 |

## 工作规则

普通模块：

```text
写 feature spec -> 加载到 current-feature.md -> 实现 -> build / test 验证 -> 写入历史
```

复杂或不确定模块：

```text
写 research prompt -> 运行 research -> 写 research 结果 -> 拆 feature spec -> 一次实现一个 spec
```

每个 feature spec 应保持短小、可执行，避免把 UI、后端、数据库、AI 行为塞进同一个 spec。

## 工具使用规划

本项目后续执行时不要只看“下一个 spec 是什么”，还要同时判断“这一步应该用什么工具”。推荐规则如下：

| 工具 | 什么时候用 | 不适合什么时候用 |
| --- | --- | --- |
| `.agents/skills/feature` | 每个可实现 spec 的主流程：`load` 写入 `current-feature.md`，`start` 开分支并实现，`review` 做范围检查，`test` 看是否有可测逻辑，`complete` 在用户确认后收尾 | 纯 research、纯问题解释、尚未拆清楚范围的大模块 |
| `.agents/skills/research` | 数据库选型、商品数据清洗、Chroma / Qdrant / pgvector、embedding、SSE、RAG、LLM、图片找货、性能优化等不确定模块 | 已经有清晰 feature spec，可以直接实现的小任务 |
| `.agents/skills/cleanup` | 每个大阶段结束后做 housekeeping：历史记录顺序、无关 TODO、调试输出、文档与实际状态是否一致 | 正在实现核心功能时频繁打断，或者用户只想快速验证一个 bug |
| `.agents/skills/list-components` | 需要快速列出 ShopMate Android Compose、资源、Express 后端、data tooling 或 agent/workflow 文件时使用，可带 `android`、`server`、`data`、`agents` 等 scope | 需要判断代码质量、安全性或重构优先级时不要把文件清单当审查结果 |
| `Context7 MCP` | 查第三方库 / 框架官方用法：Python + LangChain、Chroma、LangChain.js、Express SSE、Qdrant client、PostgreSQL `pg` / pgvector、Zod、OkHttp / Retrofit、Jetpack Compose、OpenAI 或模型 SDK 文档 | 本地业务规则、Figma 还原、课题说明、已有 spec、当前代码结构，这些以仓库文件和 Figma MCP 为准 |
| `Figma MCP` | 新增或调整 Figma 驱动页面、导出资产、核对视觉布局 | 后端、RAG、数据库、纯文档规划 |
| `Playwright MCP` | 后续如果有 Web 管理页、文档站、本地服务调试页，或需要验证浏览器端 API / SSE 行为 | Android 原生 UI 不能用 Playwright 直接替代真机 / 模拟器验证 |

### Subagent 使用规则

Subagent 适合做并行的专项检查或大范围扫描，不适合替代主流程。当前 `.codex/agents` 里的 `code-scanner`、`auth-auditor`、`refactor-scanner` 已按 ShopMate Android / Express / PostgreSQL / Qdrant 语境维护；运行前仍要限定目录、输出格式和是否允许写文件。

| Subagent | 推荐使用时机 | 备注 |
| --- | --- | --- |
| `code-scanner` | Phase 1 后端地基、Phase 2 RAG/SSE、Phase 3 Android 接真实链路完成后，做安全、错误处理、性能和代码质量扫描 | 使用时要限定目录，例如 `server/src`、`client/android/app/src/main/java`，并要求按 ShopMate 规范审查 |
| `refactor-scanner` | Android UI 第一轮完成后、后端模块变多后、RAG / cart / product 出现重复逻辑后，查可抽取的组件、service、helper、type | 只用于找机会，不默认直接改；避免过早抽象 |
| `auth-auditor` | 只有实现登录 / 注册 / JWT / 用户会话后才使用 | 当前提示词已是 ShopMate Express JWT / password hash / ownership check 语境；如果 auth 尚未实现，应返回空发现而不是假设风险 |
| `ui-reviewer` | Android Compose 页面、Figma 复现、模拟器截图或未来 Web 页面都可用，但要在任务中明确目标平台和证据来源 | Android 原生 UI 不要只靠 Playwright；应优先使用 Figma MCP、Android Studio Preview / 模拟器截图和 Compose 代码证据 |

### Context7 MCP 判断

我会用到 Context7，但不是每个阶段都用。它最有价值的地方是“避免凭记忆写第三方库用法”，尤其是：

- Python + LangChain、Chroma、Qdrant、pgvector、LangChain.js 或手写 TypeScript RAG 的官方能力边界和示例。
- Express SSE header、断连处理和流式响应实现。
- Qdrant collection、payload filter、upsert 和 search 的 JS / TS client 用法。
- PostgreSQL `pg` 连接池、事务、migration 工具的推荐写法。
- Zod schema、错误格式和 TypeScript 类型推导。
- Android 网络层如果选择 OkHttp / Retrofit / Ktor client，需要查当前官方 API。
- OpenAI 或其他模型 SDK 的最新 API 形态、流式返回格式和错误处理。

不需要 Context7 的地方：

- 当前项目业务分层、课题优先级、评分逻辑。
- Figma 页面复现和本地资源使用。
- 已经在仓库里确定的 spec、命名、目录、测试命令。
- 只需要读本地代码就能判断的问题。

## 当前已完成

1. `android-onboarding-spec.md`
   - 复现 Figma onboarding 首屏。
   - 接入 ShopMate Buddy 本地资源、CTA、底部价值点和 Preview。

2. `android-theme-foundation-spec.md`
   - 新增 `ShopMateTheme`、共享颜色、圆角、背景和基础按钮组件。
   - 重构 onboarding 复用主题层。

3. `android-chat-composer-spec.md`
   - 新增可复用 `ChatComposer`。
   - 支持 placeholder、语音、图片、发送按钮和本地输入状态。

4. `android-mock-ui-data-spec.md`
   - 新增 prompt suggestion、商品卡片、商品详情、购物车和历史聊天 mock UI model。
   - 补充 `MockShopMateData`。

5. `android-home-chat-entry-spec.md`
   - 复现主聊天入口页。
   - 接入 onboarding CTA、本地 screen state、prompt panel 和 `ChatComposer`。

6. `android-sidebar-history-spec.md`
   - 实现左侧历史抽屉。
   - 接入历史聊天 mock 数据、遮罩关闭、新聊天返回和图标资产。

7. `android-chat-recommendation-spec.md`
   - 实现蓝牙耳机推荐结果页。
   - 从侧边栏历史项进入，展示用户气泡、AI 回复、商品推荐卡和底部输入栏。

8. `android-product-card-spec.md`
   - 抽取可复用 `ProductCard`。
   - 推荐结果页改用组件渲染商品列表，支持 enabled / disabled 状态。

9. `android-product-comparison-spec.md`
   - 实现防晒商品对比页 mock 版。
   - 展示用户气泡、AI 回复、两个商品卡、对比表和推荐结论。

10. `android-product-detail-spec.md`
    - 实现商品详情页 mock 版。
    - 支持推荐页商品卡跳转、收藏 toggle、not found 状态和底部购买栏。

## 下一步总路线

### Phase 0 - 收尾 Android Demo 外壳

目标：把已经做了一半的 Android mock Demo 收口，形成稳定演示壳。这个阶段只做短收尾，不继续无限扩 UI。

建议使用：

- `feature`：执行 `android-cart-screen-spec.md` 和 `android-ui-polish-spec.md`。
- Figma MCP：实现购物车页前读取 Cart frame `3:704`，核对视觉和资产。
- `refactor-scanner`：Phase 0 完成后可扫描 Android UI 目录，找重复组件或明显可抽取状态。
- `cleanup check`：Phase 0 完成后检查 current-feature 历史和文档状态。
- Context7：一般不需要，除非遇到新的 Compose API / Gradle 配置不确定。

1. `android-cart-screen-spec.md`
   - 实现购物车页。
   - 支持本地选择、数量加减、删除、合计和空状态。
   - 仍然使用 `MockShopMateData.cartItems`。

2. `android-ui-polish-spec.md`
   - 统一安全区、滚动 padding、键盘避让、按钮状态和 Preview。
   - 修复第一轮页面明显重叠、溢出和小屏问题。

完成标准：

- Onboarding、主聊天、侧边栏、推荐页、对比页、详情页、购物车页都能在本地 mock 下走通。
- `cd client/android && .\gradlew.bat build` 通过。

### 队友并行任务启动点

团队一共 3 人时，建议你继续负责主线 Android / 后端集成。队友 A 可以从 Phase 0 完成后立即介入商品数据；队友 B 不建议提前开发 RAG 主流程，RAG 正式测试应等你完成 Phase 2 的最小 RAG 闭环后再开始。她在此之前最多准备测试问题、评估表和预期答案，不直接改主线代码。

#### 队友 A - 商品数据与脱敏数据集

启动条件：

- Phase 0 完成，已有商品卡片、详情页、购物车页的 mock 数据结构。
- Phase 1 准备开始 `product-data-research.md` 和 `product-seed-data-spec.md`。

交付内容：

- 整理导师提供的脱敏商品数据，并补充自采脱敏商品数据。
- 目标先做到 80-120 条，后续可扩到 200-300 条。
- 至少覆盖这些品类：
  - 美妆护肤
  - 数码电子
  - 服饰运动
  - 食品生活
  - 家居日用
  - 可选：宠物 / 母婴 / 学生宿舍用品
- 每条商品尽量补齐字段：
  - `name`
  - `category`
  - `brand`
  - `price`
  - `description`
  - `imageUrl` 或本地图片文件名
  - `stock`
  - `tags`
  - `sellingPoints`
  - `suitableFor`
  - `avoidFor`
- 为每条商品写一段用于 embedding 的商品知识文本，包含类目、价格、品牌、适合人群、排除条件和卖点。
- 输出到 `data/raw/` 和 `data/processed/`，优先给一个 `products.json` 或 CSV。

验收标准：

- 数据没有真实用户隐私、真实密钥、真实订单信息。
- 同类商品数量足够支持推荐、筛选和对比。
- 至少能覆盖这些测试问题：
  - `推荐一款适合油皮的洗面奶`
  - `200 元以下的蓝牙耳机有哪些？`
  - `推荐防晒霜，但不要含酒精的`
  - `帮我对比两款防晒霜`

可以直接发给队友 A 的说明：

```text
我们现在 Android demo 壳快稳定了，接下来需要你帮忙做商品数据这条线，尽量不要改 App 代码。

任务是整理导师给的脱敏商品数据，并补充一些自采脱敏商品，总量先做到 80-120 条，后续能扩到 200-300 条更好。品类至少要有美妆护肤、数码电子、服饰运动、食品生活、家居日用。

每条商品请尽量整理这些字段：name、category、brand、price、description、imageUrl 或本地图片名、stock、tags、sellingPoints、suitableFor、avoidFor。还要给每条商品写一段适合 RAG embedding 的商品知识文本。

先把结果放成 products.json 或 CSV，不要放任何真实用户隐私、真实订单、真实 API key。我们后面会用这批数据做推荐、筛选、反选和商品对比。
```

#### 队友 B - RAG 测试与评估

启动条件分三层：

- 准备测试集：Phase 1 的商品数据和商品 API 稳定后即可开始，先整理问题、预期答案、失败判定规则和记录表，不接触主线代码。
- 离线检索测试：`vector-search-evaluation-spec.md` 完成后可以开始，用固定问题看 top-k 是否命中合适商品、metadata filter 是否生效。
- 正式黑盒测试：`rag-chat-service-spec.md`、`chat-sse-api-spec.md`、`rag-evaluation-cases-spec.md` 和 `rag-evaluation-baseline-report-spec.md` 完成后开始，通过接口或 App 页面测试完整回复。
- App 端测试：Phase 3 Android 接真实链路后，再补一次端到端测试，确认流式文本、商品卡片、详情跳转和加购入口都正常。

可提前准备但不算正式测试：

- 在你开发 Phase 2 前，队友 B 可以先整理测试问题、预期答案、失败判定规则和记录表。
- 不提前改 RAG 主代码，不提前决定最终技术路线。

交付内容：

- 作为测试者使用你已经开发好的 RAG 接口或 App 页面，不直接改 Android / 后端主代码。
- 使用同一批商品和同一组问题做黑盒测试：
  - `推荐一款适合油皮的洗面奶`
  - `200 元以下的蓝牙耳机有哪些？`
  - `推荐防晒霜，但不要含酒精的`
  - `帮我对比两款防晒霜`
  - `再便宜一点的有吗？`
- 额外补充 10-20 个真实用户会问的问题，覆盖价格、品牌、排除条件、同类对比、追问和商品不存在的情况。
- 记录每个问题：
  - 输入问题和期望行为
  - 检索到了哪些商品
  - 是否命中库内合适商品
  - metadata filter 是否生效
  - 输出是否能稳定变成商品卡片 JSON
  - 是否出现库外编造商品、价格错误、类别错配或前后追问断裂
  - 复现步骤、失败截图或接口返回

验收标准：

- 提供一份 RAG 测试记录表和简短测试报告。
- 报告按问题列出通过 / 失败 / 可接受但需优化。
- 对失败案例给出清楚复现方式，方便你回到 Phase 2 修 RAG 检索、prompt、metadata filter 或输出 schema。
- 不把 API key 写进代码或报告。

可以直接发给队友 B 的说明：

```text
我会先把 Phase 2 的最小 RAG 闭环开发出来，包括商品导入、向量索引、聊天 API 和基础推荐结果。等这个跑通后，想请你负责 RAG 测试和评估，不需要改 Android 或后端主代码。

在我开发完成前，你可以先准备测试问题和记录表。正式测试时请用同一批商品数据，重点测这些问题：推荐适合油皮的洗面奶、200 元以下蓝牙耳机、不要含酒精的防晒、两款防晒对比、再便宜一点。也可以再补充 10-20 个真实用户会问的问题。

请记录每个问题的期望结果、实际返回、检索到的商品、是否命中合适商品、是否出现编造商品 / 价格错误 / 类别错配、输出能不能稳定变成商品卡片 JSON。失败案例请附复现步骤或截图，方便我回头修检索、prompt、metadata filter 或输出 schema。

注意不要把 API key 写进代码或文档。最后给一份测试记录表和简短报告即可。
```

#### 协作边界

- 你负责主线 App、页面集成、后端主 API、最终 Demo 串联。
- 队友 A 只负责数据，不改 Android / 后端主流程代码。
- 队友 B 只负责 RAG 测试与评估，不改 Android / 后端主代码；RAG 主实现由你在 Phase 2 完成后再交给她测试。
- 队友提交前先发 PR 或文件包，不直接改 `MainActivity.kt`、核心 Compose 页面和最终 API 契约。

### Phase 1 - 基础必做：数据与后端地基

目标：让后端从最小 Express 骨架升级为可承载商品数据和 RAG 的服务。

建议使用：

- `research`：先跑 `database-tooling-research.md` 和 `product-data-research.md`。
- Context7：用于确认 `pg`、migration 工具、Zod、Express 路由和错误处理的官方用法。
- `feature`：research 输出稳定后，逐个执行 database、seed data、product schema、product API spec。
- `code-scanner`：Phase 1 完成后扫描 `server/src`，重点看输入校验、错误处理、敏感配置和 TypeScript 类型。
- `cleanup check`：确认数据目录、`.env.example`、README / context 文档没有过期。

3. `database-tooling-research.md` -> `database-foundation-spec.md`
   - 确认使用原生 `pg` + SQL migrations，还是轻量 ORM。
   - 建立数据库连接、migration 目录和 `.env.example`。
   - 真实密钥只放本地 `.env`，不进入 Git。

4. `product-data-research.md` -> `product-seed-data-spec.md`
   - 梳理导师或自采商品数据字段。
   - 原始数据放 `data/raw/`，清洗后放 `data/processed/`。
   - 目标是 50-100 条覆盖美妆、数码、服饰运动、食品生活等类目。

5. `product-schema-spec.md`
   - 定义 `products` 表和 TypeScript 类型。
   - 字段必须支持卡片、详情、对比和购物车：名称、类目、品牌、价格、描述、主图、库存、标签。

6. `product-api-spec.md`
   - 实现商品列表、详情和基础搜索 / 筛选接口。
   - 先支持关键词、类目、价格范围过滤。
   - 所有商品展示数据以后端 PostgreSQL 为准。

6.5. `backend-test-foundation-spec.md`（推荐在商品 API 完成后、RAG / SSE 铺开前执行）
   - 目标不是立刻追求高覆盖率，而是把后端测试脚本从占位升级为真实 Vitest 测试地基。
   - 适合在已经有稳定可测逻辑后开始：catalog normalize / validate、product mapper、product service 查询参数、API response / error helper、后续 RAG prompt builder 和 vector search wrapper。
   - 第一批测试应小而具体，优先覆盖纯函数、mapper、参数校验和不依赖真实数据库的 service helper。
   - 暂不把 Vitest 作为当前 quick wins 的 blocker；如果 Demo 时间紧，可以先继续以 `npm.cmd run build` 作为后端 gate，等 RAG / cart / auth 逻辑增加后再补。
   - 完成后再把 `server/package.json` 的 `test` 从占位命令改为真实 `vitest`，并同步更新 `.agents/skills/feature/actions/test.md` 和相关文档。

完成标准：

- 后端可以导入商品数据。
- 可以通过 API 查商品列表、详情和条件筛选。
- `cd server && npm.cmd run build` 通过；如 `backend-test-foundation-spec.md` 已完成，再运行真实 `npm.cmd test`。

### Phase 2 - 基础必做：RAG 与流式聊天

目标：跑通课题最核心链路：用户输入 -> 检索商品 -> LLM 生成回复 -> SSE 流式返回 -> Android 展示文字和商品卡片。

建议使用：

- `research`：先跑 `rag-stack-research.md`，再跑 embedding / vector store、LLM 接入、chat streaming、RAG 评估相关 research。
- Context7：高频使用，查 Python + LangChain、Chroma、LangChain.js、Qdrant client、pgvector、Express SSE、模型 SDK、Zod 输出校验和流式 API 细节。
- `feature`：等 `rag-stack-research.md` 给出结论后，再按选定路线拆 `vector-rag-documents-spec.md`、`vector-qdrant-index-spec.md`、`vector-search-evaluation-spec.md`、`llm-client-spec.md`、`rag-chat-service-spec.md`、`chat-sse-api-spec.md`。
- `code-scanner`：Phase 2 完成后扫描 RAG、vector、chat 模块，重点看幻觉控制、错误路径、断连处理和密钥泄露。
- `refactor-scanner`：RAG / SSE helper 出现重复逻辑后再扫，不要在第一版过早抽象。

#### 基础 RAG 技术边界

看到高级 RAG 技巧时，不要默认全部加入 Phase 2 主线。当前阶段只做基础链路必须具备的取舍：

- 必做：chunking R&D、encoder R&D、prompt 约束、确定性 document preprocessing、metadata filter、PostgreSQL 回查。
- 不做：query rewriting、query expansion、re-ranking、hierarchical RAG、GraphRAG、Agentic RAG。
- LLM document preprocessing 先不作为 blocker。第一版优先用结构化字段生成稳定 document；如果测试发现召回差，再考虑用 LLM 生成改写版 chunk 或摘要。
- 高级 RAG 技巧放到后续加分阶段，并且必须等基础链路齐全后才能做。

这里的“基础链路齐全”指：商品已入 PostgreSQL、商品 API 可查、向量索引已生成、RAG chat service 可返回库内商品、SSE 可流式输出、Android 已能展示真实回复和商品卡片，并且 `rag-evaluation-baseline-report-spec.md` 有第一轮测试记录。

7. `rag-stack-research.md`
   - 在实现 RAG 前先做技术栈和向量数据库决策实验。
   - 比较候选路线：
     - `Python + LangChain + Chroma RAG service`：优先实验路线，适合几百条脱敏商品、本地 Demo 和复用已有学习经验。
     - `Python + LangChain + Qdrant RAG service`：保留 LangChain 生态，同时获得更工程化的向量服务和 filter 能力。
     - `Node.js / TypeScript + Qdrant 手写 RAG`：RAG 逻辑直接在 Express 后端中实现，减少跨服务联调。
     - `Node.js / TypeScript + pgvector 手写 RAG`：如果想减少服务数量，可把结构化数据和向量放在 PostgreSQL，但需要确认 pgvector 环境和检索体验。
   - 不把 Qdrant 写死为默认选择；当前数据规模预计为导师脱敏数据 + 自采脱敏数据，总量可能只有几百条，Chroma 完全可以进入主候选。
   - 使用同一批商品样例和同一组问题测试：
     - `推荐一款适合油皮的洗面奶`
     - `200 元以下的蓝牙耳机有哪些？`
     - `推荐防晒霜，但不要含酒精的`
   - 评估维度：
     - 推荐是否命中库内商品。
     - 是否能稳定返回结构化商品卡片数据。
     - 是否方便做价格、品牌、类目、库存和否定条件过滤。
     - metadata filter 能否覆盖商品类目、价格、品牌、标签、库存等条件。
     - 本地持久化、重建索引、导入几百条数据和调试检索结果是否顺手。
     - 是否容易解释和调试。
     - 与 Android、SSE、购物车 API 的集成成本。
     - 后续多轮上下文、对话式加购和多商品对比的扩展性。
   - 输出结论：
     - 选定 RAG 服务边界：Node 内部实现，还是独立 Python RAG service。
     - 选定向量库：Chroma、Qdrant 或 pgvector。
     - 如果选 Python + LangChain + Chroma，需要明确 Chroma 持久化目录、metadata schema、索引重建脚本和 Node.js 调用接口。
     - 如果选 Qdrant，需要明确本地服务启动、collection schema、payload filter 和备份 / 重建方式。
     - 如果选 pgvector，需要明确 PostgreSQL 扩展可用性、migration、embedding 字段和检索 SQL。
     - 无论选择哪条路线，都需要明确失败降级策略和商品数据以 PostgreSQL / 结构化主库为准的规则。

8. `embedding-vector-search-research.md`
   - 做 chunking R&D：比较按 `content_blocks`、FAQ、marketing description、review summary 拆 document，还是直接索引 `knowledge_text`。
   - 做 encoder R&D：用同一批测试问题比较 embedding 模型和向量库返回质量。
   - 设计商品知识文本和 metadata schema。
   - 输出后拆成三个可单独执行的 spec，不把 document、index、evaluation 全塞进一个大任务。

8.1. `vector-rag-documents-spec.md`
   - 从 PostgreSQL 商品主库生成 deterministic RAG documents。
   - 输出 `product-documents.jsonl` 和 `document-manifest.json`。
   - 不接 embedding、不接 Qdrant、不做 search。

8.2. `vector-qdrant-index-spec.md`
   - 接入 embedding wrapper 和 Qdrant。
   - 实现 `rag:index` 和 `rag:search`。
   - 向量命中只返回 `doc_id` / `product_id` / score / snippet，后续必须回查 PostgreSQL。

8.3. `vector-search-evaluation-spec.md`
   - 在不调用 LLM 的情况下做离线检索评估。
   - 固定测试问题、filters、pass / fail 和失败原因。
   - 完成后队友 B 可以开始准备基于检索结果的初步测试记录。

9. `llm-backend-integration-research.md` -> `llm-client-spec.md`
   - 接入课程指定或团队确认的 LLM API。
   - 模型 Base URL、Model 和 API Key 全部从环境变量读取。
   - 不在仓库文档、代码或提交记录中写真实 API Key。

10. `rag-chat-service-spec.md`
   - 按 `rag-stack-research.md` 的结论实现 RAG 服务。
   - 如果选择 Node.js 路线，实现 `rag.service.ts` 和 `prompt.builder.ts`。
   - 如果选择 Python + LangChain 路线，实现独立 RAG service，并在 Node.js 中保留网关 / SSE / 业务 API 边界。
   - 如果选择 Chroma，需要保证商品 metadata 足够支持价格、品牌、类目、标签和库存过滤。
   - 支持单轮模糊推荐和条件筛选。
   - Prompt 必须约束：只基于检索结果推荐，不编造价格、库存、优惠或功效。
   - Prompt 应包含必要上下文：当前日期、商品数据是脱敏 / synthetic、用户当前问题、可用检索结果、必要的短历史。
   - 第一版先不默认加入 LLM query expansion / reranking，但代码边界要方便后续插入。

11. `chat-sse-api-spec.md`
    - 实现 `/api/chat/stream`。
    - 支持 `message_delta`、`product_cards`、`done`、`error`。
    - 处理客户端断开、LLM 失败、检索无结果和 JSON 序列化失败。

12.1. `chat-contract-fixtures-spec.md`
    - 固定后端聊天 SSE contract 文档、payload schema 和 fixture。
    - 覆盖文本 delta、商品卡片、错误状态和完成事件。
    - 不写 Android 代码，先把双方要遵守的接口样例稳定下来。

12.2. `android-chat-contract-parser-spec.md`
    - 基于 contract fixture 新增 Android DTO、event parser 和商品卡片 mapper。
    - 不实现真实 SSE 连接、不接 ViewModel、不改 Compose UI。

12.5a. `rag-evaluation-cases-spec.md`
   - 固定第一轮 RAG Chat 黑盒测试 case。
   - 新增 `data/processed/rag/chat-evaluation-cases.json`。
   - 只设计测试集，不运行真实 RAG / LLM，不生成报告。

12.5b. `rag-evaluation-baseline-report-spec.md`
   - 在 `vector-search-evaluation-spec.md` 完成后复用 `rag:evaluate` 做离线检索 baseline。
   - 在 `rag-chat-service-spec.md` 和 `chat-sse-api-spec.md` 完成后做正式 Chat SSE 黑盒测试。
   - 记录每个问题的 query、检索结果、最终推荐商品、商品卡片 JSON、fallback、SSE contract、是否出现编造或价格错误。
   - 输出 `docs/rag-evaluation-baseline-report.md`，并标记 pass / fail / acceptable 与失败归因。
   - 这个 spec 完成后，队友 B 可以开始正式 RAG 测试与评估。

完成标准：

- 后端用真实商品数据回答“推荐护肤品”和“200 元以下蓝牙耳机有哪些？”。
- 回复中返回库内商品 id 和商品卡片数据。
- 无结果时明确说明未找到，不强行推荐。
- 已有一份可复用 RAG 测试记录表，能指导后续优化和队友 B 黑盒测试。

### Phase 3 - 基础必做：Android 接真实链路

目标：把 Android mock 推荐页接到真实后端，形成可演示的端到端基础 Demo。

建议使用：

- `research`：如果 Android 网络层技术路线未定，先补 Android network research。
- Context7：用于 OkHttp / Retrofit / Ktor client、SSE 客户端、协程 / Flow、序列化库的官方用法。
- `feature`：分开执行 Android network、chat integration、product integration、cart API foundation。
- Figma MCP：只在真实数据接入导致 UI 需要回看视觉规格时使用。
- `code-scanner`：扫描 Android network / repository / UI state，重点看错误状态、线程 / 协程边界和硬编码 URL。
- `ui-reviewer`：不作为 Android 主审；这阶段更建议模拟器截图 + Figma 对照。

13. `android-network-client-spec.md`
    - 建立 Android 网络层。
    - 先确认使用最小 OkHttp、Retrofit，或项目当前依赖中已有方案。
    - UI 不直接发 HTTP 请求。

14. `android-chat-api-integration-spec.md`
    - 主聊天页发送用户输入到 `/api/chat/stream`。
    - 渲染流式文本和商品卡片。
    - 保留 Preview / mock fallback，避免开发时完全依赖后端在线。

15. `android-product-api-integration-spec.md`
    - 商品详情页从真实商品 API 读取数据。
    - 推荐卡片点击进入真实详情。

16. `android-cart-api-foundation-spec.md`
    - 实现最小购物车 API 和 Android 加购入口。
    - 基础阶段可以使用 demo user 或本地会话策略，不把复杂登录作为 blocker。

完成标准：

- Demo 能从 Android 端输入问题，收到后端 SSE 流式回复和商品卡片。
- 点击商品卡片进入真实详情页。
- 可以把推荐商品加入购物车，并看到购物车状态变化。

### Phase 3.5 - 基础必做：移动端演示与部署准备

目标：不急着正式云上线或上架应用商店，但提前把“手机能像 App 一样安装打开、真实设备能访问后端、后续可以部署”的基础坑处理掉。这个阶段是 deployment readiness，不是生产级运维。

建议使用：

- `research`：如果后端部署平台未定，先做轻量 `deployment-readiness-research.md`，比较本地 Wi-Fi 演示、临时公网隧道和云部署方案。
- Context7：用于确认 Android manifest 权限、build variants、网络安全配置、Express production 启动方式等官方用法。
- `feature`：分开执行 Android 配置、后端部署准备、APK 打包说明，避免和 RAG / UI 主线混在一起。
- `code-scanner`：检查 Android 是否硬编码 `localhost`、后端是否泄露环境变量、生产启动脚本是否依赖本机路径。
- `cleanup check`：Demo 前清理调试 URL、临时 token、无用日志和未完成 TODO。

17. `deployment-readiness-research.md`
    - 明确课程 Demo 需要的是 APK 安装 + 可访问后端，不等于 Google Play 上架。
    - 对比三种演示方式：
      - 本地同 Wi-Fi：手机访问电脑局域网 IP。
      - 临时公网隧道：用于短时间演示。
      - 云部署：后端使用公网 HTTPS API。
    - 记录推荐路线、风险、成本和需要的环境变量。

18. `android-runtime-config-spec.md`
    - 给 Android 增加后续真实网络需要的 `INTERNET` 权限。
    - 规划 `debug` / `release` 的 API Base URL，不把 `localhost` 写死在 UI 或 repository 中。
    - 保留 mock fallback，避免后端离线时 Android Preview / UI 开发完全不可用。
    - 规划正式 app icon、app name、APK 输出路径和真机安装步骤。

19. `backend-deployment-readiness-spec.md`
    - 后端补齐 production start / health check / `.env.example`。
    - 所有 LLM、embedding、数据库、JWT 等真实密钥只放部署环境变量。
    - 明确 Android 访问后端时使用的公开 Base URL。
    - 如果暂不云部署，也要写清楚本地 Wi-Fi 演示时的 IP 配置方式。

完成标准：

- 手机或模拟器可以安装 APK，并在桌面看到 ShopMate 图标 / 应用名。
- Android 网络层的 Base URL 可配置，不硬编码 `localhost`。
- 后端有明确的本地演示或云部署启动说明。
- 文档中没有真实 API Key、数据库连接串、JWT Secret 或个人隐私数据。

## 入门加分阶段

基础闭环和 Phase 3.5 演示准备完成后，优先选择“对话智能 + 业务闭环”两条线做深。

建议使用：

- `feature`：逐个实现多轮上下文、主动反问、对话式加购。
- Context7：仅在需要确认模型 SDK、结构化输出、缓存或 Android 语音 API 时使用。
- `code-scanner`：检查上下文状态是否串用户、购物车操作是否校验商品归属和数量。
- `refactor-scanner`：如果 chat context、cart tool、prompt builder 之间开始重复，再扫描。

20. `chat-context-memory-spec.md`
    - 支持多轮上下文记忆。
    - 示例：`帮我推荐跑鞋` -> `要轻量的` -> `预算 500 以内`。
    - 后端保存最近意图、约束和上一轮推荐商品。

21. `active-clarification-spec.md`
    - 信息不足时主动反问。
    - 示例：用户说“推荐一款手机”，Agent 追问拍照、续航、预算或性价比。

22. `conversational-cart-add-spec.md`
    - 支持“把这个加到购物车”“把第二个加进去”。
    - Agent 从最近一次推荐结果中定位商品，调用购物车 API。

23. `rag-query-rewrite-spec.md`（可选，基础链路齐全后）
    - 启动条件：Phase 3.5 完成，`rag-evaluation-baseline-report-spec.md` 已跑出第一轮记录，并证明用户原问题直接检索效果不稳定。
    - 用 LLM 或规则把口语问题改写成更适合检索的 query。
    - 保留原始用户问题，不让改写结果覆盖聊天语义。
    - 重点解决“再便宜一点”“不要某成分”“适合油皮”这类口语表达。

可选入门项：

- `voice-input-spec.md`：Android 语音输入转文字后走正常 RAG 流程。
- `popular-query-cache-spec.md`：对高频相似问题做缓存，降低重复模型调用。

## 进阶加分阶段

进阶阶段应优先处理复杂语义，而不是先做炫技功能。

建议使用：

- `research`：反选排除、多商品对比真实输出、自然语言购物车管理如果方案不确定，先 research。
- Context7：用于模型结构化输出、选定向量库的 metadata filter、LLM function/tool calling 或 JSON schema 输出参考。
- `feature`：按否定约束、购物车自然语言 CRUD、真实对比输出拆开实现。
- `code-scanner`：重点查否定条件是否真的影响检索 / 过滤，购物车 CRUD 是否有权限和数量校验。
- `auth-auditor`：只有这一阶段已经补登录 / JWT 后才使用。

24. `negative-constraint-rag-spec.md`
    - 支持“不要含酒精”“除了某品牌还有什么”等否定条件。
    - 在检索后过滤和 Prompt 中都明确排除规则。

25. `cart-natural-language-management-spec.md`
    - 支持“删除第二个商品”“把数量改成 2”。
    - 覆盖购物车自然语言 CRUD 和客户端实时反馈。

26. `comparison-rag-output-spec.md`
    - 把当前 mock 对比页升级为真实 RAG 对比结果。
    - 后端返回对比维度、商品列表、每格内容、推荐结论和高亮项。

27. `rag-query-expansion-rerank-spec.md`（可选，基础链路齐全后）
    - 启动条件：`rag-query-rewrite-spec.md` 或 metadata filter 仍不能解决召回 / 排序问题。
    - query expansion 用于把一个问题扩成多个检索 query，提高召回。
    - re-ranking 用于在候选商品较多时重排，优先保留库内真实商品和强匹配商品。
    - 必须复用 `rag-evaluation-cases-spec.md` 的测试集，证明优化前后有实际提升。

可选进阶项：

- `tts-response-spec.md`：AI 回复语音播报。
- `first-token-optimization-spec.md`：统计并优化首 Token 延迟。

## 挑战阶段

挑战阶段只建议挑 1-2 个方向做深，并在 Demo 中讲清楚工程取舍。

建议使用：

- `research`：图片找货、模拟下单、场景化组合推荐、性能优化都应先 research。
- Context7：图片上传、VLM / embedding、缓存、性能测量、模型流式调用等第三方 API 细节需要查。
- `feature`：只选择 1-2 个挑战方向拆 spec 实现。
- `auth-auditor`：如果做下单确认并接入用户 / 地址 / token，先跑安全审查。
- `code-scanner`：挑战项完成后做全链路风险扫描。
- `cleanup check`：Demo 前做最终文档、历史、TODO、调试输出清理。

28. `mock-checkout-spec.md`
    - Agent 汇总购物车、确认默认地址、生成模拟订单。
    - 不接真实支付和真实物流。

29. `multimodal-image-search-research.md` -> `android-image-search-spec.md`
    - Android 图片选择 / 拍照上传。
    - 后端用 VLM 或图片 embedding 提取视觉特征，再检索相似商品。
    - 只有基础文本 RAG 已稳定后再开始。

30. `scenario-bundle-recommendation-spec.md`
    - 支持“去三亚度假，帮我搭配一套从防晒到穿搭的方案”。
    - 跨类目检索、组合编排和解释推荐。

31. `rag-advanced-techniques-research.md`（挑战备选）
    - 启动条件：基础链路齐全，入门 / 进阶 RAG 优化已评估，且 Demo 时间仍允许。
    - 评估 hierarchical RAG、GraphRAG、Agentic RAG 是否真的适合当前商品数据规模。
    - 当前默认不实现；只有多商品关系、工具调用、购物车 / 订单推理需要时才拆后续 spec。

32. `commercial-demo-polish-spec.md`
    - 骨架屏、过渡动效、商品卡片富交互、收藏动画。
    - 只在核心链路稳定后做。

## 暂缓事项

以下功能不是当前优先级，除非基础闭环已经跑通或用户明确要求：

- 完整登录 / 注册 / JWT：项目产品规划需要，但课题最小闭环不强制，可在真实购物车和订单前补。
- 个性化偏好持久化：先做多轮上下文，再做长期偏好。
- 大规模推荐系统或复杂排序模型：本课题重点是工程链路，不是推荐模型训练。
- 图片找货、TTS、首 Token 优化：都属于加分项，不能阻塞基础链路。
- Google Play / 应用商店正式上架：课程 Demo 阶段优先 APK 安装和可访问后端，应用商店发布放到最后再评估。

## Research 优先级

最高优先级：

- `database-tooling-research.md`
- `product-data-research.md`
- `rag-stack-research.md`
- `embedding-vector-search-research.md`
- `llm-backend-integration-research.md`
- `chat-streaming-research.md`

中优先级：

- `deployment-readiness-research.md`
- `rag-agent-research.md`
- `auth-flow-research.md`
- `checkout-order-research.md`

基础完成后再做：

- `multimodal-image-search-research.md`
- `voice-input-research.md`
- `tts-response-research.md`
- `performance-optimization-research.md`

已完成或已有材料：

- `figma-to-compose-reproduction-research.md`

## 资产与数据放置

Figma / UI assets：

```text
client/android/app/src/main/res/drawable/
client/android/app/src/main/res/drawable-nodpi/
```

导师原始数据：

```text
data/raw/
```

清洗后数据：

```text
data/processed/
```

注意：

- UI mock 图片和真实商品 `imageUrl` 要保持边界清晰。
- 大文件或敏感数据是否提交 Git 需要单独判断。
- 真实 API Key、数据库连接串、JWT Secret 不写入文档或代码，只放本地 `.env`。

## Figma MCP 使用提醒

开始实现新的 Figma 页面前，应尽量先读取目标 frame：

1. `get_design_context`
2. `get_screenshot`
3. 必要时 `get_metadata`
4. 资产下载或导出

已知 Figma frame：

- Onboarding：`3:103`
- Home chat entry：`3:145`
- Sidebar：`3:236`
- Chat recommendation：`3:307`
- Product comparison：`3:432`、`66:2`
- Product detail：`3:578`、`81:135`
- Cart：`3:704`

## 验证要求

Android UI 或 Android 集成 spec 完成后至少运行：

```powershell
cd client/android
.\gradlew.bat build
```

后端 spec 完成后至少运行：

```powershell
cd server
npm.cmd run build
```

如配置了 lint / test，再运行：

```powershell
cd server
npm.cmd run lint
npm.cmd test
```

移动端演示 / 部署准备 spec 完成后检查：

- Android 已有真实网络需要的 manifest 权限规划。
- API Base URL 可按 debug / release 或环境配置切换。
- APK 安装路径、真机安装步骤和后端访问方式写清楚。
- 后端部署或本地 Wi-Fi 演示不依赖硬编码 `localhost`。

文档类 spec 完成后检查：

- Markdown 标题层级清晰。
- 计划顺序仍然符合“基础必做 -> 移动端演示 / 部署准备 -> 入门 -> 进阶 -> 挑战”。
- 没有写入真实 API Key 或其他敏感配置。
