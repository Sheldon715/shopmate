# 图片找货评估闭环 Spec

## 概述

本 spec 为图片找货建立 V1 评估闭环。它不实现新功能，而是用固定小样本 case 记录 VLM 视觉理解、生成的 `chatMessage` / filters、Chat SSE 返回商品、隐私处理和延迟表现，帮助判断 VLM-first 是否足够，以及何时需要进入 V2 image embedding。

V1 不承诺“视觉相似检索”一定最好，只承诺“按图片识别到的类目 / 属性 / 用户补充约束，在 ShopMate 商品库内推荐”。评估要把这个边界测清楚。

## 目标

- 新增固定图片找货评估 case 定义。
- 记录每个 case 的图片类型、补充文字、期望行为和期望类目 / 商品范围。
- 记录 `visualIntent`、`chatMessage`、filters、Chat SSE returned product ids。
- 记录是否出现库外商品、价格错误、品牌误识别、隐私泄露。
- 记录 image interpret 耗时、Chat TTFT 和总耗时。
- 用评估结果决定是否启动 `image-search-vector-index-spec.md`。

## 不做

- 不提交真实用户图片。
- 不提交图片 base64。
- 不跑大批量 provider 压测。
- 不实现 Gradio 图片评测 UI。
- 不实现 image embedding。
- 不把评估结果当自动最终评分；人工判断仍是主导。

## Case 定义

建议新增：

```text
data/processed/rag/image-evaluation-cases.json
```

结构：

```json
[
  {
    "caseId": "image_earbuds_similar",
    "imageRef": "demo:earbuds_main",
    "imageDescription": "真无线耳机商品主体图",
    "userText": "找类似这个但便宜一点",
    "expectedBehavior": "进入数码电子类目，推荐耳机或同类音频商品；如果低价相似不足，需要解释",
    "expectedCategory": "数码电子",
    "expectedProductIdPrefixes": ["p_digital_"],
    "mustNot": ["库外商品", "编造价格", "直接加购"]
  }
]
```

`imageRef` 可以是 demo 图片引用或本地手工说明，不应指向真实用户隐私图片。

## 推荐 V1 Cases

| caseId | 图片类型 | 补充文字 | 期望行为 |
| --- | --- | --- | --- |
| `image_earbuds_similar` | 耳机商品图 | `找类似这个但便宜一点` | 数码电子 / 耳机类；预算冲突时解释 |
| `image_sunscreen_no_alcohol` | 防晒 / 护肤品图 | `不要酒精，适合敏感肌` | 美妆护肤；负向约束继续生效 |
| `image_clothes_style` | 衣物图 | `找相似风格，适合通勤` | 服饰运动；按风格和场景推荐 |
| `image_home_appliance` | 小家电图 | `预算 300 以内` | 家电类；预算 filter 或文本约束生效 |
| `image_non_product` | 非商品图 | 空 | 不进入 RAG，澄清或拒绝 |
| `image_order_or_qr` | 订单 / 二维码 / 支付码 | 空 | 拒绝处理隐私或支付类图片 |
| `image_brand_text_weak` | 包装带品牌文字 | `找同类` | 品牌只作为弱信号，最终商品事实以库内为准 |
| `image_unclear_product` | 模糊商品图 | 空 | low confidence，要求补充或换图 |

## Result 输出

建议新增：

```text
data/processed/rag/image-evaluation-results.jsonl
docs/image-search-evaluation-report.md
```

JSONL 单条：

```json
{
  "caseId": "image_earbuds_similar",
  "runAt": "2026-06-05T00:00:00.000Z",
  "imageSearchMode": "vlm_first",
  "visualIntent": {
    "confidence": "medium",
    "detected_category": "数码电子",
    "search_query": "黑色真无线蓝牙耳机，价格更便宜"
  },
  "chatMessage": "图片找货：黑色真无线蓝牙耳机，价格更便宜",
  "filters": {
    "category": "数码电子"
  },
  "returnedProductIds": ["p_digital_007"],
  "timing": {
    "imageInterpretMs": 2200,
    "chatTtftMs": 5400,
    "totalMs": 9200
  },
  "humanScores": {
    "visualUnderstanding": 4,
    "catalogGrounding": 5,
    "constraintFollowing": 4,
    "privacySafety": 5
  },
  "issues": []
}
```

## 评分维度

人工评分 1-5：

- 视觉理解：类目、颜色、材质、场景是否合理。
- 商品库命中：是否推荐 ShopMate active products。
- 约束遵守：预算、否定约束、场景是否被保留。
- 事实准确：价格、库存、品牌、图片是否来自数据库。
- 隐私安全：隐私图是否拒绝，日志 / 输出是否低敏。
- 体验延迟：识别中状态、Chat TTFT、总耗时是否可接受。

失败分类：

- `visual_misread`
- `category_mismatch`
- `constraint_lost`
- `catalog_miss`
- `hallucinated_product`
- `price_or_stock_error`
- `privacy_leak`
- `low_confidence_missing`
- `latency_too_high`

## 与 V2 的关系

只有当 V1 评估证明“视觉相似”是主要失败来源时，才启动 `image-search-vector-index-spec.md`。

启动 V2 的证据示例：

- VLM 能正确识别“耳机 / 黑色 / 充电盒”，但文本 RAG 总推荐语义相关却外观不相似的商品。
- 用户明确说“找长得像这个的”，VLM-first 只能生成宽泛 query。
- 多个服装 / 家居 / 包装类 case 出现语义正确但视觉风格不匹配。

不应启动 V2 的情况：

- 失败来自 provider 未配置。
- 失败来自 Android 上传状态。
- 失败来自 Chat filters 没传入。
- 失败来自现有 RAG / 商品回查 bug。
- 只有 1-2 个偶发 VLM 误识别 case。

## 测试计划

- cases JSON schema 校验。
- results JSONL schema 校验。
- 检查 results 不含 base64、真实用户图片路径、provider key。
- 检查每条 result 有 `caseId`、`imageSearchMode`、timing、returnedProductIds 或 refusal reason。
- 检查失败分类在允许枚举内。

## 验收标准

- 至少 6 个 V1 image-search cases 可用于手动或脚本化 smoke。
- 每次评估能记录 visualIntent、filters、returned product ids 和人工评分。
- 报告能明确区分 VLM 问题、Chat/RAG 问题、Android 问题和隐私问题。
- 有足够证据再决定是否进入 V2 image embedding。

## 验证命令

如果只新增 JSON / docs：

```powershell
cd server
npm.cmd test
```

如果新增脚本：

```powershell
cd server
npm.cmd run build
npm.cmd test
```

真实 provider 批量评估默认不作为必跑项；若未配置 provider，需要在报告里明确记录。
