## Context

ACP SDK 的 tool call 事件带有工具类别 `kind`，FylloCode 在共享流事件中已经将其命名为 `toolKind`。现有 `acp-mapper` 会把 `tool_call.kind` 映射为 `SessionEvent.toolKind`，`ipc-streaming` 也要求 `tool_call_start` 与部分 `tool_call_update` chunk 携带 `toolKind`。

丢失发生在下一层：主进程 `MessageAssembler` 与渲染端 `useUIMessageAssembler` 把 `tool_call_*` 事件组装为 AI SDK `DynamicToolUIPart` 时，只保留 `toolCallId`、`toolName`、`input`、`state`、`output` 等展示字段，没有把 `toolKind` 写入 part。因此已持久化历史消息无法恢复准确分类，新消息也无法让前端稳定生成工具概况。

UI 侧当前 `AssistantMessage.vue` 按 `message.parts` 顺序逐个渲染：reasoning 走 `UChatReasoning`，tool 走 `UChatTool`，text 走 `MarkStream`。Fyllo action 的定位与状态依赖 text part 的原始 `partIndex`，所以工具折叠必须是渲染派生结果，不能重写 `message.parts`。

## Goals / Non-Goals

**Goals:**

- 连续 tool part 折叠为一个类似 `UChatTool` 的可展开面板，降低 Chat 消息流噪音。
- 新生成的 assistant `dynamic-tool` part 保留 `toolKind`，优先从 `part.toolMetadata.toolKind` 生成折叠概况。
- 历史消息无 `toolMetadata.toolKind` 时仍参与折叠，概况降级为 `Run x tool(s)`。
- 展开后复用现有单个工具展示逻辑，避免改变 tool text、suffix、output 细节。
- 保持 Fyllo action 的原始 `partIndex` 语义不变。

**Non-Goals:**

- 不迁移历史 `*.messages.jsonl`。
- 不从 `toolName`、`input`、`toolCallId` 做复杂启发式分类；缺 metadata 就按 unknown/other 处理。
- 不改变 ACP `StreamContentEvent`、`MessageChunkData` 的 wire shape；`toolKind` 已经存在，本变更只改变组装为 AI SDK UI part 的方式。
- 不改变单个 tool part 的展开内容、输出格式或 streaming 判定。
- 不为 Proposal SidePanel 单独设计另一套展示规则；其共享 message 渲染通路应自然复用同一行为。

## Decisions

### 决策 1：使用 AI SDK `toolMetadata.toolKind` 承载工具类别

`DynamicToolUIPart` 原生支持 `toolMetadata?: JSONObject`，语义上是 tool invocation 的附加元数据，比写入 message-level `metadata` 更贴近数据归属。本变更规定：

- `tool_call_start.toolKind` 写入新建 part 的 `toolMetadata.toolKind`。
- 孤儿 `tool_call_update.toolKind` 写入惰性创建的 part 的 `toolMetadata.toolKind`。
- 对已有 part 应用 update 时必须保留 `prev.toolMetadata`。
- 若 update 自带 `toolKind` 且已有 part 缺少 `toolMetadata.toolKind`，实现可以补写；但不得用缺失值覆盖已有 metadata。

备选方案是扩展 `MessageMeta` 或在 renderer 维护 `toolCallId -> kind` 旁路表。前者把 tool 级数据放到 message 级容器，后者无法跨重载持久化，均不如 `toolMetadata` 直接。

### 决策 2：历史消息不推断类别，统一降级为 Run

历史 `dynamic-tool` part 没有 `toolKind`，但仍有 `type: "dynamic-tool"`，因此可以可靠判断“这是一个 tool”，不能可靠判断“这是 read/write/search”。本变更不维护脆弱的 `toolName` 映射表：

- 缺少 `toolMetadata.toolKind`、`toolKind` 不是字符串、或值不在支持集合内时，按 `other` 统计。
- `other` 的文案类型统一为 `Run`，例如 `Run 1 tool` / `Run 2 tools`。
- 混合场景按分组统计，例如 `Read 1 file, Run 2 tools`。

这样历史消息能获得折叠收益，但不会承诺无法从数据中恢复的精确分类。

### 决策 3：分组只做渲染派生，保留原始 partIndex

`AssistantMessage.vue` 应先把 `props.message.parts` 派生为 render items：

- 普通 part item：`{ kind: "part", part, partIndex }`
- tool group item：`{ kind: "tool-group", tools: [{ part, partIndex }, ...] }`

