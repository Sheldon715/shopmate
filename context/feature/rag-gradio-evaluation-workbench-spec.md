# RAG Gradio Evaluation Workbench Spec

## 1. 背景

ShopMate 当前已经有多套 RAG 测试材料：

- 离线检索 case：`data/processed/rag/evaluation-cases.json`
- Chat SSE case：`data/processed/rag/chat-evaluation-cases.json`
- 人工评分测试集草案：`rag_agent_test_cases.md`
- 多轮评估报告：`docs/rag-evaluation-*.md`

随着 negative constraint、comparison、query rewrite、negative fact metadata 等能力完成，RAG 评估已经从“跑几条命令看 pass / fail”变成“维护测试集、反复跑、人工打分、比较不同版本”的工作。

本 spec 建立一个本地 Gradio 内部评估工作台。它不是正式用户界面，也不是 Android 替代品，而是用于开发和答辩准备阶段：

- 批量运行测试集
- 查看中文评估指标
- 人工评分和标注失败类型
- 可选使用 LLM 初评
- 单条调试时查看检索证据 / 发送给 LLM 的上下文

## 2. 目标

- 新增本地 Gradio 工具，界面语言使用中文。
- 支持上传 CSV 测试集，并校验字段格式。
- 支持批量调用现有 `POST /api/chat/stream` 运行 Chat SSE 测试。
- 支持人工 0-5 分评分，记录通过 / 失败 / 可接受。
- 支持可选 LLM 初评，LLM 初评只作为建议，不覆盖人工最终分数。
- 展示批量评估看板：通过率、平均分、商品命中率、约束通过率、幻觉次数、安全风险次数、失败类型分布等。
- 展示单条调试聊天页：左侧聊天，右侧“检索证据 / 发送给 LLM 的上下文”。
- 保存每轮运行结果到本地 JSONL / CSV，便于后续比较 baseline、query rewrite、negative metadata、future rerank。

## 3. 非目标

本 feature 不做以下事情：

- 不改 Android 正式 UI。
- 不替代 `POST /api/chat/stream` 正式接口。
- 不实现 29 query expansion / rerank。
- 不把 Gradio 接入生产环境。
- 不新增登录 / 权限系统。
- 不在 UI 中展示真实 API key、数据库 URL、`.env`、完整 prompt 或 provider 原始敏感错误。
- 不允许在 Gradio 中修改正式商品数据、RAG documents、Qdrant index 或 prompt。
- 不让 LLM judge 成为唯一评分来源。

## 4. 页面结构

第一版做两个页面。

### 4.1 批量评估看板

中文页面名：`批量评估`

用途：上传测试集，批量运行，查看总体结果。

主要区域：

- `测试集上传`
  - 上传 CSV。
  - 显示字段校验结果。
  - 提供 CSV 模板下载。
  - 显示用例预览表。
- `运行设置`
  - 后端地址，默认 `http://localhost:3000`。
  - 运行范围：全部用例 / 选中用例 / 单个分组。
  - 运行模式：Chat SSE。
  - 是否启用 LLM 初评。
  - 是否保存运行结果。
- `总体指标`
  - 用例总数
  - 通过率
  - 平均人工分
  - LLM 建议平均分
  - 商品命中率
  - 约束通过率
  - 幻觉次数
  - 安全风险次数
  - 对比成功率
  - 无结果正确率
- `图表`
  - 按分组平均分
  - 失败类型分布
  - 通过 / 可接受 / 失败数量
  - fallbackReason 分布
- `结果表`
  - 每个 case 的问题、期望、返回商品、assistant 摘要、分数、失败类型、备注。
  - 支持选中某一行进入单条调试。
- `导出`
  - 导出 JSONL。
  - 导出 CSV。

### 4.2 单条调试聊天

中文页面名：`单条调试`

用途：像聊天一样测试单个问题，并查看后端可观测证据。

左侧：`聊天`

- 输入用户问题。
- 显示 SSE 流式 assistant 文本。
- 显示商品卡片摘要。
- 显示 `comparison_result` 摘要。
- 显示 `cartAction` 摘要。
- 支持把当前问题保存为测试 case 草稿。

右侧：`检索证据 / 发送给 LLM 的上下文`

需要展示：

- 原始问题
- retrieval query / query rewrite 状态
- filters / negative constraints
- returnedProductIds
- fallbackUsed / fallbackReason
- cartAction
- comparison_result product ids
- 当前返回商品的 PostgreSQL 商品事实摘要
- 如可用，展示 Qdrant retrieved chunks：
  - productId
  - docId
  - score
  - docType / blockType
  - snippet
  - metadata：`freeFromTerms`、`riskTerms`、`wearingStyles`

说明：

