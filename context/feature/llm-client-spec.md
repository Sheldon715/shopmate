# LLM Client

## 概述

实现 Phase 2 第一版 LLM 后端 client：用 provider-neutral `LlmClient` interface 包住 OpenAI-compatible Chat Completions 调用，让后续 `rag-chat-service-spec.md` 可以安全调用模型。

本 spec 只做 LLM config、client adapter、错误映射、mock 和测试。不做 prompt builder、不做 RAG orchestration、不做 SSE、不做 Android 接入。

技术依据：`docs/llm-backend-integration-research-results.md`。

## 范围

本 spec 负责：

- 新增 `server/src/modules/llm/`。
- 定义 `LlmClient`、request / response / error types。
- 实现 OpenAI-compatible Chat Completions adapter。
- 实现 LLM env config 和 validation。
- 实现 mock client，供后续 RAG tests 使用。
- 用 Vitest 覆盖 config、adapter、error mapping 和 mock。

不负责：

- `prompt.builder.ts`。
- LLM 输出 JSON parser / product id allowlist。
- RAG chat service。
- `/api/chat/stream`。
- true provider streaming。
- tool calling、Agentic RAG、query rewriting、query expansion、re-ranking。

## API Key Gate

如果实现或验证时需要真实 LLM 调用，但本地没有有效 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`：

- 必须停下来告诉我需要配置 API key。
- 不要在代码、测试、文档、日志或聊天里硬写真实 key。
- 不要编造 key、base URL 或模型名来“跑通”。
- 不要让我把 key 粘贴到聊天里；只提示我放进本地 `.env` 或部署环境变量。
- 没有 key 时仍然要能跑 mock tests 和 build；真实 provider smoke test 标记为 skipped。

第一版验收不强制真实 LLM API 成功。

## 环境变量

`.env.example` 新增：

```text
LLM_PROVIDER=volcengine-ark
LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
LLM_API_KEY=
LLM_MODEL=Doubao-Seed-2.0-lite
LLM_TIMEOUT_MS=20000
LLM_MAX_RETRIES=1
LLM_MAX_COMPLETION_TOKENS=700
LLM_TEMPERATURE=0.2
```

规则：

- `LLM_API_KEY` 只允许为空占位，不写真实值。
- `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 任一缺失时，config 返回 disabled。
- disabled config 不让 server 启动崩溃；真正调用时抛 `LLM_CONFIG_MISSING`。
- `LLM_BASE_URL` 必须是合法 URL。
- timeout 范围：1000 到 60000。
- max retries 范围：0 到 3。
- max completion tokens 范围：64 到 2000。
- temperature 范围：0 到 1。

## 文件

预计新增：

- `server/src/modules/llm/llm.types.ts`
- `server/src/modules/llm/llm.error.ts`
- `server/src/modules/llm/llm.config.ts`
- `server/src/modules/llm/openai-compatible-chat.client.ts`
- `server/src/modules/llm/mock-llm.client.ts`
- `server/src/modules/llm/llm.config.test.ts`
- `server/src/modules/llm/openai-compatible-chat.client.test.ts`
- `server/src/modules/llm/mock-llm.client.test.ts`

预计修改：

- `server/src/lib/env.ts`
- `.env.example`

第一版不新增 npm dependency，优先用 Node native `fetch` 实现 adapter。

## Contract

`LlmClient` 第一版只要求：

- `generate(request): Promise<LlmGenerateResponse>`
- messages 支持 `system`、`developer`、`user`、`assistant`
- request 支持 `temperature`、`maxCompletionTokens`、`timeoutMs`、`responseFormat`、`abortSignal`、`requestId`
- response 返回 `text`、`model`、`provider`、`finishReason`、`usage`、`providerRequestId`、`latencyMs`

第一版不实现 `streamGenerate()`；后续需要 true provider streaming 时再扩展。

## Adapter

`OpenAiCompatibleChatClient` 要求：

- 使用 `POST {LLM_BASE_URL}/chat/completions`。
- request 包含 `model`、`messages`、`temperature`、`max_completion_tokens`。
- 可选支持 `response_format: { type: "json_object" }`。
- 使用 `AbortController` 实现 timeout。
- 支持外部 `abortSignal`，给后续 SSE 断连使用。
- 返回自己的 `LlmGenerateResponse`，不暴露 provider 原始类型。

不要在 adapter 中写 ShopMate prompt，也不要解析 `recommended_product_ids`。

## 错误

固定 error code：

- `LLM_CONFIG_MISSING`
- `LLM_BAD_BASE_URL`
- `LLM_AUTH_FAILED`
- `LLM_BAD_REQUEST`
- `LLM_RATE_LIMITED`
- `LLM_TIMEOUT`
- `LLM_PROVIDER_UNAVAILABLE`
- `LLM_INVALID_RESPONSE`
- `LLM_EMPTY_RESPONSE`
- `LLM_REQUEST_FAILED`

只重试 network、timeout、408、409、429、5xx；不重试 400 / 401 / 403 / 422。默认最多 1 次。

## Mock Client

新增 `MockLlmClient`：

- 可返回固定 `LlmGenerateResponse`。
- 可接收 handler，根据 request 返回不同结果。
- 可模拟抛出 `LlmError`。

后续 `rag-chat-service-spec.md` 用它测试 prompt builder、fallback 和 product id 校验，不调用真实模型。

## 安全规则

- 不打印 `LLM_API_KEY`。
- 不记录完整 prompt。
- 不把 `.env` 内容返回给 Android。
- 日志最多记录 provider、model、latency、error code、provider request id。
- 测试 fixture 不包含真实 key。

## 测试

Vitest 覆盖：

- config：缺少 key / base URL / model 时 disabled；非法 URL / timeout / retry / token / temperature 会报错。
- adapter：fake fetch 正常 200、401、429、500、network error、timeout、非 JSON、空 content。
- retry：只对 retryable error 重试，且次数受 `LLM_MAX_RETRIES` 限制。
- mock：固定返回、handler 返回、模拟错误。

不在单元测试中调用真实 LLM API。

## 验收标准

- `server/src/modules/llm/` 有清晰的 types、config、adapter、mock 和 tests。
- 没有真实 API key 被写入仓库。
- 缺少 API key 时不会硬跑真实 provider；需要真实调用时会停下来提示配置。
- `LlmClient.generate()` 可以通过 fake fetch 测试 OpenAI-compatible response。
- 所有错误映射有测试覆盖。
- `cd server && npm.cmd test` 通过。
- `cd server && npm.cmd run build` 通过。
