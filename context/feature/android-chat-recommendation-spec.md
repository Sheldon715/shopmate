# Android Chat Recommendation

## 概述

实现聊天推荐结果页。当前阶段先从侧边栏历史聊天进入该页：用户点击最贴近推荐结果页内容的历史项后，进入一个聊天式结果页面，展示用户气泡、AI 回复、商品推荐卡片列表和底部输入栏。

Figma 参考：

- 文件：`shopmate`
- 推荐结果 frame：`3:307`
- Frame size：约 `389 x 843`

## 需求

- 从侧边栏历史聊天项进入推荐结果页。
- 使用历史项 `推荐适合通勤的蓝牙耳机` 作为入口。
- 侧边栏里的 `新聊天` 按钮返回主聊天入口页。
- 页面顶部包含：
  - 左侧菜单按钮
  - 中间小号 Shopmate Buddy
  - 右侧购物车按钮
- 展示用户消息气泡：
  - `推荐一款适合通勤的蓝牙耳机，预算 200 以内`
- 展示 AI 回复气泡：
  - `好的！为你筛选了几款 200 元以内、适合通勤的蓝牙耳机，综合音质、续航、降噪和佩戴舒适度，看看有没有适合你的。`
- 使用 `MockShopMateData.bluetoothEarbuds` 渲染商品推荐卡片列表。
- 每张商品卡展示：
  - 商品图
  - 商品名
  - 价格
  - tags
  - 推荐理由
  - `加入购物车` 按钮
- 底部输入栏复用 `ChatComposer`。
- 商品卡点击、加入购物车和购物车按钮可以暂时 no-op。
- 菜单按钮继续打开侧边栏。

## 文件

预计新增 Android 文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`

预计修改已有文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/sidebar/SidebarHistoryDrawer.kt`
- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`

复用已有文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateIconButton.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductCardUi.kt`

可能新增 drawable：

- `client/android/app/src/main/res/drawable/ic_add_cart.xml`

## 状态

- 使用简单本地 screen state：
  - onboarding
  - home chat entry
  - chat recommendation
- 继续使用本地 composer text state。
- 点击 `MockShopMateData.historyConversations` 中的 `history-commute-earbuds` 进入 chat recommendation。
- 点击侧边栏 `新聊天` 回到 home chat entry。
- 不接真实 SSE、RAG、后端 API、购物车 API 或数据库。
- 商品卡片可以先作为 `ChatRecommendationScreen` 内部 composable；通用 `ProductCard` 后续由 `android-product-card-spec.md` 再抽取。

## 视觉备注

- 背景、header button、底部 composer 复用现有主题和组件。
- 用户消息气泡右对齐，AI 回复气泡左对齐。
- 商品卡片为纵向列表，左右边距接近 Figma。
- 商品图区域、标题、价格、tag 和推荐理由需要在小屏下稳定换行。
- 页面内容需要可滚动，底部 `ChatComposer` 不遮挡最后一张商品卡。

## 验收标准

- 从侧边栏历史项 `推荐适合通勤的蓝牙耳机` 可以进入推荐结果页。
- 推荐结果页菜单按钮可以继续打开侧边栏。
- 侧边栏 `新聊天` 可以回到主聊天入口页。
- 页面显示用户气泡、AI 回复气泡、至少 3 张蓝牙耳机推荐卡和底部 `ChatComposer`。
- 商品数据来自 `MockShopMateData.bluetoothEarbuds`。
- 页面在目标手机尺寸下无明显重叠或文字溢出。
- 不需要后端即可完整渲染。
- `cd client/android && .\gradlew.bat build` 通过。
