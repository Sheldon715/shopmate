package com.shopmate.app.data.products

private const val MAX_PRODUCT_DISPLAY_NAME_CHARS = 22

private val ProductTypeMarkers = listOf(
    "黑白激光一体机",
    "墨仓式一体机",
    "加墨式一体机",
    "真无线蓝牙耳机",
    "多功能早餐机",
    "壁挂式空调",
    "空气净化器",
    "即热饮水机",
    "台式净饮机",
    "无线吸尘器",
    "滚筒洗衣机",
    "人体工学椅",
    "电动升降桌",
    "多功能双肩背包",
    "空气炸锅",
    "养生壶",
    "电炖盅",
    "破壁料理机",
    "智能电饭煲",
    "防晒乳",
    "隔离露",
    "特护霜",
    "修复霜",
    "肌底液",
    "精华露",
    "精华液",
    "化妆水",
    "爽肤水",
    "洁面乳",
    "蜜粉饼",
    "粉底液",
    "卸妆油",
    "唇釉",
    "眼霜",
    "面膜",
    "眉笔",
    "短袖上衣",
    "速干短袖",
    "运动长裤",
    "运动短裤",
    "跑步鞋",
    "篮球鞋",
    "徒步鞋",
    "瑜伽裤",
    "户外裤",
    "双肩背包",
    "棒球帽",
    "鸭舌帽",
    "智能手机",
    "专业版",
    "标准版",
    "旗舰版",
    "青春版",
    "轻享版",
    "笔记本电脑",
    "平板电脑",
    "显示器",
    "无线键盘",
    "机械键盘",
    "笔记本",
    "文件框",
    "文件柜",
    "收纳盒",
    "活页笔记本",
    "方便面",
    "气泡水",
    "功能饮料",
    "纯牛奶",
    "酸牛奶",
    "乌龙茶",
    "茉莉花茶",
    "黑咖啡",
    "速溶咖啡",
    "生抽",
    "老抽",
    "每日坚果",
    "肉松饼",
    "沐浴露",
    "身体乳",
    "护臀膏",
    "辅食勺",
    "安全勺",
    "叉勺套装",
    "婴儿睡袋",
    "布书",
    "叠叠杯",
    "健身架",
    "婴儿推车",
).sortedByDescending { marker -> marker.length }

private val DescriptorSuffixMarkers = listOf(
    "高倍",
    "修护",
    "提亮",
    "控油",
    "防水",
    "防汗",
    "清爽",
    "户外",
    "面部",
    "身体",
    "敏感肌",
    "易敏肌",
    "适用",
    "保湿",
    "补水",
    "淡纹",
    "紧致",
    "抗初老",
    "抗皱",
    "维稳",
    "强韧",
    "细腻",
    "毛孔",
    "肤色",
    "温和",
    "清洁",
    "洁面",
    "底妆",
    "持妆",
    "遮瑕",
    "定妆",
    "显色",
    "防晕染",
    "持久",
    "轻薄",
    "水感",
    "大容量",
    "便携",
    "经典",
    "家用",
    "厨房",
    "早餐",
    "一人食",
)

