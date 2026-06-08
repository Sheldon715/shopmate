# Android Motion Transition Polish

## Research 判断

不需要外部 research。V1 只使用现有 Compose 能力做轻量 motion，不引入新的导航框架或动效库。

实现前需要扫描：

- `MainActivity.kt` 的页面切换状态。
- `SidebarHistoryDrawer.kt` 的打开 / 关闭、遮罩和历史项交互。
- `ChatRecommendationScreen.kt` 的消息列表和商品卡列表。
- `HomeChatEntryScreen.kt` 和 `ChatRecommendationScreen.kt` 中侧边栏入口的状态接入。
- `ProductDetailScreen.kt` 的进入 / 返回 / 收藏状态。
- `CartScreen.kt` 和 `CheckoutScreen.kt` 的局部状态切换。
- 已有 `ChatViewModel` streaming / side effect 处理。

## 背景

当前 ShopMate 的业务链路已经比较完整，但页面和状态之间多数是直接切换。商业产品体验不需要每个地方都动，但主路径上的切换应当有“被接住”的感觉：

- 发送消息后，用户看到稳定等待态。
- 打开侧边栏时，遮罩和抽屉自然进入，关闭时不突然消失。
- 商品卡出现时不是突然插入。
- 点击商品进入详情页时有轻量过渡。
- checkout draft 更新、提交、取消等状态不硬切。
- 按钮点击有即时反馈。

## 目标

- 为主 Demo 路径增加轻量、克制、可维护的动效。
- 用统一 motion token 管理时长、easing 和按压 scale。
- 重点覆盖 onboarding、home、sidebar、chat、composer、comparison、product detail、cart、checkout，不追求历史 mock 页面全覆盖。
- 侧边栏是主聊天入口的一部分，打开 / 关闭必须纳入 V1，而不是留到 V2。
- 动效不能拖慢真实状态展示，也不能掩盖网络慢、接口失败或业务失败。
- 不改变导航架构，不引入 Navigation Compose。

## 不做

- 不做复杂共享元素转场。
- 不新增 Lottie。
- 不新增 Accompanist 或第三方 transition 库。
- 不重写 MainActivity 的 screen state 架构。
- 不为了动画人为延迟 API / SSE / checkout 结果。
- 不把动画作为业务成功依据。

## Motion Token

建议新增：

```text
client/android/app/src/main/java/com/shopmate/app/ui/theme/Motion.kt
```

包含：

```kotlin
object ShopMateMotion {
    const val FastMillis = 120
    const val MediumMillis = 220
    const val SlowMillis = 320
    const val PressedScale = 0.97f
}
```

如果现有 theme 更适合放在 component 内，也可以先放到 `ui/components/ShopMateMotion.kt`，后续再归并。

设计原则：

- 列表 item 出现：120-220ms。
- 页面内容淡入 / slide：180-260ms。
- 按压反馈：即时，释放后快速恢复。
- checkout 状态切换：220-320ms。
- 不使用过大的弹性或夸张 bounce。

## 主路径动效

### Chat

- 用户消息发送后保持现有立即入列行为。
- assistant loading / streaming 气泡出现使用轻量 fade / slide。
- `product_cards` 到达后，商品卡列表逐张淡入或整体 fade-in。
- comparison result / checkout draft card 出现时轻量 expand / fade。
- 列表自动滚动继续保持稳定，不因动画导致滚动到错误位置。

### Onboarding / Home

- Onboarding 到 Home 的切换避免整屏硬切；可以使用轻量 fade。
- Home prompt suggestion 按压 / 选中后有反馈，填入 composer 不造成 prompt panel 跳动。
- Home 的菜单、购物车、composer、图片预览高度变化保持在底部安全区内。
- 开始语音后从 Home 切到 Chat 时，pending voice bubble 是第一时间可见的状态。

### Composer

- text / voice mode 切换有轻量过渡，不出现左右控件跳闪。
- 图片 preview 出现 / 删除时 composer 高度平滑变化，底部位置不遮挡输入。
- voice listening waveform 可以保留现有静态形态或做轻量 pulse，但不能影响录音事件。
- send button、image pick、mode toggle、voice surface 都复用 press feedback。

### Sidebar

- `SidebarHistoryDrawer` 打开时，遮罩 alpha 从 0 过渡到目标值，抽屉从左侧轻量 slide-in。
- 关闭时，遮罩和抽屉同步退出，不要因 `isOpen=false` 立即 return 导致硬切。
- 点击遮罩关闭、点击历史会话、点击新聊天、点击购物车都应走同一关闭动效。
- 长按历史项弹出的重命名 / 删除浮层保持当前交互，不因抽屉动效导致定位漂移。
- 小屏下抽屉宽度仍按当前规则计算，动效不改变最终布局宽度。
- 打开 / 关闭期间不应误触底层聊天输入框或商品卡。

