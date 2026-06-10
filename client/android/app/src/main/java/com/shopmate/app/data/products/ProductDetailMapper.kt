package com.shopmate.app.data.products

import com.shopmate.app.data.network.ShopMateImageUrlResolver
import com.shopmate.app.ui.model.ProductDetailSpecUi
import com.shopmate.app.ui.model.ProductDetailUi
import java.util.Locale

private const val MAX_DETAIL_TAGS = 4
private const val MAX_DETAIL_HIGHLIGHTS = 3
private const val MAX_DETAIL_SPECS = 4
private const val MAX_HIGHLIGHT_CHARS = 34
private const val MAX_REASON_CORE_CHARS = 48
private const val MAX_REASON_CHARS = 120
private const val MAX_SPEC_VALUE_CHARS = 32
private const val MAX_DESCRIPTION_CHARS = 120

private val SentenceBreakRegex = Regex("[。！？!?；;\\n]+")
private val ClauseBreakRegex = Regex("[，,：:]")
private val WhitespaceRegex = Regex("\\s+")
private val ParentheticalRegex = Regex("[（(][^）)]{1,30}[）)]")
private val LeadingCopyPrefixRegex = Regex("^(推荐理由|亮点|适合|谨慎选择)[:：]\\s*")
private val LeadingMarketingPrefixRegex = Regex("^(主要卖点包括|核心特点包括|它的核心特点包括)\\s*")
private val TemplateCopyMarkers = listOf(
    "功效描述明确",
    "适用场景清楚",
    "便于按肤质筛选",
    "希望获得医疗效果",
    "不应替代医疗建议",
    "商品详情页数据",
    "数据说明",
    "本商品数据",
    "本数据集",
    "真实品牌",
    "真实用户反馈",
    "产品名",
    "后续查找",
    "对应商品图片",
    "构建商品详情页",
    "导购信息经过",
    "脱敏",
    "结构化整理",
    "课程 Demo",
    "课程Demo",
    "检索实验",
    "最终展示",
    "PostgreSQL",
    "比赛数据集",
    "模拟内容",
    "SKU",
    "sku",
    "FAQ",
    "faq",
    "评论",
    "实时售价",
    "不代表实时售价",
    "不代表真实用户反馈",
    "页面 mock",
    "测试数据",
    "口味信息明确",
    "规格容易比较",
    "规格选择清楚",
    "场景适用性强",
    "配置清晰",
    "SKU 选择较多",
    "适合参数比较",
    "看过来",
    "如果用户属于",
    "推荐时需要结合限制条件",
)
private val CautionCopyMarkers = listOf(
    "不适合",
    "谨慎",
    "注意",
    "过敏",
    "医疗",
    "避免",
    "确认",
    "控糖",
    "控盐",
    "最低价格",
    "不愿意",
    "专业竞技",
    "皮肤异常",
    "咨询医生",
    "刺激",
    "闭口",
    "长痘",
)

fun ProductDetailDto.toProductDetailUi(
    imageUrlResolver: ShopMateImageUrlResolver? = null,
): ProductDetailUi {
    val displayName = cleanProductDisplayName(
        rawName = name,
        brand = brand,
        category = category,
        subCategory = subCategory,
    )
    val recommendationReason = buildRecommendationReason()

    return ProductDetailUi(
        id = id,
        name = displayName,
        priceText = formatProductPrice(),
        imageRes = resolveProductImageRes(),
        categoryText = listOfNotNull(
            category?.takeIf { value -> value.isNotBlank() },
            subCategory?.takeIf { value -> value.isNotBlank() },
        ).joinToString(" / ").ifBlank { "商品" },
        brandText = brand.orEmpty().ifBlank { "品牌信息待补充" },
        tags = buildFallbackDisplayTags(
            tags = tags,
            recommendationReason = recommendationReason,
            category = category,
            subCategory = subCategory,
        ).take(MAX_DETAIL_TAGS),
        recommendationReason = recommendationReason,
        description = buildDescription(),
        highlights = buildHighlights(excludeReason = recommendationReason),
        specs = buildSpecs(),
        suitedForText = buildSuitabilityText(),
        imageUrl = imageUrlResolver?.resolve(imagePath),
    )
}

