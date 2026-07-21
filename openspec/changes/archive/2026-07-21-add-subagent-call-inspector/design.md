## Context

`data/logs/claude-subagent.log` 记录了完整时序：Claude Code 先发出 `_meta.claudeCode.toolName: "Agent"` 的父工具，子工具通过 `parentToolUseId` 指向父 `toolCallId`，父工具结束前又以仅含 `toolResponse` 的中间 update 提供 `resolvedModel`、`totalTokens`、`totalDurationMs`、`totalToolUseCount` 与 `toolStats`。随后标准 completed update 才携带最终文本。实际 Apply 测试又确认新版 Claude Code ACP 会在 completed content 中把正常回复与供应商尾注作为两个独立文本块返回；通用 mapper 的无分隔拼接会丢失该块边界。

当前 `src/shared/types/stream-event.ts`、main `MessageAssembler` 和 renderer `useUIMessageAssembler` 已把 `parentToolCallId` 保存到 `DynamicToolUIPart.toolMetadata`，但 Claude adapter 不提取 Agent 运行摘要。`AssistantMessage.vue` 还会把连续工具统一交给 `ChatToolGroup.vue`，既不建立父子关系，也没有可持续更新的详情宿主。

本变更横跨 Agent 私有协议适配、同构 stream contract、实时与持久化消息组装以及 chat UI。必须保持 ACP 工具调用只承担可观测性，不从可选字段推导宿主工作流副作用；首版只对日志已证明稳定的 Claude Code 元数据作窄适配。

## Goals / Non-Goals

**Goals:**

- 在 Claude Code Agent 工具事件上提供供应商无关、可选且可持久化的子 Agent 运行摘要。
- 让实时消息和重新加载的历史消息使用相同父子关系与统计数据。
- 在一条 assistant message 内按 ID 建立可处理乱序、并行与嵌套后代的安全投影。
- 用独立父卡片替换父 Agent 的普通工具展示，并在响应式 Slideover 中展示完整可观测信息。
- 对缺失、失败、中断、孤儿、循环和旧消息保持可理解且不丢数据的降级行为。

**Non-Goals:**

- 不把子 Agent 统计计入 session `tokenUsage`，也不改变 ACP `done.totalTokens` 语义。
- 不从 `_meta.claudeCode.toolResponse` 保存完整响应、`usage`、内部 `agentId` 或其他未列入白名单的供应商数据。
- 不解析、过滤或重新解释标准 ACP content 中由供应商返回的文本尾注。
- 不通过 `Task`、`Agent` 等标题字符串猜测非 Claude Agent 的子 Agent 语义。
- 不增加 IPC channel、Pinia store、外部依赖或新的 renderer feature 目录。
- 不改变普通工具、assistant stream indicator、Fyllo Action 或其他 Agent adapter 的行为。
- 不在首版提供搜索、过滤、导出或跨消息聚合子 Agent 调用。

## Decisions

### 1. 用可选 `SubagentRunSummary` 扩展同构工具事件

在 `src/shared/types/stream-event.ts` 定义并导出：

- `SubagentRunStatus = "in_progress" | "completed" | "failed"`；
- `SubagentToolStats`，仅包含可选非负数字字段 `readCount`、`searchCount`、`bashCount`、`editFileCount`、`linesAdded`、`linesRemoved`、`otherToolCount`；
- `SubagentRunSummary`，包含可选 `status`、`agentType`、`resolvedModel`、`totalTokens`、`totalDurationMs`、`totalToolUseCount`、`toolStats`；
- `tool_call_start` 与 `tool_call_update` 的可选 `subagent?: SubagentRunSummary`。字段存在即表示父工具是已确认的子 Agent 调用，空摘要也可作为 marker。

不新增另一类 stream event，因为父工具的输入、输出、状态与生命周期仍属于现有 tool call。也不把摘要塞进 `content` 字符串，避免 renderer 再解析展示文本。

### 2. Claude adapter 只白名单提取已证明的 Agent 元数据

在 `src/main/services/session/chat/acp-mapper/agent-adapters/claude.ts` 增加纯 helper，读取 `_meta.claudeCode.toolName` 与对象形态的 `toolResponse`：

