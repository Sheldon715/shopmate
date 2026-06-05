package com.shopmate.app.data.image

import kotlin.test.assertEquals
import org.junit.Test

class ImageSearchPreflightTest {
    @Test
    fun normalizesSupportedMimeTypes() {
        assertEquals("image/jpeg", normalizeSupportedImageMimeType("image/jpg"))
        assertEquals("image/jpeg", normalizeSupportedImageMimeType(" image/jpeg; charset=utf-8 "))
        assertEquals("image/png", normalizeSupportedImageMimeType("image/png"))
        assertEquals("image/webp", normalizeSupportedImageMimeType("image/webp"))
        assertEquals(null, normalizeSupportedImageMimeType("image/svg+xml"))
        assertEquals(null, normalizeSupportedImageMimeType(null))
    }

    @Test
    fun detectsImageMimeTypesFromMagicBytes() {
        assertEquals("image/jpeg", detectImageMimeType(byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte())))
        assertEquals(
            "image/png",
            detectImageMimeType(
                byteArrayOf(
                    0x89.toByte(),
                    0x50,
                    0x4e,
                    0x47,
                    0x0d,
                    0x0a,
                    0x1a,
                    0x0a,
                ),
            ),
        )
        assertEquals(
            "image/webp",
            detectImageMimeType("RIFF1234WEBP".toByteArray(Charsets.US_ASCII)),
        )
        assertEquals(null, detectImageMimeType("%PDF".toByteArray()))
    }

    @Test
    fun mapsStableImageSearchErrorMessages() {
        assertEquals(
            "图片格式不支持，请选择 JPEG、PNG 或 WebP 图片。",
            imageSearchErrorMessage("IMAGE_UNSUPPORTED_MEDIA_TYPE", null),
        )
        assertEquals(
            "当前后端未配置图片识别模型，请稍后再试。",
            imageSearchErrorMessage("IMAGE_CONFIG_MISSING", "raw provider error"),
        )
        assertEquals(
            "自定义错误",
            imageSearchErrorMessage("UNKNOWN", "自定义错误"),
        )
    }
}
