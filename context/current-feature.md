# 当前功能：Android Onboarding Screen

## 状态

已完成

## 目标

- 用 Jetpack Compose 复现 Figma welcome / onboarding 首屏，替换当前 `Text("ShopMate")` 占位界面。
- 首屏包含状态栏区域、Shopmate Buddy 吉祥物、标题文案、说明文案、主 CTA 和底部三个价值点。
- 使用从 Figma 导出的真实 mascot 资产，保存为 Android 本地资源，不在代码中引用临时 Figma MCP URL。
- 保持目标手机尺寸附近的响应式布局，避免文字重叠或溢出。
- 完成后通过 Android 构建检查：`cd client/android && .\gradlew.bat build`。

## 待办事项

- [x] 读取 Figma frame `3:103` 的设计上下文、截图和 mascot 资产。
- [x] 导出 mascot 并保存到 `client/android/app/src/main/res/drawable-nodpi/mascot_assistant.png`。
- [x] 新增 `client/android/app/src/main/java/com/shopmate/app/ui/onboarding/OnboardingScreen.kt`。
- [x] 在 `MainActivity.kt` 中把应用入口替换为 onboarding screen。
- [x] 实现 Figma 对应的背景、mascot hero、中文标题、说明文案、CTA 和底部价值点。
- [x] 检查目标手机尺寸下的排版、比例、文字换行和触控区域。
- [x] 运行 `cd client/android && .\gradlew.bat build` 并记录结果。

## 备注

- Feature spec: `context/feature/android-onboarding-spec.md`。
- Figma reference: file `shopmate`, frame node `3:103`, frame size about `389 x 843`。
- Required text:
  - Title first line: `你好， 我是你的`
  - Highlight line: `AI 导购助手`
  - Supporting text: `告诉我你想买什么，我来帮你筛选和对比`
  - CTA: `开始购物`
  - Bottom value points: `懂你所需`、`帮你筛选`、`陪你挑选`
- Visual direction: white / very light gray-green background, soft mint glow near mascot, primary green close to `#31C88C`, dark navy / charcoal text, rounded green gradient CTA with soft shadow。
- CTA click can be no-op unless an app shell / navigation spec is already implemented。
- Bottom value icons can be simple vector drawables if dedicated Figma icon export is unnecessary。
- Start step: branch `feature/android-onboarding-screen` has been created and checked out。
- Figma URL received: `https://www.figma.com/design/hxq1Z7wXPBoruSIFczLluY/shopmate?node-id=0-1&m=dev&t=BvvR7ntUHKGW7rqd-1`。
- Figma MCP design context for file `hxq1Z7wXPBoruSIFczLluY`, node `3:103` was fetched successfully and included the visual reference plus asset URLs。
- Separate Figma MCP screenshot and variable calls hit the Starter plan tool-call limit, so implementation used the screenshot embedded in the design-context response plus the structured node geometry。
- Figma served the mascot asset as PNG bytes, so the committed local Android resource is `mascot_assistant.png` instead of the originally proposed `.webp` filename。
- Small bottom icons and CTA arrow were recreated as Android vector drawables from the Figma asset semantics。
- Removed the Figma-drawn status bar mock (`9:41`, signal, battery) from Compose. The real Android system status bar now owns that area。
- Verification: `cd client/android && .\gradlew.bat build` passed after rerunning with permission for Gradle's user-level cache. Initial sandboxed build failed only because Gradle could not write to `C:\Users\lxd04\.gradle`。
- Verification after status-bar cleanup: `cd client/android && .\gradlew.bat build` passed。
- Added Android Studio Compose previews for the Figma target size `389 x 843` and compact Android size `360 x 740` to support visual inspection without changing runtime behavior。
- Final verification: `cd client/android && .\gradlew.bat build` passed after adding previews and Compose tooling dependencies。
- Runtime visual screenshot was not captured because no adb device was connected. `adb connect 127.0.0.1:5555` was refused, so LDPlayer / emulator was not available from this shell。
- Follow-up for user-side visual QA: open `OnboardingScreen.kt` in Android Studio Preview or run the app on LDPlayer / emulator and compare against the Figma frame。

## 历史记录

- 初始化前后端技术栈骨架：完成 Android Kotlin + Jetpack Compose 与 Node.js + TypeScript + Express 最小工程初始化，补充 README 与 Git 忽略配置，并通过后端构建与 Android `assembleDebug` 验证。
- 开发顺序规划文档：新增 `context/feature/spec-implementation-order.md`，梳理 Phase 2 之后的 spec 实现顺序、research 插入点、依赖关系和近期队列。
- 开发顺序规划文档中文化：将 `context/feature/spec-implementation-order.md` 从英文改为中文，保留原有结构、文件名和开发顺序。
- Figma 驱动开发顺序调整：根据欢迎页、主聊天页、侧边栏、推荐结果、商品对比、详情页和购物车设计，将近期队列调整为 Android UI 先行，并补充 UI model、mock data 与前后端契约 spec。
- Figma 复现 research prompt：新增 `context/research/figma-to-compose-reproduction-research.md`，用于后续通过 Figma MCP 获取设计上下文、截图和资产，并产出 Compose 复现计划。
