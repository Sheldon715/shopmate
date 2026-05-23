# Android Mock UI Data

## 概述

为 Figma 页面还原准备一小组 Android 本地 mock UI 数据。它用于驱动主聊天入口、推荐结果、商品详情和购物车等页面，先保证 UI 可以完整展示和点击，不等待后端、数据库或导师原始数据处理。

## 需求

- 新增轻量 UI model，只包含当前 Figma 页面需要展示的字段。
- 新增本地 mock data 文件，提供：
  - 主聊天入口 prompt suggestions
  - 蓝牙耳机推荐商品
  - 护肤品 / 防晒相关商品
  - 商品详情样例
  - 购物车样例 item
- mock 数据只服务 UI，不直接等同于后端 DTO 或数据库 schema。
- 不接 PostgreSQL、Qdrant、RAG、网络请求或 repository 层。
- 导师给的真实 data 可以先放在 `data/raw/`，但本 spec 不依赖它。

## 文件

预计新增 Android 文件：

- `client/android/app/src/main/java/com/shopmate/app/ui/model/PromptSuggestionUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductCardUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductDetailUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/CartItemUi.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`

后续页面会使用这些数据：

- `client/android/app/src/main/java/com/shopmate/app/ui/home/HomeChatEntryScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/cart/CartScreen.kt`

## 数据内容

Prompt suggestions 至少包含：

- `推荐适合油皮的护肤品`
- `200 元以内的蓝牙耳机`
- `帮我对比这两款商品`
- `拍照找同款`

商品 mock 至少包含：

- `漫步者 Zero Air 真无线蓝牙耳机`，价格 `¥179`
- `QCY T13 X 真无线蓝牙耳机`，价格 `¥149`
- `小米 Redmi Buds 4 青春版`，价格 `¥129`
- `玻尿酸保湿精华补水修护精华液`，价格 `¥199`
- `理肤泉 清透防晒乳 SPF50+ PA++++`，价格 `¥168`

每个商品应支持：

- id
- name
- priceText
- image resource name 或 drawable id
- tags
- recommendation reason

## 备注

- 图片资源可以先复用已有 mascot 或临时简单 drawable；真实商品图后续单独处理。
- 不要在 model 中塞入后端字段，如库存表结构、embedding 字段或数据库 id 规则。
- 如果字段开始变复杂，优先保持 UI model 简单，等 contract spec 再反推后端 response。

## 验收标准

- 存在可复用 UI model 和 `MockShopMateData`。
- mock 数据能覆盖主聊天入口、推荐结果、详情和购物车的第一轮页面实现。
- 不需要真实后端或导师数据即可渲染 UI。
- `cd client/android && .\gradlew.bat build` 通过。
