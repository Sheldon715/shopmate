# Android Chat Composer

## 概述

实现可复用的底部聊天输入栏组件。它会先用于主聊天入口页，后续也会复用于推荐结果页、商品对比页和其他聊天式页面。

Figma 参考：

- 文件：`shopmate`
- 主聊天入口 frame：`3:145`
- 推荐结果页 frame：`3:307`

## 需求

- 新增 `ChatComposer` Compose 组件。
- 输入栏显示 placeholder：`问问 Shopmate...`
- 右侧显示三个 icon button：
  - 语音输入
  - 添加图片
  - 发送
- 支持本地输入文本状态。
- 输入文字后，发送按钮仍然只触发回调，不接后端。
- 语音和图片按钮可以是 no-op 回调。
- 组件需要能放在屏幕底部，并避免遮挡主要内容。
- 主聊天入口页实现时直接复用该组件，不在页面里重新手写输入栏。

## 文件

预计新增 Android 文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt`

可能新增 drawable：

- `client/android/app/src/main/res/drawable/ic_mic.xml`
- `client/android/app/src/main/res/drawable/ic_image.xml`
- `client/android/app/src/main/res/drawable/ic_send.xml`

预计后续使用文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`

## 状态与回调

组件参数建议保持简单：

- `value: String`
- `onValueChange: (String) -> Unit`
- `onSend: () -> Unit`
- `onVoiceClick: () -> Unit`
- `onImageClick: () -> Unit`
- `modifier: Modifier = Modifier`

本 spec 不要求接入 ViewModel、repository 或 API。

## 视觉备注

- 输入栏整体是 pill / 大圆角容器。
- 背景使用白色或极浅色 surface。
- placeholder 使用次级文字色。
- icon button 使用当前 `ShopMateIconButton` 风格。
- 高度接近 Figma 中的 `52dp`。
- 左右边距接近 `18dp`。
- 图标触控区域接近 `34dp`。

## 验收标准

- 存在可复用 `ChatComposer` 组件。
- 组件能在 preview 中显示空输入和有文字输入两种状态。
- 主聊天入口 spec 实现时可以直接复用它。
- 不引入语音、图片上传或后端发送逻辑。
- `cd client/android && .\gradlew.bat build` 通过。
