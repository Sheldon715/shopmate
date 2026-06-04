package com.shopmate.app.ui.chat

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

interface TypewriterTicker {
    suspend fun delayNextFrame(): Long
}

class CoroutineTypewriterTicker(
    private val frameMillis: Long = DEFAULT_FRAME_MILLIS,
) : TypewriterTicker {
    override suspend fun delayNextFrame(): Long {
        delay(frameMillis)
        return frameMillis
    }

    private companion object {
        private const val DEFAULT_FRAME_MILLIS = 33L
    }
}

internal class AssistantTextRevealer(
    private val scope: CoroutineScope,
    private val ticker: TypewriterTicker = CoroutineTypewriterTicker(),
    private val onVisibleTextChanged: (String) -> Unit,
) {
    private val visibleCodePoints = mutableListOf<Int>()
    private val pendingCodePoints = mutableListOf<Int>()
    private var revealJob: Job? = null
    private var revealBudget = 0.0

    fun enqueue(delta: String) {
        val nextCodePoints = delta.toCodePoints()
        if (nextCodePoints.isEmpty()) {
            return
        }

        pendingCodePoints += nextCodePoints
        if (visibleCodePoints.isEmpty()) {
            revealFromPending(minOf(FIRST_REVEAL_CODE_POINTS, pendingCodePoints.size))
            emitVisibleText()
        }
        ensureRevealJob()
    }

    fun flush(): Boolean {
        revealJob?.cancel()
        revealJob = null
        revealBudget = 0.0

        if (pendingCodePoints.isEmpty()) {
            return false
        }

        revealFromPending(pendingCodePoints.size)
        emitVisibleText()
        return true
    }

    fun cancel() {
        revealJob?.cancel()
        revealJob = null
        revealBudget = 0.0
        visibleCodePoints.clear()
        pendingCodePoints.clear()
    }

    private fun ensureRevealJob() {
        if (pendingCodePoints.isEmpty() || revealJob?.isActive == true) {
            return
        }

        revealJob = scope.launch {
            while (isActive && pendingCodePoints.isNotEmpty()) {
                val elapsedMillis = ticker.delayNextFrame()
                revealForFrame(elapsedMillis)
            }
            revealJob = null
        }
    }

    private fun revealForFrame(elapsedMillis: Long) {
        if (elapsedMillis <= 0L || pendingCodePoints.isEmpty()) {
            return
        }

        val codePointsPerSecond =
            if (pendingCodePoints.size >= CATCH_UP_PENDING_THRESHOLD) {
                CATCH_UP_CODE_POINTS_PER_SECOND
            } else {
                NORMAL_CODE_POINTS_PER_SECOND
            }
        revealBudget += codePointsPerSecond * elapsedMillis / MILLIS_PER_SECOND
        val revealCount = minOf(revealBudget.toInt(), pendingCodePoints.size)
        if (revealCount <= 0) {
            return
        }

        revealBudget -= revealCount
        revealFromPending(revealCount)
        emitVisibleText()
    }

    private fun revealFromPending(count: Int) {
        repeat(count) {
            visibleCodePoints += pendingCodePoints.removeAt(0)
        }
    }

    private fun emitVisibleText() {
        onVisibleTextChanged(visibleCodePoints.toCodePointString())
    }

    private companion object {
        private const val FIRST_REVEAL_CODE_POINTS = 4
        private const val NORMAL_CODE_POINTS_PER_SECOND = 30.0
        private const val CATCH_UP_CODE_POINTS_PER_SECOND = 80.0
        private const val CATCH_UP_PENDING_THRESHOLD = 100
        private const val MILLIS_PER_SECOND = 1000.0
    }
}

private fun String.toCodePoints(): List<Int> {
    val codePoints = mutableListOf<Int>()
    var index = 0
    while (index < length) {
        val codePoint = codePointAt(index)
        codePoints += codePoint
        index += Character.charCount(codePoint)
    }
    return codePoints
}

private fun List<Int>.toCodePointString(): String {
    val builder = StringBuilder()
    forEach { codePoint ->
        builder.appendCodePoint(codePoint)
    }
    return builder.toString()
}