- 这里不要命名为 `LLM References`，因为我们不能证明模型内部最终引用了哪条信息。
- 正确命名是 `检索证据 / 发送给 LLM 的上下文`。
- 如果 V1 只能拿到 SSE done payload 和 product cards，就先展示这些稳定字段。
- 完整 retrieved chunks 可通过本地 debug helper 或 `rag:search` 补充，但不能暴露完整 prompt 或真实密钥。

## 5. CSV 测试集格式

V1 首选 CSV，因为它适合用 Excel / WPS / Google Sheets 维护。

### 5.1 必需列

CSV 第一版使用中文列名：

| 列名 | 说明 |
| --- | --- |
| `用例ID` | 稳定 id，例如 `B02` |
| `分组` | `事实问答` / `推荐决策` / `多商品对比` / `避坑反选` / `图片信息` / `抗幻觉` |
| `问题` | 用户原始问题 |
| `期望商品ID任一` | 命中任一即算商品命中；多个用 `|` 分隔 |
| `禁止商品ID` | 不应返回的商品；多个用 `|` 分隔 |
| `期望答案要点` | 应覆盖的回答要点；多个用 `|` 分隔 |
| `硬约束` | 预算、品类、否定条件、安全边界等；多个用 `|` 分隔 |
| `关注失败类型` | F1-F10；多个用 `,` 分隔 |
| `优先级` | `P0` / `P1` / `P2` |
| `备注` | 可选说明 |

### 5.2 示例

```csv
用例ID,分组,问题,期望商品ID任一,禁止商品ID,期望答案要点,硬约束,关注失败类型,优先级,备注
B02,推荐决策,"我在宿舍用，想买一个安静、便宜的键盘，推荐哪个？",p_office_keyboard_002,p_office_keyboard_003,"推荐 Logitech K380|说明价格低|说明声音低或适合宿舍|提醒手感偏软","宿舍|安静|便宜","F1,F2,F4,F5",P0,宿舍安静键盘
F01,抗幻觉,"现在这个商品实时库存还有多少？",,,"说明知识库没有实时库存数量|不能编造具体库存","禁止实时库存幻觉","F6",P0,实时信息边界
```

### 5.3 字段规则

- CSV 使用 UTF-8。
- 多值字段默认用 `|` 分隔。
- `关注失败类型` 用 `,` 分隔。
- 空字段允许存在，但 `用例ID`、`分组`、`问题` 必须非空。
- V1 可以支持英文列名 alias，但中文列名是默认模板。

## 6. 评分方式

### 6.1 人工评分

人工评分是最终分数。

每个 case 0-5 分：

| 分数 | 中文含义 |
| --- | --- |
| 5 | 商品召回正确，事实准确，理由完整，包含注意事项，无幻觉 |
| 4 | 商品正确，事实基本准确，但解释略少 |
| 3 | 商品方向正确，但漏掉重要约束或注意事项 |
| 2 | 部分正确，但推荐不够贴合需求 |
| 1 | 有明显事实错误或推荐错误 |
| 0 | 完全答非所问、严重幻觉、编造实时信息或安全风险严重 |

通过线：

- `>= 4`：通过
- `3`：可接受但需优化
- `< 3`：失败

### 6.2 LLM 初评

LLM 初评可以在 V1 中实现，但必须满足：

- 默认可关闭。
- 只作为建议分数和建议失败类型。
- 人工确认后才写入最终分数。
- judge prompt 不能包含真实 API key、完整系统 prompt 或 provider 原始错误。
- judge 只能基于测试 case、assistant 输出、returned product ids 和可展示证据判断。

LLM 初评输出建议：

```json
{
  "suggestedScore": 4,
  "suggestedStatus": "通过",
  "suggestedFailureTypes": ["F5"],
  "notes": "商品命中正确，但注意事项较少。"
}
```

## 7. 失败类型

沿用 `rag_agent_test_cases.md` 的 F1-F10，并在 UI 中使用中文展示：

| 类型 | 中文名 | 判定 |
| --- | --- | --- |
| F1 | 检索失败 | 知识库中存在明确商品，但没有召回或推荐 |
| F2 | 商品错误 | 推荐了不符合品类、预算、场景、适用人群的商品 |
| F3 | 事实错误 | 价格、SKU、品牌、品类、商品 ID、适用场景说错 |
| F4 | 约束遗漏 | 明确预算、用途、避坑条件没有遵守 |
| F5 | 解释不完整 | 完全不提缺点、注意事项或不适用场景 |
| F6 | 幻觉编造 | 编造实时库存、销量、榜单、今日优惠等 |
| F7 | 对比逻辑差 | 多商品对比时没有说清适合谁、不适合谁 |
| F8 | 拒答不足 | 知识库没有信息时仍硬编答案 |
| F9 | 安全风险 | 美妆护肤、母婴等给出医疗功效承诺或绝对化建议 |
| F10 | 图片误判 | 根据占位图编造真实外观、颜色、材质细节 |

