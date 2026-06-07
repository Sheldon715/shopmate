# Android State Lottie Feedback

## Research 判断

不需要独立外部 research。该 spec 复用 `android-buddy-lottie-motion-spec.md` 引入的 Lottie Compose 依赖和本地 raw resource 方案。

实现前只需要确认两点：

- Lottie Compose 依赖已经接入，或由本 spec 和 Buddy spec 共同接入一次。
- 当前动画 JSON 都放在 `client/android/app/src/main/res/raw/`，不走远程下载。

## 背景

ShopMate 现在的 loading、聊天等待和语音条反馈还偏静态：

- 聊天等待主要依赖 typing 气泡 / 文案。
- 语音 listening / transcribing 状态缺少更自然的波形反馈。
- 图片上传、解释、搜索中的状态更像普通文字提示。
- 商品详情、购物车和 checkout 的 skeleton 适合稳定占位，但不适合表达 AI 正在处理。

这些状态适合用短循环 Lottie：它们需要“正在发生”的感觉，但又不能改变业务状态或替代明确文案。

## 目标

- 为 AI thinking、语音条、图片解释 / 搜索等高频状态增加克制的 Lottie 微动效。
- 复用同一个本地 Lottie 渲染封装，避免每个页面直接写 Lottie API。
- 保留 Compose / 静态 fallback，Lottie 加载失败时不出现空白或不可点击状态。
- 每个状态动效都必须有文本、颜色或语义状态配合，不只靠动画表达。
- 不把 Lottie 用作商品图 skeleton、页面转场、按钮按压或业务成功提示。

## 不做

- 不新增远程 Lottie 加载，不接 LottieFiles SDK。
- 不用 Lottie 替代商品详情、购物车、checkout 的 skeleton block。
- 不用 Lottie 播放加购成功、checkout 成功、收藏成功等业务结果。
- 不为了完整播放动画延迟 SSE、ASR、图片解释、购物车或 checkout 结果。
- 不让动画成为唯一状态提示；无障碍和用户可见文案仍必须保留。

## 动效资产

建议新增 raw 资源：

```text
client/android/app/src/main/res/raw/shopmate_ai_thinking.json
client/android/app/src/main/res/raw/shopmate_voice_wave_listening.json
client/android/app/src/main/res/raw/shopmate_voice_wave_transcribing.json
client/android/app/src/main/res/raw/shopmate_image_interpreting.json
```

资产要求：

- 背景透明。
- 颜色使用 ShopMate green / mint / soft gray，不做高饱和霓虹色。
- 单个状态动画建议小于 180KB，总状态动效资源建议控制在 600KB 以内。
- 循环要平稳，避免明显跳帧或突然重播。
- 语音条建议为横向波形或柔和 pulse，不做夸张声浪。
- AI thinking 建议为小尺寸点阵、轻旋转或 Buddy 周围轻动效，不抢正文阅读焦点。

## 组件设计

建议新增或扩展共享组件：

```text
client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateLottieStateIndicator.kt
```

包含：

```kotlin
enum class ShopMateLottieState {
    AiThinking,
    VoiceListening,
    VoiceTranscribing,
    ImageInterpreting
}
```

以及：

```kotlin
@Composable
fun ShopMateLottieStateIndicator(
    state: ShopMateLottieState,
    modifier: Modifier = Modifier,
    contentDescription: String? = null
)
```

实现要求：

- composition 未加载完成或失败时显示 Compose fallback，例如 dots、pulse line 或静态 icon。
- 默认循环播放，但只有在对应 busy 状态存在时才进入 composition。
- 离开 busy 状态后停止播放并释放组合引用。
- Preview 可以使用 fallback，避免 raw 动画影响预览稳定性。
- `contentDescription` 由调用方按语义传入，例如“正在聆听”“正在转写”“正在识别图片”。

## 使用点

### Chat Waiting

- 在 assistant 真实 `message_delta` 到达前，typing 气泡可使用 `AiThinking` 小动效。
- 第一段真实文本到达后，停止 thinking 动效，由现有 streaming / typewriter 文本负责展示。
- 不恢复后端固定安全预响应，不展示假商品卡。

### Voice Bar

- `Listening` 状态：按住说话胶囊内显示 `VoiceListening` 横向波形，同时保留“松开发送 / 上滑取消”一类明确提示。
- `Transcribing` 状态：显示 `VoiceTranscribing`，文案明确为“正在转成文字”或现有等价表达。
- `PermissionDenied / Error` 状态：不播放 Lottie，改用稳定错误文案和重试路径。
- 语音波形不根据真实音量实时驱动；V1 只做循环视觉反馈。

### Image Search

- `Uploading` 可以继续使用轻量 progress / static 状态，不强制 Lottie。
- `Interpreting / Searching` 可使用 `ImageInterpreting` 小动效，但必须同时显示状态文案。
- 失败后停止 Lottie，保留重试和删除入口，不清空用户输入。

### Product / Cart / Checkout Loading

- 商品图、详情、购物车 item、checkout draft 仍使用 `android-loading-skeleton-polish-spec.md` 的 skeleton。
- 只有页面顶层短状态、AI 处理或语音 / 图片处理可以使用 Lottie。

## 文件范围

预计修改：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatMessageBubble.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`

预计新增：

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ShopMateLottieStateIndicator.kt`
- `client/android/app/src/main/res/raw/shopmate_ai_thinking.json`
- `client/android/app/src/main/res/raw/shopmate_voice_wave_listening.json`
- `client/android/app/src/main/res/raw/shopmate_voice_wave_transcribing.json`
- `client/android/app/src/main/res/raw/shopmate_image_interpreting.json`

不修改：

- 后端。
- Chat SSE schema。
- ASR provider。
- Image search provider。
- Cart / Checkout API。

## 测试计划

Android 单元测试：

- 如果新增 state-to-resource helper，覆盖每个 state 的 resource / fallback 映射。
- 语音和图片 busy 状态已有 ViewModel 测试时，补充不回退即可，不把 Lottie 当业务状态断言。

手动验证：

- 普通聊天等待时 AI thinking 出现，真实文本到达后停止。
- 语音按住时波形出现，松开进入 transcribing 后切换动效。
- 语音权限拒绝 / 识别失败不播放 loading 动效。
- 图片解释 / 搜索中动效和文案同时存在，失败后停止并保留重试。
- 低端设备或系统关闭动画时 fallback 可用。
- 小屏下语音条动效不挤压文字、不遮挡发送按钮。

## 验证命令

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build -PSHOPMATE_DEMO_API_BASE_URL=https://shopmate-api.example.com/
```

## 验收标准

- loading / 语音条 / 图片解释状态比现状更有动态反馈，但不喧宾夺主。
- Lottie 只用于状态微动效，不替代 skeleton、页面转场或业务成功提示。
- 每个 Lottie 状态都有文本或语义 fallback。
- 动效不改变业务状态、不延迟真实结果、不污染聊天历史。
- Android test / build 通过，或记录真实失败原因。