### Product Detail

- 详情页内容加载完成后，hero 图、标题区、推荐理由和规格区域可以分层淡入。
- 返回按钮、收藏按钮、加购底栏不应因为内容淡入而跳位。
- 收藏按钮动画细节由 `android-product-card-rich-interaction-spec.md` 处理，本 spec 只保证进入 / 状态切换的整体流畅。

### Product Comparison

- 从聊天对比入口进入 `ProductComparisonScreen` 时页面整体轻量进入。
- 对比商品、核心参数、推荐亮点和结论可以按块淡入，但不改变最终滚动位置。
- 对比页加购按钮和商品图片点击要有 press feedback。
- comparison 不存在时回到聊天页，不闪出空白中间态。

### Cart

- 购物车 item 数量变化时使用轻量尺寸 / alpha 过渡。
- 删除商品后，item 消失不应导致底部合计栏跳动或误触。
- 刷新购物车时保留旧数据，局部按钮 disabled / loading，不整页硬切成空白。

### Checkout

- Draft 加载完成后，地址、商品清单、配送、支付和金额明细按块淡入。
- 切换配送 / 支付选项时，选中态有轻量过渡。
- 地址编辑页、地址簿页和 summary 页之间切换时不要硬闪；保持顶部返回、底部保存 / 提交栏稳定。
- 地址 tag、保存地址、选择地址、编辑地址按钮都需要统一 press feedback。
- 提交订单中按钮进入 loading 状态，页面主体保持稳定。
- 订单成功 / 取消 / 过期状态更新时不闪烁。

## 按压反馈

为共享可点击组件补统一按压反馈：

- 商品卡。
- 商品卡加购按钮。
- 对比页商品摘要卡和加购按钮。
- 详情页收藏按钮。
- 主要底部按钮。
- checkout 选择项。
- 顶部栏菜单 / 返回 / 购物车按钮。
- composer 模式切换、图片选择、发送、语音 surface。

实现建议：

- 使用 Compose interaction source 或局部 pressed state。
- scale 控制在 `0.97f-0.99f`，避免明显变形。
- disabled 状态不触发 pressed animation。
- 不让 scale 改变父布局尺寸；通过 graphicsLayer / draw 层处理。

## 文件范围

预计修改：

- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/sidebar/SidebarHistoryDrawer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/onboarding/OnboardingScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/comparison/ProductComparisonScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ProductCard.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateButton.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateIconButton.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateTopActionBar.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/cart/CartScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/checkout/CheckoutScreen.kt`

预计新增：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMatePressable.kt`
- 或 `client/android/app/src/main/java/com/shopmate/app/ui/theme/Motion.kt`

## 依赖边界

默认不新增依赖。

如果实现中需要 `AnimatedVisibility`、`animateFloatAsState`、`updateTransition` 等官方 Compose animation API，而当前 Gradle 未显式暴露对应 artifact，可以只补官方 Compose animation artifact，并在实现记录中说明：

```text
androidx.compose.animation:animation
```

不允许为 V1 引入：

- Lottie。
- 第三方 transition 框架。
- Navigation Compose。

## 测试计划

Android 单元测试：

- ViewModel 行为不应因为 UI motion 改变。
- 如果新增 pressable helper 为纯状态逻辑，可补最小单测；否则以 build 和手测为主。

手动验证：

- 普通推荐：消息、loading、商品卡出现流畅。
- Onboarding -> Home、Home prompt -> Chat。
- text / voice / image composer 切换和底部高度变化。
- 主入口和聊天页打开 / 关闭侧边栏，遮罩和抽屉无硬切、无误触底层内容。
- 侧边栏打开后点击历史会话、新聊天和购物车，关闭动效与导航行为不冲突。
- 对比入口 -> 对比详情 -> 商品详情 / 加购 -> 返回聊天。
- 商品卡 -> 商品详情 -> 返回。
- 商品详情收藏、加购。
- 购物车数量修改 / 删除。
- Checkout 配送 / 支付选择、提交中、成功 / 失败。
- 小屏下动画过程中无文字重叠、无按钮位置跳动。

## 验证命令

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/
```

## 验收标准

- 主 Demo 路径的页面和状态切换更平滑，没有明显硬切和闪烁。
- 侧边栏打开 / 关闭有明确过渡，遮罩、抽屉和历史项操作不出现硬切、闪烁或误触。
- 按钮和商品卡点击有即时反馈。
- 动效不改变业务状态、不延迟后端结果、不破坏自动滚动。
- 小屏和长文案下无重叠或布局跳动。
- 不引入第三方动效 / 导航库。
- Android test / build 通过，或记录真实失败原因。
