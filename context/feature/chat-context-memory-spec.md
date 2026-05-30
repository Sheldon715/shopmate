# Chat Context Memory

## 概述

为 ShopMate 聊天链路补上最小多轮上下文记忆。目标是让用户可以连续表达约束，而不是每一轮都重新说完整需求。

示例：

```text
用户：帮我推荐跑鞋
AI：...
用户：要轻量的
AI：结合上一轮跑鞋需求，继续按轻量方向筛选。
用户：预算 500 以内
AI：在跑鞋 + 轻量 + 500 元以内的约束下推荐商品。
```

本 spec 的重点是短期会话记忆，不做长期用户画像。第一版使用 `conversationId` + 后端有界内存 store，保存最近意图、约束和上一轮推荐商品，服务当前课程 demo 的多轮导购体验。

## 范围

本 spec 负责：

- Android 为每个本地聊天会话发送稳定 `conversationId`。
- 后端根据 `conversationId` 保存短期 `ChatContextMemory`。
- 后端合并当前问题、短历史和已保存记忆，生成用于检索和 prompt 的上下文。
- 支持预算、品类/子类目、偏好关键词、否定词和上一轮推荐商品 id 的最小记忆。
- `done` 事件可选返回当前 context 摘要，方便测试和后续功能复用。
- Android 历史会话恢复后继续使用同一个 `conversationId`。
- 为后续 `active-clarification-spec.md` 和 `conversational-cart-add-spec.md` 提供最近意图 / 最近推荐商品基础。

不负责：

- 登录、用户画像、跨设备同步。
- 把上下文长期写入 PostgreSQL。
- 用 LLM 做复杂 query rewrite。
- query expansion / rerank。
- 否定约束完整过滤；这个留给 `negative-constraint-rag-spec.md`。
- 购物车自然语言加购；这个留给 `conversational-cart-add-spec.md`。
- UI 上展示“记忆面板”或调试信息。

## 前置条件

先完成：

- `rag-chat-service-spec.md`
- `chat-sse-api-spec.md`
- `android-chat-api-integration-spec.md`
- `android-main-chat-app-flow-spec.md`
- `rag-evaluation-baseline-report-spec.md`

当前项目应已有：

- Android `ChatViewModel` 本地 session snapshot。
- Android `DefaultChatRepository` 发送最近 4 条 `history`。
- 后端 `parseChatStreamRequestBody` 支持 `history`。
- 后端 `buildRagPrompt` 已把短历史放进 prompt。

## 技术决策

第一版采用后端内存记忆：

- key：`conversationId`
- store：进程内 `Map`
- TTL：建议 30 分钟
- 最大会话数：建议 100
- 无 auth 情况下只服务 demo，不承诺跨设备、跨重启、跨实例持久化

原因：

- 当前没有登录和用户体系。
- 课程 demo 更需要一条可演示、低风险的多轮链路。
- 后续如果要真实用户级记忆，再单独设计数据库表和鉴权边界。

如果后端重启或 Render 冷启动导致记忆丢失，Android 仍会发送最近短历史，系统应该降级为现有行为，不崩溃。

## Context 数据结构

新增：

- `server/src/modules/chat/chat-context-memory.types.ts`

建议类型：

```ts
export interface ChatContextMemory {
  conversationId: string;
  lastIntent?: string;
  constraints: ChatContextConstraints;
  lastRecommendedProductIds: string[];
  updatedAt: string;
  turnCount: number;
}

export interface ChatContextConstraints {
  category?: string;
  subCategory?: string;
  brand?: string;
  maxPriceCents?: number;
  minPriceCents?: number;
  preferenceTerms: string[];
  avoidTerms: string[];
}
```

规则：

- 所有字符串 trim。
- 数组去重并限制长度，例如最多 12 项。
- 不保存完整 prompt、LLM 原始响应、API key、provider error。
- `lastRecommendedProductIds` 只保存后端返回过的库内商品 id。

## Request / SSE Contract

扩展 `POST /api/chat/stream` request：

```json
{
  "conversationId": "local-chat-session-1",
  "message": "预算 500 以内",
  "history": []
}
```

要求：

- `conversationId` 可选；缺失时后端按无记忆模式处理。
- `conversationId` 长度限制建议 80 字符。
- 只允许字母、数字、`-`、`_`、`.`，避免日志和存储混乱。

扩展 `done` payload，可选：

```json
{
  "recommendedProductIds": ["p_sport_shoes_001"],
  "fallbackUsed": false,
  "retrieval": {
    "candidateCount": 5,
    "returnedProductIds": ["p_sport_shoes_001"]
  },
  "contextMemory": {
    "conversationId": "local-chat-session-1",
    "lastIntent": "推荐跑鞋",
    "constraints": {
      "maxPriceCents": 50000,
      "preferenceTerms": ["轻量"]
    },
    "lastRecommendedProductIds": ["p_sport_shoes_001"]
  }
}
```

Android 当前 JSON parser 使用 `ignoreUnknownKeys`，所以新增字段必须保持向后兼容。

## 后端实现

新增：

- `server/src/modules/chat/chat-context-memory.types.ts`
- `server/src/modules/chat/chat-context-memory.store.ts`
- `server/src/modules/chat/chat-context-memory.service.ts`
- `server/src/modules/chat/chat-context-memory.service.test.ts`