private fun ProductDetailDto.formatProductPrice(): String {
    return formatProductPriceRangeText(
        priceCents = priceCents,
        minPriceCents = priceRangeCents?.min,
        maxPriceCents = priceRangeCents?.max,
        currency = currency,
        unavailableText = "价格待确认",
    )
}

private fun ProductDetailDto.buildRecommendationReason(): String {
    recommendationReason
        ?.toCleanDisplayCopy()
        ?.takeIf { value -> value.isNotBlank() && value.isPositiveProductCopy() }
        ?.let { value -> return value.shortenForSentence(MAX_REASON_CHARS).ensureSentence() }

    val productSnippet = buildMarketingRecommendationSnippet()
    val scenario = attributes["使用场景"].orEmpty().toSpecValues().firstOrNull()
        ?: recommendWhen.toPositiveValues().firstOrNull()
    val audience = attributes["适用人群"].orEmpty().toSpecValues().firstOrNull()

    val reason = when {
        productSnippet != null && scenario != null ->
            mergeReasonWithScenario(productSnippet, scenario)

        productSnippet != null -> productSnippet

        audience != null && scenario != null ->
            "适合${audience}在${scenario}时比较"

        audience != null ->
            "适合${audience}优先比较"

        scenario != null ->
            "适合${scenario}场景优先比较"

        else -> null
    }

    return reason
        ?.shortenForSentence(MAX_REASON_CHARS)
        ?.ensureSentence()
        ?: buildProductFallbackReason()
}

private fun mergeReasonWithScenario(
    productSnippet: String,
    scenario: String,
): String =
    if (productSnippet.contains(scenario) || productSnippet.contains("适合")) {
        productSnippet
    } else {
        "$productSnippet，适合$scenario"
    }

private fun ProductDetailDto.buildMarketingRecommendationSnippet(): String? {
    val sentenceSnippet = marketingDescription
        ?.toReadableSentences()
        ?.filter { sentence ->
            sentence.isPositiveProductCopy() &&
                !sentence.isTitleLikeProductIntro(name = name, brand = brand)
        }
        ?.map { sentence -> sentence.shortenForSentence(MAX_REASON_CHARS) }
        ?.firstOrNull { sentence -> sentence.isNotBlank() }

    if (sentenceSnippet != null) {
        return sentenceSnippet
    }

    return marketingDescription
        ?.toReadableClauses()
        ?.filter { clause ->
            clause.isPositiveProductCopy() &&
                !clause.isTitleLikeProductIntro(name = name, brand = brand)
        }
        ?.map { clause -> clause.shortCopy(MAX_REASON_CORE_CHARS) }
        ?.firstOrNull { clause -> clause.isNotBlank() }
}

private fun ProductDetailDto.buildProductFallbackReason(): String {
    val brandText = brand.orEmpty().ifBlank { "这款商品" }
    val categoryText = listOfNotNull(category, subCategory)
        .map { value -> value.trim() }
        .filter { value -> value.isNotBlank() }
        .joinToString(" / ")
        .ifBlank { "当前品类" }
    val availabilityText = if (available) "当前可选" else "当前暂不可选"
    return "$brandText · $categoryText，$availabilityText，可以结合价格、规格和适用场景继续比较。"
}

