package com.shopmate.app.data.mock

import com.shopmate.app.R
import com.shopmate.app.ui.model.CartItemUi
import com.shopmate.app.ui.model.ComparisonRowUi
import com.shopmate.app.ui.model.ComparisonUi
import com.shopmate.app.ui.model.HistoryConversationUi
import com.shopmate.app.ui.model.ProductCardUi
import com.shopmate.app.ui.model.ProductDetailUi
import com.shopmate.app.ui.model.PromptSuggestionUi

object MockShopMateData {
    val historyConversations = listOf(
        HistoryConversationUi(
            id = "history-commute-earbuds",
            title = "推荐适合通勤的蓝牙耳机",
            timeText = "09:41"
        ),
        HistoryConversationUi(
            id = "history-sunscreen-compare",
            title = "帮我对比这两款防晒霜",
            timeText = "昨天"
        ),
        HistoryConversationUi(
            id = "history-oily-skincare",
            title = "推荐适合油皮的护肤品",
            timeText = "昨天"
        ),
        HistoryConversationUi(
            id = "history-earbuds-under-200",
            title = "200 元以内的耳机推荐",
            timeText = "前天"
        ),
        HistoryConversationUi(
            id = "history-image-search",
            title = "拍照找同款",
            timeText = "前天"
        )
    )

    val promptSuggestions = listOf(
        PromptSuggestionUi(
            id = "prompt-oily-skincare",
            title = "推荐适合油皮的护肤品"
        ),
        PromptSuggestionUi(
            id = "prompt-earbuds-under-200",
            title = "200 元以内的蓝牙耳机"
        ),
        PromptSuggestionUi(
            id = "prompt-compare-products",
            title = "帮我对比这两款商品"
        ),
        PromptSuggestionUi(
            id = "prompt-image-search",
            title = "拍照找同款"
        )
    )

    val bluetoothEarbuds = listOf(
        ProductCardUi(
            id = "ui-edifier-zero-air",
            name = "漫步者 Zero Air 真无线蓝牙耳机",
            priceText = "¥179",
            imageRes = R.drawable.product_zero_air,
            tags = listOf("半入耳舒适", "20h 续航"),
            recommendationReason = "推荐理由：轻盈半入耳，佩戴无感，通勤久戴不累，通话清晰，日常使用足够省心。"
        ),
        ProductCardUi(
            id = "ui-qcy-t13-x",
            name = "QCY T13 X 真无线蓝牙耳机",
            priceText = "¥149",
            imageRes = R.drawable.product_qcy_t13_x,
            tags = listOf("低延迟", "30h 续航"),
            recommendationReason = "推荐理由：续航更长，连接稳定，适合预算内想兼顾通勤和日常娱乐的选择。"
        ),
        ProductCardUi(
            id = "ui-redmi-buds-4-lite",
            name = "小米 Redmi Buds 4 青春版",
            priceText = "¥129",
            imageRes = R.drawable.product_redmi_buds_4,
            tags = listOf("蓝牙 5.3", "20h 续航"),
            recommendationReason = "推荐理由：价格友好，机身轻巧，适合作为入门备用耳机。"
        )
    )

    val skincareProducts = listOf(
        ProductCardUi(
            id = "ui-hyaluronic-acid-serum",
            name = "玻尿酸保湿精华补水修护精华液",
            priceText = "¥199",
            imageRes = R.drawable.mascot_assistant,
            tags = listOf("护肤", "补水", "修护"),
            recommendationReason = "主打补水修护，适合需要加强保湿、维持肌肤稳定的用户。"
        ),
        ProductCardUi(
            id = "ui-la-roche-posay-sunscreen",
            name = "理肤泉 清透防晒乳 SPF50+ PA++++",
            priceText = "¥168",
            imageRes = R.drawable.comparison_product_one,
            tags = listOf("防晒", "清透", "SPF50+"),
            recommendationReason = "防护力高，质地相对清爽，适合日常通勤和夏季防晒。"
        ),
        ProductCardUi(
            id = "ui-anessa-perfect-uv-sunscreen",
            name = "安热沙 小金瓶防晒乳 SPF50+",
            priceText = "¥229",
            imageRes = R.drawable.comparison_product_two,
            tags = listOf("防晒", "耐汗", "SPF50+"),
            recommendationReason = "防晒膜更稳，耐水耐汗表现更强，适合户外暴晒或长时间通勤。"
        )
    )

