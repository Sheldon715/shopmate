# Android Product Card Rich Interaction

## Research 判断

不需要外部 research。当前项目已有 `ProductCard`、`ShopMateProductImage`、商品详情收藏本地状态、Cart API、Chat / Product / Cart 加购入口，本 spec 只把关键商品操作做得更像商业产品。

实现前需要扫描：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ProductCard.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/cart/CartViewModel.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`

## 背景

商品卡是 ShopMate 主 Demo 最可见的商业化组件。用户会反复执行：

- 看推荐商品。
- 点击商品卡进入详情。
- 点击加入购物车。
- 收藏商品。
- 从聊天或详情继续 checkout。

如果这些操作没有反馈，App 会显得像静态 Demo。V1 需要让这些高频动作有明确、克制、可靠的反馈，但不能在本地伪造真实业务状态。

## 目标

- 商品卡点击有按压反馈。
- 商品卡加购按钮支持 `idle / loading / added / failed / disabled` 的视觉状态。
- 加购成功后短暂显示成功反馈，然后回到可操作状态。
- 加购失败时展示轻量错误提示，不吞掉现有错误信息。
- 商品详情收藏按钮有 scale / tint 过渡和短 bounce。
- 商品详情底部“加入购物车 / 立即购买”和对比页商品摘要卡加购也纳入同一反馈模型。
- 购物车商品行的数量加减、删除、全选和 checkout 按钮保留真实 in-flight 状态，并在视觉上与商品卡操作一致。
- 保持所有业务成功状态以后端 Cart / Chat action 返回为准。
- UI 文案和可访问性标签保持清晰。

## 不做

- 不新增收藏 API。
- 不持久化收藏状态到后端。
- 不在本地直接写购物车成功。
- 不改变 Cart API、Chat SSE、Product API。
- 不新增 Snackbar 框架或全局 toast 系统，除非当前代码已有可复用机制。
- 不引入 Lottie 或第三方动画库。
- 不把“mock”“fake”“模拟”展示在用户 UI。

## ProductCard API 调整

当前 `ProductCard` 只有：

```kotlin
onClick: () -> Unit
onAddCartClick: () -> Unit
enabled: Boolean
```

建议扩展：

```kotlin
enum class ProductCardActionState {
    Idle,
    Loading,
    Added,
    Failed,
    Disabled,
}
```

或更轻量：

```kotlin
data class ProductCardInteractionState(
    val addCartState: ProductAddCartState = ProductAddCartState.Idle,
    val message: String? = null,
)
```

V1 推荐只扩展 `ProductCard` 参数，不修改 `ProductCardUi` 数据模型：

```kotlin
fun ProductCard(
    product: ProductCardUi,
    enabled: Boolean = true,
    addCartState: ProductAddCartState = ProductAddCartState.Idle,
    onClick: () -> Unit = {},
    onAddCartClick: () -> Unit = {},
)
```

原因：

- 加购状态是交互状态，不是商品事实。
- 同一个商品在聊天、详情、购物车、checkout 中可能有不同操作状态。

## 加购状态策略

### Chat 商品卡

当用户点击聊天商品卡“加入购物车”：

- 立即将该 productId 的按钮置为 `Loading`。
- 等待 ViewModel / repository 返回真实结果。
- 成功：显示 `Added` 约 900-1200ms，再回到 `Idle` 或显示可再次加购状态。
- 失败：显示 `Failed` 约 1200-1800ms，同时保留现有错误提示 / retry 机制。

如果当前聊天加购通过 `ChatViewModel` side effect 或外层 cart repository 处理，优先沿用现有路径，不新增并行业务路径。

### 商品详情页

详情页底部“加入购物车”：

- 点击后按钮进入 loading。
- 成功后短暂显示“已加入”或 check 状态。
- 失败后恢复按钮并显示现有错误文案。
- 不离开详情页，不自动打开购物车，除非现有交互已经如此设计。

“立即购买”：

- V1 仍然复用当前 add-to-cart / checkout 入口，不在客户端直接创建 checkout 或订单。
- 如果点击后只完成加购，应明确展示“已加入购物车”而不是“已下单”。
- 如果后续接入直接 checkout，需要单独定义业务路径，不能在本 spec 中偷做。

### 对比详情页

`ProductComparisonScreen` 中的商品摘要卡也属于商品操作入口：

- 商品图片 / 商品名点击进入详情需要 press feedback。
- “加入购物车”按钮沿用商品卡的 loading / added / failed 状态。
- 推荐商品标识不应被误认为按钮。
- 两个商品同时显示时，各自加购状态互不影响。

### 购物车页

购物车页已经是已加购商品集合，不需要在 item 内展示 “added” 状态，但需要纳入操作反馈一致性：

- 数量加减时仅当前 item disabled / loading，不冻结整页。
- 删除时保留当前 item 的 in-flight feedback，成功后 item 消失或列表平滑更新。
- 全选 / 取消全选时底部合计栏同步更新，不能出现旧金额闪烁。
- checkout 按钮 loading 时不能重复提交 draft。

## 视觉设计

### 商品卡按压

- 整张卡点击：scale 0.98 左右，shadow 稍微变浅。
- 按压反馈不改变布局占位。
- disabled 商品卡只降低 alpha，不触发 press scale。

### 加购按钮

状态建议：

- `Idle`：现有绿色图标 + “加入购物车”。
- `Loading`：按钮 disabled，显示小 loading dot / spinner 或文字“加入中”。
- `Added`：绿色强化，图标切换为 check，文字“已加入”。
- `Failed`：温和错误色，文字“重试”或“未加入”。
- `Disabled`：现有“暂不可选”。

要求：

- 按钮宽高固定，不因文字切换导致卡片跳动。
- 文案必须在小屏下放得下。
- 图标可复用现有 drawable；如果缺少 check icon，可以新增简单 vector drawable。

### 收藏按钮

商品详情已有本地收藏状态：

```kotlin
var isFavorite by rememberSaveable(product?.id) { mutableStateOf(false) }
```

V1 行为：

- 点击后 icon tint 平滑变化。
- 点击瞬间 scale up -> settle，形成轻量 bounce。
- contentDescription 在“收藏商品 / 取消收藏”之间切换。
- 不展示“已同步”或“收藏成功保存”这种暗示后端持久化的文案。

## 状态所有权

加购状态应由拥有业务调用的 ViewModel / 屏幕层维护：

- 聊天页：可在 `ChatUiState` 增加 `addingCartProductIds` / `recentlyAddedProductIds` / `addCartErrors`。
- 详情页：可在 `ProductDetailUiState` 或 screen local state 中维护 `addCartState`，前提是业务调用仍通过 repository / ViewModel。
- 对比页：可复用聊天 / 购物车外层的加购状态，不能在 `ProductComparisonScreen` 内直接调网络。
- 购物车页：沿用 `CartUiState.operationInFlightItemId`、`isSelectAllInFlight`、`isCheckoutDraftLoading`。
- 组件层只渲染状态，不自己调用网络。

不要把交互状态写入：

- `ProductCardUi`，除非多个页面确实需要统一展示同一交互状态。
- 后端 DTO。
- RAG / Chat contract。

## 可访问性

- 商品卡整体 contentDescription 不应和加购按钮冲突。
- 加购按钮：
  - Idle: `加入购物车`
  - Loading: `正在加入购物车`
  - Added: `已加入购物车`
  - Failed: `加入购物车失败，点按重试`
  - Disabled: `暂不可选`
- 收藏按钮：
  - `收藏商品`
  - `取消收藏`

## 文件范围

预计修改：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ProductCard.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/comparison/ProductComparisonScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/cart/CartScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatUiState.kt`
- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- 视现有路径，可能涉及 `CartViewModel` 或 `MainActivity.kt` 的 side effect 展示。