private fun ProductDetailDto.buildHighlights(excludeReason: String? = null): List<String> {
    val reasonCopy = (excludeReason ?: recommendationReason)?.toCleanDisplayCopy()
    val generatedHighlights = recommendationHighlights
        .mapNotNull { value -> value.toCleanDisplayCopy() }
        .map { value -> value.shortCopy(MAX_HIGHLIGHT_CHARS) }
        .filter { value -> value.isPositiveProductCopy() }
        .filter { value -> !value.isSameCopyAs(reasonCopy) }
        .distinctByNormalized()
        .take(MAX_DETAIL_HIGHLIGHTS)

    if (generatedHighlights.isNotEmpty()) {
        return generatedHighlights
    }

    val displayName = cleanProductDisplayName(
        rawName = name,
        brand = brand,
        category = category,
        subCategory = subCategory,
    )
    val highlights = buildPositiveCandidates(includeMarketingDescription = true)
        .map { value -> value.shortCopy(MAX_HIGHLIGHT_CHARS) }
        .filter { value -> !value.isSameCopyAs(reasonCopy) }
        .filter { value -> !value.isTitleEchoCopy(rawName = name, displayName = displayName, brand = brand) }
        .distinctByNormalized()
        .take(MAX_DETAIL_HIGHLIGHTS)
    return highlights.ifEmpty { listOf("暂无更多商品亮点") }
}

private fun ProductDetailDto.buildSpecs(): List<ProductDetailSpecUi> {
    val specs = listOfNotNull(
        buildAttributeSpec(label = "适用人群", attributeKey = "适用人群"),
        buildAttributeSpec(label = "使用场景", attributeKey = "使用场景"),
        buildSkuSpec(),
        brand?.toCleanDisplayCopy()?.takeIf { value -> value.isNotBlank() }?.let { value ->
            ProductDetailSpecUi(label = "品牌", value = value)
        },
        buildCategorySpec(),
    )

    return specs
        .distinctBy { spec -> spec.label to spec.value }
        .take(MAX_DETAIL_SPECS)
}

private fun ProductDetailDto.buildSuitabilityText(): String {
    val audience = attributes["适用人群"].orEmpty().toSpecValues().firstOrNull()
    val usage = attributes["使用场景"].orEmpty().toSpecValues().firstOrNull()
    val fallbackScenario = buildScenarioCandidates().firstOrNull()
    val caution = buildCautionCandidates().firstOrNull()

    val positiveSentence = when {
        audience != null && usage != null -> "适合$audience，尤其是$usage。"
        audience != null -> "适合$audience，可以结合价格和规格继续比较。"
        usage != null -> "适合${usage}等场景，可以结合规格继续比较。"
        fallbackScenario != null -> "适合${fallbackScenario}场景优先比较。"
        else -> null
    }
    val cautionSentence = caution?.let { value ->
        "如果你${value.shortCopy(18)}，建议先谨慎比较或降低预期。"
    }

    return listOfNotNull(positiveSentence, cautionSentence)
        .joinToString("")
        .ifBlank { "可以结合价格、规格和适用场景继续比较。" }
}

private fun ProductDetailDto.buildDescription(): String {
    val description = marketingDescription
        ?.toReadableSentences()
        ?.filter { sentence -> !sentence.isTemplateLikeProductCopy() }
        ?.take(2)
        ?.joinToString("。")
        ?.shortCopy(MAX_DESCRIPTION_CHARS)
        ?.ensureSentence()

    return description ?: "暂无详细说明"
}

private fun ProductDetailDto.buildPositiveCandidates(
    includeMarketingDescription: Boolean,
): List<String> {
    val marketingSentences = if (includeMarketingDescription) {
        marketingDescription.orEmpty()
            .toReadableClauses()
            .filter { clause -> !clause.isTitleLikeProductIntro(name = name, brand = brand) }
    } else {
        emptyList()
    }
    return (
        pros.toPositiveValues() +
            attributes["核心卖点"].orEmpty().toPositiveValues() +
            recommendWhen.toPositiveValues() +
            marketingSentences.toPositiveValues()
        ).distinctByNormalized()
}

private fun ProductDetailDto.buildScenarioCandidates(): List<String> =
    (
        recommendWhen.toPositiveValues() +
            attributes["使用场景"].orEmpty().toSpecValues() +
            attributes["适用人群"].orEmpty().toSpecValues()
        ).distinctByNormalized()

private fun ProductDetailDto.buildCautionCandidates(): List<String> =
    (
        avoidWhen +
            cons +
            attributes["注意事项"].orEmpty() +
            attributes["不适合"].orEmpty()
        )
        .mapNotNull { value -> value.toCautionCopyOrNull() }
        .distinctByNormalized()

