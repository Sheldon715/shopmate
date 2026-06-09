# Chat / RAG / UI 稳定性修复总 spec

## 背景

ShopMate 已经连续完成了多轮 RAG、意图识别、首 Token、Android 商业化打磨、购物车和 checkout 能力。现在的问题不是单个功能缺失，而是功能叠加后出现了回归：

- 之前修好的对话能力在新功能后退化。
- 同一类问题在不同路径表现不一致。
- 后端返回、Android 渲染和商品数据之间偶尔不一致。
- 首 Token 优化可能压缩了 prompt / token / 并行路径，但不能以牺牲模型表现为代价。

本 spec 的目标是先统一 bug 范围和修复顺序，避免继续“修一个坏一个”。实现时必须先建立回归用例，再按后端 contract、RAG 质量、Android UI、数据补强的顺序推进。

## 当前证据

用户截图和当前 smoke test 暴露了以下问题。

## 与既有 spec 的关系

本 spec 不替代之前已经写过和实现过的 spec，而是作为稳定性回归总入口。修复时必须回到 `context/spec-implementation-order.md` 和 `context/current-feature.md` 历史记录，逐条核对已经完成的能力是否仍然成立。

重点回看这些既有能力：

- `Active Clarification` / `Active Clarification LLM Intent`
  - 已承诺宽泛购物需求应由 LLM 判断是否需要澄清。
  - 当前“跑鞋推荐”直接推荐，属于该能力的回归候选。
- `Chat Context Memory`
  - 已承诺多轮预算、类目、偏好能合并到同一购物意图。
  - 当前“跑鞋推荐 -> 300 左右，好穿耐用”无结果且回答不完整，需要回查会话记忆和约束合并。
- `RAG Chat Response Generation`
  - 已承诺无候选商品说明由 LLM 生成，并且 Android 不再把已有 assistant 文案当错误卡。
  - 当前 no-candidates 文案短、截断、不可继续，需要回查 token / streaming / fallback。
- `RAG Query Rewrite` / `RAG Pipeline 并行首 Token 优化`
  - 已承诺 query rewrite 只改检索 query，原始问题仍用于用户可见回复。
  - 当前推荐不稳定、同一对话漂移、低价条件失败，需要回查 query rewrite、并行竞速和 cache key。
- `RAG Negative Fact Metadata` / `Negative Constraint RAG`
  - 已承诺否定约束进入事实过滤和 vector filters。
  - 反选、耳机佩戴形态、酒精 / 不入耳等问题必须纳入本轮回归。
- `Comparison Ambiguous Clarification` / `Comparison Target Consistency and Performance`
  - 已承诺比较目标不明确时澄清，且 Android 可见商品顺序用于后端目标解析。
  - 发送新消息后旧商品卡 / 详情入口消失，可能影响比较和加购目标定位。
- `Conversational Cart Add` / `Cart Natural Language Management`
  - 已承诺“把第一款加入购物车”等业务动作走 cart intent 和最近推荐 allowlist。
  - 不能落入普通 RAG no-candidates。
- `Mock Checkout Agent Flow` / `AI Checkout Backend Patch Contract` / `Checkout Realtime SSE Event`
  - 已承诺聊天侧 checkout draft、确认、取消和实时状态事件。
  - “下单第一款商品”异常必须回查 checkout intent、target resolution 和 SSE contract。
- `首 Token 优化` / `首 Token 体验回归修复`
  - 已承诺后端首条 `message_delta` 是真实业务回答，Android 本地 waiting 气泡承担等待反馈。
  - 本轮不能为了速度降低 prompt 事实量、completion token 或回答完整性。
- `Android Home Prompt Carousel`
  - 已承诺 Home prompt 覆盖推荐、预算、反选、图片找货、对比、购物车 checkout 等入口。
  - 首页 prompt 必须全部对应稳定可演示路径；如果数据不足，要调整 prompt 或补数据。
