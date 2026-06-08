# Android Loading Skeleton Polish

## Research 判断

不需要外部 research。当前项目已有 Jetpack Compose、Material3、Coil 3、真实 Product / Cart / Order / Chat 状态，本 spec 只做 Android skeleton / image / empty / error 体验统一。

聊天等待、语音条和图片解释这类适合 Lottie 的忙碌微动效不放在本 spec，由 `android-state-lottie-feedback-spec.md` 负责。本 spec 继续负责稳定占位和页面加载结构。

实现前做本地代码扫描：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/`
- `client/android/app/src/main/java/com/shopmate/app/ui/cart/`
- `client/android/app/src/main/java/com/shopmate/app/ui/checkout/`

## 背景

当前 Android 已经有若干局部 loading：

- 商品详情页有 `ProductLoadingCard`。
- 购物车页有 `CartLoadingState`。
- 聊天页有本地 streaming / typing 气泡，但状态动效不够自然。
- 商品图已通过 `ShopMateProductImage` 使用 Coil placeholder / error fallback。

问题是这些状态分散在各页面，视觉节奏和加载层级不统一。商业 Demo 的 V1 应该先把“慢的时候也像正式产品”做好。

## 目标

- 新增共享 skeleton / pulse 组件，统一颜色、圆角、节奏和尺寸策略。
- 升级商品图片加载状态：加载中显示柔和 skeleton，成功后 fade-in，失败时保持稳定 fallback。
- 统一商品详情、购物车、checkout 和聊天商品卡的 loading / empty / error 外观。
- 覆盖 `ChatComposer` 图片附件上传 / 识别 / 搜索状态和语音转写状态的布局稳定性；具体 Lottie 动效由状态反馈 spec 实现。
- 覆盖对比详情页中的商品图片加载和 comparison 不可用 fallback。
- 加载组件必须固定尺寸，不能导致页面跳动。
- 保持现有业务 state 和 API contract 不变。

## 不做

- 不新增第三方 shimmer / placeholder 库。
- 不在 skeleton / 商品图占位 / 页面加载块中新增 Lottie；状态微动效由 `android-state-lottie-feedback-spec.md` 控制。
- 不改变 Product / Cart / Order / Chat API。
- 不改变 ViewModel 业务状态机。
- 不为了 skeleton 人为延迟接口结果。
- 不展示假的商品、假的金额或假的订单状态。

## 共享组件

建议新增：

```text
client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateSkeleton.kt
```

包含：

```kotlin
@Composable
fun ShopMateSkeletonBlock(...)

@Composable
fun ShopMateSkeletonTextLine(...)