- 仅当 `toolName === "Agent"` 时返回 `subagent`；MCP 字符串响应和其他 Claude 工具不解析。
- start/in-progress 使用 event status 建立 `in_progress` marker，并可从 `rawInput.subagent_type` 补充 `agentType`。
- `toolResponse.status` 只接受三种规范状态；最终 ACP update 的 `completed/failed` 覆盖先前状态。
- 文本字段只接受非空字符串；计数、token 与耗时只接受有限且非负的数字；`toolStats` 逐字段白名单复制。
- prompt 与最终回复继续使用既有 `DynamicToolUIPart.input` / `output`，不在摘要中复制；`usage`、内部 `agentId` 和原始响应不透传。
- Claude Agent update 的标准 ACP content 保持不透明：按原始顺序保留所有文本块，并以 `\n\n` 连接后覆盖通用 mapper 的无分隔结果。该规则不检查正文、`agentId`、`SendMessage` 或 `<usage>` 文本，也不影响非 Agent 工具及其他 adapter。

选择显式 Claude adapter，而不是 renderer 按工具名称识别，原因是 ACP 公共工具字段可选且跨 Agent 时序不一致；供应商私有语义必须留在已注册 adapter 内。

### 3. 两套 assembler 以相同规则增量合并摘要

更新 `src/main/domain/session/chat/message-assembler.ts` 与 `src/renderer/src/composables/useUIMessageAssembler.ts` 的 `toolMetadataFor`：

- 把 event `subagent` 合并到 `toolMetadata.subagent`；缺失的新字段不得清空旧值，`toolStats` 也按字段合并。
- `subagent` 即使为空对象也必须保留 marker。
- 仅包含 `subagent` 的 update 也视为有效更新，解决 `toolResponse` 中间事件当前被忽略的问题。
- 后续不含摘要的标准 completed update 保留先前统计；含最终状态的 update 只更新状态及新到字段。
- `parentToolCallId` 仍允许在 start 缺失、update 到达后补齐。

main assembler 负责持久化历史 `UIMessage`，renderer assembler 负责当前流；两者保持镜像测试，避免实时视图和重载结果分叉。本变更不借机重构两套 assembler。

### 4. 用纯 projector 建图，不依赖工具相邻性

新增 `src/renderer/src/utils/chatSubagent.ts`，导出 `projectSubagentCalls(parts)` 以及 card/Slideover 所需的稳定投影类型和格式化函数。算法在单条 assistant message 内执行：

1. 按 `toolCallId` 索引所有工具 part 与原始 `partIndex`。
2. 父工具只在 `toolMetadata.subagent` 存在，或至少一个同消息工具以 `parentToolCallId` 指向它时成为子 Agent 节点；不看 title/toolName。
3. 仅连接父、子都存在且不会形成 self-edge 或 cycle 的边；非法边不隐藏子工具。
4. 以原始 part 顺序输出每个根调用的全部后代，并通过沿父链计算 `depth`；因此并行调用互不串组，嵌套调用可缩进展示，非连续工具仍能正确归属。
5. 只有成功连接到可见根调用的后代工具才从主消息 tool run 中隐藏；找不到父节点、跨消息引用、重复 ID 或循环涉及的工具继续按现有普通工具展示。

选择纯投影而不是在 Pinia 或 assembler 中维护树，是因为父子树完全可由一条消息的已持久化 parts 派生；另存可变状态会产生第二事实源，并让延迟到达的 `parentToolCallId` 更难修正。

### 5. 父卡片是工具序列中的独立 render item

扩展 `AssistantMessage.vue` 的 `RenderItem`：

- projector 标记的根父工具输出 `subagent-call` item；遇到它时先 flush 普通 `ChatToolGroup`。
- 已连接后代跳过顶层渲染；其他工具继续使用现有单卡/连续分组规则。
- `SubagentCallCard.vue` 使用 `UiSurface as="button" interactive`，以描述性 title（优先父工具 `input.description`，再回退 `title/toolName`）、Agent 类型、文字状态和可用的 `totalToolUseCount` / `totalTokens` / `totalDurationMs` 摘要展示。
- 状态优先使用摘要中的 `completed/failed`；其余情况下，仅当该 assistant message 是当前 stream indicator 对应消息时显示“正在运行”，否则显示“已中断”。卡片状态不只依赖颜色。
- 卡片使用稳定的 `message.id + toolCallId` key，保证 parts 被 `splice` 替换时本地 open 状态不丢失。

父工具的最终 output 不再在主消息展开，而在 Slideover 中展示；父卡片之后的普通 assistant 文本保持原顺序和原渲染。

### 6. 卡片本地拥有一个受控、响应式 Slideover

