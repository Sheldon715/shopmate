# Android Product Comparison

## 概述

实现商品对比页。当前阶段先从侧边栏历史聊天进入：用户点击 `帮我对比这两款防晒霜` 后，进入一个聊天式对比结果页面，展示两个商品、对比表、AI 推荐结论和底部输入栏。

Figma 参考：

- 文件：`shopmate`
- 页面：商品对比页
- 当前本地 order 里还没有记录 exact node id；实现前如果 Figma MCP 可用，优先补一次目标 frame 的 screenshot。

## 需求

- 从侧边栏历史项 `帮我对比这两款防晒霜` 进入商品对比页。
- 页面顶部延续推荐页结构：
  - 左侧菜单按钮
  - 中间小号 Shopmate Buddy
  - 右侧购物车按钮
- 展示用户消息气泡：
  - `帮我对比理肤泉和安热沙这两款防晒霜`
- 展示 AI 回复气泡，说明已从防晒力、肤感、适合场景和预算做对比。
- 展示两个商品卡片：
  - 复用 `ProductCard`
  - 商品来自本地 mock data
  - 商品卡点击暂时 no-op
- 展示对比表，至少包含：
  - 防晒力
  - 肤感
  - 适合肤质
  - 通勤适配
  - 价格 / 预算
- 展示 AI 推荐结论卡，明确推荐其中一个商品，并给出一句理由。
- 底部输入栏复用 `ChatComposer`。
- 菜单按钮继续打开侧边栏。
- 购物车按钮进入购物车页，如果购物车页还没实现可以先 no-op。

## 文件

预计新增 Android 文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/comparison/ProductComparisonScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ComparisonUi.kt`

预计修改已有文件：

- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/sidebar/SidebarHistoryDrawer.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`

复用已有文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ProductCard.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductCardUi.kt`

## Mock Data

如果当前商品数据不够，扩展 `MockShopMateData`：

- 新增第二个防晒商品，例如 `安热沙 小金瓶防晒乳 SPF50+`
- 新增 `ComparisonUi`，包含：
  - `id`
  - `queryText`
  - `assistantText`
  - `products: List<ProductCardUi>`
  - `rows: List<ComparisonRowUi>`
  - `recommendedProductId`
  - `summaryText`

不要接真实后端、数据库、RAG 或 SSE。

## 视觉备注

- 页面背景、header、消息气泡和底部输入栏尽量沿用 `ChatRecommendationScreen` 的布局语言。
- 对比表要适合手机窄屏：左侧维度列固定，右侧两个商品列等宽。
- 表格文字允许换行，不能横向溢出。
- 推荐结论卡放在对比表下方，内容短，不做复杂解释。
- 页面主体可滚动，底部 `ChatComposer` 不遮挡最后一行结论。

## 验收标准

- 点击侧边栏历史项 `帮我对比这两款防晒霜` 可以进入商品对比页。
- 页面展示用户气泡、AI 回复、两个商品卡、对比表、推荐结论和底部 `ChatComposer`。
- 对比数据来自 `MockShopMateData`。
- 菜单按钮可以继续打开侧边栏。
- 页面在目标手机尺寸下无明显重叠或文字溢出。
- 不需要后端即可完整渲染。
- `cd client/android && .\gradlew.bat build` 通过。
