# RAG Chat Response Generation

## 概述

对已经完成的 `rag-chat-service-spec.md` 做一次回复生成补修：把 RAG 主流程里的用户可见回答和后端结构化状态拆开，避免代码在 LLM 输出无效、候选 id 不合法或无候选商品时拼装导购式推荐文案。

目标不是重做 RAG 检索，也不是加入 query rewrite / rerank，而是让 ShopMate 的聊天回复继续坚持“LLM 是主心骨”：推荐解释、无结果说明和候选展示说明都优先由 LLM 基于当前问题、库内商品事实和输出 schema 生成；代码只做商品 allowlist、事实回查、长度限制和状态控制。

## 范围

本 spec 负责：

- 清理 `RagChatService` 中 RAG 路径的固定导购回答。
- 区分 `answer`、`productCards`、`fallbackUsed` / `fallbackReason` 等协议状态和用户可见自然语言。
- 正常推荐路径继续由 LLM 输出 `answer` 和 `recommended_product_ids`。
- 无候选商品时，如果 LLM 可用，由 LLM 生成可继续聊天的无结果说明；如果 LLM 不可用，只返回最小状态消息和空商品卡片。
- LLM 输出无效、请求失败或候选 id 不合法时，不用代码模板伪装成导购推荐；只返回结构化状态和经过 PostgreSQL 回查的库内候选商品卡片。
- 补充 Vitest，覆盖无候选、LLM error、invalid JSON、候选外 id、全部 id 不合法等路径。

不负责：

- `conversational-cart-add-spec.md` 的加购成功 / 歧义 / 失败回复文案；那是 `conversational-cart-add-response-generation-spec.md`。
- `active-clarification-spec.md` 的澄清 intent；当前已由 `ClarificationIntentService` 处理。
- 改 Android UI。
- 改 SSE event 名称。
- query rewrite、query expansion、rerank、negative constraint、comparison output。
- 新增长期用户画像或登录权限。

## 当前问题

当前 `RagChatService` 里还有几类固定回答：

- `NO_CANDIDATES` 时直接写死“暂时没有找到匹配商品...”。
- `LLM_ERROR` / `LLM_INVALID_OUTPUT` / `NO_VALID_PRODUCT_IDS` 时直接写死“先给你几款候选商品...”。
- 当 LLM 没有选出合法商品 id 时，代码会按检索顺序拿前 N 个商品，同时给出像推荐说明一样的固定文案。

这些逻辑虽然安全，但会让代码决定用户可见导购表达。修复后，代码仍然可以决定是否返回商品卡片、哪些商品卡片是库内安全候选，但不能生成推荐理由或伪装成模型判断。

## 设计原则

- LLM 负责用户可见回答。
- PostgreSQL 商品回查是商品事实真源。
- 代码只信任 allowlist 内的 product id。
- 代码可以返回协议状态，但不写导购式解释。
- 模型不可用时，不再补写推荐理由；只给最小状态消息，避免空白 UI。
- `fallbackUsed` / `fallbackReason` 作为现有 contract 字段保留，但文档和实现里不要把它当成“模板回答”入口。

## 后端实现

修改：

- `server/src/modules/chat/rag.service.ts`
- `server/src/modules/chat/rag.service.test.ts`
- `server/src/modules/chat/prompt.builder.ts`（如需新增无候选回答 prompt）
- `server/src/modules/chat/prompt.builder.test.ts`（如新增 prompt）
- `server/src/modules/chat/chat-contract.fixture.ts`（如 fixture 文案需要同步）
- `server/src/modules/chat/chat-contract.fixture.test.ts`（如 fixture 文案需要同步）

可选新增：

- `server/src/modules/chat/rag-response-generation.service.ts`
- `server/src/modules/chat/rag-response-generation.service.test.ts`

### 输出状态

保留现有 `RagChatFallbackReason`：

```ts
type RagChatFallbackReason =
  | "NO_CANDIDATES"
  | "LLM_ERROR"
  | "LLM_INVALID_OUTPUT"
  | "NO_VALID_PRODUCT_IDS";
```

不要求本 spec 新增 SSE 字段。`answer` 仍然是 string，Android 继续把它当普通 assistant message 展示。

### 正常推荐路径

保持现有主流程：

1. vector search。
2. PostgreSQL 回查 active products。
3. 构造 RAG prompt。
4. LLM 输出：

```json
{
  "answer": "string",
  "recommended_product_ids": ["product_001"]
}
```

5. 后端只保留候选 allowlist 内的 product id。
6. 商品卡片继续来自 PostgreSQL DTO，不读取 LLM 的价格、库存、图片或卡片字段。

