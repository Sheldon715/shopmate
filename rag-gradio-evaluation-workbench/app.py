from __future__ import annotations

import argparse
import csv
import html
import io
import json
import os
import re
import shutil
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin


APP_TITLE = "ShopMate RAG Gradio 评估工作台"
DEFAULT_API_BASE_URL = "http://localhost:3000"
ROOT_DIR = Path(__file__).resolve().parents[1]
WORKBENCH_DIR = Path(__file__).resolve().parent
RUNS_DIR = ROOT_DIR / "data" / "processed" / "rag" / "gradio-runs"
SAMPLE_CASES_PATH = WORKBENCH_DIR / "sample-cases.csv"
LOCAL_ENV_PATH = ROOT_DIR / ".env"
JUDGE_API_KEY_ENV = "SHOPMATE_GRADIO_JUDGE_API_KEY"
JUDGE_BASE_URL_ENV = "SHOPMATE_GRADIO_JUDGE_BASE_URL"
JUDGE_MODEL_ENV = "SHOPMATE_GRADIO_JUDGE_MODEL"
SHOPMATE_LLM_API_KEY_ENV = "LLM_API_KEY"
SHOPMATE_LLM_BASE_URL_ENV = "LLM_BASE_URL"
SHOPMATE_LLM_MODEL_ENV = "LLM_MODEL"
DEFAULT_JUDGE_BASE_URL = "https://api.openai.com/v1"
LOCAL_ENV_LOADED = False

APP_CSS = """
.score-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin: 8px 0 14px;
}
.score-card {
    border: 1px solid #d9e1ec;
    border-left: 4px solid #16a34a;
    border-radius: 8px;
    background: #ffffff;
    padding: 14px 16px;
    min-height: 92px;
}
.score-card.warn {
    border-left-color: #f59e0b;
}
.score-card.bad {
    border-left-color: #dc2626;
}
.score-label {
    color: #64748b;
    font-size: 13px;
    margin-bottom: 8px;
}
.score-value {
    color: #0f172a;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.1;
}
.score-note {
    color: #64748b;
    font-size: 12px;
    margin-top: 6px;
}
.chart-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 14px;
    margin: 8px 0 16px;
}
.chart-panel {
    border: 1px solid #d9e1ec;
    border-radius: 8px;
    background: #ffffff;
    padding: 14px 16px;
}
.chart-title {
    color: #0f172a;
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 12px;
}
.bar-row {
    display: grid;
    grid-template-columns: minmax(72px, 126px) 1fr 54px;
    align-items: center;
    gap: 10px;
    margin: 9px 0;
}
.bar-label {
    color: #334155;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.bar-track {
    background: #e2e8f0;
    border-radius: 999px;
    height: 12px;
    overflow: hidden;
}
.bar-fill {
    background: #2563eb;
    height: 100%;
}
.bar-value {
    color: #475569;
    font-size: 12px;
    text-align: right;
}
.simple-status {
    border: 1px solid #d9e1ec;
    border-radius: 8px;
    background: #f8fafc;
    color: #334155;
    padding: 10px 12px;
    margin: 6px 0 12px;
}
"""

REQUIRED_COLUMNS = [
    "用例ID",
    "分组",
    "问题",
    "期望商品ID任一",
    "禁止商品ID",
    "期望答案要点",
    "硬约束",
    "关注失败类型",
    "优先级",
    "备注",
]

RESULT_COLUMNS = [
    "用例ID",
    "分组",
    "问题",
    "首token(ms)",
    "总耗时(ms)",
    "返回商品",
    "对比商品",
    "assistant摘要",
    "人工分",
    "人工状态",
    "失败类型",
    "LLM建议分",
    "LLM建议状态",
    "fallback",
    "cartAction",
    "事件",
    "备注",
]

COLUMN_ALIASES = {
    "caseId": "用例ID",
    "id": "用例ID",
    "group": "分组",
    "category": "分组",
    "query": "问题",
    "question": "问题",
    "expectedProductIdsAny": "期望商品ID任一",
    "expected_product_ids_any": "期望商品ID任一",
    "forbiddenProductIds": "禁止商品ID",
    "forbidden_product_ids": "禁止商品ID",
    "expectedAnswerPoints": "期望答案要点",
    "expected_answer_points": "期望答案要点",
    "constraints": "硬约束",
    "hardConstraints": "硬约束",
    "riskFocus": "关注失败类型",
    "failureTypes": "关注失败类型",
    "priority": "优先级",
    "notes": "备注",
}

FAILURE_TYPES = {
    "F1": "检索失败",
    "F2": "商品错误",
    "F3": "事实错误",
    "F4": "约束遗漏",
    "F5": "解释不完整",
    "F6": "幻觉编造",
    "F7": "对比逻辑差",
    "F8": "拒答不足",
    "F9": "安全风险",
    "F10": "图片误判",
}


def load_local_env_file() -> None:
    global LOCAL_ENV_LOADED
    if LOCAL_ENV_LOADED:
        return
    LOCAL_ENV_LOADED = True
    if not LOCAL_ENV_PATH.exists():
        return

    for raw_line in LOCAL_ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", key):
            continue

        value = raw_value.strip()
        if (
            len(value) >= 2
            and value[0] == value[-1]
            and value[0] in {'"', "'"}
        ):
            value = value[1:-1]

        os.environ.setdefault(key, value)


def read_env_value(*keys: str) -> str:
    load_local_env_file()
    for key in keys:
        value = os.environ.get(key, "").strip()
        if value:
            return value
    return ""


@dataclass
class EvaluationCase:
    case_id: str
    group: str
    query: str
    expected_product_ids_any: list[str] = field(default_factory=list)
    forbidden_product_ids: list[str] = field(default_factory=list)
    expected_answer_points: list[str] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)
    focus_failure_types: list[str] = field(default_factory=list)
    priority: str = ""
    notes: str = ""


@dataclass
class ChatRunResult:
    run_id: str
    case_id: str
    group: str
    query: str
    assistant_text: str
    returned_product_ids: list[str]
    comparison_product_ids: list[str]
    fallback_used: bool
    fallback_reason: str | None
    cart_action: dict[str, Any] | None
    event_names: list[str]
    retrieval: dict[str, Any]
    product_cards: list[dict[str, Any]]
    comparison_result: dict[str, Any] | None
    product_facts: list[dict[str, Any]]
    request_filters: dict[str, Any]
    expected_product_ids_any: list[str]
    forbidden_product_ids: list[str]
    expected_answer_points: list[str]
    constraints: list[str]
    first_token_ms: int | None = None
    total_ms: int | None = None
    manual_score: int | None = None
    manual_status: str = "未评分"
    manual_failure_types: list[str] = field(default_factory=list)
    judge_suggested_score: int | None = None
    judge_suggested_status: str = ""
    judge_suggested_failure_types: list[str] = field(default_factory=list)
    judge_notes: str = ""
    notes: str = ""
    http_status: int | None = None
    error: str | None = None
    generated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass
class ChatStreamEvent:
    event_name: str
    payload: dict[str, Any]


@dataclass
class ChatStreamRun:
    status_code: int
    events: list[ChatStreamEvent]
    first_token_ms: int | None
    total_ms: int | None


def split_pipe_values(value: str | None) -> list[str]:
    if value is None:
        return []
    return [item.strip() for item in str(value).split("|") if item.strip()]


def split_failure_types(value: str | None) -> list[str]:
    if value is None:
        return []
    values = []
    for item in re.split(r"[,，|]", str(value)):
        normalized = item.strip().upper()
        if normalized:
            values.append(normalized)
    return values


def normalize_column_name(name: str) -> str:
    trimmed = name.strip()
    return COLUMN_ALIASES.get(trimmed, trimmed)


def read_csv_text(path: str | Path) -> str:
    raw = Path(path).read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    return raw.decode("utf-8")


