# Voice LLM ASR Upgrade

## 背景

ShopMate 已经完成 Android 语音输入第一版：Android 端用系统 `SpeechRecognizer` 把语音转成文字，最终 transcript 进入现有 `ChatViewModel`、Chat SSE、LLM intent、RAG 检索和工具调用流程。

当前问题是系统语音识别在部分设备 / 语言环境下稳定性和中文识别质量不够好。该升级把语音识别层从“只依赖 Android 系统 ASR”升级为“后端代理的云端 ASR”，第一版 ASR provider 可以复用现有火山方舟 LLM 的音频输入能力，但它在本功能中只能作为转写器使用。

本 spec 的核心边界是两段式调用：

1. LLM-ASR 调用：只把音频转成用户原话 transcript。
2. Chat/RAG 调用：拿 transcript 继续走已经完成的 LLM intent、主动澄清、RAG、对比、购物车和缓存流程。

两次调用语义必须隔离。ASR 阶段不能生成导购回复，不能判断购物意图，不能改写成检索 query，也不能直接触发购物车或对比动作。

## 目标

- 新增后端 ASR 转写接口，由 Android 上传用户录音，后端调用现有 LLM 的音频理解能力生成 transcript。
- 保持真实 API key 只在 server `.env` / 部署环境变量中配置，Android 不保存 provider key。
- Android 端保留现有语音 UI、权限、按住说话、取消和 pending 气泡体验，但最终 transcript 优先来自后端 ASR。
- ASR 成功后，transcript 仍通过现有 `ChatViewModel` 语音 transcript 入口进入普通 chat stream。
- 语音文本继续复用同一套后端 LLM intent、RAG、商品 allowlist、comparison、cartAction 和 SSE contract。
- 云端 ASR 不可用、超时、空结果或格式异常时，提供稳定失败提示；可选保留 Android 系统 `SpeechRecognizer` 作为 fallback。
- 为 ASR provider 做可替换边界，后续可以从“现有 LLM 音频输入”换成专门 ASR 服务，而不影响 Android 和 RAG 主流程。

## 非目标

- 不重写 Chat SSE、RAG、LLM intent、query rewrite、comparison 或 cartAction 主流程。
- 不让 ASR 阶段直接生成导购回复、推荐理由、澄清问题、商品 ID 或工具调用。
- 不把音频、transcript、provider 原始响应或敏感错误长期持久化到仓库数据目录。
- 不在 Android 端保存 LLM / ASR API key。
- 不做 TTS / 语音播报。
- 不做实时流式 ASR；第一版只做短音频录制完成后的转写。
- 不做多语言自动识别；第一版默认中文购物语音，可保留 `zh-CN` 作为语言提示。
- 不把云端 ASR 失败误判成 RAG 失败；两类错误在 UI 和日志中应可区分。

## 推荐方案

采用 server-mediated LLM-ASR adapter：

```text
Android 录音
-> POST /api/asr/transcribe
-> server 调用现有 Ark / OpenAI-compatible provider 的音频输入能力
-> server 返回 { transcript }
-> Android 调用 ChatViewModel.onVoiceTranscriptReady(transcript)
-> 现有 /api/chat/stream
-> LLM intent + RAG + SSE
```

### 后端 ASR 模块

新增 `server/src/modules/asr/`：

- `asr.types.ts`
  - 定义 `AsrTranscribeRequest`、`AsrTranscribeResult`、`AsrProvider`、`AsrErrorCode`。