修改：

- `server/src/modules/chat/chat.types.ts`
- `server/src/modules/chat/chat-stream.request.ts`
- `server/src/modules/chat/rag.service.ts`
- `server/src/modules/chat/prompt.builder.ts`
- `server/src/modules/chat/chat.controller.ts`
- `server/src/modules/chat/chat.controller.test.ts`
- `server/src/modules/chat/prompt.builder.test.ts`
- `server/src/modules/chat/rag.service.test.ts`

### Memory Store

`ChatContextMemoryStore` 至少提供：

```ts
get(conversationId: string): ChatContextMemory | undefined
set(memory: ChatContextMemory): void
delete(conversationId: string): void
```

要求：

- 读取时清理过期项。
- 写入时限制最大 session 数。
- 单元测试覆盖 TTL、覆盖更新、最大容量。

### Memory Service

`ChatContextMemoryService` 负责：

- 从历史记忆和当前问题合并新 context。
- 解析基础预算：
  - `500以内`
  - `500 元以内`
  - `预算 500`
  - `不超过 500`
- 解析轻量偏好：
  - `轻量`
  - `便携`
  - `续航`
  - `拍照`
  - `性价比`
- 解析否定词第一版只保存，不做强过滤：
  - `不要酒精`
  - `不含酒精`
  - `除了某品牌`
- 保存 `lastRecommendedProductIds`。

不要过度泛化中文 NLP。第一版只覆盖 demo 高频表达。

### Retrieval Context

`RagChatService.answer` 改为：

1. 读取 `conversationId` 对应 memory。
2. 合并当前问题和 memory。
3. 生成 `retrievalQuery`：
   - 当前问题
   - 上一轮 intent
   - preference terms
   - category / subCategory
4. 合并 filters：
   - 请求显式 filters 优先。
   - memory 中的 `maxPriceCents` 可作为默认过滤。
5. 检索、回查商品、LLM prompt。
6. 将推荐结果写回 memory。

注意：

- 当前问题包含完整新需求时，不能被旧 intent 锁死。
- 用户说“重新推荐手机”时，应更新 intent，而不是继续跑鞋。
- 当用户点击“新聊天”并发送新的 `conversationId`，不能串到旧会话。

### Prompt

`buildRagPrompt` 增加 context section：

```text
当前会话记忆：
- 最近意图：推荐跑鞋
- 已知约束：预算 500 元以内；偏好：轻量
- 上一轮推荐商品：p_xxx, p_yyy
```

要求：

- 明确告诉 LLM：会话记忆只能辅助理解当前问题，不能覆盖当前用户最新表达。
- 不把 memory 当作事实来源；商品事实仍来自 PostgreSQL 商品字段。

## Android 实现

修改：

- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatStreamRequestDto.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatRepository.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/chat/DefaultChatRepository.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`
- `client/android/app/src/test/java/com/shopmate/app/data/chat/DefaultChatRepositoryTest.kt`
- `client/android/app/src/test/java/com/shopmate/app/ui/chat/ChatViewModelTest.kt`

要求：

- `ChatViewModel` 确保每个活跃会话有稳定 `conversationId`。
- 新建会话时创建新的 `conversationId`。
- 打开历史会话时恢复对应 `conversationId`。
- `DefaultChatRepository.streamChat` 发送 `conversationId`。
- retry 使用同一个 `conversationId`。
- Preview / mock 不依赖 `conversationId`。

不要把 `conversationId` 显示在 UI。

## 测试

后端必须覆盖：

- 无 `conversationId` 时行为兼容旧请求。
- 有 `conversationId` 时第二轮能读取上一轮 intent。
- `预算 500 以内` 能写入 `maxPriceCents=50000`。
- 新 `conversationId` 不串旧 memory。
- `lastRecommendedProductIds` 只保存真实返回的商品 id。
- prompt 中出现 context section，但不泄露敏感数据。

Android 必须覆盖：

- 新聊天生成新 `conversationId`。
- retry 不更换 `conversationId`。
- 历史会话恢复后继续使用原 `conversationId`。
- repository request body 包含 `conversationId` 和最近 history。

## 运行与验证

必须运行：

```powershell
cd server
npm.cmd test
npm.cmd run build
```

```powershell
cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
.\gradlew.bat --no-daemon build
```

建议 smoke：

```powershell
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"demo-context-1\",\"message\":\"帮我推荐跑鞋\",\"topK\":8,\"maxRecommendedProducts\":3}" http://localhost:3000/api/chat/stream
curl.exe -N -H "Content-Type: application/json" -d "{\"conversationId\":\"demo-context-1\",\"message\":\"要轻量的，预算 500 以内\",\"topK\":8,\"maxRecommendedProducts\":3}" http://localhost:3000/api/chat/stream
```

第二轮应体现跑鞋 + 轻量 + 预算约束。

## 完成标准

- Android 每个聊天会话有稳定 `conversationId`。
- 后端能按 `conversationId` 保存最近意图、约束和上一轮推荐商品。
- 第二轮短句约束能影响检索和 prompt。
- 新会话不会串旧上下文。
- 现有单轮聊天、商品卡片和 fallback 行为不破坏。
- 后端 test / build 与 Android unit test / build 通过，或记录真实失败原因。