- `Android Loading Skeleton Polish` / `Android Product Card Rich Interaction` / `Android Motion Transition Polish`
  - 已承诺小屏、商品卡、详情、购物车和 checkout 的 loading / empty / 操作反馈稳定。
  - 商品名截断、推荐理由 UI 异常、购物车总价显示异常都要回查这些 UI polish 结果。

执行方式：

1. 先不急着再写全新功能 spec。
2. 对每个已完成 spec 抽 1-3 条最关键的回归 case。
3. 能用后端单元测试覆盖的进入 Vitest。
4. 能用 Android ViewModel / mapper 测试覆盖的进入 `testDebugUnitTest`。
5. 只能靠真机 / 页面观察的，写入手测清单和 smoke 结果。
6. 如果发现原 spec 本身没有覆盖当前需求，才拆新的升级 spec；否则按 bugfix 修复已承诺行为。

### 用户截图反馈

1. 推荐理由质量差
   - 商品卡推荐理由现在常出现“品牌 + 类目 + 当前可选”这类弱解释。
   - 期望使用“适用人群 / 使用场景 / 核心优势 / 用户约束命中点”，而不是只写品牌。

2. 聊天气泡文本显示不全
   - 无结果或补充建议的回复在气泡底部被截断。
   - 需要区分是后端生成文本本身被截断，还是 Android 气泡 / typewriter / 滚动锚点导致显示不完整。

3. 无推荐说明但仍展示商品
   - Android 出现“这次没有生成可靠推荐说明。”，下面却展示商品卡。
   - 这会让用户无法判断为什么推荐，也可能暴露后端 answer 与 product_cards 不一致。

4. 推荐不稳定 / 搜索失败
   - “手机推荐”“蓝牙耳机推荐”“跑鞋推荐”等路径出现反复“当前商品库没有找到匹配结果”。
   - 如果商品库确实没有对应类目，应给出完整、可继续的解释；如果商品库有对应商品，则属于检索 / filter / query rewrite / context 回归。

5. 商品名称显示不全
   - 商品卡标题被过早省略，用户看不清商品核心型号。
   - 小屏下需要允许 2 行标题或更稳定的自适应高度。

6. 发送新消息后，之前推荐的商品页 / 商品卡消失
   - 历史消息中的商品卡不应因为新一轮发送而从原位置消失。
   - 新消息可以产生新的推荐，但不能破坏旧消息附件和详情入口。

7. 同一提示词在同一对话内回复错误
   - 同一个或相近需求重复发送后，结果不稳定。
   - 需要检查 conversation memory、recentProductIds、visible product ids、query rewrite、cache key 和 fallback 的交互。

8. 总价显示异常
   - 购物车合计显示与所选数量 / 商品数量之间存在异常感。
   - 需要核对后端 `summary.selectedTotalCents`、Android mapper、底部 footer 排版和大金额显示。

9. 搜索 / 反问失败
   - “跑鞋推荐”以前应该主动反问预算、场景和性能偏好；现在直接推荐。
   - “300 左右，好穿耐用”后又进入无结果，说明主动澄清、多轮上下文和价格约束合并不稳定。

10. 下单功能仍然异常
    - “下单第一款商品”被回答成“当前商品库没有找到匹配结果”。
    - 业务动作不能落入普通 RAG no-candidates；应进入 checkout / cart action intent，不明确时应澄清目标商品。

11. 商品详情页推荐理由 UI 异常
    - 从商品卡进入详情后，推荐理由区域仍有裁切、重复条目或层级混乱。
    - 详情页应展示完整可读的导购理由，不应把商品名本身当成理由 bullet。

12. 首页推荐点进入后无可靠说明
    - 从 Home prompt 进入后，回答“没有生成可靠推荐说明”，但仍展示商品。
    - 首页 prompt 是 Demo 主入口，必须纳入回归用例。

### 本轮 smoke test 结果

已执行：

```powershell
cd server
npm.cmd test
npm.cmd run build

cd client/android
.\gradlew.bat --no-daemon testDebugUnitTest
```

结果：

- 后端 55 个测试文件、412 个测试通过。
- 后端 TypeScript build 通过。
- Android `testDebugUnitTest` 通过。

