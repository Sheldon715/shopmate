# Android Home Prompt Carousel

## Research 判断

不需要外部 research。该 spec 是现有 Home prompt suggestion 的交互升级，使用 Jetpack Compose Foundation 的 `LazyColumn` / scroll state / fade scrim 即可完成。

不使用 Lottie。Lottie 已由 `android-buddy-lottie-motion-spec.md` 和 `android-state-lottie-feedback-spec.md` 限定在 Buddy / 状态反馈动效里。

## 背景

当前 `HomeChatEntryScreen` 的 prompt panel 固定展示 4 条文案：

- 推荐适合油皮的护肤品
- 200 元以内的蓝牙耳机
- 帮我对比这两款商品
- 拍照找同款

这能支撑最小 Demo，但入口看起来有点静态，也没有充分展示 ShopMate 已经具备的能力：文字推荐、反选、对比、图片找货、购物车和 checkout。用户参考图里的“可滑动建议列表”方向是对的，但 ShopMate 不应照搬对方的 OK 气泡或强社交聊天视觉，而应保留现有 Figma / ShopMate 的白底、绿色强调、商品导购感和轻量卡片风格。

## 目标

- 把 Home 下方固定 4 条 prompt suggestion 扩充到 7-8 条，并改成可滑动的 prompt carousel。
- 增加更多贴合当前 ShopMate 能力的中文建议文案，但数量先控制在 7-8 条，避免入口像长列表。
- 保持 panel 尺寸稳定，不因为列表滚动、图片附件或键盘避让导致 composer 被遮挡。
- 点击 prompt 后沿用现有行为：填入 composer 文本，不自动发送，用户仍可编辑后再发送。
- 用轻量动画和 fade scrim 提示可滚动，不照搬参考图的 OK 气泡。

## 不做

- 不新增后端 API，不新增 prompt 个性化接口。
- 不让 prompt 点击直接触发购物车、checkout 或任何业务状态变更。
- 不复制参考图的 OK 气泡、对话头像或整套布局。
- 不新增 Lottie、Pager 第三方库或复杂手势库。
- 不把 prompt 文案写成夸张营销话术，不暗示 App 能完成尚未实现的真实支付 / 物流能力。

## Prompt 内容

建议扩展 `MockShopMateData.promptSuggestions` 到 7-8 条。V1 文案优先覆盖：

- 推荐适合油皮的清爽防晒
- 200 元以内通勤蓝牙耳机
- 找一款不入耳、久戴舒服的耳机
- 推荐宿舍好用的小家电
- 拍照找同款或相似商品
- 帮我对比刚刚推荐的两款
- 把购物车里想买的商品生成订单
- 推荐不含酒精的防晒霜

备选文案，如果实现时需要替换其中一条：

- 给妈妈挑一份实用礼物
- 帮我找一款适合学生党的补水精华

文案原则：

- 尽量对应现有真实链路：RAG 推荐、negative constraint、comparison、image search、cart、checkout。
- 避免“全网最低价”“马上付款”“保证正品”等无法由当前系统证明的承诺。
- 每条点击后生成一条可直接发给 Chat 的自然语言需求。

## UI 设计

保留现有 Home 结构：

- 顶部 Header。
- 品牌 copy。
- 中部 Buddy。
- 下方 prompt panel。
- 底部 `ChatComposer`。

Prompt panel 内部调整为：

- 标题和说明保持克制，可以保留“今天想买点什么？”。
- 标题下方是固定高度可滑动列表。
- 列表 item 使用 ShopMate 风格的白底 / 浅绿选中 / 图标 / 一行主文案。
- 可选增加极短辅助标签，例如“推荐”“对比”“图片”“订单”，但不要让 item 变成拥挤的营销卡。
- 顶部 / 底部可以使用淡入淡出 scrim 暗示列表可滑动。
- 当前首屏可见 3-4 条，总量 7-8 条，用户上下滑动查看更多。

不建议：

- 每条右侧放大号 `OK`。
- 使用过大的圆角聊天气泡遮住 panel。
- 用过多 emoji 作为主要视觉。
- 为每条 prompt 播放 Lottie。

## 数据模型

当前模型：

```kotlin
data class PromptSuggestionUi(
    val id: String,
    val title: String
)
```

V1 可以保持不变。如果实现时需要更丰富的信息，可以扩展为：

```kotlin
data class PromptSuggestionUi(
    val id: String,
    val title: String,
    val categoryLabel: String = "",
    val iconType: PromptSuggestionIconType = PromptSuggestionIconType.Bag
)
```

扩展要求：

- 默认值保证已有调用不崩。
- UI 仍以 `title` 作为填入 composer 的文本。
- icon 选择使用现有资源：`ic_prompt_bag`、`ic_prompt_cart`、`ic_prompt_search`、`ic_prompt_camera`，不新增自绘 icon。

## 交互

- 点击 prompt item 后，填入 composer，并给 item 一个 120-180ms 的 press / selected 反馈。
- 不自动发送，避免用户误触后直接触发 RAG 或 checkout。
- 如果 composer 当前已有文本，点击 prompt 直接替换文本；不做复杂合并。
- 如果正在发送、语音监听、图片上传或图片解释中，prompt 点击应 disabled 或只更新文本但不触发业务动作，具体按现有 composer busy 规则处理。
- 滚动列表不应和底部 composer 手势冲突。

## 文件范围

预计修改：

- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/PromptSuggestionUi.kt`（仅在需要 label / iconType 时）

可新增：

- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomePromptCarousel.kt`（如果从 Home 文件拆出更清晰）

不修改：

- 后端。
- Chat SSE contract。
- Cart / Checkout API。
- Lottie / Buddy 动效组件。

## 测试计划

Android 单元测试：

- 如果扩展 `PromptSuggestionUi` mapper 或 icon type helper，补充最小单测。
- 如果只是 Compose UI 和 mock data 调整，以 build + Preview / 手测为主。

手动验证：

- 389x843 和 360x740 预览下 prompt panel 不遮挡 composer。
- 列表能上下滑动，顶部 / 底部 scrim 不遮住文字。
- 点击每条 prompt 都能填入 composer。
- 发送后进入 ChatRecommendation，prompt 不污染聊天历史。
- 图片附件状态下 Home composer 高度增加时，prompt panel 不与 composer 重叠。
- 长中文文案不溢出卡片，小屏下仍可读。

## 验证命令

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/
```

## 验收标准

- Home prompt 从固定 4 条升级为 7-8 条可滑动列表。
- 新文案覆盖 ShopMate 当前主要 Demo 能力，但不夸大未实现能力。
- UI 保持 ShopMate 现有风格，不照搬参考图。
- prompt 点击只填入 composer，不直接改变业务状态。
- 小屏、键盘和图片附件场景没有重叠或跳动。
- Android test / build 通过，或记录真实失败原因。
