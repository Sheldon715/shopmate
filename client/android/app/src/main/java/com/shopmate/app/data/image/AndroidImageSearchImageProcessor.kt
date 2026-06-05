package com.shopmate.app.data.image

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidImageSearchImageProcessor(
    private val contentResolver: ContentResolver,
) : ImageSearchImageProcessor {
    override suspend fun prepare(image: ImageSearchAttachmentInput): PreparedImageUpload =
        withContext(Dispatchers.IO) {
            val uri = Uri.parse(image.uriString)
            val rawBytes = contentResolver.openInputStream(uri)?.use(::readCappedBytes)
                ?: throw ImageSearchException(
                    code = "IMAGE_REQUIRED",
                    displayMessage = "没有读取到图片，请重新选择。",
                    retryable = false,
                )
            val detectedMimeType = detectImageMimeType(rawBytes)
            val hintedMimeType = normalizeSupportedImageMimeType(
                contentResolver.getType(uri) ?: image.mimeType,
            )
            val effectiveMimeType = hintedMimeType ?: detectedMimeType
            if (effectiveMimeType == null || detectedMimeType?.let { it != effectiveMimeType } == true) {
                throw ImageSearchException(
                    code = "IMAGE_UNSUPPORTED_MEDIA_TYPE",
                    displayMessage = imageSearchErrorMessage(
                        code = "IMAGE_UNSUPPORTED_MEDIA_TYPE",
                        fallbackMessage = null,
                    ),
                    retryable = false,
                )
            }

            val bitmap = decodeScaledBitmap(rawBytes)
            val normalizedBitmap = bitmap.withWhiteBackgroundIfTransparent()
            val compressedBytes = normalizedBitmap.compressForUpload()

            PreparedImageUpload(
                bytes = compressedBytes,
                mimeType = IMAGE_UPLOAD_MIME_TYPE,
                fileName = IMAGE_UPLOAD_FILE_NAME,
            )
        }

    private fun readCappedBytes(inputStream: InputStream): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var totalBytes = 0

        while (true) {
            val read = inputStream.read(buffer)
            if (read == -1) {
                break
            }

            totalBytes += read
            if (totalBytes > MAX_SOURCE_IMAGE_BYTES) {
                throw ImageSearchException(
                    code = "IMAGE_TOO_LARGE",
                    displayMessage = "图片太大，请换一张更小的图片。",
                    retryable = false,
                )
            }
            output.write(buffer, 0, read)
        }

        return output.toByteArray()
    }

    private fun decodeScaledBitmap(bytes: ByteArray): Bitmap {
        val bounds = BitmapFactory.Options().apply {
            inJustDecodeBounds = true
        }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw ImageSearchException(
                code = "IMAGE_UNSUPPORTED_MEDIA_TYPE",
                displayMessage = "图片内容无法识别，请换一张 JPEG、PNG 或 WebP 图片。",
                retryable = false,
            )
        }

        val options = BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.ARGB_8888
            inSampleSize = calculateInSampleSize(
                width = bounds.outWidth,
                height = bounds.outHeight,
                targetLongEdge = TARGET_LONG_EDGE_PIXELS,
            )
        }

        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
            ?: throw ImageSearchException(
                code = "IMAGE_UNSUPPORTED_MEDIA_TYPE",
                displayMessage = "图片内容无法识别，请换一张 JPEG、PNG 或 WebP 图片。",
                retryable = false,
            )
    }

    private fun Bitmap.withWhiteBackgroundIfTransparent(): Bitmap {
        val scaled = scaleToTargetLongEdge()
        if (!scaled.hasAlpha()) {
            return scaled
        }

        val normalized = Bitmap.createBitmap(scaled.width, scaled.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(normalized)
        canvas.drawColor(Color.WHITE)
        canvas.drawBitmap(scaled, 0f, 0f, null)
        return normalized
    }

    private fun Bitmap.scaleToTargetLongEdge(): Bitmap {
        val longEdge = maxOf(width, height)
        if (longEdge <= TARGET_LONG_EDGE_PIXELS) {
            return this
        }

        val scale = TARGET_LONG_EDGE_PIXELS.toFloat() / longEdge.toFloat()
        val scaledWidth = (width * scale).toInt().coerceAtLeast(1)
        val scaledHeight = (height * scale).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(this, scaledWidth, scaledHeight, true)
    }

    private fun Bitmap.compressForUpload(): ByteArray {
        var quality = INITIAL_JPEG_QUALITY
        while (quality >= MIN_JPEG_QUALITY) {
            val output = ByteArrayOutputStream()
            if (!compress(Bitmap.CompressFormat.JPEG, quality, output)) {
                break
            }

            val bytes = output.toByteArray()
            if (bytes.size <= IMAGE_UPLOAD_TARGET_MAX_BYTES || quality == MIN_JPEG_QUALITY) {
                if (bytes.size <= IMAGE_UPLOAD_TARGET_MAX_BYTES) {
                    return bytes
                }
                break
            }
            quality -= JPEG_QUALITY_STEP
        }

        throw ImageSearchException(
            code = "IMAGE_TOO_LARGE",
            displayMessage = "图片压缩后仍然过大，请换一张更小的图片。",
            retryable = false,
        )
    }

    private fun calculateInSampleSize(
        width: Int,
        height: Int,
        targetLongEdge: Int,
    ): Int {
        var sampleSize = 1
        var currentLongEdge = maxOf(width, height)
        while (currentLongEdge / 2 >= targetLongEdge) {
            sampleSize *= 2
            currentLongEdge /= 2
        }
        return sampleSize
    }

    private companion object {
        private const val MAX_SOURCE_IMAGE_BYTES = 24 * 1024 * 1024
        private const val TARGET_LONG_EDGE_PIXELS = 1440
        private const val INITIAL_JPEG_QUALITY = 85
        private const val MIN_JPEG_QUALITY = 65
        private const val JPEG_QUALITY_STEP = 5
    }
}
