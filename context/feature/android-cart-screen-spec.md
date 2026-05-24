# Android Cart Screen

## 概述

实现购物车页。当前阶段使用 `MockShopMateData.cartItems` 渲染本地购物车，支持选择状态、数量加减、删除、合计和结算按钮，但不接真实购物车 API。

Figma 参考：

- 文件：`shopmate`
- Cart frame：`3:704`
- Frame size：约手机竖屏尺寸

## 需求

- 从页面顶部购物车按钮进入购物车页：
  - 主聊天入口页
  - 推荐结果页
  - 商品对比页
  - 商品详情页
  - 侧边栏购物车入口
- `MainActivity` 中新增本地 screen state：
  - `ShopMateScreen.Cart(previousScreen: ShopMateScreen)`
  - 点击购物车入口时记录来源页面。
  - 购物车返回按钮回到来源页面；如果来源不可恢复，回到主聊天入口页。
- 页面顶部包含：
  - 返回按钮
  - 标题 `购物车`
  - 商品数量文案
- 展示精选提示卡，例如：
  - `已为你保留 AI 推荐商品`
- 展示购物车商品列表：
  - 选择状态
  - 商品图
  - 商品名
  - 价格
  - 最多两个 tags
  - 数量加减
  - 删除
  - 小计
- 底部合计栏展示：
  - 已选数量
  - 合计金额
  - `去结算` 按钮
- 数量加减、选择状态和删除先在 `CartScreen` 本地 state 中生效。
- `CartItemUi` 目前只有 `priceText` / `subtotalText` 文案，没有数值价格字段；本 spec 内可以新增一个小型本地 helper 从 `priceText` 中解析人民币整数，或者在 `CartScreen` 内维护 `unitPrice` derived state，但不要改成后端 DTO。
- `去结算` 暂时 no-op。

## 文件

预计新增 Android 文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/cart/CartScreen.kt`

预计修改已有文件：

- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/comparison/ProductComparisonScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/sidebar/SidebarHistoryDrawer.kt`

复用已有文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/model/CartItemUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductCardUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateIconButton.kt`

## 状态

- 初始数据来自 `MockShopMateData.cartItems`。
- 页面内维护本地 cart state：
  - `selected`
  - `quantity`
  - 是否已删除
- 数量最低为 `1`。
- 减号在数量为 `1` 时 disabled 或不再继续减少。
- 删除后从当前页面列表移除即可，不需要持久化回 `MockShopMateData`。
- 如果列表为空，展示空购物车状态和返回按钮。
- 页面重新进入时可以重新从 `MockShopMateData.cartItems` 初始化，不要求跨页面持久化。
- 不接真实购物车 API、订单 API、支付或登录。

## 视觉备注

- 购物车列表应可滚动，底部合计栏固定。
- 商品图尺寸固定，商品名最多两行。
- 数量步进按钮尺寸固定，避免点击后布局跳动。
- 合计栏不能遮挡最后一个商品。
- 如果缺少删除、减号或选中图标，先用最小可读的本地按钮样式；图标资产后续由 `android-product-image-assets-spec.md` 或 UI polish 再替换。
- 已有 `ic_cart.xml`、`ic_add_plus.xml` 等资产可以复用；本 spec 不要求新增完整图标资产包。
- 购物车页应有 target preview 和 empty preview。

## 验收标准

- 点击购物车入口可以进入购物车页。
- 返回按钮可以回到进入购物车前的页面。
- 购物车页显示 header、精选提示卡、商品列表和底部合计栏。
- 初始商品来自 `MockShopMateData.cartItems`。
- 勾选、取消勾选、数量加减、删除会更新本地页面展示和合计。
- 数量不会小于 `1`。
- 空购物车状态可显示且不崩溃。
- 不需要后端即可完整渲染。
- `cd client/android && .\gradlew.bat build` 通过。