@Composable
fun ShopMateProductImageFrame(...)
```

设计要求：

- 使用现有 ShopMate 颜色体系，建议基底为浅灰绿 / 浅雾灰。
- 圆角匹配当前卡片和图片圆角。
- 动效使用轻量 alpha pulse 或横向 brush sweep；V1 优先 pulse，避免复杂测试。
- 所有 skeleton block 都由父级传入明确 `Modifier.size(...)` 或 `fillMaxWidth().height(...)`。
- `contentDescription = null`，避免读屏读出装饰性加载块。

## 商品图片加载

升级：

```text
ShopMateProductImage.kt
```

建议行为：

- `imageUrl` 为空：继续显示本地 placeholder，不显示网络 loading。
- `imageUrl` 非空加载中：显示同尺寸 skeleton / soft placeholder。
- 加载成功：图片 fade-in，避免突然闪出。
- 加载失败：稳定显示本地 placeholder，不改变容器尺寸。

如果 Coil `AsyncImage` 无法精确区分状态，可改用 `SubcomposeAsyncImage` 或 `rememberAsyncImagePainter`，但仍保持封装在 `ShopMateProductImage` 内部，不让调用方重复处理。

影响范围：

- 商品卡片。
- 商品详情 hero 图。
- 购物车商品图。
- Checkout 商品列表图。
- 聊天图片附件不强制纳入；附件是用户本地图片，优先保持现状。

## 页面加载状态

### Chat

保持现有本地 streaming / typing 气泡，但做视觉统一：

- 文本尚未到达时显示轻量 thinking dots、短 skeleton line，或接入 `android-state-lottie-feedback-spec.md` 的 `AiThinking` 小动效。
- 第一条真实文本到达后由现有 typewriter / streaming 逻辑接管。
- 不恢复后端固定安全预响应。

商品卡区域：

- `product_cards` 到达前不显示假的商品卡。
- 如果当前 stream 已有 assistant 文本但商品卡稍后到达，可以显示极短的卡片区域淡入，不提前占很大空位。

Composer 状态：

- 图片附件 `Uploading / Interpreting / Searching` 状态显示稳定的进度感，不能只靠静态文字；`Interpreting / Searching` 可复用状态 Lottie。
- 图片附件 `Failed` 状态保留重试和删除入口，不清空用户已输入文本。
- 语音 `Listening / Transcribing` 状态需要有明确等待反馈，可复用状态 Lottie 的波形 / 转写动效，不能看起来像按钮失效。
- 语音 `PermissionDenied / Error` 不应撑高 composer 或遮挡底部导航。

### Product Detail

替换或收口 `ProductLoadingCard`：

- Hero 图区域 skeleton。
- 标题 / 价格 / tag / 推荐理由 / 规格卡片 skeleton。
- 保持当前详情页高度和滚动策略，避免 loading -> success 时页面整体跳动。

### Cart

替换或收口 `CartLoadingState`：

- 2 到 3 个购物车 item skeleton。
- 底部金额栏 loading 态，不展示假金额。
- 如果已有旧购物车数据并在 refresh，可保留旧数据并用局部 progress / disabled action 表示刷新中。

### Checkout

新增或统一 checkout loading：

- Draft 加载中：地址、商品清单、配送、支付和金额明细显示 skeleton。
- 提交订单中：按钮进入 loading / disabled 状态，页面内容保持可见。
- 不能展示假的订单号或成功状态。
- 地址编辑、地址簿、配送选项和支付选项如果发生局部保存 / 切换，不整页回到 loading。
- field error 出现时不让输入框高度突然挤压底部提交按钮。

### Product Comparison

对比详情不是普通商品卡列表，也需要进入 V1 验收：

- 对比商品图片复用 `ShopMateProductImage` 的 loading / fallback。
- comparison 不存在或被恢复路由找不到时，返回聊天前不能闪空白页。
- 对比表、推荐亮点、推荐结论不展示 skeleton 假数据；没有数据时显示稳定 fallback。

## Empty / Error 状态

V1 只做统一外观，不改业务逻辑：

- 商品详情 not found。
- 空购物车。
- Checkout draft 过期 / 加载失败。
- Chat 网络失败 / SSE 中断。
- Comparison 不可用。
- 图片找货失败。
- 语音权限拒绝 / 识别失败。

建议新增共享小组件：

```text
ShopMateStatusBlock.kt
```

但如果现有页面已有清晰状态卡，也可以只调整样式，不强行抽象。

状态文案要求：

- 面向用户，不暴露 stack trace、provider 原始错误、API key、完整 prompt。
- 错误 action 明确：重试、返回、重新发起 checkout。
- 不使用“mock”“fake”“模拟”等字样出现在正式 UI。

## 文件范围

预计修改：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateProductImage.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ProductCard.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/cart/CartScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/checkout/CheckoutScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`

预计新增：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateSkeleton.kt`
- 可选：`client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateStatusBlock.kt`

不修改：

- 后端。
- 数据库。
- RAG。
- SSE event schema。
- Android network client / parser。

## 测试计划

Android 单元测试：

- 如新增纯 mapper / helper，补普通 unit test。
- 如果只改 Compose UI，至少保证现有 `testDebugUnitTest` 不回退。

手动检查：

- 商品图 URL 正常、为空、失败三种情况。
- 商品详情 loading -> success / error。
- 购物车 loading -> loaded / empty / error。
- Checkout draft loading -> loaded / expired / submit loading。
- Chat 发送后等待期间没有空白页或假商品。

## 验证命令

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/
```

如仅修改 Android UI，后端 test / build 可不作为必跑项；如果实现中意外触及后端 contract，必须补跑后端验证。

## 验收标准

- 主 Demo 路径的加载状态不再出现明显空白或突兀跳变。
- 商品图片加载中、成功和失败都有稳定同尺寸表现。
- 商品详情、购物车、checkout loading 风格统一。
- 所有 skeleton 不导致文字重叠、卡片跳动或小屏溢出。
- 不新增第三方 UI loading 库；Lottie 仅限状态反馈 spec 的微动效。
- Android test / build 通过，或记录真实失败原因。