说明：现有自动化没有覆盖这些真实体验回归，需要新增稳定性回归用例。

本地 `POST /api/chat/stream` smoke 观察：

| 输入 | 当前结果 | 判断 |
| --- | --- | --- |
| `跑鞋推荐` | 直接推荐 3 款跑鞋 | 应主动反问，属于 clarification 回归 |
| `300左右，好穿耐用` | 无商品，回答被截断为“符合你预算和好” | no-candidates 文案 / token / streaming 完整性问题 |
| `1000元以下的蓝牙耳机有哪些？` | 无商品，返回“当前商品库没有找到匹配结果。” | 需要确认商品库价格范围；无结果文案过短 |
| `帮我推荐一款手机 适合老年人使用 预算1000-2000` | 无商品，泛化无结果 | 如果库内无手机，应说明“暂未收录手机类商品”而不是泛化失败 |
| `推荐一款适合油皮的洗面奶` | 能返回洁面商品和理由 | 可作为正向基线 |
| `推荐一款小容量省空间，适配宿舍使用的一人食小家电` | 回答说没有合适推荐，但 product_cards 返回美妆商品 | P0，回答与商品卡冲突，必须先修 |

## 问题分类

### P0：合同和事实一致性

这些问题会破坏 RAG 安全边界，优先修。

- 回答说无推荐或无可靠说明，但仍返回不相关 product_cards。
- 商品卡类目和用户需求不一致，例如宿舍小家电返回美妆护肤。
- checkout / cart 业务动作落入普通 RAG no-candidates。
- 后端返回的 answer、recommendedProductIds、product_cards、done.retrieval 之间不一致。

### P1：对话智能稳定性

这些问题影响核心导购体验。

- 宽泛请求不主动反问，例如“跑鞋推荐”。
- 多轮补充条件后上下文没有稳定合并，例如“300 左右，好穿耐用”。
- 同一对话重复或相似提示词结果漂移。
- no-candidates 回复太短、重复、不可继续，甚至文本截断。
- 首 Token 优化后 prompt / token 压缩可能让模型输出变弱，需要重新平衡。

### P1：Android 展示稳定性

这些问题直接影响 Demo 观感。

- 聊天气泡文本底部裁切。
- 商品卡标题过早省略。
- 商品卡推荐理由行数 / 高度不足。
- 商品详情推荐理由区域裁切或重复。
- 新消息发送后旧商品卡消失或详情入口丢失。
- 购物车合计显示异常或 footer 文本挤压。

### P2：数据和能力升级

这些不一定是 bug，但如果 Demo 需要，就应作为升级项写清楚。

- 商品库是否包含手机、老人机、低价耳机、300 元跑鞋等测试场景。
- 商品结构化字段是否足够支持“适用人群 / 优势 / 使用场景”理由。
- 首页 prompt 是否全部对应真实可稳定召回的商品类别。

## 修复原则

- 先保证后端合同一致，再修 Android 展示。
- 无结果时不能强行返回商品卡。
- 商品卡只能来自与用户需求一致、通过后端事实校验的商品。
- 业务动作优先进入 cart / checkout intent；不明确时澄清，不走普通搜索失败。
- 推荐理由必须使用商品事实和用户约束，不靠品牌 / 类目模板凑数。
- 首 Token 继续优化，但不能降低回答完整性、推荐准确性和解释质量。
- 每修一个问题都要加入回归用例，避免后续功能再次破坏。

## 反过拟合评估策略

本轮不能只对用户截图里的原句做定向修补。每个 bug 都必须被抽象成一个行为不变量，并配套同义变体和留出 case：

- `seed`：来自截图或 smoke 的原始失败输入，用来复现 bug。
- `paraphrase`：同一用户意图的 2-4 个自然改写，用来确认不是只修了原句。
- `holdout`：修代码时不针对它调 prompt / 规则，最后统一跑，用来发现过拟合。
- `invariant`：只断言业务行为，例如“宽泛品类先澄清”“无可靠回答不得有 product_cards”“cart / checkout 命令不得落入普通 no-result”，不要求 assistant 文案逐字一致。
- `layer`：标明归因层，包括 `intent`、`retrieval`、`generation`、`contract`、`android_ui`、`cart_checkout`、`data_coverage`。