可新增：

- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductInteractionUi.kt`
- `client/android/app/src/main/res/drawable/ic_check.xml`

不修改：

- 后端 Cart API。
- Chat SSE event schema。
- Product API。
- Order / checkout 后端。

## 测试计划

Android 单元测试：

- 聊天页点击加购后对应 productId 进入 loading。
- 加购成功后进入 added，并最终回到 idle。
- 加购失败后进入 failed 或保留错误提示。
- 不同商品的加购状态互不影响。
- 重复点击 loading 商品不会发起重复请求。
- 商品详情页加购失败不展示成功状态。

如果 UI 状态主要在 Compose 层，不方便单测：

- 至少保留 ViewModel / repository 现有测试不回退。
- 用手动 Demo 路径验证按钮状态。

## 手动验证

- 聊天推荐商品卡点击进入详情。
- 聊天推荐商品卡加购成功。
- 聊天推荐商品卡加购失败。
- 商品详情页收藏 / 取消收藏。
- 商品详情页加购成功 / 失败。
- 商品详情页立即购买不伪造订单成功。
- 对比详情页两个商品分别加购成功 / 失败。
- 购物车数量、删除、全选和 checkout loading 不重复提交。
- 小屏下按钮文案不溢出。
- disabled 商品卡不触发加购。

## 验证命令

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/
```

如实现触及后端或 Chat contract，补跑：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

## 验收标准

- 商品卡和详情页关键操作有即时、明确、克制的反馈。
- 加购成功与失败都以后端真实结果为准。
- 收藏动画只表达本地收藏视觉状态，不暗示后端持久化。
- 按钮状态切换不导致卡片尺寸变化或文字溢出。
- 不新增第三方动效库。
- Android test / build 通过，或记录真实失败原因。
