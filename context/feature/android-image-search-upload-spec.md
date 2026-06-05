# Android 图片找货上传入口 Spec

## 概述

本 spec 实现图片找货 V1 的 Android 用户入口：在聊天输入区提供图片附件能力，用户从相册选择商品图，可补充文字，Android 上传图片到后端解释接口，成功后复用现有 Chat SSE 展示流式导购回复和商品卡片。

推荐 V1 Android 流程：

```text
ChatComposer 选择图片
-> 显示预览，可删除 / 重选
-> 用户可输入补充文字
-> 上传到 POST /api/image-search/interpret
-> 成功后用返回 chatMessage / filters 调 Chat SSE
-> 展示流式回复和 product_cards
```

## 背景

当前 Android 已有：

- OkHttp JSON client 和 Chat SSE client。
- ASR multipart 上传模式。
- `ChatViewModel.startStream()` 统一处理文字聊天。
- `ChatComposer` 目前有文字 / 语音输入模式切换。
- `ShopMateImageUrlResolver` 已处理商品图片 URL。

图片找货入口不能破坏现有语音输入。V1 应在聊天输入体验里增加附件入口，而不是用图片按钮替换现有 voice/text 切换。

## 目标

- 在 ChatComposer 增加图片附件入口，保留现有语音输入能力。
- 使用 Android Photo Picker 选择单张图片。
- 支持图片预览、删除、重新选择。
- 支持用户在图片旁补充文字，例如“找类似但便宜一点”。
- 发送时先调用 `ImageSearchRepository.interpret(...)`。
- interpret 成功后复用现有 Chat SSE。
- interpret 失败时保留用户输入，显示可重试错误，不进入 Chat SSE。
- 上传前做图片大小压缩、重新编码和 EXIF 去除。
- Android 不保存 provider key，不做本地商品识别。

## 不做

- 不做直接拍照；CameraX / 系统相机放后续 V1.5。
- 不做多图上传。
- 不做实时连续识别。
- 不做本地 OCR 或端侧商品判断。
- 不长期保存用户图片。
- 不在 Android 端根据文件名、OCR、关键词决定商品。
- 不把图片识别结果直接变成 cartAction。

## UI 行为

### 入口

推荐在 composer 中增加独立附件按钮：

- 不替换现有语音 / 键盘切换按钮。
- 图标使用已有 icon 系统或 Material 图标。
- 入口只负责选择图片，不直接发送。
- 选择图片后 composer 进入“有附件”状态。

### 预览

选择图片后显示：

- 小缩略图。
- 删除按钮。
- 上传 / 识别 / 找货状态。
- 失败状态和重试入口。

不要显示：

- 本地文件完整路径。
- 原始相册文件名。
- base64。
- provider 原始错误。

### 发送状态

状态建议：

```text
idle
imageSelected
uploading
interpreting
searching
failed
```

用户点击发送：

1. 无图片时，保持现有文字发送。
2. 有图片时，先显示用户气泡，包含图片预览和用户原文。
3. 上传 / 识别中显示等待状态。
4. interpret 成功后，用内部 `chatMessage` 请求 Chat SSE。
5. Chat SSE 返回后，现有 assistant streaming 气泡继续工作。
6. interpret 失败时，不请求 Chat SSE，用户可重试。

## 推荐数据结构

```kotlin
data class ChatImageAttachmentUi(
    val uri: Uri,
    val previewLabel: String,
    val mimeType: String?,
    val sizeBytes: Long?,
    val isUploading: Boolean = false,
    val errorMessage: String? = null
)
```

图片解释结果：

```kotlin
data class ImageSearchInterpretResult(
    val visualIntent: VisualIntentDto,
    val chatMessage: String?,
    val filters: ChatStreamFiltersDto?,
    val imageSearchMode: String
)
```

## 推荐文件

新增：

```text
client/android/app/src/main/java/com/shopmate/app/data/image/ImageSearchApiClient.kt
client/android/app/src/main/java/com/shopmate/app/data/image/ImageSearchRepository.kt
client/android/app/src/main/java/com/shopmate/app/data/image/ImageSearchDtos.kt
client/android/app/src/test/java/com/shopmate/app/data/image/
```

可能修改：

