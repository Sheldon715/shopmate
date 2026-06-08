package com.shopmate.app.data.mock

import com.shopmate.app.ui.model.PromptSuggestionIconType
import com.shopmate.app.ui.model.PromptSuggestionUi
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Test

class MockShopMateDataTest {
    @Test
    fun homePromptSuggestionsCoverCarouselContent() {
        val prompts = MockShopMateData.promptSuggestions

        assertEquals(8, prompts.size)
        assertEquals(prompts.size, prompts.map { prompt -> prompt.id }.toSet().size)
        assertTrue(prompts.all { prompt -> prompt.title.isNotBlank() })
        assertTrue(prompts.all { prompt -> prompt.categoryLabel.isNotBlank() })
        assertTrue(prompts.any { prompt -> prompt.title.contains("拍照") })
        assertTrue(prompts.any { prompt -> prompt.title.contains("对比") })
        assertTrue(prompts.any { prompt -> prompt.title.contains("购物车") })
        assertTrue(prompts.any { prompt -> prompt.title.contains("不含酒精") })
    }

    @Test
    fun promptSuggestionKeepsBackwardCompatibleDefaults() {
        val prompt = PromptSuggestionUi(
            id = "legacy-prompt",
            title = "推荐适合油皮的护肤品",
        )

        assertEquals("", prompt.categoryLabel)
        assertEquals(PromptSuggestionIconType.Bag, prompt.iconType)
    }
}