新增 `SubagentCallSlideover.vue`，由 `SubagentCallCard.vue` 通过本地 `open` 状态控制。卡片向 Slideover 传入响应式 `message` 引用、根 `toolCallId` 与当前消息是否仍在 stream，而不是传递点击时生成的 projection 快照。Slideover 每次 render 都从最新 `message.parts` 重新投影，因此打开期间新增的子工具、最终回复和统计会立即出现。

Slideover 使用全局 Nuxt UI overlay 主题，宽度遵循现有详情面板模式，并包含：

- header：标题、Agent 类型、resolved model、文字状态与关闭按钮；
- metrics：仅展示上游提供的 `totalTokens`、`totalDurationMs`、`totalToolUseCount`，缺失值显示 `—`，不以可见子工具数推算；
- tool stats：按白名单字段展示读、搜、Bash、编辑、其他与增删行，保留上游的零值；
- prompt：读取父工具 `input.prompt`；缺失时显示明确不可用状态；
- tool activity：按投影顺序和 depth 展示后代，每项复用 `chatTool.ts` 的 icon/text/suffix/output 规则，默认折叠详细输入输出，展开区限制高度并滚动，底层数据不截断；
- result：父工具完成/失败后使用现有 `MarkStream` 展示 output；运行中尚无结果时显示等待状态。

运行中且暂无后代时显示“等待子 Agent 工具调用…”；终态且无后代时使用 compact `AppEmptyState` 显示“未记录工具调用”。关闭后显式把焦点还给父卡片；卡片提供可见 focus 和 `aria-expanded`。

选择卡片局部状态，而不是新 store 或全局 overlay controller，是因为 open/close 与焦点返回只属于单个 UI 单元，消息与统计已有唯一事实源。每个卡片只在打开时挂载详情内容，不保存派生副本。

### 7. 首版 Provider 边界与兼容策略

main 只为注册的 Claude Code adapter 生成 `subagent`。renderer 不检查 Agent ID，只消费规范化字段或已存在的同消息父子关系，因此未来其他 adapter 可以复用同一 UI contract。旧消息的兼容规则是：

- 有 `parentToolCallId` 但没有摘要：仍可按关系生成父卡片，统计显示不可用；
- 没有任何 marker/关系：维持普通工具展示；
- 新版部分消息或取消后的消息：保留已经收到的 prompt、子工具和统计，并按是否仍为当前 stream 显示运行中或中断。

## Risks / Trade-offs

- [Claude Code 私有 `toolResponse` 形态变化] → parser 拒绝未知形态、只复制白名单字段，并用真实日志 fixture 覆盖；失败时仍保留父子调用卡片而不展示统计。
- [Claude Agent 标准 content 增加或改变供应商尾注] → 不匹配或维护尾注文本；始终完整保留文本块，只在 adapter 内用双换行恢复结构边界。
- [乱序更新造成 UI 瞬时从普通工具切换为子 Agent 卡片] → 以稳定 toolCallId key 投影，允许 update 后关联；不为消除短暂变化而缓存第二份树状态。
- [循环、重复或跨消息引用隐藏正常工具] → projector 对每条边做存在性与 cycle guard，任何不安全边都降级为当前普通工具展示。
- [打开的 Slideover 持有过期 part 对象] → 只保存根 ID并从响应式 message 重新投影，不保存 projection 快照。
- [大量工具输出拖慢详情面板] → 工具详情默认折叠、展开区限高滚动；只在卡片打开时挂载 Slideover 主体。
- [子 Agent token 与会话 token 混淆] → UI 明确标注为子 Agent 指标，且数据不进入 session store 的 token 累加路径。
- [两套 assembler 合并逻辑漂移] → main 与 renderer 各自增加相同 fixture/断言，任务要求镜像验证统计中间 update 与最终 update。

## Migration Plan

1. 先增加全可选 shared 类型与 Claude mapper，旧消费者在字段缺失时不受影响。
2. 再更新两套 assembler，使新摘要既进入 live UI 也进入后续持久化消息。
3. 最后接入 projector、父卡片和 Slideover；旧历史消息按兼容规则渐进增强，无需数据迁移。
4. 回滚时可先移除 renderer 专用展示，使已持久化的未知 `toolMetadata.subagent` 被旧 UI 忽略；再移除 mapper/type 扩展，不需要转换已有 JSONL。

## Open Questions

无。首版 Provider 范围、展示字段、嵌套降级与状态语义已在本 Proposal 中确定。