评估依据：

- OpenAI eval best practices 强调 eval-driven development、真实分布、自动化评分、人审校准、持续评估和覆盖输入变体；本轮照这个方法做，不用“感觉好了”作为验收。
- RAGAS / RAG 评估资料把 RAG 拆成 retrieval context、response relevancy、faithfulness / groundedness 等维度；ShopMate 对应为“召回是否相关”“回答是否基于库内事实”“商品卡 / done contract 是否一致”。
- LangChain text splitter 文档建议按文档结构或递归层级拆分，让 chunk 尽量保持语义完整；Pinecone chunking 资料强调 chunk 要在“足够包含意义”和“足够小以避免主题混杂 / 保持低延迟”之间折中。ShopMate 商品文档不能只靠默认 chunk size，要按商品字段、FAQ、评论和内容块分别评估。
- 涉及 RAG 检索、RAG prompt、RAG eval、query rewrite、ranking、grounding 的新问题，修复前先查资料或官方 / 论文 / 框架文档，再落到本 spec 和测试里。

参考资料：

- OpenAI Evaluation best practices: https://platform.openai.com/docs/guides/evaluation-best-practices
- RAGAS available metrics: https://docs.ragas.io/en/v0.2.9/concepts/metrics/available_metrics/
- LangChain recursive text splitter / text splitting docs: https://python.langchain.com/docs/how_to/recursive_text_splitter/
- Pinecone chunking strategies: https://www.pinecone.io/learn/chunking-strategies/

具体落地：

1. 新增 `data/processed/rag/chat-stability-regression-cases.json`，记录截图 seed、同义变体、留出 case 和不变量。
2. 新增 Vitest 校验：case id 唯一；每个 P0/P1 case 至少有 seed + paraphrase + holdout；自动化 case 不允许只有单句。
3. 对能自动化的后端行为加服务级测试，例如 clarification、fallback card suppression、no-result 完整性、checkout / cart routing。
4. 对 Android 展示问题加 ViewModel / mapper / Compose 可测断言；真机只能观察的放进手测清单，但仍用同义输入验收。
5. 每修一个 bug，都先把它加入 regression matrix，再实现；刚刚已修过但测试只覆盖单句的部分，也要补同义/留出用例后重新验证。

## 数据工程与模型 / Agent 治理补充

用户补充截图中的“数据工程与特征治理”和“模型 / Agent 编排”正式纳入本轮稳定性范围，不再只看 prompt 或单条测试结果。

### 数据工程与特征治理

- 非结构化数据向量化
  - 商品详情、规格、功能、材质、广告文案、FAQ、用户评价要转成可检索向量索引。
  - 向量文档必须保留商品 ID、类目、子类目、价格、库存、可售状态、字段来源、block 类型等 metadata，避免检索命中后无法做事实过滤。
  - 广告文案和用户评论不能直接当事实；推荐理由优先使用结构化属性、核心卖点、适用人群、使用场景，再用营销描述抽短事实补充。

- 数据一致性保障
  - 商品价格、库存、状态以后续 PostgreSQL 商品回查为准；RAG 文档只提供召回和解释证据。
  - `product_cards`、`recommendedProductIds`、checkout / cart target 和详情页必须使用同一个 active product source。
  - 索引 manifest、catalog manifest 和测试结果要能追溯到同一批数据；如果补数据，必须重建 catalog / RAG documents / vector index 并记录结果。