分组算法按原始 parts 顺序扫描，只有相邻 tool part 数量大于等于 2 时产出 `tool-group`；单个 tool 仍按现有 `UChatTool` 渲染。text/reasoning/其他 part 一律打断当前工具组。

所有需要 `buildActionContext` 的 text part 必须继续传入原始 `partIndex`。不得使用 render item 的 `v-for index` 作为 action context。工具分组也不得修改、过滤或重新排序 `message.parts`。

### 决策 4：概况文案集中在 renderer util 中生成

新增或扩展 `src/renderer/src/utils/chatTool.ts`，提供面向 tool group 的纯函数：

- `getToolKind(part)`：读取 `DynamicToolUIPart.toolMetadata.toolKind`，无法识别时返回 `"other"`。
- `summarizeToolGroup(parts)`：按支持顺序输出逗号分隔概况。

支持集合建议与 ACP SDK 常见 kind 对齐：`read`、`write`、`edit`、`search`、`execute`、`other`。初始文案：

- `read` → `Read x file(s)`
- `write` → `Write x file(s)`
- `edit` → `Edit x file(s)`
- `search` → `Search x tool(s)`
- `execute` → `Run x command(s)`
- `other` → `Run x tool(s)`

如果实现阶段确认 SDK 的 kind 集合包含其他稳定值，可在 spec 中保持 unknown fallback 不变的前提下扩展 util 映射。

### 决策 5：折叠面板使用局部组件复用单 tool 渲染

新增 `ChatToolGroup.vue` 或等价局部组件，职责是：

- 折叠态使用外层 `UChatTool` 渲染 header、chevron、streaming/状态视觉和 summary 文案。
- 展开态对组内每个 tool 复用现有 `UChatTool` 调用与 `getToolText` / `getToolSuffix` / `getToolOutput`。
- 展开状态仅为组件本地状态，不写入 `UIMessage` 或 session meta。

最终实现应直接用 `UChatTool v-model:open` 承载 group header，避免手写一个与 Nuxt UI `ChatTool` 相似但细节不一致的容器。外层 group 可使用 `variant="card"` 形成可展开面板；展开后内部继续渲染原有单个 tool 的 `UChatTool`，让单个 tool 的 text、suffix、output、streaming 行为与未分组时保持一致。

### 决策 6：单个 tool 与 tool group 都展示 kind icon

`UChatTool` 支持 `icon` prop，tool kind 已经通过 `part.toolMetadata.toolKind` 进入 AI SDK part，因此图标也应从同一 metadata 派生。这样用户能在消息流中快速判断当前工具动作类型，且单个工具与工具分组采用同一套视觉语言。

单个 tool 的 icon 规则：

- `read` → `i-lucide-file-text`
- `write` → `i-lucide-file-plus`
- `edit` → `i-lucide-pencil`
- `search` → `i-lucide-search`
- `execute` → `i-lucide-square-terminal`
- `other`、未知 kind、缺失 metadata → `i-lucide-wrench`

Tool group header 的 icon 规则：

- 组内存在 streaming tool 时，展示最后一个正在 streaming 的 tool 的 kind icon。
- 组内所有 tool 都结束后，展示最后一个 tool 的 kind icon。
- 如果用于展示的 tool 没有可识别 kind，则 fallback 到 `other` 的 `i-lucide-wrench`。

完成后继续展示最后一个 tool 的 icon，而不是统一切换为 wrench。原因是 group icon 在 streaming 期间表达“当前动作”，完成后保留最后动作的类型能保持状态变化连续；`wrench` 只作为无法分类或明确 `other` 时的汇总 fallback。

## Risks / Trade-offs

- [风险] 历史消息 summary 不精确。→ 明确降级为 `Run x tools`，展开后仍保留完整历史 tool 细节。
- [风险] 渲染分组误用 group index 破坏 Fyllo action partIndex。→ spec 和 tasks 明确要求所有 action context 使用原始 `partIndex`，并补组件测试覆盖 text-tool-tool-text 场景。
- [风险] streaming 期间 tool group key 抖动导致展开状态丢失。→ group key 应由组内原始 `partIndex` 或 `toolCallId` 组合生成，而不是数组对象引用或渲染循环 index。
- [风险] `tool_call_update` 替换 part 时丢失 `toolMetadata`。→ 主进程和渲染端 assembler 测试覆盖 start→update、orphan update、update 后 metadata 保留。

## Migration Plan

不迁移历史消息。新代码读历史 part 时按无 metadata 处理；新生成消息从本变更落地后自然写入 `toolMetadata.toolKind`。这是兼容性新增字段，旧消息读取路径无需迁移脚本。
