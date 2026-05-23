# 当前功能：Android Mock UI Data

## 状态

已完成

## 目标

- 新增 Android UI model，覆盖 prompt suggestion、商品卡片、商品详情和购物车 item。
- 新增本地 `MockShopMateData`，提供主聊天入口、推荐结果、详情页和购物车首轮 UI 所需数据。
- mock 数据只服务 Compose UI 展示，不接入后端 DTO、数据库 schema、repository、网络请求、PostgreSQL、Qdrant 或 RAG。
- 使用临时或已有图片资源字段支撑 UI 渲染，真实商品图后续单独处理。
- 通过 `cd client/android && .\gradlew.bat build` 验证 Android 构建。

## 待办事项

- [x] 新增 `PromptSuggestionUi`、`ProductCardUi`、`ProductDetailUi`、`CartItemUi`。
- [x] 新增 `MockShopMateData`，包含聊天 prompt suggestions、蓝牙耳机推荐、护肤 / 防晒商品、商品详情样例和购物车样例。
- [x] 确保商品 mock 至少包含 id、name、priceText、image resource name 或 drawable id、tags、recommendation reason。
- [x] 保持 UI model 轻量，不引入后端字段、库存表结构、embedding 字段或数据库 id 规则。
- [x] 运行 `cd client/android && .\gradlew.bat build`，记录验证结果。

## 备注

- Spec: `context/feature/android-mock-ui-data-spec.md`
- Figma file: `https://www.figma.com/design/nROupRXwCGT6DH3kK5E0Og/shopmate?node-id=0-1&m=dev&t=TzK1Qbe7TeOBYQZH-1`
- 预计新增文件：
  - `client/android/app/src/main/java/com/shopmate/app/ui/model/PromptSuggestionUi.kt`
  - `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductCardUi.kt`
  - `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductDetailUi.kt`
  - `client/android/app/src/main/java/com/shopmate/app/ui/model/CartItemUi.kt`
  - `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`
- 后续页面会使用这些数据：`HomeChatEntryScreen`、`ChatRecommendationScreen`、`ProductDetailScreen`、`CartScreen`。
- Prompt suggestions 至少包含：推荐适合油皮的护肤品、200 元以内的蓝牙耳机、帮我对比这两款商品、拍照找同款。
- 商品 mock 至少包含：漫步者 Zero Air 真无线蓝牙耳机、QCY T13 X 真无线蓝牙耳机、小米 Redmi Buds 4 青春版、玻尿酸保湿精华补水修护精华液、理肤泉 清透防晒乳 SPF50+ PA++++。
- Start step: branch `feature-android-mock-ui-data` has been created and checked out. Slash-style branch creation failed in this Git environment, so this closest scoped branch name was used.
- Verification: first sandboxed `cd client/android && .\gradlew.bat build` failed because Gradle could not write to `C:\Users\lxd04\.gradle` lock files.
- Final verification: `cd client/android && .\gradlew.bat build` passed after rerunning with permission for Gradle's user-level cache.

## 历史记录

- 初始化前后端技术栈骨架：完成 Android Kotlin + Jetpack Compose 与 Node.js + TypeScript + Express 最小工程初始化，补充 README 与 Git 忽略配置，并通过后端构建与 Android `assembleDebug` 验证。
- 开发顺序规划文档：新增 `context/feature/spec-implementation-order.md`，梳理 Phase 2 之后的 spec 实现顺序、research 插入点、依赖关系和近期队列。
- 开发顺序规划文档中文化：将 `context/feature/spec-implementation-order.md` 从英文改为中文，保留原有结构、文件名和开发顺序。
- Figma 驱动开发顺序调整：根据欢迎页、主聊天页、侧边栏、推荐结果、商品对比、详情页和购物车设计，将近期队列调整为 Android UI 先行，并补充 UI model、mock data 与前后端契约 spec。
- Figma 复现 research prompt：新增 `context/research/figma-to-compose-reproduction-research.md`，用于后续通过 Figma MCP 获取设计上下文、截图和资产，并产出 Compose 复现计划。
- Android 引导页：新增 `context/feature/android-onboarding-spec.md`，用 Jetpack Compose 复现 Figma onboarding 首屏，接入 Shopmate Buddy 本地资源、CTA、底部价值点和 Android Studio Preview，并通过 `cd client/android && .\gradlew.bat build` 验证。
- Android 主题基础：新增 `ShopMateTheme`、共享颜色 / 圆角 / 背景和基础按钮组件，重构 onboarding 复用主题层，并通过 `cd client/android && .\gradlew.bat build` 验证。
- Android 聊天输入栏：新增可复用 `ChatComposer` 组件和语音、图片、发送图标，提交聊天输入栏 spec，并补上 Android 主题基础 spec，通过 `cd client/android && .\gradlew.bat build` 验证。