private fun ProductDetailDto.buildAttributeSpec(
    label: String,
    attributeKey: String,
): ProductDetailSpecUi? {
    val value = attributes[attributeKey]
        .orEmpty()
        .toSpecValues()
        .take(2)
        .joinToString(" / ")
    return value.takeIf { it.isNotBlank() }?.let {
        ProductDetailSpecUi(label = label, value = it)
    }
}

private fun ProductDetailDto.buildSkuSpec(): ProductDetailSpecUi? {
    val value = skus
        .mapNotNull { sku -> sku.toSpecSummaryOrNull() }
        .distinctByNormalized()
        .take(2)
        .joinToString(" / ")
    return value.takeIf { it.isNotBlank() }?.let {
        ProductDetailSpecUi(label = "规格", value = it)
    }
}

private fun ProductDetailDto.buildCategorySpec(): ProductDetailSpecUi? {
    val value = listOfNotNull(category, subCategory)
        .map { categoryValue -> categoryValue.toCleanDisplayCopy() }
        .filter { categoryValue -> categoryValue.isNotBlank() }
        .joinToString(" / ")
    return value.takeIf { it.isNotBlank() }?.let {
        ProductDetailSpecUi(label = "品类", value = it)
    }
}

private fun ProductSkuDto.toSpecSummaryOrNull(): String? {
    val values = attributes.values
        .map { value -> value.toCleanDisplayCopy() }
        .filter { value -> value.isNotBlank() }
    return (values + listOfNotNull(optionName, name).map { value -> value.toCleanDisplayCopy() })
        .firstOrNull { value -> value.isNotBlank() }
}

private fun ProductDetailDto.resolveProductImageRes(): Int {
    return resolveProductPlaceholder(
        listOf(id, name, brand, category, subCategory, imagePath),
    )
}

private fun Iterable<String>.toPositiveValues(): List<String> =
    map { value -> value.toCleanDisplayCopy() }
        .filter { value -> value.isPositiveProductCopy() }
        .map { value -> value.shortCopy(MAX_HIGHLIGHT_CHARS) }

private fun Iterable<String>.toSpecValues(): List<String> =
    map { value -> value.toCleanDisplayCopy() }
        .filter { value -> value.isNotBlank() && !value.isTemplateLikeProductCopy() }
        .map { value -> value.toCompactSpecValue() }
        .map { value -> value.shortCopy(MAX_SPEC_VALUE_CHARS) }
        .distinctByNormalized()

private fun String.toCleanDisplayCopy(): String =
    replace(WhitespaceRegex, " ")
        .replace("，不应替代医疗建议", "")
        .replace("不应替代医疗建议", "")
        .trim()
        .replace(LeadingCopyPrefixRegex, "")
        .replace(LeadingMarketingPrefixRegex, "")
        .trim(' ', '。', '；', ';')

private fun String.toCompactSpecValue(): String {
    val compact = removeSuffix("的人群")
        .removeSuffix("用户")
        .removeSuffix("人群")
    return compact.ifBlank { this }
}

private fun String.toCautionCopyOrNull(): String? {
    val value = toCleanDisplayCopy()
    return value.takeIf {
        it.isNotBlank() &&
            !it.isTemplateLikeProductCopy() &&
            it !in listOf("希望获得医疗效果的用户")
    }
}

private fun String.isPositiveProductCopy(): Boolean =
    isNotBlank() && !isTemplateLikeProductCopy() && !containsCautionCopy()

private fun String.isTemplateLikeProductCopy(): Boolean {
    val value = toCleanDisplayCopy()
    return TemplateCopyMarkers.any { marker -> value.contains(marker) }
}

private fun String.containsCautionCopy(): Boolean {
    val value = toCleanDisplayCopy()
    return CautionCopyMarkers.any { marker -> value.contains(marker) }
}

