# Android Buddy Lottie Motion

## Research 判断

不需要做独立外部 research，但实现前需要确认 Lottie Compose 的当前官方接入方式和版本。当前可采用的基础形态是：

- Gradle 依赖：`com.airbnb.android:lottie-compose`。
- Android 资源：将动画 JSON 放在 `client/android/app/src/main/res/raw/`。
- Compose 渲染：使用 `rememberLottieComposition(LottieCompositionSpec.RawRes(...))`、`LottieAnimation` 和 `animateLottieCompositionAsState`。

本 spec 只引入 Buddy 品牌动效基础，不把所有 UI 动效都改成 Lottie。loading、语音条和图片解释这类状态微动效由 `android-state-lottie-feedback-spec.md` 处理。

## 背景

ShopMate 现在已经有多个 Buddy 静态资源：

- Home 主入口使用 `home_chat_buddy.png` 作为大面积品牌视觉。
- 聊天顶部栏使用 `sidebar_shopmate_buddy.png` 作为 38dp 中央头像。
- comparison / cart 等页面也有局部 Buddy 资产。

用户希望从 Lottie 先起手，避免后期所有页面都再返工，同时希望主聊天入口有类似“中间 Buddy 过渡到顶部头像”的品牌动效。这个方向适合做，但范围必须收窄：

- Lottie 负责 Buddy 的品牌生命力。
- 状态类 Lottie 只进入 loading / voice / image interpreting 等少数忙碌反馈，另由独立 spec 管理。
- Compose motion 负责列表、按钮、卡片、composer、页面状态等普通交互。
- 不为了动画改变 Chat SSE、RAG、cart、checkout、image search 或页面路由 contract。

## 目标

- 在 Android 端接入 Lottie Compose，并建立可复用的 Buddy 动效组件。
- 为 Home -> ChatRecommendation 首次进入增加 Buddy 过渡：从 Home 中部 Buddy 的视觉重心过渡到聊天顶部栏中央头像。
- 保留静态 PNG fallback，Lottie 加载失败、资源缺失或系统动画关闭时仍能正常展示 Buddy。
- 统一 Buddy idle / arrival / thinking 的命名和资源放置方式，为状态 Lottie 和后续商业 Demo polish 留出一致的依赖入口。
- 不把 prompt carousel、商品卡、skeleton、checkout 卡片等普通 UI 绑定到 Lottie。

## 不做

- 不接远程 Lottie URL，不在运行时下载动画。
- 不引入 LottieFiles 网络 SDK、账号、token 或在线素材接口。
- 不把 Lottie 用作商品图、加载骨架屏、按钮按压、卡片列表出现或页面转场的通用方案。
- 不做复杂共享元素导航重构，不引入 Navigation Compose。
- 不为了播放完整动画延迟消息发送、SSE 接收、页面跳转或业务结果展示。
- 不提交体积极大的动画 JSON。单个 Buddy 动画建议控制在 250KB 以内，总量建议控制在 800KB 以内。

## 动效资产

建议新增 raw 资源：

```text
client/android/app/src/main/res/raw/shopmate_buddy_idle.json
client/android/app/src/main/res/raw/shopmate_buddy_home_to_avatar.json
client/android/app/src/main/res/raw/shopmate_buddy_thinking.json
```

如果暂时只有一个动画资产，可以先只实现：

```text
shopmate_buddy_idle.json
```

并让 Home -> Chat 过渡使用 Compose 的位置 / 尺寸 / alpha 动画包裹这个 Lottie。

资产要求：

- 背景透明。
- 主色靠近现有 ShopMate green / mint 体系，不改品牌识别。
- 可在 58dp、88dp、180dp 等不同尺寸下保持清晰。
- 不包含真实商品、订单、金额或用户信息。
- 不出现与现有 Figma Buddy 风格明显冲突的角色设定。

## 组件设计

建议新增：

```text
client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateBuddyMotion.kt
```

包含：

```kotlin
enum class ShopMateBuddyMotionState {
    Idle,
    Arrival,
    Thinking
}
```

以及：

```kotlin
@Composable
fun ShopMateBuddyMotion(
    state: ShopMateBuddyMotionState,
    modifier: Modifier = Modifier,
    fallbackRes: Int = R.drawable.sidebar_shopmate_buddy,
    contentDescription: String? = null,
    iterations: Int = 1
)
```

实现要求：