```text
client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatUiState.kt
client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt
client/android/app/src/main/java/com/shopmate/app/ui/components/ChatComposer.kt
client/android/app/src/main/java/com/shopmate/app/data/chat/ChatRepository.kt
client/android/app/src/main/java/com/shopmate/app/data/chat/ChatStreamRequestDto.kt
client/android/app/src/test/java/com/shopmate/app/ui/chat/
client/android/app/src/test/java/com/shopmate/app/data/chat/
```

## 图片处理

V1 建议：

- 客户端最大上传前目标 4 MB。
- 后端最大 5 MB。
- 支持 `image/jpeg`、`image/png`、`image/webp`。
- 长边缩放到 1280-1600 px。
- JPEG quality 80-85。
- 重新编码以移除 EXIF。
- 上传文件名使用安全固定名，如 `shopmate-image-search.jpg`。
- 不打印 Uri、文件路径、base64 或图片 bytes。

## API Client

使用 OkHttp multipart，字段名固定：

```text
image: file part
message: optional text form part
conversationId: optional text form part
```

错误处理：

- `IMAGE_UNSUPPORTED_MEDIA_TYPE`：提示图片格式不支持。
- `IMAGE_TOO_LARGE`：提示换小图或等待压缩。
- `IMAGE_SEARCH_PROVIDER_DISABLED`：提示当前后端未配置图片识别模型。
- `IMAGE_SEARCH_LOW_CONFIDENCE` 或 low confidence data：提示换清晰商品主体图或补充文字。
- network error：保留图片和文字，允许重试。

## ChatViewModel 集成

建议新增方法：

```kotlin
fun selectImage(uri: Uri)
fun clearSelectedImage()
fun retryImageSearch()
```

发送逻辑：

- `selectedImage == null`：走原 `sendMessage()` / `startStream()`。
- `selectedImage != null`：
  - 调 `ImageSearchRepository.interpret(image, userText, conversationId)`。
  - 成功且 `chatMessage != null`：调用现有 chat stream，并传 filters。
  - 成功但 `chatMessage == null`：显示澄清 / 低置信消息，不进入 Chat SSE。
  - 失败：保留 selected image 和 text。

用户气泡：

- 展示用户实际输入文本。
- 展示图片缩略图。
- 不展示后端生成的内部 `chatMessage`。

## 权限

- V1 使用 Android Photo Picker，优先避免宽泛 storage permission。
- Android 13+ 不默认申请 `READ_MEDIA_IMAGES`，除非实现上确实需要。
- 后续拍照入口再处理 `CAMERA` permission、FileProvider、cache file 清理。

## 安全边界

- Android 不持有 provider key。
- Android 不做商品事实判断。
- Android 不根据图片文件名或 OCR 文本触发购物车动作。
- 用户图片只用于本次请求，不长期保存。
- 网络日志不包含图片 bytes、base64、完整 Uri 或 provider response。

## 测试计划

单测：

- 无图片时旧文字发送流程不变。
- 选择图片后 UI state 正确保存 attachment。
- 删除图片后回到普通文字模式。
- interpret 成功后调用 Chat SSE。
- interpret 失败后不调用 Chat SSE。
- low confidence 后不调用 Chat SSE。
- filters 从 interpret result 传给 Chat repository。
- multipart 字段名为 `image`，包含可选 `message` 和 `conversationId`。
- 图片压缩 / MIME 校验工具覆盖 JPEG / PNG / WebP 和拒绝格式。

手动 smoke：

- 选择图片显示预览。
- 删除 / 重新选择正常。
- 断网时显示失败并可重试。
- 后端未配置 provider 时提示稳定。
- 成功后 assistant 流式回复和商品卡片正常。
- 商品卡片点击详情、加购仍走现有 Cart API。

## 验收标准

- 用户可以在聊天里选择单张商品图片并补充文字。
- 图片上传成功后复用现有 Chat SSE 返回回复和商品卡片。
- 文字聊天和语音输入不回归。
- 失败时不丢失用户选择的图片和文本。
- Android 不暴露 provider key，不打印敏感图片信息。

## 验证命令

```powershell
cd client/android
.\gradlew.bat testDebugUnitTest
.\gradlew.bat build
```

如需 demo 环境：

```powershell
cd client/android
.\gradlew.bat assembleDemo
```

如果未配置后端 image model，记录为“真实图片识别 smoke 未跑”，但 UI state、multipart client 和普通 chat 回归测试仍应通过。
