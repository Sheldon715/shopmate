# 当前功能：Android Chat Composer

## 状态

已完成

## 目标

- 新增可复用的 Jetpack Compose `ChatComposer` 底部聊天输入栏组件。
- 输入栏支持受控文本状态：`value`、`onValueChange`、`onSend`、`onVoiceClick`、`onImageClick`。
- 输入栏显示 placeholder：`问问 Shopmate...`，右侧包含语音、图片和发送三个 icon button。
- 组件视觉接近 Figma：pill / 大圆角容器、浅色 surface、次级 placeholder、约 `52dp` 高度、约 `18dp` 左右边距、约 `34dp` 图标触控区域。
- 组件可放在屏幕底部，并为后续主聊天入口页、推荐结果页和商品对比页复用，不在页面中重复手写输入栏。
- 不接入 ViewModel、repository、API、语音输入、图片上传或后端发送逻辑。
- 完成后通过 Android 构建检查：`cd client/android && .\gradlew.bat build`。

## 待办事项

- [x] 检查现有 Android 主题、`ShopMateButton` 和 `ShopMateIconButton` 组件风格。
- [x] 新增 `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt`。
- [x] 实现 `ChatComposer` 的受控输入参数和发送、语音、图片回调。
- [x] 新增或复用 `ic_mic.xml`、`ic_image.xml`、`ic_send.xml` 三个 drawable 图标。
- [x] 使用现有主题颜色、圆角、间距和 `ShopMateIconButton` 风格完成输入栏视觉。
- [x] 添加空输入和有文字输入两种 Compose Preview。
- [x] 检查底部放置时的 padding / inset 处理，避免遮挡主要内容。
- [x] 运行 `cd client/android && .\gradlew.bat build` 并记录结果。

## 备注

- Feature spec: `context/feature/android-chat-composer-spec.md`。
- Figma reference: file `shopmate`，主聊天入口 frame `3:145`，推荐结果页 frame `3:307`。
- 预计新增 Android 文件：`client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt`。
- 可能新增 drawable：`client/android/app/src/main/res/drawable/ic_mic.xml`、`client/android/app/src/main/res/drawable/ic_image.xml`、`client/android/app/src/main/res/drawable/ic_send.xml`。
- 后续主聊天入口页 `HomeChatEntryScreen.kt`、推荐结果页 `ChatRecommendationScreen.kt` 应直接复用该组件。
- 本功能只实现本地 UI 组件和回调出口；发送按钮只触发回调，语音和图片按钮可以接 no-op 回调。
- Start step: branch `feature/android-chat-composer` has been created and checked out。
- Figma URL received: `https://www.figma.com/design/nROupRXwCGT6DH3kK5E0Og/shopmate?node-id=0-1&m=dev&t=TzK1Qbe7TeOBYQZH-1`。
- Figma MCP design context and screenshots were fetched for file `nROupRXwCGT6DH3kK5E0Og`, nodes `3:145` and `3:307`。
- Figma composer reference: width about `352.667dp`, height `52dp`, left offset `18dp`, pill radius `26dp`, inner horizontal gap `7dp`, action buttons `34dp`。
- Verification: first sandboxed `cd client/android && .\gradlew.bat build` failed because Gradle could not write to `C:\Users\lxd04\.gradle` lock files。
- Final verification: `cd client/android && .\gradlew.bat build` passed after rerunning with permission for Gradle's user-level cache。

## 历史记录

- 初始化前后端技术栈骨架：完成 Android Kotlin + Jetpack Compose 与 Node.js + TypeScript + Express 最小工程初始化，补充 README 与 Git 忽略配置，并通过后端构建与 Android `assembleDebug` 验证。
- 开发顺序规划文档：新增 `context/feature/spec-implementation-order.md`，梳理 Phase 2 之后的 spec 实现顺序、research 插入点、依赖关系和近期队列。
- 开发顺序规划文档中文化：将 `context/feature/spec-implementation-order.md` 从英文改为中文，保留原有结构、文件名和开发顺序。
- Figma 驱动开发顺序调整：根据欢迎页、主聊天页、侧边栏、推荐结果、商品对比、详情页和购物车设计，将近期队列调整为 Android UI 先行，并补充 UI model、mock data 与前后端契约 spec。
- Figma 复现 research prompt：新增 `context/research/figma-to-compose-reproduction-research.md`，用于后续通过 Figma MCP 获取设计上下文、截图和资产，并产出 Compose 复现计划。
- Android 引导页：新增 `context/feature/android-onboarding-spec.md`，用 Jetpack Compose 复现 Figma onboarding 首屏，接入 Shopmate Buddy 本地资源、CTA、底部价值点和 Android Studio Preview，并通过 `cd client/android && .\gradlew.bat build` 验证。
- Android 主题基础：新增 `ShopMateTheme`、共享颜色 / 圆角 / 背景和基础按钮组件，重构 onboarding 复用主题层，并通过 `cd client/android && .\gradlew.bat build` 验证。