def parse_cases_csv(path: str | Path) -> tuple[list[EvaluationCase], list[str]]:
    text = read_csv_text(path)
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return [], ["CSV 缺少表头。"]

    original_headers = [header or "" for header in reader.fieldnames]
    normalized_headers = [normalize_column_name(header) for header in original_headers]
    missing_headers = [
        column
        for column in ["用例ID", "分组", "问题"]
        if column not in normalized_headers
    ]

    warnings: list[str] = []
    if missing_headers:
        return [], [f"缺少必需列：{', '.join(missing_headers)}。"]

    header_map = dict(zip(original_headers, normalized_headers, strict=False))
    cases: list[EvaluationCase] = []
    seen_case_ids: set[str] = set()

    for row_index, row in enumerate(reader, start=2):
        normalized_row: dict[str, str] = {}
        for original_header, value in row.items():
            if original_header is None:
                continue
            normalized_header = header_map.get(original_header, original_header)
            normalized_row[normalized_header] = (value or "").strip()

        case_id = normalized_row.get("用例ID", "").strip()
        group = normalized_row.get("分组", "").strip()
        query = normalized_row.get("问题", "").strip()

        if not case_id or not group or not query:
            warnings.append(
                f"第 {row_index} 行缺少 用例ID / 分组 / 问题，已跳过。"
            )
            continue

        if case_id in seen_case_ids:
            warnings.append(f"第 {row_index} 行用例ID 重复：{case_id}。")
        seen_case_ids.add(case_id)

        failure_types = split_failure_types(normalized_row.get("关注失败类型"))
        unknown_failure_types = [
            item for item in failure_types if item not in FAILURE_TYPES
        ]
        if unknown_failure_types:
            warnings.append(
                f"{case_id} 的关注失败类型未知：{', '.join(unknown_failure_types)}。"
            )

        cases.append(
            EvaluationCase(
                case_id=case_id,
                group=group,
                query=query,
                expected_product_ids_any=split_pipe_values(
                    normalized_row.get("期望商品ID任一")
                ),
                forbidden_product_ids=split_pipe_values(
                    normalized_row.get("禁止商品ID")
                ),
                expected_answer_points=split_pipe_values(
                    normalized_row.get("期望答案要点")
                ),
                constraints=split_pipe_values(normalized_row.get("硬约束")),
                focus_failure_types=failure_types,
                priority=normalized_row.get("优先级", "").strip(),
                notes=normalized_row.get("备注", "").strip(),
            )
        )

    if not cases:
        warnings.append("CSV 中没有可运行用例。")

    optional_missing = [
        column for column in REQUIRED_COLUMNS if column not in normalized_headers
    ]
    if optional_missing:
        warnings.append(
            "以下推荐列缺失，V1 仍可运行但指标会变少："
            + ", ".join(optional_missing)
            + "。"
        )

    return cases, warnings


def cases_to_rows(cases: list[EvaluationCase]) -> list[dict[str, Any]]:
    return [
        {
            "用例ID": item.case_id,
            "分组": item.group,
            "问题": item.query,
            "期望商品ID任一": "|".join(item.expected_product_ids_any),
            "禁止商品ID": "|".join(item.forbidden_product_ids),
            "期望答案要点": "|".join(item.expected_answer_points),
            "硬约束": "|".join(item.constraints),
            "关注失败类型": ",".join(item.focus_failure_types),
            "优先级": item.priority,
            "备注": item.notes,
        }
        for item in cases
    ]


def records_to_table(records: list[dict[str, Any]], columns: list[str]) -> list[list[Any]]:
    return [[record.get(column, "") for column in columns] for record in records]


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_api_base_url(value: Any) -> str:
    return normalize_text(value) or DEFAULT_API_BASE_URL


def normalize_timeout_seconds(value: Any) -> int:
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return 90


def parse_sse_stream_text(text: str) -> list[ChatStreamEvent]:
    events: list[ChatStreamEvent] = []
    current_event = "message"
    data_lines: list[str] = []

    def flush() -> None:
        nonlocal current_event, data_lines
        if not data_lines:
            current_event = "message"
            return
        raw_data = "\n".join(data_lines)
        try:
            payload = json.loads(raw_data)
        except json.JSONDecodeError:
            payload = {"raw": raw_data}
        events.append(ChatStreamEvent(event_name=current_event, payload=payload))
        current_event = "message"
        data_lines = []

    for line in text.splitlines():
        if line == "":
            flush()
            continue
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            current_event = line[len("event:") :].strip()
            continue
        if line.startswith("data:"):
            data_lines.append(line[len("data:") :].strip())

    flush()
    return events


def parse_sse_response(response: Any) -> list[ChatStreamEvent]:
    events, _, _ = parse_timed_sse_response(response, start_time=None)
    return events


def parse_timed_sse_response(
    response: Any,
    start_time: float | None,
) -> tuple[list[ChatStreamEvent], int | None, int | None]:
    events: list[ChatStreamEvent] = []
    current_event = "message"
    data_lines: list[str] = []
    first_token_ms: int | None = None

    def flush() -> None:
        nonlocal current_event, data_lines, first_token_ms
        if not data_lines:
            current_event = "message"
            return
        raw_data = "\n".join(data_lines)
        try:
            payload = json.loads(raw_data)
        except json.JSONDecodeError:
            payload = {"raw": raw_data}
        event = ChatStreamEvent(event_name=current_event, payload=payload)
        events.append(event)
        if (
            start_time is not None
            and first_token_ms is None
            and is_first_token_event(event)
        ):
            first_token_ms = elapsed_ms(start_time)
        current_event = "message"
        data_lines = []

    for raw_line in response.iter_lines(decode_unicode=True):
        line = raw_line or ""
        if line == "":
            flush()
            continue
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            current_event = line[len("event:") :].strip()
            continue
        if line.startswith("data:"):
            data_lines.append(line[len("data:") :].strip())

    flush()
    total_ms = elapsed_ms(start_time) if start_time is not None else None
    return events, first_token_ms, total_ms


def is_first_token_event(event: ChatStreamEvent) -> bool:
    if event.event_name != "message_delta":
        return False
    text = event.payload.get("text")
    if text is None:
        text = event.payload.get("delta")
    return bool(str(text or "").strip())


def elapsed_ms(start_time: float) -> int:
    return max(0, int(round((time.perf_counter() - start_time) * 1000)))


def call_chat_stream(
    api_base_url: str,
    case: EvaluationCase,
    conversation_id_prefix: str,
    timeout_seconds: int,
) -> ChatStreamRun:
    import requests

    endpoint = urljoin(api_base_url.rstrip("/") + "/", "api/chat/stream")
    body: dict[str, Any] = {
        "conversationId": f"{conversation_id_prefix}-{slugify(case.case_id)}",
        "message": case.query,
        "topK": 8,
        "maxRecommendedProducts": 3,
    }
    filters = infer_filters_from_constraints(case.constraints)
    if filters:
        body["filters"] = filters

    start_time = time.perf_counter()
    response = requests.post(
        endpoint,
        json=body,
        headers={
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
        },
        stream=True,
        timeout=timeout_seconds,
    )
    status_code = response.status_code
    if status_code >= 400:
        try:
            payload = response.json()
        except ValueError:
            payload = {"message": response.text[:500]}
        return ChatStreamRun(
            status_code=status_code,
            events=[ChatStreamEvent("error", payload)],
            first_token_ms=None,
            total_ms=elapsed_ms(start_time),
        )

    events, first_token_ms, total_ms = parse_timed_sse_response(
        response,
        start_time=start_time,
    )
    return ChatStreamRun(
        status_code=status_code,
        events=events,
        first_token_ms=first_token_ms,
        total_ms=total_ms,
    )


def infer_filters_from_constraints(constraints: list[str]) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    for raw_constraint in constraints:
        item = raw_constraint.strip()
        if not item:
            continue
        if item.startswith("category="):
            filters["category"] = item.split("=", 1)[1].strip()
        elif item.startswith("subCategory="):
            filters["subCategory"] = item.split("=", 1)[1].strip()
        elif item.startswith("brand="):
            filters["brand"] = item.split("=", 1)[1].strip()
        elif item.startswith("maxPriceCents="):
            filters["maxPriceCents"] = int(item.split("=", 1)[1].strip())
        elif item.startswith("minPriceCents="):
            filters["minPriceCents"] = int(item.split("=", 1)[1].strip())
        elif item.startswith("avoidTerms="):
            filters["avoidTerms"] = split_pipe_values(item.split("=", 1)[1])
        elif item in {"availableOnly", "availableOnly=true", "有货"}:
            filters["availableOnly"] = True
    return filters


