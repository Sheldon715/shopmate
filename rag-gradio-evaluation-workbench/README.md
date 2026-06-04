# ShopMate RAG Gradio Evaluation Workbench

本目录是本地内部评估工具，不是 Android 正式 UI，也不接入生产环境。它通过现有 `POST /api/chat/stream` 跑 Chat SSE case，打开后默认展示一键评估仪表盘。

## 启动

先启动后端：

```powershell
cd server
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

再启动 Gradio：

```powershell
cd rag-gradio-evaluation-workbench
python -m pip install -r requirements.txt
python app.py --api-base-url http://localhost:3000
```

默认地址是 `http://127.0.0.1:7860`。

如果之前已经开着 Gradio，改完代码或切换参数后先在终端按 `Ctrl+C` 停掉，再重新运行上面的命令。Gradio 的下载文件白名单是在启动时注册的。

## 常见报错

如果终端出现 `InvalidPathError: Cannot move ... results.jsonl to the gradio cache dir`，含义是 Gradio 拦截了下载文件路径。评估结果实际已经写入 `data/processed/rag/gradio-runs/<run-id>/`，只是页面想返回 `results.jsonl` / `results.csv` / `summary.json` 时，Gradio 发现它们不在当前工作目录或允许目录里。

当前版本启动时会自动把 `rag-gradio-evaluation-workbench/` 和 `data/processed/rag/gradio-runs/` 加入 `allowed_paths`。如果仍看到同类报错，先确认正在运行的是最新 `app.py`，然后重启 Gradio。

## 日常使用

打开页面后停留在 `评估仪表盘`：

1. 点 `运行评估`。
2. 直接看页面上的首 token、答案质量、商品命中率、约束通过率、MRR、nDCG、要点覆盖和分组图表。
3. 需要人工复核时，在页面下方给单条 case 打 0-5 分。

默认会使用 `sample-cases.csv` 和 `http://localhost:3000`，不用手动填写后端地址。只有要换测试集、只跑某个分组 / 单个用例、改超时、关闭自动初评分或查看留档文件时，才打开 `高级设置`。

## CSV 格式

默认模板是 `sample-cases.csv`，使用 UTF-8，中文列名：

```text
用例ID,分组,问题,期望商品ID任一,禁止商品ID,期望答案要点,硬约束,关注失败类型,优先级,备注
```

多值字段用 `|` 分隔，`关注失败类型` 用 `,` 分隔。`用例ID`、`分组`、`问题` 必填。

`硬约束` 可以写普通中文说明，也可以写少量后端 filter helper：

```text
category=美妆护肤|subCategory=防晒|availableOnly|avoidTerms=酒精|maxPriceCents=20000
```

## 功能

- `评估仪表盘`：默认一键运行 sample cases，在页面直接展示分数、分布图和每条用例结果。
- `高级设置`：可选上传 CSV、校验字段、预览用例、按全部 / 分组 / 单个用例运行 Chat SSE。
- `总体指标`：展示用例总数、平均首 token、P95 首 token、平均总耗时、自动 / 人工平均分、商品命中率、约束通过率、MRR、nDCG、要点覆盖率、幻觉次数、安全风险次数、失败类型分布和 fallback 分布。
- `人工评分`：按用例 ID 写入 0-5 分、通过 / 可接受 / 失败、失败类型和备注。人工分数是最终分数。
- `自动初评`：默认开启。未配置 judge key 时使用本地启发式规则；配置后可使用 LLM judge。初评只写建议分数、建议失败类型和 notes，不覆盖人工评分。
- `单条调试`：左侧显示 Chat SSE 输出，右侧显示“检索证据 / 发送给 LLM 的上下文”，包括 retrieval、returnedProductIds、fallbackReason、cartAction、comparison_result 和可安全展示的商品事实摘要。
- `导出`：留档用，保存到 `data/processed/rag/gradio-runs/<run-id>/`，包含 `cases.csv`、`results.jsonl`、`summary.json`，并额外提供 `results.csv`。日常查看分数不需要下载。

## 首 token 指标

首 token 指标用于优化 Chat SSE 体感速度。Gradio 从发出 `POST /api/chat/stream` 请求开始计时，收到第一条带文本的 `message_delta` 时记录 `首token(ms)`，流结束时记录 `总耗时(ms)`。

这个指标是客户端侧观测值，适合对比同一台机器、同一批 case 在优化前后的变化。优化前先跑一次 `运行评估` 留下 baseline，优化后再跑同一批 case，看页面上的平均首 token / P95 首 token 是否下降。

## 可选 LLM 初评

默认复用仓库根目录 `.env` 里的 ShopMate LLM 配置：

```text
LLM_API_KEY
LLM_BASE_URL
LLM_MODEL
```

也就是说，平时不需要再额外配置 `SHOPMATE_GRADIO_JUDGE_MODEL`。如果某次评估想临时换 judge provider，可以用下面这些变量覆盖：

```powershell
$env:SHOPMATE_GRADIO_JUDGE_API_KEY="..."
$env:SHOPMATE_GRADIO_JUDGE_BASE_URL="https://api.openai.com/v1"
$env:SHOPMATE_GRADIO_JUDGE_MODEL="..."
python app.py --api-base-url http://localhost:3000
```

如果 `.env` / 覆盖变量缺失，或 judge 调用失败，工具会自动退回本地启发式建议，并在 notes 中说明。

## 敏感信息边界

- 仅在本地读取 `.env` 中的 `LLM_*` 作为可选 judge 配置，不在 UI、日志或导出文件中展示 `.env` 内容。
- 不在 UI、日志、README 或导出文件中写入真实 API key、数据库 URL、完整系统 prompt 或 provider 原始敏感错误。
- 上传测试集和运行结果只保存到本地 `data/processed/rag/gradio-runs/`。
- Gradio 只调用现有 Chat SSE 和 Product API，不修改商品数据、RAG documents、Qdrant index 或正式 prompt。

## 自检

不依赖后端和 Gradio 依赖的核心逻辑自检：

```powershell
cd rag-gradio-evaluation-workbench
python app.py --self-test
```

自检覆盖 CSV 解析、SSE 解析、评分统计和 JSONL / CSV / summary 保存。
