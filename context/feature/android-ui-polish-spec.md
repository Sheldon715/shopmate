# Android UI Polish

## 概述

对第一轮 Figma 页面做统一打磨。这个 spec 不新增业务功能，重点修明显的页面间距、滚动行为、键盘避让、按钮状态、空状态、错误状态和 Preview 质量，让 onboarding、主聊天入口、侧边栏、推荐页、对比页、详情页和购物车页看起来像同一个 App。

本 spec 是第一轮 UI 收尾，不是重写设计系统，也不是大规模重构 Figma 绝对定位页面。

## 范围

覆盖已经完成或即将完成的第一轮 Android UI：

- Onboarding
- Home chat entry
- Sidebar history drawer
- Chat recommendation
- Product comparison
- Product detail
- Cart
- 共享组件：`ChatComposer`、`ProductCard`、按钮、tag chip

执行前提：

- `android-cart-screen-spec.md` 已完成，`CartScreen.kt` 已存在。
- 如果购物车页尚未实现，先执行 cart screen spec，再执行本 spec。

## 需求

- 统一页面安全区处理：
  - status bar
  - navigation bar
  - 底部固定栏
- 统一页面左右边距和顶部 header 间距。
- 优先复用已有 `ShopMateTheme`、`shopMateScreenBackground()`、共享颜色和圆角 token；只有在局部 Figma 复现需要时才保留页面内背景 helper。
- 检查所有可滚动页面：
  - 内容不能被底部 `ChatComposer` 或购买栏遮挡
  - 最后一项需要有足够 bottom padding
- 检查键盘避让：
  - `ChatComposer` 聚焦后不能完全被键盘盖住
  - 先做最小 Compose `imePadding` / `navigationBarsPadding` 处理即可
- 统一按钮状态：
  - enabled
  - disabled
  - pressed / clickable feedback
- 统一空状态和错误状态的最小样式：
  - 空推荐结果
  - 找不到商品详情
  - 空购物车
- 不要求新增 loading state 的真实业务逻辑；可以只补 fake / preview state。
- 补齐关键 Preview：
  - 目标手机尺寸
  - compact 手机尺寸
  - 空状态
  - 长文案 / 长商品名
- 修复明显的文字溢出、重叠和小屏布局问题。
- 修复明显无效回调或 no-op 入口中影响第一轮演示的问题，例如购物车入口进入购物车页。

## 文件

预计修改已有文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/onboarding/OnboardingScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/sidebar/SidebarHistoryDrawer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/comparison/ProductComparisonScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/cart/CartScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ProductCard.kt`

可以新增的共享组件：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateEmptyState.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateStatusMessage.kt`

## 边界

- 不接真实后端。
- 不新增导航框架。
- 不重写整体设计系统。
- 不把所有页面从 Figma 绝对定位重写为响应式架构；只修明显小屏和遮挡问题。
- 不在本 spec 大规模替换商品图片资源。
- 不处理 SSE、RAG、登录、checkout。
- 不引入新的 Compose UI 依赖。

## 视觉检查清单

- 所有页面在 `389 x 843` 左右尺寸下无明显重叠。
- 关键页面在 `360 x 740` 左右 compact 尺寸下无明显重叠。
- 长标题和长推荐理由不会撑破卡片。
- 底部固定栏不会挡住滚动内容。
- 侧边栏打开 / 关闭时主页面不出现奇怪跳动。
- disabled 商品卡、空购物车和 not found 详情页有清晰状态。
- 按钮文字和图标在小屏下不挤压。
- 购物车页空状态、商品详情 not found 状态、推荐页长商品名 preview 都能编译。

## 验收标准

- 第一轮页面整体间距和组件风格统一。
- 主要页面都有可用 Preview。
- 长文案、空状态和 not found 状态不会导致崩溃或布局溢出。
- 键盘打开时底部输入栏仍可用。
- 不改变 mock 数据、后端接口、真实网络接入和 RAG 计划。
- `cd client/android && .\gradlew.bat build` 通过。