def build_result_from_events(
    run_id: str,
    case: EvaluationCase,
    events: list[ChatStreamEvent],
    api_base_url: str,
    http_status: int | None = None,
    error: str | None = None,
    first_token_ms: int | None = None,
    total_ms: int | None = None,
) -> ChatRunResult:
    event_names = [event.event_name for event in events]
    message_parts = [
        str(event.payload.get("text", ""))
        for event in events
        if event.event_name == "message_delta"
    ]
    assistant_text = "".join(message_parts)
    product_cards: list[dict[str, Any]] = []
    comparison_result: dict[str, Any] | None = None
    done_payload: dict[str, Any] = {}
    error_payload: dict[str, Any] | None = None

    for event in events:
        if event.event_name == "product_cards":
            items = event.payload.get("items")
            if isinstance(items, list):
                product_cards = [
                    item for item in items if isinstance(item, dict)
                ]
        elif event.event_name == "comparison_result":
            comparison_result = event.payload
        elif event.event_name == "done":
            done_payload = event.payload
        elif event.event_name == "error":
            error_payload = event.payload

    returned_product_ids = [
        str(item.get("id"))
        for item in product_cards
        if isinstance(item.get("id"), str)
    ]
    if not returned_product_ids:
        retrieval = done_payload.get("retrieval", {})
        if isinstance(retrieval, dict):
            raw_ids = retrieval.get("returnedProductIds", [])
            if isinstance(raw_ids, list):
                returned_product_ids = [str(item) for item in raw_ids]

    comparison_product_ids: list[str] = []
    if comparison_result:
        raw_comparison_ids = comparison_result.get("productIds", [])
        if isinstance(raw_comparison_ids, list):
            comparison_product_ids = [str(item) for item in raw_comparison_ids]

    retrieval_payload = done_payload.get("retrieval", {})
    if not isinstance(retrieval_payload, dict):
        retrieval_payload = {}

    cart_action = done_payload.get("cartAction")
    if not isinstance(cart_action, dict):
        cart_action = None

    fallback_reason = done_payload.get("fallbackReason")
    if fallback_reason is not None:
        fallback_reason = str(fallback_reason)

    product_facts = fetch_product_fact_summaries(api_base_url, returned_product_ids)
    if error_payload and error is None:
        error = sanitize_error(error_payload)

    return ChatRunResult(
        run_id=run_id,
        case_id=case.case_id,
        group=case.group,
        query=case.query,
        assistant_text=assistant_text,
        returned_product_ids=returned_product_ids,
        comparison_product_ids=comparison_product_ids,
        fallback_used=bool(done_payload.get("fallbackUsed", False)),
        fallback_reason=fallback_reason,
        cart_action=cart_action,
        event_names=event_names,
        retrieval=retrieval_payload,
        product_cards=product_cards,
        comparison_result=comparison_result,
        product_facts=product_facts,
        request_filters=infer_filters_from_constraints(case.constraints),
        expected_product_ids_any=case.expected_product_ids_any,
        forbidden_product_ids=case.forbidden_product_ids,
        expected_answer_points=case.expected_answer_points,
        constraints=case.constraints,
        first_token_ms=first_token_ms,
        total_ms=total_ms,
        http_status=http_status,
        error=error,
    )


def fetch_product_fact_summaries(
    api_base_url: str,
    product_ids: list[str],
) -> list[dict[str, Any]]:
    if not product_ids:
        return []
    try:
        import requests
    except ImportError:
        return []

    summaries: list[dict[str, Any]] = []
    for product_id in product_ids[:5]:
        endpoint = urljoin(
            api_base_url.rstrip("/") + "/",
            f"api/products/{product_id}",
        )
        try:
            response = requests.get(endpoint, timeout=8)
            if response.status_code != 200:
                summaries.append(
                    {
                        "id": product_id,
                        "error": f"PRODUCT_API_{response.status_code}",
                    }
                )
                continue
            payload = response.json()
            data = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(data, dict):
                summaries.append({"id": product_id, "error": "INVALID_PRODUCT_PAYLOAD"})
                continue
            summaries.append(
                {
                    "id": data.get("id"),
                    "name": data.get("name"),
                    "brand": data.get("brand"),
                    "category": data.get("category"),
                    "subCategory": data.get("subCategory"),
                    "priceCents": data.get("priceCents"),
                    "priceRangeCents": data.get("priceRangeCents"),
                    "available": data.get("available"),
                    "pros": first_items(data.get("pros"), 3),
                    "cons": first_items(data.get("cons"), 3),
                    "recommendWhen": first_items(data.get("recommendWhen"), 3),
                    "avoidWhen": first_items(data.get("avoidWhen"), 3),
                    "attributes": compact_attributes(data.get("attributes")),
                }
            )
        except Exception:
            summaries.append({"id": product_id, "error": "PRODUCT_API_FAILED"})
    return summaries


def first_items(value: Any, limit: int) -> list[Any]:
    return value[:limit] if isinstance(value, list) else []


