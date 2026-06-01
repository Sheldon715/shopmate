# Voice Input

## 背景

ShopMate 当前 `ChatComposer` 已有麦克风按钮，但调用方还没有接入真实语音输入。该功能要让用户通过语音输入购物需求，语音转文字后继续走现有聊天、RAG、主动澄清和购物车 intent 流程。

本 spec 基于 `docs/voice-input-research-results.md` 和 `context/research/voice-input-research.md`。research 默认建议“转写后先填入输入框，由用户点击发送”来降低误识别风险；本 spec 按当前产品决策改为“说完后直接进入聊天流”：语音结束后展示用户侧识别中气泡，最终 transcript 出来后替换成用户说的话，并自动进入现有 chat / RAG 流程。

## 目标

- 在 Android 端接入语音输入，把用户语音转成文本。
- 语音结束后，在聊天列表中展示用户侧“正在识别”loading 气泡。
- 最终 transcript 出来后，用识别文本替换 loading 气泡，并自动发送到现有聊天链路。
- 转写文本必须进入现有 `ChatViewModel` 控制流，复用当前 conversation、history、`ChatRepository.streamChat()` 和 Chat SSE 流程；不要求先写入 `composerText`。
- 语音文本仍由后端执行同一套 LLM intent、主动澄清、RAG 检索、商品 allowlist 和购物车工具调用。
- 支持录音权限申请、拒绝提示、录音中、取消、转写中、失败和重试状态。
- 后端离线或聊天接口失败时，沿用现有聊天失败 / 重试体验，不把语音失败和聊天失败混成一个状态。
- 输入框 UI 会在 voice input 实现前单独澄清；本 spec 只锁定语音直发、识别中气泡、状态完整、布局不重叠和按钮语义清楚。

## 非目标

- 不做后端语音转写服务。
- 不上传或存储用户音频。
- 不做 TTS / 语音播报。
- 不做唤醒词。
- 不做多语言自动识别。
- 不改后端 RAG、主动澄清、购物车 intent 和缓存逻辑。
- 不在 Android 端用关键词直接触发推荐、加购或澄清。
- 不要求第一版支持离线识别；只做能力探测和稳定失败提示。

## 推荐方案

第一版使用 Android `SpeechRecognizer` 封装应用内语音识别：

- 新增小型 `VoiceInputController` 或同等封装，负责 `SpeechRecognizer` 创建、开始、停止、取消、销毁和错误映射。
- `MainActivity` 或 Compose 入口负责运行时权限请求。
- `ChatViewModel` 只接收语音状态和最终转写文本，不直接持有 Android framework 对象。
- 进入 `Transcribing` 时，在聊天列表插入一个用户侧 pending 气泡，例如“正在识别...”。
- 收到最终 transcript 后，替换 pending 气泡文本，并立即通过 `ChatViewModel` 进入与手动发送相同的内部 stream 流程。
- 不发送 `onPartialResults` 的中间文本；partial result 只能用于未来 UI 展示，不能触发后端请求。
- 如果当前 `sendMessage()` 只从 `composerText` 读取文本，应新增 `sendVoiceTranscript(text)` 或等价入口，并让它复用同一个 `startStream` / repository 路径，避免为了直发把 transcript 写入输入框再模拟点击。

## Android 改动范围

- `client/android/app/src/main/AndroidManifest.xml`
  - 增加 `android.permission.RECORD_AUDIO`。

- `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt`
  - 扩展语音状态入参。
  - 麦克风按钮根据状态切换 idle / listening / transcribing / error 表现。
  - 保留文字输入、图片按钮和发送按钮的稳定尺寸。
  - 输入框 UI 细节后续确认；业务逻辑不能依赖具体视觉布局。
  - 语音直发不应把 transcript 默认塞进输入框，但不影响用户继续手动输入。

- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatUiState.kt`
  - 增加结构化 voice input 状态，例如 `VoiceInputUiState`。
  - 如果现有 `ChatMessageUi` 不能表达用户侧 pending 气泡，需要增加轻量 message status，例如 `isVoiceTranscribing` 或通用 `deliveryState`。

- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`
  - 增加语音识别开始 / 转写中 / 成功 / 失败 / 取消的状态入口。
  - 增加语音 pending 用户气泡的插入、替换和清理逻辑。
  - 增加 `sendVoiceTranscript(text)` 或等价入口，最终仍调用现有 chat stream 路径。
  - 手动发送仍走现有 `sendMessage()`。
  - 新聊天、切换历史、页面销毁时清理录音 / 转写状态。

- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
  - 把语音权限请求和 `onVoiceClick` 接到首页 / 聊天推荐页的 `ChatComposer`。
  - `ProductComparisonScreen` 仍可保持 no-op，除非该 feature 明确把 mock 对比页也接入真实聊天。

## 状态要求

必须覆盖这些状态：

- `Idle`：默认状态。
- `PermissionDenied`：录音权限被拒绝，提示用户需要开启权限才能语音输入。
- `Listening`：正在收音，可取消。
- `Transcribing`：等待最终识别结果，聊天列表显示用户侧 pending loading 气泡。
- `TranscriptReady`：转写成功，pending 气泡替换为最终文本，并立即进入 chat stream。
- `Error`：识别服务不可用、没有听到语音、网络 / 服务错误或未知失败，可重试。

状态之间要可恢复：

- listening -> cancel -> idle。
- listening / transcribing -> cancel -> 移除 pending 气泡 -> idle。
- listening / transcribing -> error -> 移除或标记 pending 气泡 -> retry 或 idle。
- transcriptReady -> 替换用户气泡文本 -> 自动开始 assistant streaming。
- startNewChat / openHistoryConversation -> 停止当前语音状态。

不得在最终 transcript 出来前请求后端。空 transcript、`NO_SPEECH`、timeout 或 recognition unavailable 都不能进入 chat stream。

## 业务边界

语音输入产出的文本必须等价于用户手打输入：

1. Android 只产出文本。
2. 文本进入 `ChatViewModel` 的 voice transcript 入口。
3. `ChatViewModel` 用同一套 conversationId、history 和 stream 编排调用 `ChatRepository.streamChat()`。
4. 后端继续执行 cart intent、clarification intent、RAG、商品校验和 SSE。

不得在 Android 端新增类似“包含加购就调用购物车接口”“包含预算就改 filters”的规则。

语音直发带来误识别风险，第一版用这些边界处理：

- 只发送最终 transcript，不发送 partial result。
- 用户侧气泡必须展示最终识别文本，让用户知道实际进入后端的内容。
- 识别失败不发送。
- 用户如果发现误识别，通过下一轮自然语言纠正；Android 端不自行改写语义。

## UI 澄清点

实现前需要在 voice input chat 中确认输入框 UI：

- 录音时麦克风按钮如何变成停止 / 取消态。
- 是否需要录音计时、音量波形或动态图标。
- 用户侧识别中气泡的文案、动效和位置。
- 识别失败时是移除 pending 气泡，还是把气泡改成失败态。
- 取消、重试、发送按钮在小屏上的排列。

本 spec 默认采用“说完后直接发送”的交互，不再把 transcript 先填入输入框。输入框仍保留手动文字输入能力。

## 测试要求

- `ChatViewModel` 或 voice controller 单元测试：
  - 权限拒绝不会发送消息。
  - 取消录音会回到 idle，并移除或清理识别中用户气泡。
  - 进入 transcribing 会显示用户侧 pending 气泡。
  - 转写成功会用 transcript 替换 pending 气泡。
  - 转写成功后会调用与手动聊天相同的 repository stream 路径。
  - 转写失败不会清空原有输入，也不会请求后端。
  - partial result 不会请求后端。
  - 语音文本发送后仍使用同一个 conversationId / chat repository 流程。

- UI / 状态测试：
  - `ChatComposer` 在 idle、listening、transcribing、error 下不发生按钮重叠。
  - 手动输入的发送按钮启用逻辑仍以 composer text 和 isSending 为准。
  - 用户侧识别中气泡和 assistant streaming 气泡不会重复、错位或覆盖。

- 验证命令：
  - `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest`
  - `cd client/android && .\gradlew.bat --no-daemon build`

- 手动 smoke：
  - 真机允许权限后中文语音可显示识别中用户气泡。
  - 最终识别文本会替换用户气泡，并自动进入后端 chat 流程。
  - 真机拒绝权限后 UI 可恢复。
  - 取消录音后不发送消息。
  - 后端离线时，语音转写仍可完成并显示用户气泡，随后显示现有聊天失败 / 重试状态。

## 完成标准

- 用户可以从首页和聊天推荐页点击麦克风完成语音转文字。
- 语音结束后会出现用户侧识别中 loading 气泡。
- 最终 transcript 会直接显示为用户消息，并进入正常 chat stream。
- 转写文本能继续走正常 RAG / chat 流程。
- Android 端没有新增导购关键词规则。
- 权限、取消、重试、失败状态都有稳定 UI。
- 输入框 UI 改动与后续澄清一致，并在小屏不重叠。
