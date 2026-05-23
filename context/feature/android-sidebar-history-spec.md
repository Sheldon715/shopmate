# Android Sidebar History

## 概述

实现主聊天入口页左侧菜单打开的侧边栏 / 历史抽屉。它用于展示 AI 导购助手信息、快捷入口和历史聊天列表。

设计参考状态：

- 文件：`shopmate`
- 暂记 Sidebar frame：`3:236`
- 参考 Sidebar width：约 `280dp`
- 本仓库尚未验证精确 Figma Dev Mode / MCP 设计上下文，因此抽屉尺寸和视觉细节只能作为实现参考。

## 需求

- 点击主聊天入口页左上角菜单按钮后打开侧边栏。
- 侧边栏从左侧滑出，覆盖在当前页面之上。
- 显示助手信息：
  - Shopmate Buddy 小头像
  - 标题：`AI 导购助手`
  - 副标题：`懂你所需 · 帮你选得更好`
- 显示两个快捷入口：
  - `新聊天`
  - `购物车`
- 显示 `历史聊天` 分组标题。
- 显示历史聊天列表：
  - `推荐适合通勤的蓝牙耳机`
  - `帮我对比这两款防晒霜`
  - `推荐适合油皮的护肤品`
  - `200 元以内的耳机推荐`
  - `拍照找同款`
- 底部显示 `设置` 入口。
- 点击历史项可以暂时关闭侧边栏，不需要切换真实会话。
- `新聊天`、`购物车`、`设置` 可以暂时 no-op。

## 文件

预计新增 Android 文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/sidebar/SidebarHistoryDrawer.kt`

预计修改已有文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`

可能新增 UI model：

- `client/android/app/src/main/java/com/shopmate/app/ui/model/HistoryConversationUi.kt`

可能新增 drawable：

- `client/android/app/src/main/res/drawable/ic_new_chat.xml`
- `client/android/app/src/main/res/drawable/ic_settings.xml`

复用已有内容：

- `ShopMateTheme`
- `ShopMateIconButton`
- `mascot_assistant`
- `ic_cart`

## 状态

- 在 `HomeChatEntryScreen` 中维护本地 `isSidebarOpen` state。
- 历史聊天数据来自 `MockShopMateData`。
- 不接数据库、后端、登录用户或真实会话存储。
- 不引入完整 navigation drawer 架构；先用轻量 Compose state 实现。

## 视觉备注

- 抽屉宽度接近当前参考稿，约 `280dp`。
- 背景使用白色或极浅色 surface。
- 菜单项高度约 `44dp`。
- 历史列表文字需要单行显示，长文本可以省略。
- 抽屉外侧可加半透明遮罩，点击遮罩关闭。

## 验收标准

- 点击 home 页菜单按钮能打开侧边栏。
- 侧边栏包含助手信息、快捷入口、历史聊天列表和设置入口。
- 点击遮罩或历史项能关闭侧边栏。
- UI 在目标手机尺寸下不溢出。
- 不需要真实后端数据即可渲染。
- `cd client/android && .\gradlew.bat build` 通过。