def compact_attributes(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {str(key): val for key, val in list(value.items())[:8]}


def sanitize_error(payload: dict[str, Any]) -> str:
    code = payload.get("code") or payload.get("error", {}).get("code")
    retryable = payload.get("retryable")
    if code:
        return f"{code}" + (f" retryable={retryable}" if retryable is not None else "")
    return "CHAT_STREAM_ERROR"


def manual_status_from_score(score: int | float | None) -> str:
    if score is None:
        return "未评分"
    score_int = int(score)
    if score_int >= 4:
        return "通过"
    if score_int == 3:
        return "可接受"
    return "失败"


def update_manual_review(
    result: ChatRunResult,
    manual_score: int | None,
    failure_types: Iterable[str],
    notes: str,
) -> ChatRunResult:
    result.manual_score = None if manual_score is None else int(manual_score)
    result.manual_status = manual_status_from_score(result.manual_score)
    result.manual_failure_types = normalize_failure_type_values(failure_types)
    result.notes = notes.strip()
    return result


def normalize_failure_type_values(values: Iterable[str]) -> list[str]:
    normalized_values: list[str] = []
    for value in values:
        match = re.match(r"^(F\d{1,2})\b", normalize_text(value).upper())
        if match and match.group(1) in FAILURE_TYPES:
            normalized_values.append(match.group(1))
    return sorted(set(normalized_values))


def auto_judge_result(result: ChatRunResult) -> ChatRunResult:
    hit_expected = (
        not result.expected_product_ids_any
        or bool(set(result.returned_product_ids) & set(result.expected_product_ids_any))
    )
    hit_forbidden = bool(
        set(result.returned_product_ids) & set(result.forbidden_product_ids)
    )
    answer_points_covered = count_covered_points(
        result.assistant_text,
        result.expected_answer_points,
    )

    suggested_failure_types: list[str] = []
    score = 5
    notes: list[str] = []

    if not hit_expected:
        score -= 2
        suggested_failure_types.append("F1")
        notes.append("未命中期望商品。")
    if hit_forbidden:
        score -= 2
        suggested_failure_types.append("F2")
        notes.append("返回了禁止商品。")
    if result.expected_answer_points and answer_points_covered == 0:
        score -= 1
        suggested_failure_types.append("F5")
        notes.append("期望答案要点覆盖不足。")
    if result.fallback_reason in {"LLM_ERROR", "LLM_INVALID_OUTPUT"}:
        score -= 1
        suggested_failure_types.append("F3")
        notes.append(f"存在 fallback：{result.fallback_reason}。")
    if result.error:
        score = 0
        notes.append(f"运行错误：{result.error}。")

    score = max(0, min(5, score))
    result.judge_suggested_score = score
    result.judge_suggested_status = manual_status_from_score(score)
    result.judge_suggested_failure_types = sorted(set(suggested_failure_types))
    result.judge_notes = " ".join(notes) or "启发式初评未发现明显问题。"
    return result


def judge_result(result: ChatRunResult) -> ChatRunResult:
    api_key = read_env_value(JUDGE_API_KEY_ENV, SHOPMATE_LLM_API_KEY_ENV)
    model = read_env_value(JUDGE_MODEL_ENV, SHOPMATE_LLM_MODEL_ENV)
    if not api_key or not model:
        auto_judge_result(result)
        missing = []
        if not api_key:
            missing.append(f"{JUDGE_API_KEY_ENV} / {SHOPMATE_LLM_API_KEY_ENV}")
        if not model:
            missing.append(f"{JUDGE_MODEL_ENV} / {SHOPMATE_LLM_MODEL_ENV}")
        result.judge_notes = (
            f"未配置 {'、'.join(missing)}，"
            + result.judge_notes
        )
        return result

    try:
        return llm_judge_result(result, api_key=api_key, model=model)
    except Exception as exc:
        auto_judge_result(result)
        result.judge_notes = f"LLM 初评失败（{type(exc).__name__}），已使用启发式建议。{result.judge_notes}"
        return result


def llm_judge_result(
    result: ChatRunResult,
    api_key: str,
    model: str,
) -> ChatRunResult:
    import requests

    base_url = (
        read_env_value(JUDGE_BASE_URL_ENV, SHOPMATE_LLM_BASE_URL_ENV)
        or DEFAULT_JUDGE_BASE_URL
    )
    endpoint = urljoin(base_url.rstrip("/") + "/", "chat/completions")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是 ShopMate RAG 评估助手。只基于用户问题、期望、assistant 输出、"
                    "returned product ids 和可展示证据评分。不要要求或推断隐藏 prompt、API key、"
                    "数据库 URL 或 provider 原始错误。只输出 JSON。"
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "caseId": result.case_id,
                        "group": result.group,
                        "query": result.query,
                        "expectedProductIdsAny": result.expected_product_ids_any,
                        "forbiddenProductIds": result.forbidden_product_ids,
                        "expectedAnswerPoints": result.expected_answer_points,
                        "constraints": result.constraints,
                        "assistantText": result.assistant_text,
                        "returnedProductIds": result.returned_product_ids,
                        "comparisonProductIds": result.comparison_product_ids,
                        "fallbackUsed": result.fallback_used,
                        "fallbackReason": result.fallback_reason,
                        "retrieval": result.retrieval,
                        "productFacts": result.product_facts,
                        "failureTypes": FAILURE_TYPES,
                        "outputSchema": {
                            "suggestedScore": "0-5 integer",
                            "suggestedStatus": "通过 / 可接受 / 失败",
                            "suggestedFailureTypes": ["F1"],
                            "notes": "简短中文理由",
                        },
                    },
                    ensure_ascii=False,
                ),
            },
        ],
        "temperature": 0,
    }
    response = requests.post(
        endpoint,
        json=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        timeout=60,
    )
    response.raise_for_status()
    response_payload = response.json()
    content = (
        response_payload.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    judge_payload = extract_json_object(content)
    suggested_score = int(judge_payload.get("suggestedScore", 0))
    suggested_score = max(0, min(5, suggested_score))
    suggested_failure_types = [
        item
        for item in judge_payload.get("suggestedFailureTypes", [])
        if isinstance(item, str) and item in FAILURE_TYPES
    ]
    result.judge_suggested_score = suggested_score
    result.judge_suggested_status = (
        normalize_text(judge_payload.get("suggestedStatus"))
        or manual_status_from_score(suggested_score)
    )
    result.judge_suggested_failure_types = sorted(set(suggested_failure_types))
    result.judge_notes = normalize_text(judge_payload.get("notes")) or "LLM 初评未返回说明。"
    return result


def extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?", "", stripped).strip()
        stripped = re.sub(r"```$", "", stripped).strip()
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", stripped, flags=re.DOTALL)
        if not match:
            raise
        payload = json.loads(match.group(0))
    if not isinstance(payload, dict):
        raise ValueError("judge response must be a JSON object")
    return payload


def count_covered_points(text: str, points: list[str]) -> int:
    if not points:
        return 0
    normalized_text = text.lower()
    return sum(1 for point in points if point.lower() in normalized_text)


def compute_summary(results: list[ChatRunResult]) -> dict[str, Any]:
    total = len(results)
    scored = [item for item in results if item.manual_score is not None]
    judge_scored = [
        item for item in results if item.judge_suggested_score is not None
    ]
    passed = [item for item in scored if item.manual_status == "通过"]
    acceptable = [item for item in scored if item.manual_status == "可接受"]
    failed = [item for item in scored if item.manual_status == "失败"]

    product_hit_cases = [
        item
        for item in results
        if item.expected_product_ids_any
        and bool(set(item.returned_product_ids) & set(item.expected_product_ids_any))
    ]
    product_expectation_cases = [
        item for item in results if item.expected_product_ids_any
    ]
    constraint_pass_cases = [
        item
        for item in results
        if not item.forbidden_product_ids
        or not bool(set(item.returned_product_ids) & set(item.forbidden_product_ids))
    ]
    hallucination_count = sum(
        1
        for item in results
        if "F6" in item.manual_failure_types
        or "F6" in item.judge_suggested_failure_types
    )
    safety_risk_count = sum(
        1
        for item in results
        if "F9" in item.manual_failure_types
        or "F9" in item.judge_suggested_failure_types
    )
    comparison_cases = [
        item
        for item in results
        if "对比" in item.group or item.comparison_result is not None
    ]
    no_result_cases = [
        item
        for item in results
        if not item.expected_product_ids_any and not item.returned_product_ids
    ]

    failure_distribution: dict[str, int] = {}
    fallback_distribution: dict[str, int] = {}
    group_scores: dict[str, list[int]] = {}
    status_distribution = {"通过": 0, "可接受": 0, "失败": 0, "未评分": 0}

    for item in results:
        status_distribution[item.manual_status] = (
            status_distribution.get(item.manual_status, 0) + 1
        )
        for failure_type in item.manual_failure_types or item.judge_suggested_failure_types:
            label = f"{failure_type} {FAILURE_TYPES.get(failure_type, '')}".strip()
            failure_distribution[label] = failure_distribution.get(label, 0) + 1
        fallback_key = item.fallback_reason or "无 fallback"
        fallback_distribution[fallback_key] = fallback_distribution.get(fallback_key, 0) + 1
        if item.manual_score is not None:
            group_scores.setdefault(item.group, []).append(item.manual_score)

    group_average_scores = {
        group: round(sum(scores) / len(scores), 2)
        for group, scores in group_scores.items()
        if scores
    }

    retrieval_metrics = compute_retrieval_metrics(results)
    answer_point_coverage = compute_answer_point_coverage(results)
    latency_metrics = compute_latency_metrics(results)

    return {
        "用例总数": total,
        "已人工评分数": len(scored),
        "通过率": ratio(len(passed), len(scored)),
        "可接受数量": len(acceptable),
        "失败数量": len(failed),
        "平均人工分": average([item.manual_score for item in scored]),
        "LLM建议平均分": average(
            [item.judge_suggested_score for item in judge_scored]
        ),
        "商品命中率": ratio(len(product_hit_cases), len(product_expectation_cases)),
        "约束通过率": ratio(len(constraint_pass_cases), total),
        "幻觉次数": hallucination_count,
        "安全风险次数": safety_risk_count,
        "对比成功率": ratio(
            len([item for item in comparison_cases if item.comparison_result is not None]),
            len(comparison_cases),
        ),
        "无结果正确率": ratio(len(no_result_cases), total),
        "MRR": retrieval_metrics["MRR"],
        "nDCG": retrieval_metrics["nDCG"],
        "要点覆盖率": answer_point_coverage,
        "平均首token(ms)": latency_metrics["平均首token(ms)"],
        "P95首token(ms)": latency_metrics["P95首token(ms)"],
        "平均总耗时(ms)": latency_metrics["平均总耗时(ms)"],
        "P95总耗时(ms)": latency_metrics["P95总耗时(ms)"],
        "首token样本数": latency_metrics["首token样本数"],
        "失败类型分布": failure_distribution,
        "fallback分布": fallback_distribution,
        "状态分布": status_distribution,
        "按分组平均分": group_average_scores,
    }


def compute_retrieval_metrics(results: list[ChatRunResult]) -> dict[str, float | None]:
    expectation_cases = [item for item in results if item.expected_product_ids_any]
    if not expectation_cases:
        return {"MRR": None, "nDCG": None}

    reciprocal_ranks: list[float] = []
    ndcg_values: list[float] = []
    for item in expectation_cases:
        expected_ids = set(item.expected_product_ids_any)
        first_rank = None
        dcg = 0.0
        for index, product_id in enumerate(item.returned_product_ids, start=1):
            if product_id in expected_ids:
                first_rank = first_rank or index
                dcg += 1 / log2(index + 1)

        reciprocal_ranks.append(0.0 if first_rank is None else 1 / first_rank)
        ideal_hits = min(len(expected_ids), max(len(item.returned_product_ids), 1))
        idcg = sum(1 / log2(index + 1) for index in range(1, ideal_hits + 1))
        ndcg_values.append(0.0 if idcg == 0 else dcg / idcg)

    return {
        "MRR": round(sum(reciprocal_ranks) / len(reciprocal_ranks), 4),
        "nDCG": round(sum(ndcg_values) / len(ndcg_values), 4),
    }


def log2(value: int) -> float:
    import math

    return math.log2(value)


def compute_answer_point_coverage(results: list[ChatRunResult]) -> str:
    cases_with_points = [item for item in results if item.expected_answer_points]
    if not cases_with_points:
        return "N/A"
    covered = sum(
        count_covered_points(item.assistant_text, item.expected_answer_points)
        for item in cases_with_points
    )
    total_points = sum(len(item.expected_answer_points) for item in cases_with_points)
    return ratio(covered, total_points)


def compute_latency_metrics(results: list[ChatRunResult]) -> dict[str, int | None]:
    first_token_values = [
        item.first_token_ms for item in results if item.first_token_ms is not None
    ]
    total_values = [item.total_ms for item in results if item.total_ms is not None]
    return {
        "平均首token(ms)": average_int(first_token_values),
        "P95首token(ms)": percentile_int(first_token_values, 95),
        "平均总耗时(ms)": average_int(total_values),
        "P95总耗时(ms)": percentile_int(total_values, 95),
        "首token样本数": len(first_token_values),
    }


def average(values: list[int | None]) -> float | None:
    clean_values = [value for value in values if value is not None]
    if not clean_values:
        return None
    return round(sum(clean_values) / len(clean_values), 2)


def average_int(values: list[int]) -> int | None:
    if not values:
        return None
    return int(round(sum(values) / len(values)))


def percentile_int(values: list[int], percentile: int) -> int | None:
    if not values:
        return None
    sorted_values = sorted(values)
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (percentile / 100) * (len(sorted_values) - 1)
    lower = int(rank)
    upper = min(lower + 1, len(sorted_values) - 1)
    fraction = rank - lower
    return int(round(sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * fraction))


def ratio(numerator: int, denominator: int) -> str:
    if denominator <= 0:
        return "N/A"
    return f"{round(numerator * 100 / denominator, 1)}%"


def parse_ratio(value: Any) -> float | None:
    if value is None or value == "N/A":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if text.endswith("%"):
        text = text[:-1]
    try:
        return float(text)
    except ValueError:
        return None


def score_card_class(value: float | None, good: float, warn: float) -> str:
    if value is None:
        return "warn"
    if value >= good:
        return ""
    if value >= warn:
        return "warn"
    return "bad"


def latency_card_class(value: float | None, good_ms: float, warn_ms: float) -> str:
    if value is None:
        return "warn"
    if value <= good_ms:
        return ""
    if value <= warn_ms:
        return "warn"
    return "bad"


def format_score(value: Any, suffix: str = "") -> str:
    if value is None or value == "N/A":
        return "N/A"
    if isinstance(value, float):
        text = str(round(value, 2))
    else:
        text = str(value)
    return text + suffix


def effective_score(result: ChatRunResult) -> int | None:
    if result.manual_score is not None:
        return result.manual_score
    return result.judge_suggested_score


def average_effective_score(results: list[ChatRunResult]) -> float | None:
    scores = [effective_score(item) for item in results]
    return average(scores)


def build_score_cards(summary: dict[str, Any], results: list[ChatRunResult]) -> str:
    answer_score = average_effective_score(results)
    product_hit = parse_ratio(summary.get("商品命中率"))
    constraint_pass = parse_ratio(summary.get("约束通过率"))
    point_coverage = parse_ratio(summary.get("要点覆盖率"))
    mrr = summary.get("MRR")
    ndcg = summary.get("nDCG")
    avg_first_token_ms = summary.get("平均首token(ms)")
    p95_first_token_ms = summary.get("P95首token(ms)")
    total = summary.get("用例总数", 0)

    cards = [
        (
            "首token",
            format_score(avg_first_token_ms, "ms"),
            f"P95 {format_score(p95_first_token_ms, 'ms')} / {summary.get('首token样本数', 0)} 条",
            latency_card_class(avg_first_token_ms, 2500, 5000),
        ),
        (
            "答案质量",
            format_score(answer_score, "/5"),
            "自动初评或人工复核后的平均分",
            score_card_class(answer_score, 4.0, 3.0),
        ),
        (
            "商品命中率",
            format_score(summary.get("商品命中率")),
            f"{total} 条用例",
            score_card_class(product_hit, 85.0, 65.0),
        ),
        (
            "约束通过率",
            format_score(summary.get("约束通过率")),
            "禁止商品 / 硬约束初判",
            score_card_class(constraint_pass, 90.0, 75.0),
        ),
        (
            "MRR",
            format_score(mrr),
            "期望商品越靠前越高",
            score_card_class(mrr, 0.8, 0.6),
        ),
        (
            "nDCG",
            format_score(ndcg),
            "检索排序质量",
            score_card_class(ndcg, 0.8, 0.6),
        ),
        (
            "要点覆盖",
            format_score(summary.get("要点覆盖率")),
            "期望答案要点命中",
            score_card_class(point_coverage, 80.0, 60.0),
        ),
    ]
    return (
        '<div class="score-grid">'
        + "".join(
            '<div class="score-card {card_class}">'
            '<div class="score-label">{label}</div>'
            '<div class="score-value">{value}</div>'
            '<div class="score-note">{note}</div>'
            "</div>".format(
                card_class=html.escape(card_class),
                label=html.escape(label),
                value=html.escape(value),
                note=html.escape(note),
            )
            for label, value, note, card_class in cards
        )
        + "</div>"
    )


def build_dashboard_charts(summary: dict[str, Any], results: list[ChatRunResult]) -> str:
    return (
        '<div class="chart-grid">'
        + build_bar_chart("首token by 分组(ms)", group_average_first_token_ms(results), max_value=None)
        + build_bar_chart("平均答案分 by 分组", group_average_effective_scores(results), max_value=5)
        + build_bar_chart("fallback 分布", summary.get("fallback分布", {}), max_value=None)
        + build_bar_chart("失败类型分布", summary.get("失败类型分布", {}), max_value=None)
        + build_bar_chart("人工状态分布", summary.get("状态分布", {}), max_value=None)
        + "</div>"
    )


def group_average_effective_scores(results: list[ChatRunResult]) -> dict[str, float]:
    scores_by_group: dict[str, list[int]] = {}
    for item in results:
        score = effective_score(item)
        if score is not None:
            scores_by_group.setdefault(item.group, []).append(score)
    return {
        group: round(sum(scores) / len(scores), 2)
        for group, scores in scores_by_group.items()
        if scores
    }


def group_average_first_token_ms(results: list[ChatRunResult]) -> dict[str, int]:
    values_by_group: dict[str, list[int]] = {}
    for item in results:
        if item.first_token_ms is not None:
            values_by_group.setdefault(item.group, []).append(item.first_token_ms)
    return {
        group: int(round(sum(values) / len(values)))
        for group, values in values_by_group.items()
        if values
    }


def build_bar_chart(
    title: str,
    values: dict[str, Any],
    max_value: float | None,
) -> str:
    clean_values: dict[str, float] = {}
    for key, value in values.items():
        if isinstance(value, (int, float)):
            clean_values[str(key)] = float(value)
    if not clean_values:
        return (
            '<div class="chart-panel">'
            f'<div class="chart-title">{html.escape(title)}</div>'
            '<div class="score-note">暂无数据</div>'
            "</div>"
        )

    local_max = max_value or max(clean_values.values()) or 1
    rows = []
    for key, value in sorted(clean_values.items(), key=lambda item: item[0]):
        width = max(2, min(100, round(value * 100 / local_max, 1)))
        rows.append(
            '<div class="bar-row">'
            f'<div class="bar-label" title="{html.escape(key)}">{html.escape(key)}</div>'
            '<div class="bar-track">'
            f'<div class="bar-fill" style="width: {width}%"></div>'
            "</div>"
            f'<div class="bar-value">{html.escape(format_score(value))}</div>'
            "</div>"
        )
    return (
        '<div class="chart-panel">'
        f'<div class="chart-title">{html.escape(title)}</div>'
        + "".join(rows)
        + "</div>"
    )


def build_status_html(message: str) -> str:
    compact_message = " ".join(message.split())
    return f'<div class="simple-status">{html.escape(compact_message)}</div>'


def result_to_export_dict(result: ChatRunResult) -> dict[str, Any]:
    data = asdict(result)
    data["returnedProductIds"] = data.pop("returned_product_ids")
    data["comparisonProductIds"] = data.pop("comparison_product_ids")
    data["fallbackUsed"] = data.pop("fallback_used")
    data["fallbackReason"] = data.pop("fallback_reason")
    data["cartAction"] = data.pop("cart_action")
    data["eventNames"] = data.pop("event_names")
    data["productCards"] = data.pop("product_cards")
    data["comparisonResult"] = data.pop("comparison_result")
    data["productFacts"] = data.pop("product_facts")
    data["requestFilters"] = data.pop("request_filters")
    data["expectedProductIdsAny"] = data.pop("expected_product_ids_any")
    data["forbiddenProductIds"] = data.pop("forbidden_product_ids")
    data["expectedAnswerPoints"] = data.pop("expected_answer_points")
    data["firstTokenMs"] = data.pop("first_token_ms")
    data["totalMs"] = data.pop("total_ms")
    data["manualScore"] = data.pop("manual_score")
    data["manualStatus"] = data.pop("manual_status")
    data["manualFailureTypes"] = data.pop("manual_failure_types")
    data["judgeSuggestedScore"] = data.pop("judge_suggested_score")
    data["judgeSuggestedStatus"] = data.pop("judge_suggested_status")
    data["judgeSuggestedFailureTypes"] = data.pop("judge_suggested_failure_types")
    data["judgeNotes"] = data.pop("judge_notes")
    data["generatedAt"] = data.pop("generated_at")
    return data


def results_to_rows(results: list[ChatRunResult]) -> list[dict[str, Any]]:
    return [
        {
            "用例ID": item.case_id,
            "分组": item.group,
            "问题": item.query,
            "首token(ms)": item.first_token_ms,
            "总耗时(ms)": item.total_ms,
            "LLM模型": format_llm_lane_summary(item.retrieval),
            "返回商品": "|".join(item.returned_product_ids),
            "对比商品": "|".join(item.comparison_product_ids),
            "assistant摘要": item.assistant_text[:120],
            "人工分": item.manual_score,
            "人工状态": item.manual_status,
            "失败类型": ",".join(item.manual_failure_types),
            "LLM建议分": item.judge_suggested_score,
            "LLM建议状态": item.judge_suggested_status,
            "fallback": item.fallback_reason or "",
            "cartAction": summarize_cart_action(item.cart_action),
            "事件": " > ".join(item.event_names),
            "备注": item.notes or item.judge_notes,
        }
        for item in results
    ]


def format_llm_lane_summary(retrieval: dict[str, Any]) -> str:
    llm = retrieval.get("llm")
    if not isinstance(llm, dict):
        return ""

    parts: list[str] = []
    labels = [
        ("decisionPrimary", "decision"),
        ("decisionFallback", "fallback"),
        ("answer", "answer"),
    ]
    for key, label in labels:
        lane = llm.get(key)
        if not isinstance(lane, dict):
            continue
        provider = str(lane.get("provider") or "").strip()
        model = str(lane.get("model") or "").strip()
        enabled = lane.get("enabled")
        enabled_text = "" if enabled is True else " off"
        value = "/".join(item for item in [provider, model] if item)
        if value:
            parts.append(f"{label}:{value}{enabled_text}")
    return " | ".join(parts)


def summarize_cart_action(cart_action: dict[str, Any] | None) -> str:
    if not cart_action:
        return ""
    parts = [
        str(cart_action.get("type", "")),
        str(cart_action.get("status", "")),
        str(cart_action.get("productId", "")),
    ]
    return " / ".join([part for part in parts if part])


def save_run_outputs(
    run_id: str,
    cases: list[EvaluationCase],
    results: list[ChatRunResult],
) -> tuple[str, str, str]:
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    cases_path = run_dir / "cases.csv"
    results_path = run_dir / "results.jsonl"
    summary_path = run_dir / "summary.json"

    write_cases_csv(cases_path, cases)
    with results_path.open("w", encoding="utf-8", newline="\n") as handle:
        for result in results:
            handle.write(
                json.dumps(result_to_export_dict(result), ensure_ascii=False)
                + "\n"
            )
    summary_path.write_text(
        json.dumps(compute_summary(results), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return str(cases_path), str(results_path), str(summary_path)


def write_cases_csv(path: str | Path, cases: list[EvaluationCase]) -> None:
    with Path(path).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REQUIRED_COLUMNS)
        writer.writeheader()
        writer.writerows(cases_to_rows(cases))


def write_results_csv(path: str | Path, results: list[ChatRunResult]) -> None:
    rows = results_to_rows(results)
    fieldnames = list(rows[0].keys()) if rows else ["用例ID"]
    with Path(path).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def case_from_result(result: ChatRunResult) -> EvaluationCase:
    return EvaluationCase(
        case_id=result.case_id,
        group=result.group,
        query=result.query,
        expected_product_ids_any=result.expected_product_ids_any,
        forbidden_product_ids=result.forbidden_product_ids,
        expected_answer_points=result.expected_answer_points,
        constraints=result.constraints,
        priority="",
        notes=result.notes,
    )


def export_current_results(
    results: list[ChatRunResult],
    persist_jsonl: bool,
) -> tuple[str | None, str | None, str | None]:
    if not results:
        return None, None, None

    run_id = results[0].run_id
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    csv_path = run_dir / "results.csv"
    write_results_csv(csv_path, results)

    if not persist_jsonl:
        return None, str(csv_path), None

    cases = [case_from_result(result) for result in results]
    _, results_path, summary_path = save_run_outputs(run_id, cases, results)
    return results_path, str(csv_path), summary_path


def create_run_id() -> str:
    return "rag_eval_" + datetime.now().strftime("%Y%m%d_%H%M%S")


def slugify(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip())
    return safe.strip("-")[:40] or "case"


def ensure_sample_template() -> str:
    return str(SAMPLE_CASES_PATH)


def run_batch_cases(
    csv_file: Any,
    api_base_url: str,
    run_scope: str,
    selected_case_id: str,
    group_filter: str,
    enable_judge: bool,
    save_results: bool,
    timeout_seconds: int,
    previous_results: list[ChatRunResult] | None,
) -> tuple[
    list[list[Any]],
    dict[str, Any],
    str,
    str | None,
    str | None,
    str | None,
    list[list[Any]],
    list[ChatRunResult],
    Any,
]:
    import gradio as gr

    csv_path = getattr(csv_file, "name", None) or str(SAMPLE_CASES_PATH)
    default_case_note = "" if csv_file is not None else "已使用默认示例测试集。"
    cases, warnings = parse_cases_csv(csv_path)
    selected_cases = select_cases(cases, run_scope, selected_case_id, group_filter)
    if not selected_cases:
        results = previous_results or []
        return (
            records_to_table(results_to_rows(results), RESULT_COLUMNS),
            compute_summary(results) if results else {},
            "没有匹配运行范围的用例。" + format_warnings(warnings),
            None,
            None,
            None,
            records_to_table(cases_to_rows(cases), REQUIRED_COLUMNS),
            results,
            gr.update(choices=[item.case_id for item in results], value=None),
        )

    run_id = create_run_id()
    results: list[ChatRunResult] = []
    normalized_api_base_url = normalize_api_base_url(api_base_url)
    normalized_timeout_seconds = normalize_timeout_seconds(timeout_seconds)
    for case in selected_cases:
        try:
            stream_run = call_chat_stream(
                api_base_url=normalized_api_base_url,
                case=case,
                conversation_id_prefix=run_id,
                timeout_seconds=normalized_timeout_seconds,
            )
            result = build_result_from_events(
                run_id=run_id,
                case=case,
                events=stream_run.events,
                api_base_url=normalized_api_base_url,
                http_status=stream_run.status_code,
                first_token_ms=stream_run.first_token_ms,
                total_ms=stream_run.total_ms,
            )
        except Exception as exc:
            result = build_result_from_events(
                run_id=run_id,
                case=case,
                events=[],
                api_base_url=normalized_api_base_url,
                error=type(exc).__name__,
            )
        if enable_judge:
            judge_result(result)
        results.append(result)

    results_path = summary_path = None
    if save_results:
        _, results_path, summary_path = save_run_outputs(
            run_id, selected_cases, results
        )

    summary = compute_summary(results)
    message = (
        f"运行完成：{run_id}，共 {len(results)} 条。{default_case_note}"
        + format_warnings(warnings)
    )
    return (
        records_to_table(results_to_rows(results), RESULT_COLUMNS),
        summary,
        message,
        results_path,
        create_export_csv(results, run_id),
        summary_path,
        records_to_table(cases_to_rows(cases), REQUIRED_COLUMNS),
        results,
        gr.update(choices=[item.case_id for item in results], value=results[0].case_id if results else None),
    )


def run_dashboard_evaluation(
    csv_file: Any,
    api_base_url: str,
    run_scope: str,
    selected_case_id: str,
    group_filter: str,
    enable_judge: bool,
    save_results: bool,
    timeout_seconds: int,
    previous_results: list[ChatRunResult] | None,
) -> tuple[
    str,
    str,
    str,
    Any,
    dict[str, Any],
    str,
    str | None,
    str | None,
    str | None,
    list[list[Any]],
    list[ChatRunResult],
    Any,
]:
    import gradio as gr

    (
        result_table,
        summary,
        message,
        results_path,
        csv_path,
        summary_path,
        preview_table,
        results,
        review_update,
    ) = run_batch_cases(
        csv_file,
        api_base_url,
        run_scope,
        selected_case_id,
        group_filter,
        enable_judge,
        save_results,
        timeout_seconds,
        previous_results,
    )
    return (
        build_status_html(message),
        build_score_cards(summary, results),
        build_dashboard_charts(summary, results),
        gr.update(value=result_table, visible=bool(results)),
        summary,
        message,
        results_path,
        csv_path,
        summary_path,
        preview_table,
        results,
        review_update,
    )


def update_manual_review_from_ui(
    results: list[ChatRunResult] | None,
    case_id: str,
    manual_score: float | int | None,
    failure_types: list[str] | None,
    notes: str,
    save_results: bool,
) -> tuple[
    list[list[Any]],
    dict[str, Any],
    str,
    str | None,
    str | None,
    str | None,
    list[ChatRunResult],
]:
    current_results = results or []
    normalized_case_id = normalize_text(case_id)
    if not current_results:
        return [], {}, "还没有批量运行结果可评分。", None, None, None, []
    if not normalized_case_id:
        return (
            records_to_table(results_to_rows(current_results), RESULT_COLUMNS),
            compute_summary(current_results),
            "请选择要评分的用例。",
            None,
            None,
            None,
            current_results,
        )

    target = next(
        (item for item in current_results if item.case_id == normalized_case_id),
        None,
    )
    if target is None:
        return (
            records_to_table(results_to_rows(current_results), RESULT_COLUMNS),
            compute_summary(current_results),
            f"没有找到用例：{normalized_case_id}。",
            None,
            None,
            None,
            current_results,
        )

    score = None if manual_score is None else int(manual_score)
    update_manual_review(target, score, failure_types or [], notes)
    results_path, csv_path, summary_path = export_current_results(
        current_results,
        persist_jsonl=save_results,
    )
    return (
        records_to_table(results_to_rows(current_results), RESULT_COLUMNS),
        compute_summary(current_results),
        f"已更新人工评分：{normalized_case_id} -> {target.manual_status}。",
        results_path,
        csv_path,
        summary_path,
        current_results,
    )


def update_dashboard_manual_review(
    results: list[ChatRunResult] | None,
    case_id: str,
    manual_score: float | int | None,
    failure_types: list[str] | None,
    notes: str,
    save_results: bool,
) -> tuple[
    str,
    str,
    str,
    Any,
    dict[str, Any],
    str,
    str | None,
    str | None,
    str | None,
    list[ChatRunResult],
]:
    import gradio as gr

    (
        result_table,
        summary,
        message,
        results_path,
        csv_path,
        summary_path,
        current_results,
    ) = update_manual_review_from_ui(
        results,
        case_id,
        manual_score,
        failure_types,
        notes,
        save_results,
    )
    return (
        build_status_html(message),
        build_score_cards(summary, current_results) if current_results else "",
        build_dashboard_charts(summary, current_results) if current_results else "",
        gr.update(value=result_table, visible=bool(current_results)),
        summary,
        message,
        results_path,
        csv_path,
        summary_path,
        current_results,
    )


def create_export_csv(results: list[ChatRunResult], run_id: str) -> str:
    export_dir = RUNS_DIR / run_id
    export_dir.mkdir(parents=True, exist_ok=True)
    csv_path = export_dir / "results.csv"
    write_results_csv(csv_path, results)
    return str(csv_path)


def select_cases(
    cases: list[EvaluationCase],
    run_scope: str,
    selected_case_id: str,
    group_filter: str,
) -> list[EvaluationCase]:
    if run_scope == "单个用例" and selected_case_id.strip():
        return [case for case in cases if case.case_id == selected_case_id.strip()]
    if run_scope == "单个分组" and group_filter.strip():
        return [case for case in cases if case.group == group_filter.strip()]
    return cases


def format_warnings(warnings: list[str]) -> str:
    if not warnings:
        return ""
    return "\n\n校验提示：\n" + "\n".join(f"- {warning}" for warning in warnings)


def preview_cases(csv_file: Any) -> tuple[list[list[Any]], str, Any, Any]:
    import gradio as gr

    csv_path = getattr(csv_file, "name", None) or str(SAMPLE_CASES_PATH)
    cases, warnings = parse_cases_csv(csv_path)
    group_choices = sorted({case.group for case in cases})
    case_choices = [case.case_id for case in cases]
    source_note = "默认示例测试集" if csv_file is None else "上传测试集"
    message = f"已读取 {len(cases)} 条用例（{source_note}）。" + format_warnings(warnings)
    return (
        records_to_table(cases_to_rows(cases), REQUIRED_COLUMNS),
        message,
        gr.update(choices=group_choices, value=group_choices[0] if group_choices else None),
        gr.update(choices=case_choices, value=case_choices[0] if case_choices else None),
    )


def run_single_debug(
    question: str,
    api_base_url: str,
    timeout_seconds: int,
) -> tuple[str, str, dict[str, Any], dict[str, Any], list[list[Any]]]:
    query = question.strip()
    if not query:
        return "", "请输入问题。", {}, {}, []
    case = EvaluationCase(
        case_id="debug",
        group="单条调试",
        query=query,
    )
    run_id = create_run_id()
    try:
        stream_run = call_chat_stream(
            api_base_url=api_base_url.strip() or DEFAULT_API_BASE_URL,
            case=case,
            conversation_id_prefix=run_id,
            timeout_seconds=max(1, int(timeout_seconds)),
        )
        result = build_result_from_events(
            run_id=run_id,
            case=case,
            events=stream_run.events,
            api_base_url=api_base_url.strip() or DEFAULT_API_BASE_URL,
            http_status=stream_run.status_code,
            first_token_ms=stream_run.first_token_ms,
            total_ms=stream_run.total_ms,
        )
    except Exception as exc:
        result = build_result_from_events(
            run_id=run_id,
            case=case,
            events=[],
            api_base_url=api_base_url.strip() or DEFAULT_API_BASE_URL,
            error=type(exc).__name__,
        )

    evidence = {
        "原始问题": result.query,
        "firstTokenMs": result.first_token_ms,
        "totalMs": result.total_ms,
        "filters": result.request_filters,
        "retrieval": result.retrieval,
        "llm": result.retrieval.get("llm", {}),
        "returnedProductIds": result.returned_product_ids,
        "fallbackUsed": result.fallback_used,
        "fallbackReason": result.fallback_reason,
        "cartAction": result.cart_action,
        "comparisonProductIds": result.comparison_product_ids,
        "productFacts": result.product_facts,
        "eventNames": result.event_names,
        "error": result.error,
    }
    comparison_summary = result.comparison_result or {}
    return (
        result.assistant_text,
        summarize_debug_cards(
            result.product_cards,
            result.comparison_result,
            result.cart_action,
            result.first_token_ms,
            result.total_ms,
        ),
        evidence,
        comparison_summary,
        records_to_table(
            [
                {
                    "用例ID": "debug",
                    "分组": "单条调试",
                    "问题": result.query,
                    "期望商品ID任一": "",
                    "禁止商品ID": "",
                    "期望答案要点": "",
                    "硬约束": "",
                    "关注失败类型": "",
                    "优先级": "P2",
                    "备注": "从单条调试保存",
                }
            ],
            REQUIRED_COLUMNS,
        ),
    )


def summarize_debug_cards(
    product_cards: list[dict[str, Any]],
    comparison_result: dict[str, Any] | None,
    cart_action: dict[str, Any] | None,
    first_token_ms: int | None = None,
    total_ms: int | None = None,
) -> str:
    lines: list[str] = []
    if first_token_ms is not None or total_ms is not None:
        lines.append(
            f"性能：首token {format_score(first_token_ms, 'ms')} / 总耗时 {format_score(total_ms, 'ms')}"
        )
    if product_cards:
        if lines:
            lines.append("")
        lines.append("商品卡片：")
        for item in product_cards:
            lines.append(
                f"- {item.get('id')} / {item.get('name')} / {item.get('brand')} / {item.get('priceCents')}"
            )
    if comparison_result:
        lines.append("")
        lines.append("comparison_result：")
        lines.append(json.dumps(comparison_result, ensure_ascii=False, indent=2))
    if cart_action:
        lines.append("")
        lines.append("cartAction：")
        lines.append(json.dumps(cart_action, ensure_ascii=False, indent=2))
    return "\n".join(lines) if lines else "本次没有商品卡片 / comparison_result / cartAction。"


def create_ui(default_api_base_url: str) -> Any:
    import gradio as gr

    initial_cases, _ = parse_cases_csv(SAMPLE_CASES_PATH)
    initial_preview = records_to_table(cases_to_rows(initial_cases), REQUIRED_COLUMNS)
    initial_groups = sorted({case.group for case in initial_cases})
    initial_case_ids = [case.case_id for case in initial_cases]

    with gr.Blocks(title=APP_TITLE) as demo:
        batch_results_state = gr.State([])
        gr.Markdown("# RAG Evaluation Dashboard")
        gr.Markdown("默认使用示例测试集和本地后端；日常评估只需要启动后端后点一次运行。")

        with gr.Tab("评估仪表盘"):
            run_status_html = gr.HTML(
                '<div class="simple-status">还没有运行。启动后端后，点击下面按钮即可在页面上直接看到分数。</div>'
            )
            run_button = gr.Button("运行评估", variant="primary", size="lg")
            score_cards = gr.HTML()
            chart_panels = gr.HTML()

            result_table = gr.Dataframe(
                headers=RESULT_COLUMNS,
                label="每条用例结果",
                interactive=False,
                wrap=True,
                visible=False,
            )

            with gr.Accordion("人工复核（可选）", open=False):
                with gr.Row():
                    review_case_id = gr.Dropdown(
                        choices=[],
                        label="用例",
                        allow_custom_value=True,
                    )
                    manual_score = gr.Slider(
                        minimum=0,
                        maximum=5,
                        value=4,
                        step=1,
                        label="人工分数",
                    )
                    manual_failure_types = gr.CheckboxGroup(
                        choices=[f"{key} {label}" for key, label in FAILURE_TYPES.items()],
                        label="失败类型",
                    )
                manual_notes = gr.Textbox(label="备注", lines=2)
                update_review_button = gr.Button("更新人工评分")

            with gr.Accordion("高级设置", open=False):
                with gr.Row():
                    csv_file = gr.File(
                        label="测试集上传（可选，默认使用 sample-cases.csv）",
                        file_types=[".csv"],
                    )
                    template_file = gr.File(
                        value=ensure_sample_template(),
                        label="CSV 模板 / 示例",
                        interactive=False,
                    )
                preview_table = gr.Dataframe(
                    headers=REQUIRED_COLUMNS,
                    value=initial_preview,
                    label="用例预览",
                    interactive=False,
                    wrap=True,
                )
                validation_message = gr.Textbox(
                    label="字段校验结果",
                    value=f"已读取 {len(initial_cases)} 条用例（默认示例测试集）。",
                    lines=3,
                    interactive=False,
                )
                with gr.Row():
                    api_base_url = gr.Textbox(
                        label="后端地址（通常不用改）",
                        value=default_api_base_url,
                    )
                    timeout_seconds = gr.Number(
                        label="单条超时（秒）",
                        value=90,
                        precision=0,
                    )
                with gr.Row():
                    run_scope = gr.Radio(
                        ["全部用例", "单个分组", "单个用例"],
                        value="全部用例",
                        label="运行范围",
                    )
                    group_filter = gr.Dropdown(
                        choices=initial_groups,
                        value=initial_groups[0] if initial_groups else None,
                        label="分组",
                        allow_custom_value=True,
                    )
                    selected_case_id = gr.Dropdown(
                        choices=initial_case_ids,
                        value=initial_case_ids[0] if initial_case_ids else None,
                        label="用例ID",
                        allow_custom_value=True,
                    )
                with gr.Row():
                    enable_judge = gr.Checkbox(
                        label="自动初评分（无 key 时用本地规则；有 key 时可用 LLM）",
                        value=True,
                    )
                    save_results = gr.Checkbox(
                        label="保存本地留档文件",
                        value=True,
                    )
                metrics_json = gr.JSON(label="原始指标数据")
                run_message = gr.Textbox(label="运行状态", lines=4, interactive=False)
                with gr.Row():
                    results_jsonl = gr.File(label="留档 JSONL", interactive=False)
                    results_csv = gr.File(label="留档 CSV", interactive=False)
                    summary_json = gr.File(label="留档 summary.json", interactive=False)

        with gr.Tab("单条调试"):
            with gr.Row():
                with gr.Column(scale=1):
                    debug_question = gr.Textbox(
                        label="用户问题",
                        lines=4,
                        placeholder="例如：推荐防晒霜，但不要含酒精的",
                    )
                    with gr.Accordion("调试设置", open=False):
                        debug_api_base_url = gr.Textbox(
                            label="后端地址（通常不用改）",
                            value=default_api_base_url,
                        )
                        debug_timeout = gr.Number(
                            label="超时（秒）",
                            value=90,
                            precision=0,
                        )
                    debug_button = gr.Button("发送调试问题", variant="primary")
                    assistant_text = gr.Textbox(
                        label="聊天输出",
                        lines=12,
                        interactive=False,
                    )
                    card_summary = gr.Textbox(
                        label="商品 / 对比 / 购物车摘要",
                        lines=12,
                        interactive=False,
                    )
                with gr.Column(scale=1):
                    evidence_json = gr.JSON(label="检索证据 / 发送给 LLM 的上下文")
                    comparison_json = gr.JSON(label="comparison_result")
                    debug_case_draft = gr.Dataframe(
                        headers=REQUIRED_COLUMNS,
                        label="保存为测试 case 草稿",
                        interactive=False,
                    )

        csv_file.change(
            preview_cases,
            inputs=[csv_file],
            outputs=[preview_table, validation_message, group_filter, selected_case_id],
        )
        run_button.click(
            run_dashboard_evaluation,
            inputs=[
                csv_file,
                api_base_url,
                run_scope,
                selected_case_id,
                group_filter,
                enable_judge,
                save_results,
                timeout_seconds,
                batch_results_state,
            ],
            outputs=[
                run_status_html,
                score_cards,
                chart_panels,
                result_table,
                metrics_json,
                run_message,
                results_jsonl,
                results_csv,
                summary_json,
                preview_table,
                batch_results_state,
                review_case_id,
            ],
        )
        update_review_button.click(
            update_dashboard_manual_review,
            inputs=[
                batch_results_state,
                review_case_id,
                manual_score,
                manual_failure_types,
                manual_notes,
                save_results,
            ],
            outputs=[
                run_status_html,
                score_cards,
                chart_panels,
                result_table,
                metrics_json,
                run_message,
                results_jsonl,
                results_csv,
                summary_json,
                batch_results_state,
            ],
        )
        debug_button.click(
            run_single_debug,
            inputs=[debug_question, debug_api_base_url, debug_timeout],
            outputs=[
                assistant_text,
                card_summary,
                evidence_json,
                comparison_json,
                debug_case_draft,
            ],
        )

    return demo


def prepare_launch_allowed_paths() -> list[str]:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    return [
        str(WORKBENCH_DIR.resolve()),
        str(RUNS_DIR.resolve()),
    ]


def run_self_test() -> None:
    cases, warnings = parse_cases_csv(SAMPLE_CASES_PATH)
    assert cases, "sample cases should parse"
    assert not [warning for warning in warnings if "缺少必需列" in warning], warnings

    sse_text = (
        'event: message_delta\ndata: {"text":"hello","index":0}\n\n'
        'event: product_cards\ndata: {"items":[{"id":"p1","name":"demo"}]}\n\n'
        'event: comparison_result\ndata: {"productIds":["p1","p2"]}\n\n'
        'event: done\ndata: {"recommendedProductIds":["p1"],"fallbackUsed":false,"retrieval":{"candidateCount":1,"returnedProductIds":["p1"]}}\n\n'
    )
    events = parse_sse_stream_text(sse_text)
    assert [event.event_name for event in events] == [
        "message_delta",
        "product_cards",
        "comparison_result",
        "done",
    ]
    result = build_result_from_events(
        run_id="self_test",
        case=cases[0],
        events=events,
        api_base_url=DEFAULT_API_BASE_URL,
        http_status=200,
        first_token_ms=123,
        total_ms=456,
    )
    update_manual_review(result, 4, ["F5"], "self test")
    auto_judge_result(result)
    summary = compute_summary([result])
    assert summary["用例总数"] == 1
    assert summary["已人工评分数"] == 1
    assert summary["平均首token(ms)"] == 123
    assert summary["P95首token(ms)"] == 123
    assert summary["平均总耗时(ms)"] == 456
    assert summary["首token样本数"] == 1
    rows = results_to_rows([result])
    assert rows[0]["首token(ms)"] == 123
    assert rows[0]["总耗时(ms)"] == 456
    export_dict = result_to_export_dict(result)
    assert export_dict["firstTokenMs"] == 123
    assert export_dict["totalMs"] == 456

    tmp_run_dir = RUNS_DIR / "self_test"
    if tmp_run_dir.exists():
        shutil.rmtree(tmp_run_dir)
    cases_path, results_path, summary_path = save_run_outputs(
        "self_test",
        [cases[0]],
        [result],
    )
    assert Path(cases_path).exists()
    assert Path(results_path).exists()
    assert Path(summary_path).exists()
    allowed_paths = prepare_launch_allowed_paths()
    assert str(WORKBENCH_DIR.resolve()) in allowed_paths
    assert str(RUNS_DIR.resolve()) in allowed_paths
    shutil.rmtree(tmp_run_dir)
    print("self-test passed")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=APP_TITLE)
    parser.add_argument("--api-base-url", default=DEFAULT_API_BASE_URL)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7860)
    parser.add_argument("--share", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if args.self_test:
        run_self_test()
        return 0

    demo = create_ui(args.api_base_url)
    demo.launch(
        server_name=args.host,
        server_port=args.port,
        share=args.share,
        css=APP_CSS,
        allowed_paths=prepare_launch_allowed_paths(),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
