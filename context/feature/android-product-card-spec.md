# Android Product Card

## 概述

把聊天推荐页里的商品推荐卡片抽成可复用组件。后续商品对比页、商品详情入口和购物车页都需要展示商品信息，所以不要继续把卡片逻辑留在 `ChatRecommendationScreen` 内部。

当前来源：

- Figma 推荐结果 frame：`3:307`
- 当前实现：`ChatRecommendationScreen.kt` 内部的 `RecommendationProductCard`、`ProductTag`、`ProductImage`、`AddCartButton`

## 需求

- 新增可复用 `ProductCard` Compose 组件。
- 从 `ChatRecommendationScreen.kt` 中移出商品卡相关私有 composable。
- `ProductCard` 使用 `ProductCardUi` 作为输入数据。
- 商品卡展示：
  - 商品图
  - 商品名
  - 价格
  - 最多两个 tags
  - 推荐理由
  - 操作按钮
- 支持推荐页当前样式：
  - 图片在左
  - 商品内容在右
  - 右下角 `加入购物车` 按钮
- 支持 disabled 状态，用于当前第三个耳机卡的 `暂不可选` 样式。
- 点击商品卡和点击加购按钮分别用不同回调。

## 文件

预计新增 Android 文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ProductCard.kt`

预计修改已有文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`

复用已有文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductCardUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/theme/Color.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/theme/Shape.kt`

## 组件接口

建议参数：

- `product: ProductCardUi`
- `enabled: Boolean = true`
- `onClick: () -> Unit = {}`
- `onAddCartClick: () -> Unit = {}`
- `modifier: Modifier = Modifier`

不要在组件内部直接读取 `MockShopMateData`。

## 视觉备注

- 第一轮只支持推荐结果页用到的横向卡片样式。
- 卡片圆角、阴影、tag、价格色和按钮风格保持当前推荐页效果。
- 商品名单行省略。
- 推荐理由最多两行。
- 商品图片区域保持固定比例，避免因为图片资源不同导致布局跳动。
- 后续如果对比页或购物车需要不同尺寸，再扩展 variant，不要现在提前做复杂参数。

## 验收标准

- `ChatRecommendationScreen` 使用新的 `ProductCard` 组件渲染商品列表。
- 推荐结果页视觉效果和抽取前基本一致。
- `ProductCard` 有 preview，覆盖 enabled 和 disabled 两种状态。
- 商品卡组件不依赖具体页面 state。
- `cd client/android && .\gradlew.bat build` 通过。