private fun String.toReadableSentences(): List<String> =
    split(SentenceBreakRegex)
        .map { sentence -> sentence.toCleanDisplayCopy() }
        .filter { sentence -> sentence.isNotBlank() }

private fun String.toReadableClauses(): List<String> =
    toReadableSentences()
        .flatMap { sentence -> sentence.split(ClauseBreakRegex) }
        .map { clause -> clause.toCleanDisplayCopy() }
        .filter { clause -> clause.isNotBlank() }

private fun String.shortCopy(maxChars: Int): String =
    safeShortCopy(maxChars)

private fun String.shortenForSentence(maxChars: Int): String =
    safeShortCopy(maxChars).trimEnd('、', '，', ',', '。', '；', ';')

private fun String.ensureSentence(): String =
    if (endsWith("。") || endsWith("！") || endsWith("？")) this else "$this。"

private fun String.safeShortCopy(maxChars: Int): String {
    val value = toCleanDisplayCopy()
    if (value.length <= maxChars && !value.hasDanglingParenthetical()) {
        return value
    }

    val withoutParenthetical = value
        .replace(ParentheticalRegex, "")
        .replace(WhitespaceRegex, " ")
        .trim()
        .trimEnd('、', '，', ',', '。', '；', ';')
    val candidate = if (withoutParenthetical.isNotBlank()) withoutParenthetical else value

    if (candidate.length <= maxChars && !candidate.hasDanglingParenthetical()) {
        return candidate
    }

    return candidate
        .take(maxChars)
        .trimEnd('、', '，', ',', '。', '；', ';')
        .dropDanglingParenthetical()
}

private fun String.dropDanglingParenthetical(): String {
    val openIndex = maxOf(lastIndexOf('（'), lastIndexOf('('))
    val closeIndex = maxOf(lastIndexOf('）'), lastIndexOf(')'))
    val value = if (openIndex > closeIndex) take(openIndex) else this
    return value.trim().trimEnd('、', '，', ',', '。', '；', ';')
}

private fun String.hasDanglingParenthetical(): Boolean {
    val openIndex = maxOf(lastIndexOf('（'), lastIndexOf('('))
    val closeIndex = maxOf(lastIndexOf('）'), lastIndexOf(')'))
    return openIndex > closeIndex
}

private fun String.isTitleLikeProductIntro(name: String, brand: String?): Boolean {
    val value = toCleanDisplayCopy()
    val brandText = brand.orEmpty().trim()
    return (name.isNotBlank() && value.startsWith(name.take(8)) && value.contains("是")) ||
        (brandText.isNotBlank() && value.startsWith(brandText) && value.contains("是"))
}

private fun String?.isSameCopyAs(other: String?): Boolean {
    if (this.isNullOrBlank() || other.isNullOrBlank()) return false
    val left = orEmpty().normalizeDisplayFact().lowercase(Locale.US).trim()
    val right = other.orEmpty().normalizeDisplayFact().lowercase(Locale.US).trim()
    return left == right || left.contains(right) || right.contains(left)
}

private fun String.isTitleEchoCopy(
    rawName: String,
    displayName: String,
    brand: String?,
): Boolean {
    val value = normalizeDisplayFact()
    if (value.length < 5) return false

    val candidates = listOf(rawName, displayName, brand.orEmpty())
        .map { candidate -> candidate.normalizeDisplayFact() }
        .filter { candidate -> candidate.length >= 4 }

    return candidates.any { candidate ->
        value == candidate ||
            value.startsWith(candidate) ||
            (
                value.length >= 8 &&
                    value.length >= candidate.length * 0.6f &&
                    candidate.startsWith(value)
                )
    }
}

private fun String.normalizeDisplayFact(): String =
    toCleanDisplayCopy()
        .removePrefix("适合")
        .replace(WhitespaceRegex, "")
        .replace("。", "")
        .replace("，", "")
        .replace(",", "")
        .trim()

private fun Iterable<String>.distinctByNormalized(): List<String> =
    distinctBy { value -> value.lowercase(Locale.US).trim() }