fun cleanProductDisplayName(
    rawName: String,
    brand: String?,
    category: String?,
    subCategory: String?,
): String {
    val value = rawName.cleanDisplayWhitespace()
    if (value.isBlank()) return "未命名商品"

    val brandText = brand.orEmpty().cleanDisplayWhitespace()
    val coreStart = if (brandText.isNotBlank() && value.startsWith(brandText)) {
        brandText.length
    } else {
        0
    }
    val categoryMarkers = listOfNotNull(category, subCategory)
        .flatMap { marker -> marker.cleanDisplayWhitespace().split("/", " ") }
        .filter { marker -> marker.length >= 2 }

    val productTypeCandidate = value.extractThroughFirstMarker(
        markers = ProductTypeMarkers,
        startIndex = coreStart,
        includeMarker = true,
    )
    if (productTypeCandidate != null) {
        return productTypeCandidate.shortenProductDisplayName()
    }

    val categoryCandidate = value.extractThroughFirstMarker(
        markers = categoryMarkers,
        startIndex = coreStart,
        includeMarker = true,
    )
    if (categoryCandidate != null) {
        return categoryCandidate.shortenProductDisplayName()
    }

    val markerIndex = DescriptorSuffixMarkers
        .asSequence()
        .mapNotNull { marker ->
            value.indexOf(marker, startIndex = coreStart).takeIf { index -> index > coreStart }
        }
        .filter { index -> index >= minOf(value.length, coreStart + 4) }
        .minOrNull()

    val candidate = markerIndex
        ?.let { index -> value.take(index) }
        ?.trimProductNameSeparators()
        ?.takeIf { name -> name.length >= 4 }
        ?: value

    return candidate
        .trimProductNameSeparators()
        .shortenProductDisplayName()
        .ifBlank { value.shortenProductDisplayName() }
}

fun buildFallbackDisplayTags(
    tags: List<String>,
    recommendationReason: String?,
    category: String?,
    subCategory: String?,
): List<String> {
    val cleanedTags = tags
        .map { tag -> tag.cleanDisplayWhitespace() }
        .filter { tag -> tag.isNotBlank() && !tag.isWeakDisplayTag(category, subCategory) }
        .distinctBy { tag -> tag.lowercase() }

    if (cleanedTags.isNotEmpty()) {
        return cleanedTags
    }

    return emptyList()
}

private fun String.extractThroughFirstMarker(
    markers: List<String>,
    startIndex: Int,
    includeMarker: Boolean,
): String? {
    val end = markers
        .mapNotNull { marker ->
            val index = indexOf(marker, startIndex = startIndex)
            if (index < startIndex) {
                null
            } else if (includeMarker) {
                index + marker.length
            } else {
                index
            }
        }
        .minOrNull()

    return end
        ?.let { index -> take(index) }
        ?.trimProductNameSeparators()
        ?.takeIf { name -> name.length >= 4 }
}

private fun String.cleanDisplayWhitespace(): String =
    replace("\\s+".toRegex(), " ").trim()

private fun String.trimProductNameSeparators(): String =
    trim(' ', '·', '-', '_', '/', '｜', '|', '，', ',', '。', '；', ';')

private fun String.isWeakDisplayTag(category: String?, subCategory: String?): Boolean {
    val normalized = cleanDisplayWhitespace().replace("\\s+".toRegex(), "")
    val weakTags = listOfNotNull(
        category,
        subCategory,
        "商品",
        "主图",
        "占位图",
        "功效描述明确",
        "适用场景清楚",
        "适用场景明确",
        "场景明确",
        "场景清楚",
        "便于按肤质筛选",
        "按肤质筛选",
        "日常护肤用户",
        "关注肤感的人群",
        "成分敏感用户",
        "日常护理",
        "换季护理",
        "送礼",
        "口味信息明确",
        "规格容易比较",
        "规格选择清楚",
        "场景适用性强",
        "配置清晰",
        "SKU 选择较多",
        "适合参数比较",
    )
        .map { tag -> tag.cleanDisplayWhitespace().replace("\\s+".toRegex(), "") }

    return normalized.isBlank() || weakTags.any { weakTag ->
        weakTag.isNotBlank() && (normalized == weakTag || normalized == "适合$weakTag")
    }
}

private fun String.shortenProductDisplayName(): String {
    if (length <= MAX_PRODUCT_DISPLAY_NAME_CHARS) return this
    val softBreak = listOf("（", "(", " ", "·", "-", "｜", "|")
        .map { marker -> indexOf(marker) }
        .filter { index -> index in 4..MAX_PRODUCT_DISPLAY_NAME_CHARS }
        .minOrNull()
    return take(softBreak ?: MAX_PRODUCT_DISPLAY_NAME_CHARS)
        .trimProductNameSeparators()
}