- Chunking 策略设计
  - 不把整段商品详情、FAQ、评论粗暴塞进一个大 chunk；优先按 `description`、`selling_point`、`scenario`、`limitation`、`sku`、`faq`、`review_summary` 等 block 拆分。
  - 每个 chunk 必须聚焦单一语义：例如“油皮粉底液 FAQ”不能因为同属美妆而污染“油皮洗面奶”检索；“厨房小电 / 一人食”不能混进美妆。
  - 后续需要做 chunk size / overlap A/B：以 300-500 tokens、500-800 tokens、content-block 原子 chunk 作为候选，比较 context precision、context recall、cross-category bleed、latency 和最终 answer/cards 一致性。
  - 调整 chunk size 前先跑固定 eval；不能因为某个原句变好就接受新 chunk 策略。

### 模型 / Agent 编排

- RAG 链路可靠性
  - 解决“幻觉优惠 / 不存在功能 / 无推荐却有商品卡”问题，所有对用户可见商品和 checkout / cart target 必须通过 allowlist 和 active product 回查。
  - LLM 输出无效时，只能用库内候选和商品事实做保守 fallback；不能把不相关候选卡片展示出去。

- 意图识别
  - 区分“随便看看”“宽泛推荐”“明确购买 / 加购 / 下单”“补充预算 / 偏好”“反选 / 比较”等意图。
  - 业务动作优先于普通 RAG；宽泛需求先澄清；明确需求进入检索；不明确目标进入 target clarification。

- Prompt Engineering
  - 系统提示词要明确输出格式、商品 allowlist、推荐理由必须来自商品事实、无结果时如何解释。
  - token / prompt 压缩只能删冗余，不能删商品事实、约束和输出校验要求。
  - 首 Token 优化只能优化等待体验和并行路径，不得减少关键事实或 completion token 到影响回答完整性的程度。

## 分阶段修复计划

### Phase 0：冻结回归矩阵

新增一组稳定性测试问题，先作为后端 Chat SSE smoke / Gradio case / Android 手测清单。

必须覆盖：

- `跑鞋` / `跑鞋推荐` / `推荐一款跑步鞋` / `运动鞋推荐`
- `跑鞋推荐` -> `300左右，好穿耐用`
- `推荐一款跑鞋` 连续重复两次
- `1000元以下的蓝牙耳机有哪些？`
- `500元以内，适合学生党的蓝牙耳机`
- `推荐一款适合油皮的洗面奶`
- `推荐一款适合油皮的洗面奶，不要含酒精`
- `推荐一款小容量省空间，适配宿舍使用的一人食小家电`
- `帮我推荐一款手机，适合老年人使用，预算1000-2000`
- 推荐后发送 `下单第一款商品`
- 推荐后发送 `把第一款加入购物车`
- 从 Home prompt 进入推荐、反选、对比、图片找货、购物车 checkout 相关问题

验收重点：

- 是否应该反问。
- 是否返回商品卡。
- answer 与 product_cards 是否一致。
- 商品类目是否符合需求。
- 推荐理由是否命中用户约束。
- fallbackReason 是否合理。
- 文本是否完整。
- Android 是否保留历史商品卡。
- 同义变体是否保持同一类行为，不因换一种说法失效。

### Phase 1：后端合同一致性修复

目标：先消灭 P0。

预计检查 / 修改：

- `server/src/modules/chat/rag.service.ts`
- `server/src/modules/chat/clarification-intent.service.ts`
- `server/src/modules/chat/rag-response-generation.service.ts`
- `server/src/modules/chat/prompt.builder.ts`
- `server/src/modules/chat/query-rewrite.service.ts`
- `server/src/modules/chat/popular-query-cache.coordinator.ts`
- `server/src/modules/chat/cart-command-intent.service.ts`
- `server/src/modules/chat/checkout-intent.service.ts`
- `server/src/modules/products/product.mapper.ts`
- `server/src/modules/vector/vector-search.service.ts`

修复内容：

- 宽泛品类请求恢复主动澄清：如“跑鞋推荐”应问预算、使用场景、性能偏好。
- no-candidates 路径必须完整生成可继续的回复，不能截断。
- 当 LLM 输出无效或无可靠推荐说明时，不允许附带不相关 product_cards。
- 增加 answer / product_cards 一致性校验：如果回答是无推荐，product_cards 必须为空；如果有 cards，回答必须能解释这些商品。
- 增加类目 / 子类目 / 属性 guard，避免小家电请求返回美妆。
- cart / checkout command 在 RAG 之前被识别；目标不清楚时返回澄清，不返回“商品库没有找到匹配结果”。
- 检查热门查询缓存 key 是否包含足够上下文，避免同一句在同会话漂移或拿到不匹配缓存。

