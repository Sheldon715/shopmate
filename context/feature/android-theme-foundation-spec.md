# Android Theme Foundation

## 概述

为 Figma 驱动的 Android 页面建立一个小型共享主题层。这不是完整 design system，只抽取 onboarding 和主聊天入口页已经重复需要的颜色、背景、文字颜色、圆角形状和基础按钮。

Figma 参考：

- 文件：`shopmate`
- Page node：`0:1`
- Onboarding frame：`3:103`
- 主聊天入口 frame：`3:145`

## 需求

- 在 Material3 外层增加 `ShopMateTheme`。
- 把重复颜色从单个 screen 中移出：
  - 主绿色：接近 `#31C88C`
  - 浅绿色：接近 `#70DCAE`
  - 柔和薄荷光感：接近 `#B8F1DB`
  - 主文字色：接近 `#172331`
  - 次级文字色：接近 `#767F8A`
  - 三级文字色：接近 `#7C8791`
  - 背景：白色到极浅灰绿色
- 提供可复用 screen background，用于还原 Figma 的白色 / 薄荷绿柔和背景。
- 提供基础圆角形状：
  - pill，用于主 CTA 和输入栏
  - rounded card，用于 prompt panel 和商品卡
  - rounded icon button，用于 header action
- 增加可复用基础按钮样式：
  - 主绿色 pill button
  - 小型圆角 icon button
- 抽出样式后，保持当前 onboarding 视觉效果基本不变。

## 文件

预计新增 Android 文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/theme/Color.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/theme/Shape.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/theme/Theme.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateButton.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateIconButton.kt`

预计修改已有文件：

- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/onboarding/OnboardingScreen.kt`

## 备注

- 不要一次性创建所有未来 token。
- 不要新增 navigation、mock repository、product model 或 chat state。
- 不要修改 mascot 或 icon asset 的现有命名。
- 只使用 Compose 和 Material3 基础能力，不新增依赖。
- 如果 Figma 阴影在 Compose 中难以完全还原，保留当前柔和近似即可。

## 验收标准

- `MainActivity` 使用 `ShopMateTheme`。
- `OnboardingScreen` 在合适位置使用共享颜色、背景和按钮 helper，减少局部重复常量。
- onboarding 页面整体观感保持不变。
- 新增主题基础能直接服务 `android-home-chat-entry-spec.md`。
- `cd client/android && .\gradlew.bat build` 通过。