### 无候选路径

当 vector search 没有候选商品，或者回查后没有 active 商品：

- 不返回商品卡片。
- `fallbackUsed=true`。
- `fallbackReason="NO_CANDIDATES"`。
- 如果 LLM 可用，可调用一个无候选回答 prompt，让模型生成简短、自然、可继续聊天的导购回复。
- 无候选回答 prompt 只能承认当前库内没有完全匹配商品，并围绕用户已有预算、品类、用途、品牌或偏好继续追问或建议放宽条件。
- prompt 必须禁止推荐具体商品、价格、库存、优惠或库外商品。
- 如果 LLM 不可用或输出无效，返回最小状态消息；不要拼接导购式推荐理由。

无候选回答 LLM 输出：

- 首选直接输出最终要展示给用户的一到两句中文。
- 服务端可兼容旧 JSON `{ "answer": "string" }`，但 prompt 不再要求模型输出 JSON。
- answer 为空或不可解析时才使用最小状态消息。

### LLM 输出无效 / 请求失败路径

当主 RAG LLM 请求失败、超时、输出 invalid JSON、`answer` 为空或 schema 不合法：

- `fallbackUsed=true`。
- `fallbackReason` 按现有错误类型设置为 `LLM_ERROR` 或 `LLM_INVALID_OUTPUT`。
- 可以返回检索到并通过 PostgreSQL 回查的库内商品卡片，作为“候选商品卡片”。
- `answer` 不能写成推荐理由，不能暗示模型已经完成了选择。
- 不重新调用同一个 RAG prompt 反复重试，避免延迟和不稳定。
- 如果要给用户一句话，只能是最小状态消息，表达“这次没有生成可靠推荐说明”，不添加商品卖点。

### 候选 id 不合法路径

当 LLM 的 `recommended_product_ids` 全部不在候选 allowlist 内：

- 丢弃所有非法 id。
- `fallbackUsed=true`。
- `fallbackReason="NO_VALID_PRODUCT_IDS"`。
- 可以返回检索顺序前 `maxRecommendedProducts` 个库内候选商品卡片，但 `answer` 不能说“我推荐这些”或生成固定推荐理由。
- 如果保留 LLM 的 `answer`，必须确认它不依赖非法 product id；第一版建议不复用该 answer，只返回最小状态消息。

## Prompt 要求

如果新增无候选回答 prompt，必须包含：

- 当前用户问题。
- 当前 filters / context memory 中可公开的约束。
- 明确说明没有库内候选商品。
- 要求输出最终 assistant 文案。

必须禁止：

- 推荐库外商品。
- 编造商品名、价格、库存、优惠、功效、物流。
- 把无结果说成推荐结果。
- 输出 JSON、markdown 列表或商品卡片 JSON。

## 测试

后端必须覆盖：

- 正常 RAG 成功时仍使用 LLM `answer` 和合法 product ids。
- 无候选时返回 `NO_CANDIDATES`、空 product cards，且不会生成商品推荐理由。
- 无候选且无候选回答 LLM 可用时，使用模型生成的无结果说明。
- 无候选回答 LLM 输出无效或失败时，返回最小状态消息。
- 主 RAG LLM 失败时返回 `LLM_ERROR`，可带库内候选商品卡片，但不出现固定推荐理由。
- 主 RAG LLM invalid JSON 时返回 `LLM_INVALID_OUTPUT`，不出现固定推荐理由。
- LLM 返回的 product ids 全部非法时返回 `NO_VALID_PRODUCT_IDS`，非法 id 不进入 `recommendedProductIds` 或 `productCards`。
- LLM 返回部分合法 id 时仍按合法 id 正常成功，不误标失败。
- `fallbackReason` contract fixture 与 parser 测试保持兼容。

如果新增 service 单元测试，使用 `MockLlmClient`，不要调用真实 LLM。

## 运行与验证

必须运行：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

建议补充目标测试：

```powershell
cd server
npm.cmd test -- --run src/modules/chat/rag.service.test.ts src/modules/chat/prompt.builder.test.ts
```

如未改 SSE 字段或 Android contract，不需要重跑 Android；如果 fixture 或 payload 结构变化，再补 Android parser / ViewModel 测试。

## 完成标准

- RAG 成功路径仍由 LLM 生成用户可见推荐解释。
- RAG 异常 / 无候选路径不再用代码模板生成导购式推荐文案。
- 所有返回的商品卡片仍来自 PostgreSQL DTO。
- 非 allowlist product id 不会进入推荐结果。
- `fallbackUsed` / `fallbackReason` 保持现有 contract 兼容。
- 后端 test / build 通过，或记录真实失败原因。