    val recommendedProducts = bluetoothEarbuds + skincareProducts

    val sunscreenComparison = ComparisonUi(
        id = "comparison-sunscreen-la-roche-posay-anessa",
        queryText = "帮我对比理肤泉和安热沙这两款防晒霜",
        assistantText = "当然可以！我从防晒力、肤感、适合场景和预算帮你做了对比，方便你快速判断哪一款更适合日常使用。",
        products = listOf(
            skincareProducts.first { product -> product.id == "ui-la-roche-posay-sunscreen" },
            skincareProducts.first { product -> product.id == "ui-anessa-perfect-uv-sunscreen" }
        ),
        rows = listOf(
            ComparisonRowUi(
                label = "防晒力",
                firstProductValue = "SPF50+ PA++++\n日常通勤足够",
                secondProductValue = "SPF50+\n耐水耐汗更强",
                highlightedProductId = "ui-anessa-perfect-uv-sunscreen"
            ),
            ComparisonRowUi(
                label = "肤感",
                firstProductValue = "清透乳液感\n更轻薄",
                secondProductValue = "成膜感更强\n略厚重",
                highlightedProductId = "ui-la-roche-posay-sunscreen"
            ),
            ComparisonRowUi(
                label = "适合肤质",
                firstProductValue = "油皮 / 敏感肌",
                secondProductValue = "混合皮 / 户外人群",
                highlightedProductId = "ui-la-roche-posay-sunscreen"
            ),
            ComparisonRowUi(
                label = "通勤适配",
                firstProductValue = "日常通勤\n补涂压力小",
                secondProductValue = "长时间户外\n更安心",
                highlightedProductId = "ui-la-roche-posay-sunscreen"
            ),
            ComparisonRowUi(
                label = "价格 / 预算",
                firstProductValue = "¥168\n预算更友好",
                secondProductValue = "¥229\n预算更高",
                highlightedProductId = "ui-la-roche-posay-sunscreen"
            )
        ),
        recommendedProductId = "ui-la-roche-posay-sunscreen",
        summaryText = "如果主要是夏季通勤、想要轻薄肤感和更好预算控制，推荐理肤泉；如果经常户外暴晒，安热沙会更稳。"
    )

    val productDetails = listOf(
        ProductDetailUi(
            id = "ui-edifier-zero-air",
            name = "漫步者 Zero Air 真无线蓝牙耳机",
            priceText = "¥179",
            imageRes = R.drawable.mascot_assistant,
            categoryText = "数码电子",
            brandText = "漫步者",
            tags = listOf("蓝牙耳机", "通勤", "轻巧"),
            recommendationReason = "预算 200 元内，佩戴轻便，适合日常通勤和网课使用。",
            description = "一款面向日常通勤和轻办公场景的真无线耳机，适合看视频、听播客和短时间语音通话。",
            highlights = listOf("真无线入耳体验", "轻量机身", "适合 200 元以内预算")
        ),
        ProductDetailUi(
            id = "ui-la-roche-posay-sunscreen",
            name = "理肤泉 清透防晒乳 SPF50+ PA++++",
            priceText = "¥168",
            imageRes = R.drawable.mascot_assistant,
            categoryText = "美妆护肤",
            brandText = "理肤泉",
            tags = listOf("防晒", "清透", "SPF50+"),
            recommendationReason = "防护力高，质地相对清爽，适合日常通勤和夏季防晒。",
            description = "适合需要高倍日常防晒的用户，页面 mock 阶段用于展示商品详情信息结构。",
            highlights = listOf("SPF50+ PA++++", "清透肤感", "适合夏季通勤")
        )
    )

    val cartItems = listOf(
        CartItemUi(
            id = "cart-ui-edifier-zero-air",
            product = bluetoothEarbuds.first(),
            quantity = 1,
            subtotalText = "¥179"
        ),
        CartItemUi(
            id = "cart-ui-sunscreen",
            product = skincareProducts.last(),
            quantity = 1,
            subtotalText = "¥168"
        )
    )

    fun findProductDetail(productId: String): ProductDetailUi? =
        productDetails.firstOrNull { product -> product.id == productId }
}
