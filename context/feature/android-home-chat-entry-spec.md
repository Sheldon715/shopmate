# Android Home Chat Entry

## 概述

复现 Figma 主聊天入口页。用户在 onboarding 点击 `开始购物` 后进入该页面。

Figma 参考：

- 文件：`shopmate`
- Frame node：`3:145`
- Frame size：约 `389 x 843`

## 需求

- onboarding CTA 跳转到主聊天入口页。
- 使用 `ShopMateTheme` 和共享背景，不重新写一套页面颜色。
- 顶部 header 包含：
  - 左侧菜单按钮
  - 右侧购物车按钮
- 展示品牌文案：
  - 标题：`抖选选 / Shopmate`
  - 副标题：`AI 购物助手 · 懂你所需，帮你选得更好`
- 展示 Shopmate Buddy mascot hero，复用现有 mascot 资源。
- 展示 prompt panel：
  - 标题：`今天想买点什么？`
  - 副标题：`告诉我你的需求，我来帮你挑选最合适的商品`
  - prompt 数据来自 `MockShopMateData.promptSuggestions`
- 底部输入栏必须复用 `ChatComposer`。
- 点击 prompt 后，把 prompt 文案填入 composer。
- 菜单按钮和购物车按钮可以暂时 no-op，等 sidebar / cart spec 再接入。

## 文件

预计新增 Android 文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`

预计修改已有文件：

- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/onboarding/OnboardingScreen.kt`

复用已有文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateIconButton.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`

可能新增 drawable：

- `client/android/app/src/main/res/drawable/ic_menu.xml`
- `client/android/app/src/main/res/drawable/ic_cart.xml`
- `client/android/app/src/main/res/drawable/ic_prompt_spark.xml`

## 状态

- 使用简单本地 screen state：
  - onboarding
  - home chat entry
- 使用本地 composer text state。
- 不引入完整 navigation 架构。
- 不接后端、repository、语音、图片上传或真实发送。

## 视觉备注

- 视觉风格延续 onboarding：白色 / 柔和薄荷背景、深色文字、圆角控件。
- Header icon button 约 `38dp`。
- Prompt panel 使用轻量 rounded surface。
- Prompt rows 是全宽圆角按钮，左侧有小图标。
- `ChatComposer` 固定在底部附近，不能遮挡 prompt panel。

## 验收标准

- 点击 onboarding `开始购物` 后能进入主聊天入口页。
- 页面包含 header、品牌标题、mascot、prompt panel、四个 prompt 和底部 `ChatComposer`。
- Prompt 文案来自 `MockShopMateData.promptSuggestions`。
- 点击 prompt 会填入 composer。
- 页面在目标手机尺寸下无文字重叠或明显溢出。
- `cd client/android && .\gradlew.bat build` 通过。