- 默认 decorative 场景 `contentDescription = null`，顶部栏如果保留品牌语义可继续使用现有描述。
- composition 未加载完成时先显示 fallback PNG，避免空白。
- `Thinking` 可以 loop，但只在真实等待态或 AI 正在生成时播放；离开等待态后停止。
- `Idle` 不应长时间高频消耗 CPU，可用低帧率 / 短 loop 或静态 fallback。
- Preview 环境可以优先 fallback，避免 Android Studio Preview 因 raw 动画失败而不可用。

## Home -> Chat Buddy 过渡

当前 `HomeChatEntryScreen` 的大 Buddy 和 `ShopMateTopActionBar` 的中央头像不在同一个页面稳定层里，不建议先重写导航。V1 采用“视觉桥接”方案：

1. Home 仍显示中部 Buddy。
2. 用户点击 prompt、发送文字、语音 transcript 完成或图片请求进入 Chat 时，父层记录一次 `HomeToChatBuddy` 过渡意图。
3. `MainActivity` 或共享顶层容器短暂显示 `ShopMateBuddyTransitionOverlay`。
4. Overlay 在 480-700ms 内把 Buddy 从 Home 中部设计位置移动、缩放、淡出到顶部栏中央头像位置。
5. Chat 页面顶部栏 Buddy 在同一时间播放 arrival / idle 动效，形成连续感。

实现原则：

- 过渡只影响视觉层，不阻塞 route 切换和 ChatViewModel 状态更新。
- 位置使用当前 Figma frame scale 计算，兼容 389x843 和 360x740 预览。
- 过渡层 `zIndex` 高于页面内容，低于系统弹窗 / 权限弹窗。
- 如果用户快速连续发送或返回，取消旧 overlay，不堆叠动画。
- 如果系统动画关闭或性能较差，直接切换到顶部头像 fallback。

## Buddy Thinking 使用点

V1 只允许这些使用点：

- Home 主入口 Buddy idle。
- Chat 顶部栏 Buddy idle / arrival。
- Chat 等待真实 SSE delta 前，顶部 Buddy 可短暂 thinking。
- 图片解释 / ASR 转写期间，可在顶部 Buddy 或 composer 内使用小尺寸 thinking，但不能替代已有明确状态文案。

Buddy spec 不允许这些使用点：

- 商品卡加载 skeleton。
- 加购成功 / 失败。
- checkout 成功。
- prompt carousel 卡片。
- 全局 Toast / transient banner。

说明：聊天等待、语音条和图片解释中的小型状态动效不放在本 spec，由 `android-state-lottie-feedback-spec.md` 控制。

## 文件范围

预计修改：

- `client/android/app/build.gradle.kts`
- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateTopActionBar.kt`

预计新增：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateBuddyMotion.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateBuddyTransitionOverlay.kt`
- `client/android/app/src/main/res/raw/shopmate_buddy_idle.json`
- `client/android/app/src/main/res/raw/shopmate_buddy_home_to_avatar.json`
- `client/android/app/src/main/res/raw/shopmate_buddy_thinking.json`

如果动画资产暂时未定，可以先新增组件和 fallback 接口，不提交占位大 JSON。

## 测试计划

Android 单元测试：

- 如果新增 transition trigger helper，覆盖一次性消费、快速重复触发和取消逻辑。
- 如果只改纯 Compose UI，无可测业务逻辑时，可以不强行写 UI 单测。

手动验证：

- Home 首屏 Buddy 正常显示，Lottie 未加载时不空白。
- 点击 prompt 后进入 Chat，Buddy 过渡不遮挡 composer 和消息气泡。
- 文字发送、语音 transcript、图片请求进入 Chat 时过渡行为一致。
- Chat 顶部栏 Buddy arrival 后回到 idle，不持续高耗播放。
- 小屏 360x740 下过渡位置不偏离顶部头像。
- 旋转 / 返回 / 快速新聊天不会留下悬浮 Buddy。

## 验证命令

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/
```

## 验收标准

- Lottie Compose 依赖在本 spec 中先服务 Buddy 动效，并可被 `android-state-lottie-feedback-spec.md` 复用；依赖用途清楚。
- Home -> Chat 有可见、克制、不卡业务的 Buddy 过渡。
- Lottie 加载失败或资源缺失时有静态 Buddy fallback。
- 动效不改变 Chat SSE、路由、商品卡锚点、语音 / 图片状态或 checkout 状态。
- Android test / build 通过，或记录真实失败原因。