## 8. V1 指标

V1 使用中文指标名。

必须实现：

- `用例总数`
- `通过率`
- `平均人工分`
- `LLM 建议平均分`
- `商品命中率`
- `约束通过率`
- `幻觉次数`
- `安全风险次数`
- `失败类型分布`
- `fallback 分布`

推荐实现：

- `答案要点覆盖率`
- `对比成功率`
- `无结果正确率`
- `平均总耗时`
- `首个消息耗时`

V1 不强制实现：

- Recall@K
- MRR
- nDCG
- 多策略 win / loss / tie

这些留给 V2 / V3，因为它们需要更稳定的 expected relevance 标注和策略对比结果。

## 9. 运行结果格式

每轮运行生成一个 run id，例如：

```text
rag_eval_20260603_153012
```

建议输出：

```text
data/processed/rag/gradio-runs/<run-id>/cases.csv
data/processed/rag/gradio-runs/<run-id>/results.jsonl
data/processed/rag/gradio-runs/<run-id>/summary.json
```

`results.jsonl` 每行至少包含：

```json
{
  "runId": "rag_eval_20260603_153012",
  "caseId": "B02",
  "group": "推荐决策",
  "query": "我在宿舍用，想买一个安静、便宜的键盘，推荐哪个？",
  "assistantText": "...",
  "returnedProductIds": ["p_office_keyboard_002"],
  "comparisonProductIds": [],
  "fallbackUsed": false,
  "fallbackReason": null,
  "cartAction": null,
  "eventNames": ["message_delta", "product_cards", "done"],
  "manualScore": 4,
  "manualStatus": "通过",
  "manualFailureTypes": ["F5"],
  "judgeSuggestedScore": 4,
  "judgeSuggestedFailureTypes": ["F5"],
  "notes": "商品正确，注意事项略少。",
  "generatedAt": "2026-06-03T00:00:00.000Z"
}
```

## 10. 实现范围建议

建议新增独立工具目录：

```text
tools/rag-evaluation-workbench/
```

可能包含：

```text
tools/rag-evaluation-workbench/app.py
tools/rag-evaluation-workbench/requirements.txt
tools/rag-evaluation-workbench/README.md
tools/rag-evaluation-workbench/sample-cases.csv
```

职责：

- Gradio UI。
- CSV 解析和校验。
- 调用本地 ShopMate backend。
- SSE event 解析。
- LLM judge 可选调用。
- 本地结果保存。

不建议第一版修改正式 Express API。若必须补充 debug evidence，优先用本地 helper 或只读取现有 SSE / product API 可获得的信息。

## 11. 敏感信息边界

- Gradio UI 不显示 `.env` 内容。
- Gradio UI 不显示真实 API key。
- Gradio UI 不显示完整系统 prompt。
- 错误信息只显示稳定错误摘要，例如 `LLM_ERROR`、`VECTOR_SEARCH_FAILED`。
- 上传测试集只保存在本地 `data/processed/rag/gradio-runs/`。
- 不上传到外部服务。
- LLM judge 如启用，只发送测试问题、模型回答、期望要点和可展示证据，不发送隐藏 prompt 或 provider 原始响应。

## 12. 验证命令

后端需要先可用：

```powershell
cd server
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Gradio 工具建议：

```powershell
cd tools/rag-evaluation-workbench
python -m pip install -r requirements.txt
python app.py --api-base-url http://localhost:3000
```

如果本机没有 Python 或 Gradio 环境：

- 不伪造验证通过。
- 在完成报告里写明 blocker。

## 13. 验收标准

- 能上传中文 CSV 测试集并通过字段校验。
- 能批量运行至少 3 条 Chat SSE case。
- 批量评估页显示中文指标和结果表。
- 单条调试页能展示聊天输出和检索证据摘要。
- 能保存 run results 到本地 JSONL / CSV。
- 人工评分能写入最终结果。
- LLM 初评如启用，只作为建议分数，不覆盖人工评分。
- UI 和结果文件不包含真实 API key、`.env`、完整 prompt 或 provider 原始敏感错误。

## 14. Checklist

- [ ] 新增 Gradio 工具目录。
- [ ] 新增中文 CSV 模板。
- [ ] 实现 CSV 上传和校验。
- [ ] 实现 Chat SSE 批量运行。
- [ ] 实现批量评估中文指标。
- [ ] 实现结果表和导出。
- [ ] 实现单条调试聊天。
- [ ] 实现检索证据 / 上下文面板。
- [ ] 实现人工评分。
- [ ] 实现可选 LLM 初评或保留明确开关。
- [ ] 写 README 和启动命令。
- [ ] 运行最小 smoke test。
