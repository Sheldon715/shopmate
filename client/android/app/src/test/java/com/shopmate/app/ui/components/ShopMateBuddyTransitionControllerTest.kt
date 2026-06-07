package com.shopmate.app.ui.components

import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import org.junit.Test

class ShopMateBuddyTransitionControllerTest {
    @Test
    fun triggerCreatesActiveRequest() {
        val controller = ShopMateBuddyTransitionController()

        val request = controller.trigger()

        assertTrue(controller.isActive(request))
    }

    @Test
    fun repeatedTriggerReplacesPreviousRequest() {
        val controller = ShopMateBuddyTransitionController()

        val first = controller.trigger()
        val second = controller.trigger()

        assertNotEquals(first, second)
        assertFalse(controller.isActive(first))
        assertTrue(controller.isActive(second))
    }

    @Test
    fun cancelClearsActiveRequest() {
        val controller = ShopMateBuddyTransitionController()
        val request = controller.trigger()

        controller.cancel()

        assertFalse(controller.isActive(request))
    }

    @Test
    fun consumeOnlyClearsMatchingRequest() {
        val controller = ShopMateBuddyTransitionController()
        val first = controller.trigger()
        val second = controller.trigger()

        controller.consume(first)
        assertTrue(controller.isActive(second))

        controller.consume(second)
        assertFalse(controller.isActive(second))
    }
}
