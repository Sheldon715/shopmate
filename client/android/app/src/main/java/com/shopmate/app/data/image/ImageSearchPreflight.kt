package com.shopmate.app.data.image

internal const val IMAGE_UPLOAD_FIELD_NAME = "image"
internal const val IMAGE_UPLOAD_MESSAGE_FIELD_NAME = "message"
internal const val IMAGE_UPLOAD_CONVERSATION_FIELD_NAME = "conversationId"
internal const val IMAGE_UPLOAD_FILE_NAME = "shopmate-image-search.jpg"
internal const val IMAGE_UPLOAD_MIME_TYPE = "image/jpeg"
internal const val IMAGE_UPLOAD_TARGET_MAX_BYTES = 4 * 1024 * 1024

private val SupportedImageMimeTypes = setOf(
    "image/jpeg",
    "image/png",
    "image/webp",
)

fun normalizeSupportedImageMimeType(mimeType: String?): String? {
    val normalized = mimeType
        ?.substringBefore(";")
        ?.trim()
        ?.lowercase()
        ?: return null

    val canonical = when (normalized) {
        "image/jpg" -> "image/jpeg"
        else -> normalized
    }

    return canonical.takeIf { value -> value in SupportedImageMimeTypes }
}

fun detectImageMimeType(bytes: ByteArray): String? {
    if (
        bytes.size >= 3 &&
        bytes[0] == 0xff.toByte() &&
        bytes[1] == 0xd8.toByte() &&
        bytes[2] == 0xff.toByte()
    ) {
        return "image/jpeg"
    }

    if (
        bytes.size >= 8 &&
        bytes[0] == 0x89.toByte() &&
        bytes[1] == 0x50.toByte() &&
        bytes[2] == 0x4e.toByte() &&
        bytes[3] == 0x47.toByte() &&
        bytes[4] == 0x0d.toByte() &&
        bytes[5] == 0x0a.toByte() &&
        bytes[6] == 0x1a.toByte() &&
        bytes[7] == 0x0a.toByte()
    ) {
        return "image/png"
    }

    if (
        bytes.size >= 12 &&
        bytes.sliceArray(0 until 4).toString(Charsets.US_ASCII) == "RIFF" &&
        bytes.sliceArray(8 until 12).toString(Charsets.US_ASCII) == "WEBP"
    ) {
        return "image/webp"
    }

    return null
}

fun imageSearchErrorMessage(code: String?, fallbackMessage: String?): String =
    when (code) {
        "IMAGE_UNSUPPORTED_MEDIA_TYPE" -> "图片格式不支持，请选择 JPEG、PNG 或 WebP 图片。"
        "IMAGE_TOO_LARGE" -> "图片太大，请换一张更小的图片或稍后重试。"
        "IMAGE_SEARCH_PROVIDER_DISABLED",
        "IMAGE_CONFIG_MISSING",
        "IMAGE_PROVIDER_UNAVAILABLE",
        -> "当前后端未配置图片识别模型，请稍后再试。"
        "IMAGE_SEARCH_LOW_CONFIDENCE" -> "图片主体不够清晰，请换一张商品更明显的图片或补充文字。"
        "IMAGE_TIMEOUT" -> "图片识别超时，请稍后重试。"
        "IMAGE_REQUIRED",
        "IMAGE_MULTIPART_INVALID",
        "IMAGE_UNEXPECTED_FIELD",
        -> "图片上传请求格式不正确，请重新选择图片。"
        else -> fallbackMessage?.takeIf { message -> message.isNotBlank() }
            ?: "图片找货失败，请再试一次。"
    }
