package com.shopmate.app.ui.chat

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AssistantTextRevealerTest {
    @Test
    fun enqueueShowsFirstVisibleChunkImmediately() = runTest {
        val visibleTexts = mutableListOf<String>()
        val revealer = AssistantTextRevealer(
            scope = backgroundScope,
            ticker = FakeTypewriterTicker(),
            onVisibleTextChanged = visibleTexts::add,
        )

        revealer.enqueue("推荐耳机")

        assertEquals(listOf("推荐耳机"), visibleTexts)
    }

    @Test
    fun flushEmitsRemainingPendingText() = runTest {
        val visibleTexts = mutableListOf<String>()
        val revealer = AssistantTextRevealer(
            scope = backgroundScope,
            ticker = FakeTypewriterTicker(),
            onVisibleTextChanged = visibleTexts::add,
        )

        revealer.enqueue("推荐耳机真的很适合通勤")

        assertTrue(revealer.flush())
        assertEquals("推荐耳机真的很适合通勤", visibleTexts.last())
        assertFalse(revealer.flush())
    }

    @Test
    fun tickerFramesRevealRemainingCodePointsProgressively() = runTest {
        val visibleTexts = mutableListOf<String>()
        val ticker = FakeTypewriterTicker(100L)
        val revealer = AssistantTextRevealer(
            scope = backgroundScope,
            ticker = ticker,
            onVisibleTextChanged = visibleTexts::add,
        )

        revealer.enqueue("推荐耳机真的很适合通勤")
        assertEquals("推荐耳机", visibleTexts.last())

        ticker.advanceOneFrame()
        runCurrent()
        assertEquals("推荐耳机真的很", visibleTexts.last())

        ticker.advanceOneFrame()
        runCurrent()
        assertEquals("推荐耳机真的很适合通", visibleTexts.last())
    }

    @Test
    fun cancelClearsPendingAndPreventsFurtherReveal() = runTest {
        val visibleTexts = mutableListOf<String>()
        val ticker = FakeTypewriterTicker(100L)
        val revealer = AssistantTextRevealer(
            scope = backgroundScope,
            ticker = ticker,
            onVisibleTextChanged = visibleTexts::add,
        )

        revealer.enqueue("推荐耳机真的很适合通勤")
        revealer.cancel()
        ticker.advanceOneFrame()
        runCurrent()

        assertEquals(listOf("推荐耳机"), visibleTexts)
        assertFalse(revealer.flush())
    }
}

private class FakeTypewriterTicker(
    private val frameMillis: Long = 100L,
) : TypewriterTicker {
    private val frameSignals = kotlinx.coroutines.channels.Channel<Unit>(
        capacity = kotlinx.coroutines.channels.Channel.UNLIMITED,
    )

    override suspend fun delayNextFrame(): Long {
        frameSignals.receive()
        return frameMillis
    }

    fun advanceOneFrame() {
        frameSignals.trySend(Unit)
    }
}
