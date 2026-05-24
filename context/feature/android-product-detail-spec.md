# Android Product Detail

## 概述

实现商品详情页。当前阶段从推荐结果页的商品卡点击进入，展示商品大图、收藏按钮、精选标识、标题、价格、tag、AI 推荐理由、商品亮点和底部购买栏。

Figma 参考：

- 文件：`shopmate`
- 页面：商品详情页
- 当前本地 order 里还没有记录 exact node id；实现前如果 Figma MCP 可用，优先补一次目标 frame 的 screenshot。

## 需求

- 从 `ChatRecommendationScreen` 的商品卡点击进入详情页。
- 后续商品对比页也可以复用同一个详情入口，但本 spec 只要求推荐页入口。
- 页面顶部包含：
  - 返回按钮
  - 收藏按钮
  - 购物车按钮
- 商品主体展示：
  - 商品大图
  - `精选推荐` 或类似精选标识
  - 商品标题
  - 价格
  - tags
  - AI 推荐理由
  - 商品描述
  - highlights 列表
- 底部购买栏展示：
  - 当前价格
  - `加入购物车` 按钮
  - `立即购买` 按钮
- 收藏按钮可以只做本地 toggle。
- `加入购物车`、`立即购买` 可以暂时 no-op。
- 购物车按钮进入购物车页，如果购物车页还没实现可以先 no-op。

## 文件

预计新增 Android 文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`

预计修改已有文件：

- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`

复用已有文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductDetailUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductCardUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateIconButton.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/theme/Theme.kt`

## 状态

- `MainActivity` 需要能记录当前详情商品 id。
- 如果现有 `enum class ShopMateScreen` 不方便带参数，可以改成轻量 sealed class。
- 使用 `MockShopMateData.findProductDetail(productId)` 获取详情。
- 找不到商品时展示简单 not found 状态：
  - 标题：`暂时找不到这个商品`
  - 返回按钮可用
- 不接真实商品详情 API、购物车 API 或登录收藏。

## 视觉备注

- 商品大图区域要有稳定高度，避免不同图片导致页面跳动。
- 标题允许两行，价格突出但不要压过标题。
- tag chip 复用现有圆角和浅色背景。
- AI 推荐理由可以做成浅色提示块。
- 底部购买栏固定在底部，页面内容滚动时不能被遮挡。
- 详情页要有 Preview，至少覆盖一个存在商品和一个 not found 状态。

## 验收标准

- 推荐结果页点击商品卡可以进入对应商品详情页。
- 返回按钮可以回到推荐结果页。
- 页面展示商品图、标题、价格、tags、AI 推荐理由、描述、highlights 和底部购买栏。
- 收藏按钮可以本地切换视觉状态。
- 找不到商品 id 时不会崩溃。
- 不需要后端即可完整渲染。
- `cd client/android && .\gradlew.bat build` 通过。
