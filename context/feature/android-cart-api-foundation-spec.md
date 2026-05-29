# Android Cart API Foundation

## 概述

在 Android 已经接通真实聊天流和真实商品详情后，把购物车从本地 mock 预览推进到可演示的真实闭环：后端提供最小购物车 API，Android 的加购入口和购物车页使用真实购物车状态。

本 spec 也顺手补齐一个较小但影响演示体验的交互：侧边栏历史记录长按后显示浮空操作卡片，支持重命名和删除本地聊天记录。

这次实现需要吸收商品详情文案 polish 的经验：卡片尺寸要稳定，长文本不能因为布局压缩而断句、少括号、和标题重叠，也不能把关键商品信息无提示地截断。

## 范围

本 spec 负责：

- 新增最小后端购物车 API。
- Android 新增购物车 repository / state / ViewModel，并接入现有 `CartScreen`。
- 推荐商品卡片、商品详情页、对比页里的加购入口调用真实购物车逻辑。
- 购物车页展示真实购物车商品、数量、选择状态、删除和合计。
- 侧边栏历史记录支持长按浮空菜单：`重命名`、`删除`。
- 为购物车卡片、历史浮空菜单、长文本状态补上稳定布局规则和预览用例。

本 spec 不负责：

- 登录、注册、复杂用户体系。
- 结算、订单、支付、优惠券。
- RAG 检索算法、chat prompt、推荐排序。
- 远程商品图片加载。
- 购物车跨设备同步。
- 历史记录后端持久化。
- 大规模重做购物车视觉稿。

## 前置条件

先完成：

- `android-network-client-spec.md`
- `android-chat-api-integration-spec.md`
- `android-main-chat-app-flow-spec.md`
- `android-product-api-integration-spec.md`
- `android-product-detail-content-polish-spec.md`
- `android-cart-screen-spec.md`

当前应已有：

- Android 网络基础层和 app container。
- 商品详情真实 API 链路。
- 推荐卡片点击商品详情的真实 product id。
- 本地 mock 购物车 UI。
- 侧边栏历史记录抽屉。

## 后端购物车 API

后端新增 `cart` 模块，保持 controllers thin，业务逻辑放在 service / repository。

建议接口：

- `GET /api/cart`
  - 返回当前 demo user 的购物车。
- `POST /api/cart/items`
  - body: `{ "productId": "...", "quantity": 1 }`
  - 如果商品已在购物车中，累加数量，而不是插入重复行。
- `PATCH /api/cart/items/:itemId`
  - body: `{ "quantity": 2 }` 或 `{ "selected": false }`
  - 两个字段都可选，但至少传一个。
- `DELETE /api/cart/items/:itemId`
  - 删除单个购物车项。
- `POST /api/cart/select-all`
  - body: `{ "selected": true }`
  - 用于底部全选状态。

第一版不接复杂 auth。可以使用固定 demo user key，例如 `demo-user`，但必须集中定义在 cart service / config 附近，避免散落硬编码。

购物车响应建议：

```ts
type CartDto = {
  items: CartItemDto[];
  summary: {
    totalCount: number;
    selectedCount: number;
    selectedTotalCents: number;
    currency: "CNY";
  };
};

type CartItemDto = {
  id: string;
  productId: string;
  name: string;
  brand?: string;
  category?: string;
  priceCents: number;
  priceText: string;
  quantity: number;
  selected: boolean;
  subtotalCents: number;
  available: boolean;
  tags: string[];
};
```

后端注意事项：

- 商品名、品牌、价格、类目必须从后端商品数据读取，不能信任 Android 传入的商品信息。
- `quantity` 范围建议限制为 `1..99`。
- 找不到商品时返回清晰错误。
- 商品不可用时不要静默加购；第一版可以返回业务错误。
- 金额计算使用 cents 整数，不用浮点数。
- API 错误结构沿用项目现有错误响应风格。

数据存储建议：

- 新增 `cart_items` 表或沿用项目现有 migration 风格。
- 字段建议包含：
  - `id`
  - `user_key`
  - `product_id`
  - `quantity`
  - `selected`
  - `created_at`
  - `updated_at`
- 添加唯一约束：`user_key + product_id`。

## Android 购物车接入

Android runtime 路径应从 mock 切换为真实 repository，Preview 仍可使用 mock 数据。

建议新增或修改：

- `data/cart/CartApiClient.kt`
- `data/cart/CartRepository.kt`
- `data/cart/CartDtos.kt`
- `data/cart/CartMapper.kt`
- `ui/cart/CartViewModel.kt`
- `ui/cart/CartUiState.kt`
- `ShopMateAppContainer.kt`
- `CartScreen.kt`
- `MainActivity.kt`
- `ProductCard.kt`
- `ProductDetailScreen.kt`
- `ProductComparisonScreen.kt`
- `ChatRecommendationScreen.kt`

状态要求：

- `CartUiState` 至少包含：
  - `items`
  - `summary`
  - `isLoading`
  - `isRefreshing`
  - `errorMessage`
  - `operationInFlightItemId`
- 第一次进入购物车页时加载 `GET /api/cart`。
- 加购成功后可以重新拉取购物车，也可以用后端响应直接更新状态；不要只打开 mock 购物车页。
- 更新数量、选择状态、删除商品时要有局部 loading 或 disabled 状态，避免重复点击造成 UI 和后端状态不一致。
- 后端失败时展示可恢复错误和重试入口，不要假装成功。