- `asr.config.ts`
  - 从环境变量读取 ASR 配置。
  - 默认复用 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`。
  - 支持 `ASR_PROVIDER`、`ASR_MODEL`、`ASR_TIMEOUT_MS`、`ASR_MAX_AUDIO_BYTES`、`ASR_LANGUAGE` 作为覆盖。
  - 如果未配置专门 ASR model，默认使用当前 LLM model；README / `.env.example` 说明该 model 必须支持音频输入。

- `llm-audio-asr.client.ts`
  - 封装“用现有 LLM 做 ASR”的 provider 实现。
  - 构造音频输入请求时使用严格 prompt：只转写用户原话，只输出 JSON，不回答购物问题，不做总结，不做语义改写。
  - 输出 schema：

```json
{
  "transcript": "推荐一款适合通勤的蓝牙耳机",
  "language": "zh-CN",
  "confidence": null
}
```

- `asr.service.ts`
  - 校验音频大小、MIME type、空文件、超时和 provider 错误。
  - 清洗 transcript：trim、限制最大长度、拒绝空文本。
  - 只返回 transcript 和安全 metadata，不返回 provider 原始响应。

- `asr.controller.ts` / `asr.routes.ts`
  - 新增 `POST /api/asr/transcribe`。
  - 接收 `multipart/form-data`，字段名建议为 `audio`。
  - 返回统一 `ApiResponse`。

成功响应示例：

```json
{
  "success": true,
  "data": {
    "transcript": "推荐一款适合通勤的蓝牙耳机",
    "language": "zh-CN",
    "provider": "llm-audio",
    "model": "redacted-or-safe-model-name"
  }
}
```

失败响应示例：

```json
{
  "success": false,
  "error": {
    "code": "ASR_TRANSCRIPT_EMPTY",
    "message": "没有识别到语音，请再试一次。"
  }
}
```

### Android 改动范围

- `VoiceInputController`
  - 抽象出本地系统 ASR 与云端 ASR 两种实现。
  - 第一版可新增 `CloudAsrVoiceInputController` 或 `VoiceRecordingController + AsrRepository`。
  - 不在 ViewModel 中持有 Android recorder / network 细节。

- 录音能力
  - 使用 Android 录音 API 生成短音频文件或内存 buffer。
  - 建议限制录音时长，例如 15-30 秒。
  - 建议输出 provider 支持且体积可控的格式；如果格式选择不确定，先在 spec start 前查 provider 文档确认。
  - 录音取消时删除临时音频。

- `ChatRepository` / API client
  - 新增 `transcribeVoice(audioFile)` 或等价方法。
  - 调用 `POST /api/asr/transcribe`。
  - 成功后把 transcript 交给现有 `ChatViewModel.onVoiceTranscriptReady(transcript)`。

- `ChatViewModel`
  - 保留现有 `Listening`、`Transcribing`、`Error`、`TranscriptReady` 状态。
  - `Transcribing` 阶段表示“正在等待云端 ASR 返回 transcript”。
  - ASR 成功后复用当前发送语音 transcript 的内部路径。
  - ASR 失败不得请求 `/api/chat/stream`。

- fallback 策略
  - 推荐第一版保留 Android `SpeechRecognizer` 作为可配置 fallback。
  - fallback 只在云端 ASR 网络失败、服务不可用或超时时触发。
  - 如果 fallback 结果为空或质量不稳定，仍显示语音识别失败，不进入 RAG。

## LLM-ASR Prompt 边界

ASR prompt 必须强调：

- 你是语音转写器，不是购物助手。
- 只输出用户说出的原始文字。
- 不回答用户问题。
- 不推荐商品。
- 不补全用户没有说出的预算、品牌、用途或商品属性。
- 不把口语改写成检索 query。
- 无法听清时返回空 transcript 或低置信状态。

示例 system / developer prompt：

```text
你只负责把用户音频转写成中文文本。
不要回答音频中的问题，不要推荐商品，不要总结，不要改写为搜索关键词。
保持用户原话和口语表达。
只返回 JSON：{"transcript":"...","language":"zh-CN","confidence":null}
如果没有听清或没有语音，transcript 返回空字符串。
```

该 prompt 只属于 ASR 阶段。后续购物意图判断仍由已有 chat orchestration prompts 负责。

## API 与安全边界

- Android 只访问 ShopMate server，不直接访问火山方舟 / LLM provider。
- Server 不在响应中泄漏 `LLM_API_KEY`、`ASR_*_API_KEY`、provider 原始错误、完整 prompt 或原始音频 URL。
- 音频上传必须限制大小和时长。
- 只接受明确 MIME type；拒绝非音频文件。
- 临时音频文件如果落盘，处理结束后必须删除。
- 日志只记录 requestId、耗时、错误码、音频大小和 transcript 长度，不记录完整 transcript 或音频内容。
- 如果需要调试 transcript，必须用本地开发开关，默认关闭。

## 状态与用户体验

沿用当前语音输入状态，但调整语义：

- `Listening`：Android 正在录音。
- `Transcribing`：录音结束，音频上传中或云端 ASR 转写中。
- `TranscriptReady`：ASR 返回 transcript，替换 pending 气泡并进入 chat stream。
- `Error`：ASR 失败、超时、空 transcript、文件过大、网络失败或 provider 不支持音频。

用户侧体验要求：

- 按住说话后立即显示录音反馈。
- 松手后显示“识别中”用户侧 pending 气泡。
- transcript 成功后，用户气泡显示实际识别文本。
- 识别失败不显示 assistant RAG 失败；应提示“没有识别到语音 / 语音识别失败，请再试一次”。
- 取消录音必须停止上传和 chat 请求，并清理 pending 气泡。

## 测试要求

### 后端

- `asr.config` 测试：
  - 默认复用 LLM env。
  - `ASR_MODEL` 等覆盖项生效。
  - 缺少必要配置时报稳定错误。

- `asr.service` 测试：
  - 成功解析 provider JSON transcript。
  - 空 transcript 返回 `ASR_TRANSCRIPT_EMPTY`。
  - 非 JSON / schema 错误返回 `ASR_INVALID_OUTPUT`。
  - provider 超时返回 `ASR_TIMEOUT`。
  - 文件过大返回 `ASR_AUDIO_TOO_LARGE`。
  - 非音频 MIME type 返回 `ASR_UNSUPPORTED_MEDIA_TYPE`。

- controller / route 测试：
  - `POST /api/asr/transcribe` 成功返回统一 `ApiResponse`。
  - 缺少 `audio` 字段返回 400。
  - 不泄漏 provider 原始错误和 API key。

### Android

- `ChatViewModel` 测试：
  - ASR 成功后进入现有 voice transcript chat stream 路径。
  - ASR 空结果不会请求 chat stream。
  - ASR 失败清理 pending 气泡并回到可重试状态。
  - 取消录音不会上传或发送 chat。

- API client 测试：
  - multipart 字段名和 content type 正确。
  - 成功响应映射 transcript。
  - 错误响应映射用户可理解的语音识别失败状态。

### 验证命令

- `cd server && npm.cmd test`
- `cd server && npm.cmd run build`
- `cd client/android && .\gradlew.bat --no-daemon testDebugUnitTest`
- `cd client/android && .\gradlew.bat --no-daemon build`

### 手动 smoke

- 真机中文语音输入，云端 ASR 返回 transcript 并自动进入 RAG。
- 关闭后端时，录音 UI 可恢复并显示语音识别失败 / 网络失败，不进入 chat stream。
- 使用一段空白或噪声音频，不触发 RAG。
- 使用过长音频，后端返回文件过大或时长限制错误。
- 云端 ASR 失败时，如果启用 fallback，则 Android 系统 ASR 可兜底；如果 fallback 也失败，不发送消息。

## 完成标准

- Android 语音输入优先使用后端 ASR 转写，而不是只依赖系统 `SpeechRecognizer`。
- 后端新增稳定 `POST /api/asr/transcribe`，provider key 不暴露给 Android。
- 第一版 provider 可以复用现有 LLM 音频能力，但只做 transcript，不做购物语义理解。
- transcript 成功后继续进入现有 LLM intent + RAG + SSE 流程。
- ASR 失败、空文本、超时、取消和文件限制都有稳定用户提示。
- 后端和 Android 测试覆盖 ASR 成功、失败和不触发 chat stream 的边界。
