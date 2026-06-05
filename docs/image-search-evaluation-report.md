# 图片找货评估报告

## 当前结论

本轮已完成真实 provider V1.1 小样本评估，8 条 case 全部写入 `data/processed/rag/image-evaluation-results.jsonl`，状态为 `needs_review`。这代表真实图片理解与 Chat SSE 已跑通，但人工评分尚未完成。

当前不建议启动 `image-search-vector-index-spec.md`。V1.1 已把图片找货 prompt 和后端类目 normalize 对齐到当前商品库真实类目；此前 `image_home_appliance` 的 `家居日用 -> NO_CANDIDATES` 问题已经恢复为 `家用电器 -> p_home_air_004`。本轮没有出现足够证据证明“视觉相似召回不足”是主要失败来源。

已落地的评估文件：

- `data/processed/rag/image-evaluation-cases.json`
- `data/processed/rag/image-evaluation-results.jsonl`
- `server/src/scripts/validate-image-search-evaluation.ts`

`image-evaluation-results.jsonl` 当前是 live provider 输出，但人工评分字段仍为 `null`。最终通过 / 失败仍需要人工按评分维度确认。

## 评估范围

V1 只评估“图片理解 -> `visualIntent` / `chatMessage` / filters -> Chat SSE / RAG -> PostgreSQL 商品事实回查”的现有链路。

本轮不做：

- 不提交真实用户图片或图片 base64。
- 不实现 image embedding。
- 不实现 Gradio 图片评测 UI。
- 不跑大批量 provider 压测。
- 不把自动分数当最终评分。

## Case 覆盖

| caseId | 目标 | 期望结果 |
| --- | --- | --- |
| `image_earbuds_similar` | 耳机商品图，相似且更便宜 | 数码电子库内候选；预算冲突时解释 |
| `image_sunscreen_no_alcohol` | 防晒 / 护肤品图，不要酒精 | 美妆护肤库内候选；负向约束继续生效 |
| `image_clothes_style` | 通勤风衣物图 | 服饰运动库内候选；记录视觉风格是否不足 |
| `image_home_appliance` | 小家电图，预算 300 以内 | 家用电器库内候选或明确无匹配 |
| `image_non_product` | 非商品图 | 澄清或拒绝，不进入 RAG |
| `image_order_or_qr` | 订单 / 二维码 / 支付码 | 拒绝隐私或支付类图片 |
| `image_brand_text_weak` | 包装带品牌文字 | 品牌只作弱信号，商品事实以库内为准 |
| `image_unclear_product` | 模糊商品图 | low confidence，要求补充或换图 |

## Live Run 摘要

运行时间：2026-06-05。

| caseId | VLM 置信度 / 类目 | Chat/RAG 结果 | 耗时 |
| --- | --- | --- | --- |
| `image_earbuds_similar` | high / 数码电子 | `p_digital_007`, `p_digital_018` | image 11.28s, TTFT 21.87s, total 33.15s |
| `image_sunscreen_no_alcohol` | high / 美妆护肤 | `p_beauty_006` | image 11.27s, TTFT 12.51s, total 24.05s |
| `image_clothes_style` | high / 服饰运动 | `p_clothes_001` | image 11.66s, TTFT 7.04s, total 19.01s |
| `image_home_appliance` | high / 家用电器 | `p_home_air_004` | image 11.46s, TTFT 10.60s, total 22.26s |
| `image_non_product` | low / null | 澄清：要求上传清晰商品主体图 | image 11.46s, total 11.47s |
| `image_order_or_qr` | low / null | 拒绝：二维码隐私风险 | image 4.64s, total 4.64s |
| `image_brand_text_weak` | high / 美妆护肤 | `p_beauty_023`, `p_beauty_006`, `p_beauty_010` | image 12.09s, TTFT 17.60s, total 29.69s |
| `image_unclear_product` | low / null | 澄清：无法识别有效商品主体 | image 10.02s, total 10.02s |

平均耗时：

- 图片理解平均约 10.48s。
- 进入 Chat SSE 的 5 条 case，Chat TTFT 平均约 13.92s。
- 8 条总耗时平均约 19.28s。

## 初步归因

- `image_earbuds_similar`、`image_sunscreen_no_alcohol`、`image_clothes_style`、`image_home_appliance` 和 `image_brand_text_weak` 形成了完整 VLM-first -> Chat SSE -> 库内商品闭环。
- V1.1 类目对齐修复有效：小家电图从 `NO_CANDIDATES` 恢复为库内商品 `p_home_air_004`。
- `image_order_or_qr` 和 `image_unclear_product` 达到隐私 / 低置信拦截预期。
- `image_non_product` 没有进入 Chat/RAG，但 `visualIntent.is_product_search` 为 `true` 且 `confidence=low`，需要人工确认是否接受这种低置信澄清形态，或要求 provider 对非商品图明确输出 `is_product_search=false`。
- `image_brand_text_weak` 结果中 `detected_brand_text` 存在，但 filters 只保留类目，符合“品牌弱信号、商品事实以库内为准”的 V1 边界。

## 记录字段

每条结果需要记录：

- `visualIntent`
- `chatMessage`
- `filters`
- `returnedProductIds` 或 `refusalReason`
- `timing.imageInterpretMs`
- `timing.chatTtftMs`
- `timing.totalMs`
- `humanScores`
- `issues`
- `notes`

失败分类限定为：

- `visual_misread`
- `category_mismatch`
- `constraint_lost`
- `catalog_miss`
- `hallucinated_product`
- `price_or_stock_error`
- `privacy_leak`
- `low_confidence_missing`
- `latency_too_high`

## V2 启动判断

只有出现足够证据说明“视觉相似召回不足”是主要失败来源，才启动 `image-search-vector-index-spec.md`。

可以作为 V2 证据：

- VLM 能正确识别耳机、颜色、充电盒，但文本 RAG 总推荐语义相关却外观不相似的商品。
- 用户明确要求“找长得像这个的”，VLM-first 只能生成宽泛 query。
- 多个服装、家居、包装类 case 语义正确但视觉风格不匹配。

不能作为 V2 证据：

- provider 未配置。
- Android 上传状态错误。
- Chat filters 没传入。
- 现有 RAG 或商品回查 bug。
- 只有 1-2 个偶发 VLM 误识别 case。

## 验证记录

已运行：

```powershell
cd server
npm.cmd run image-search:evaluation:validate
npm.cmd test
npm.cmd run build
```

真实 provider 批量评估：已运行。输出文件为 `data/processed/rag/image-evaluation-results.jsonl`；所有 live result 仍需人工评分。