入口接入：

- 推荐结果里的 `ProductCard` 加购按钮必须带真实 `productId`。
- 商品详情底部 `加入购物车` 调用当前详情商品的真实 id。
- 商品对比页如果仍是 mock 数据，可以保留打开购物车预览或禁用加购；不能伪装成真实加购成功。
- 侧边栏购物车入口打开真实 `CartScreen`。

## 历史记录长按菜单

侧边栏历史记录新增长按操作，但不接后端持久化。

交互要求：

- 点击历史项：保持当前行为，打开对应会话并关闭侧边栏。
- 长按历史项：在抽屉内显示浮空操作卡片。
- 浮空卡片包含两个操作：
  - `重命名`
  - `删除`
- 点击抽屉空白处、遮罩、另一个历史项或执行操作后关闭浮空卡片。
- 浮空卡片不应挤压历史列表布局，也不应改变抽屉宽度。

重命名要求：

- 使用轻量 dialog 或抽屉内浮层输入框。
- 默认填入当前标题。
- 空标题禁用确认。
- 标题长度建议沿用当前历史标题限制，最多 `24` 个中文字符左右。
- 重命名后应更新历史列表和当前会话标题。

删除要求：

- 删除历史记录时同步移除对应 session snapshot。
- 如果删除的是当前打开的会话，应清空当前会话并回到主聊天入口状态。
- 删除 mock demo 历史记录时不要假装后端已删除；第一版建议只允许编辑 `ChatViewModel` 管理的本地会话，mock 历史保持只读。

实现要求：

- `SidebarHistoryDrawer` 的历史行可以使用 `combinedClickable` 区分点击和长按。
- 不要靠标题文本判断一条历史是否可编辑；使用显式字段或由 `MainActivity` 传入可编辑 id 集合。
- `ChatViewModel` 新增清晰方法，例如：
  - `renameHistoryConversation(conversationId, title)`
  - `deleteHistoryConversation(conversationId)`
- 重命名 / 删除逻辑放在 ViewModel，不放在 Composable 内拼状态。

## UI 稳定性要求

这部分是从商品详情文案 polish 里沉淀下来的硬要求，避免再次出现“一张图一点点找问题”的情况。

购物车商品卡片：

- 每张卡片高度必须稳定，不能因为加载状态、按钮 disabled、长商品名而跳动。
- 商品名建议最多两行；如果必须省略，要保证品牌、规格、价格和数量不被遮挡。
- tags 数量固定为最多两个，超出的不要硬塞进同一行。
- 删除按钮、数量按钮、价格区需要有固定尺寸，不能被长标题挤走。
- 选中状态、loading 状态不能改变卡片整体高度。

历史浮空菜单：

- 菜单宽度和行高固定，例如宽度约 `148-168dp`，每行高度约 `44dp`。
- `重命名`、`删除` 两个文字必须完整显示。
- 菜单需要在小屏宽度下仍位于抽屉可见区域内。
- 菜单出现时不能覆盖正在操作的行到无法辨认。

文案完整性：

- 重要商品信息不要只靠单行省略。
- 如果文本中包含括号、规格、型号、百分比，不能因为字符串裁剪导致少半个括号或只剩半截型号。
- 不允许标题和正文、标题和 bullet、bullet 和下一行发生重叠。
- 对长中文、长英文型号、长规格名分别准备 Preview 或测试数据。
- 对于真正需要省略的紧凑入口，例如侧边栏历史标题，应明确 `maxLines` 和 `overflow`，并在重命名输入框里能看到完整标题。

## 验收标准

- Android 从聊天推荐商品卡片点击加购后，购物车真实状态发生变化。
- 商品详情页点击 `加入购物车` 后，购物车真实状态发生变化。
- 购物车页首次进入会从后端加载数据。
- 购物车页可更新数量、选择状态、删除商品，并正确刷新合计。
- 后端不可用或接口失败时，Android 展示错误和重试，不展示假的成功态。
- 侧边栏历史记录长按后出现浮空操作卡片。
- 本地历史记录可以重命名和删除。
- 删除当前会话后不会留下无法打开的空历史项。
- 长商品名、长历史标题、长 tags、长价格文案在目标手机尺寸下不重叠、不断行遮挡、不出现关键内容被裁掉的问题。
- Preview 仍可用，且 mock 数据只用于 Preview 或明确的 demo fallback。

## 验证

后端：

- `cd server && npm.cmd test`
- `cd server && npm.cmd run build`

Android：

- `cd client/android && .\gradlew.bat build`

建议补充测试：

- 后端 cart service 测试：
  - 新增商品。
  - 重复加购合并数量。
  - 数量边界。
  - 修改选择状态。
  - 删除商品。
  - 找不到商品。
- Android ViewModel 测试：
  - 加载购物车成功 / 失败。
  - 加购成功 / 失败。
  - 数量更新成功 / 失败。
  - 历史重命名。
  - 历史删除当前会话。

手动检查：

- 从聊天推荐加购。
- 从商品详情加购。
- 从侧边栏进入购物车。
- 购物车长文本卡片在 360dp 和目标手机宽度下不重叠。
- 长按历史记录，执行重命名和删除。