### Phase 2：推荐理由质量修复

目标：让推荐理由从“品牌 / 类目”升级为真实导购理由。

预计检查 / 修改：

- `server/src/modules/chat/prompt.builder.ts`
- `server/src/modules/chat/rag-response-generation.service.ts`
- `server/src/modules/chat/rag-llm-output.parser.ts`
- `server/src/modules/products/product.mapper.ts`
- `client/android/app/src/main/java/com/shopmate/app/data/chat/ChatProductMapper.kt`
- `client/android/app/src/main/java/com/shopmate/app/data/products/ProductDetailMapper.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/model/ProductCardUi.kt`

修复内容：

- 给 LLM 的商品事实优先包含 `suitableFor`、`useCases`、`sellingPoints`、`attributes`、`avoidFor`、价格和库存。
- 推荐理由 schema 要求每个商品给出命中用户需求的 1-2 个事实点。
- 后端验证推荐理由不能只等于品牌 / 类目 / 当前可选。
- LLM 失败时使用商品事实生成安全 fallback，例如“适合宿舍一人食、小容量、易收纳”，而不是“品牌 + 类目”。
- Android 商品卡和详情页统一消费同一条可信推荐理由，不各自拼模板。

### Phase 3：Android 聊天和商品卡稳定性修复

目标：修复截图中的裁切、消失、显示不全。

预计检查 / 修改：

- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatViewModel.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/AssistantTextRevealer.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ChatMessageBubble.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/components/ProductCard.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/product/ProductDetailScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/comparison/ProductComparisonScreen.kt`

修复内容：

- `done`、`error`、`product_cards`、`comparison_result` 到达时 flush typewriter 未显示文本，避免气泡只显示半句。
- AI 气泡不设置会裁切正文的固定高度；长文允许自然换行。
- 聊天列表底部 padding 避免被 composer、浮动菜单和底部遮罩盖住。
- 商品卡标题至少支持 2 行；长型号保留关键前半段，价格和按钮不被挤压。
- 推荐理由支持 2-3 行，超长时详情页可完整展示。
- 每条 assistant message 的 product_cards 固定锚在该消息上，新消息不能清空旧消息附件。
- 详情页推荐理由区域改为完整可读，不把商品名重复当 bullet。

### Phase 4：购物车合计和 checkout action 稳定性修复

目标：修复总价显示异常和下单命令异常。

预计检查 / 修改：

- `server/src/modules/cart/cart.mapper.ts`
- `server/src/modules/cart/cart.service.ts`
- `server/src/modules/chat/checkout-command.service.ts`
- `server/src/modules/chat/checkout-intent.service.ts`
- `server/src/modules/orders/*`
- `client/android/app/src/main/java/com/shopmate/app/data/cart/CartMapper.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/cart/CartScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/checkout/CheckoutScreen.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/chat/ChatRecommendationScreen.kt`

修复内容：

- 以后端 `summary.selectedTotalCents` 作为购物车底部合计权威来源。
- Android mapper 不自行重复推导总价，除非后端字段缺失且有明确 fallback。
- 底部 footer 为 5 位以上金额留出空间，避免 `¥2512` 这类金额被挤压或误读。
- `下单第一款商品` 如果有最近推荐商品，应生成 checkout draft；如果没有上下文，应问“你想下单哪一款？”。
- checkout_action / done.checkoutAction 去重逻辑继续保留，避免草稿卡残留或重复刷新。

### Phase 5：数据补强和首页 prompt 校准

目标：区分“代码 bug”和“商品库没有数据”。

预计检查 / 修改：

- `data/raw/`
- `data/processed/catalog/products.normalized.jsonl`
- `data/processed/rag/product-documents.jsonl`
- `context/feature/android-home-prompt-carousel-spec.md`
- `client/android/app/src/main/java/com/shopmate/app/data/mock/MockShopMateData.kt`

修复内容：

- 盘点商品库是否有手机、老人机、300 元跑鞋、1000 元以下耳机、一人食小家电。
- 如果 Demo 要展示这些问题，就补齐商品数据并重建 catalog / RAG documents / vector index。
- 如果短期不补数据，首页 prompt 和测试问题必须避开不存在类目，或者无结果文案明确说明“当前库内暂未收录该类商品”。
- 商品数据要补适用人群、使用场景、核心卖点、避雷项，支撑推荐理由质量。

## 首 Token 与模型表现策略

首 Token 优化保留，但本轮修复先以质量稳定为准。

需要检查：

- 全局 `LLM_MAX_COMPLETION_TOKENS` 是否过低。
- `RagResponseGenerationService`、clarification、query rewrite、comparison、cart / checkout response 是否各自有过低 token 上限。
- prompt 压缩是否删掉了推荐理由需要的商品事实。
- streaming JSON answer extractor 是否在 done 时完整 flush。
- Android typewriter 是否在 stream 完成时完整 flush。

原则：

- Android 本地 waiting / thinking 气泡承担“马上有反馈”的体验。
- 后端第一条真实 `message_delta` 仍必须是完整业务回答的一部分。
- 不用截短回答换首 Token。
- 指标分开看：`first_visible_feedback_ms`、`grounded_first_delta_ms`、`done_ms`、推荐命中率、无结果准确率和解释质量。

## 验收标准

后端验收：

- 新增稳定性回归 cases。
- `跑鞋推荐` 返回澄清，不直接推荐昂贵跑鞋。
- `跑鞋推荐 -> 300左右，好穿耐用` 要么返回符合预算的跑鞋，要么完整说明库内无符合预算跑鞋并询问是否放宽预算。
- `推荐一款小容量省空间，适配宿舍使用的一人食小家电` 不能返回美妆 product_cards。
- `下单第一款商品` 不再进入普通 RAG no-candidates。
- answer、product_cards、recommendedProductIds、done.retrieval.returnedProductIds 一致。
- no-candidates 文本完整，不被截断。
- 后端 `npm.cmd test` 和 `npm.cmd run build` 通过。

Android 验收：

- 聊天气泡长文完整显示，不被底部菜单、composer 或固定高度裁切。
- 商品卡标题至少 2 行可读，不影响价格和按钮。
- 商品卡推荐理由不再只显示品牌 / 类目。
- 商品详情推荐理由完整可读。
- 发送新消息后历史商品卡和详情入口不消失。
- 购物车合计显示与选中商品数量 / 后端 summary 一致。
- Android `testDebugUnitTest` 和带 demo HTTPS URL 的 build 通过。

Demo 验收：

- 从 Home prompt 进入的主路径都有可靠回答或合理澄清。
- 推荐、反选、对比、加购、购物车、checkout 都能在同一会话中连续演示。
- 无结果场景像正式产品：说明原因、给出调整方向，不重复机械失败。

## 不做

- 不在本轮新增真实支付、真实物流、真实登录体系。
- 不为了修 UI 重写导航架构。
- 不为了修搜索直接替换向量库或 LLM provider。
- 不把不存在的商品硬塞进回答。
- 不继续单独追求首 Token 数字，直到质量回归通过。

## 建议实施顺序

1. 将本 spec load 到 `context/current-feature.md`。
2. 新建分支：`fix/chat-rag-ui-stability`.
3. 先写后端稳定性回归测试，复现 P0。
4. 修后端 answer / product_cards / no-candidates / action routing。
5. 修推荐理由质量。
6. 修 Android 文本裁切、商品卡、详情页和历史卡片锚点。
7. 修购物车合计和 checkout 指令路径。
8. 如需要，再补数据并重建 RAG artifacts。
9. 跑完整验证，整理前后对比结果。
