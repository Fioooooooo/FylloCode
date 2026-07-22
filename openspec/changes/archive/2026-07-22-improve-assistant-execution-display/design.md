## Context

`AssistantMessage.vue` 当前先调用 `projectSubagentCalls()` 隐藏已安全归属的子 Agent 后代工具，再按 `message.parts` 原始顺序扫描可见内容。扫描只累计连续 tool part：两个及以上工具产生 `ChatToolGroup`，单个工具直接产生 `UChatTool`；reasoning、text 和子 Agent 根卡片都会 flush 工具组。因而 `reasoning -> tool(s) -> reasoning -> tool(s) -> text` 会渲染为多段独立 `UChatReasoning` 与工具卡。Nuxt UI 的 `UChatReasoning` 在 streaming 时自动展开并在结束后延迟收起，这种交替会产生明显的纵向变化。

普通工具的 `input`、最终 `output` 和 `toolMetadata.liveOutput` 由 AI SDK tool part 承载，不需要调整 assembler 或持久化。不过 Codex ACP 1.1.4/1.1.5 的 MCP 完成事件把标准 `CallToolResult` 放在 `rawOutput.result` 中，现有 Codex adapter 只回退终端聚合字段，导致 MCP output 未进入 tool part。当前 `chatTool.ts#getToolSuffix()` 只为 Bash 返回 `input.command`、为 Glob/Grep 返回 `input.pattern`，而 `getToolOutput()` 只格式化 dynamic tool。直接工具与 `ChatToolGroup` 内部工具各自重复 output 模板；`SubagentCallSlideover.vue` 另有一套 Input/Output 模板。

本变更属于小规模 renderer 展示能力，继续位于既有 `components/chat/message/**` 与 `utils/**`，不建立新的 renderer feature。实现必须遵守 `subagent-call-inspector` 对父卡片独立展示的约束，并保留 Fyllo Action 使用的原始 `partIndex`。

## Goals / Non-Goals

**Goals:**

- 用统一详情组件为 direct tool 与 `ChatActivityGroup` 内部 tool 展示独立的 Input/Output 分区。
- 让 Codex adapter 从当前 `rawOutput.result.content` 和旧版 `rawOutput.content` 提取 MCP 文本结果，沿用现有 tool update 组装链路。
- 删除 suffix 展示和 `getToolSuffix()`，让标题行只承担工具名称、图标与状态摘要。
- 将现有 `ChatToolGroup.vue` 通过 `git mv` 重命名为 `ChatActivityGroup.vue`，以同一个默认折叠组件收拢连续两个及以上的可见 reasoning/tool activity。
- 让 activity group 展开后按原顺序直接渲染仍保持折叠的 reasoning 和逐个 tool；单个 reasoning/tool 与所有 `SubagentCallCard` 继续独立展示。
- 保持流式更新、子 Agent 投影、文本位置、原始 parts 与 `partIndex` 语义稳定。

**Non-Goals:**

- 不把 `SubagentCallCard`、text 或其他非 reasoning/tool part 纳入 `ChatActivityGroup`。
- 不改变 `UChatReasoning` 和单个 `UChatTool` 自身的详情展开语义。
- 不修改上游 ACP event、IPC schema、message assembler、持久化数据或历史消息。
- 不从 reasoning 或工具内容推断 Agent 当前任务，也不改变 `AssistantStreamIndicator` 的通用状态文案。
- 不改变子 Agent 卡片或 Slideover 的信息架构；只允许其复用统一工具详情展示。

## Decisions

### 决策 1：把现有工具组泛化并重命名为 `ChatActivityGroup`

使用 `git mv src/renderer/src/components/chat/message/ChatToolGroup.vue src/renderer/src/components/chat/message/ChatActivityGroup.vue` 保留文件历史，再把 props 从纯 tool entries 扩展为 reasoning/tool activity entries。该组件继续使用当前 `UChatTool` 单层折叠交互和本地 `expanded = false`，但展开区域按 `partIndex` 顺序派发 `UChatReasoning` 或 `ChatToolItem`。

原有 tool group 的 summary 规则泛化到 activity：summary 仍按 activity kind 首次出现顺序聚合并保持当前单复数规则，现有 Read/Write/Edit/Search/Run 文案不变，新增 `think -> Think x time(s)`。group icon 则承担“这段活动做了什么”的稳定识别：存在 streaming tool 时取最后一个 streaming tool，否则只要存在 tool 就取最后一个 tool；只有完全不含 tool 的纯 Thinking group 使用 `i-lucide-brain`。因此 mixed run 尾部追加 reasoning 不会覆盖已有工具图标，而 group 的 streaming 状态仍独立驱动 header shimmer/状态视觉，不增加“正在执行”等新前缀文案。

group 本身在历史和 streaming 状态下都默认关闭。用户展开 group 后，内部 reasoning 与 tool 也必须保持各自折叠；尤其不能让 `UChatReasoning` 的 streaming 默认行为自动展开组内 Thinking。实现应使用受控 wrapper、非自动展开的等价呈现或其他局部方案抑制自动展开，同时保留用户主动展开和内容响应式更新。

不保留第二个 execution/tool group 组件，也不建立 group 嵌套。`ChatActivityGroup` 的语义统一为“Agent 在回复过程中的连续可见 reasoning/tool activity”，纯工具、纯 reasoning 和 mixed run 只是在 summary 中呈现不同类别。

### 决策 2：用纯投影函数统一计算顶层 render items

新增 `src/renderer/src/utils/chatAssistant.ts`，导出 `AssistantActivityEntry`、`AssistantRenderItem` 与 `projectAssistantRenderItems(messageId, parts, subagentProjection)`。`AssistantMessage.vue` 的 computed 只调用该函数，不修改 `props.message.parts`。

投影按以下顺序工作：

1. 使用 `SubagentMessageProjection.hiddenPartIndexes` 跳过已安全归属的后代工具；被跳过的 part 不成为新的视觉边界。
2. 遇到 `rootByPartIndex` 中的子 Agent 根调用时 flush 当前 activity run，产出独立 `subagent-call` item；根卡片不进入 activity group。连续多个根调用逐个产出卡片，每个根调用都保持独立边界。
3. 把可见 reasoning 与普通 tool 累积为 activity run；text 和其他可见 part flush 当前 run 并保持原位。
4. activity run 含两个及以上 entry 时产出一个 `activity-group`，无论它是纯 reasoning、纯 tool 或 mixed composition。
5. activity run 只有一个 entry 时产出普通 part，保持单个 Thinking 或 Tool 的直接展示。

`activity-group` key 使用 message id、item kind 和首个原始 `partIndex`，避免已有组在追加 part 后因末尾 index 变化而重建。由单 part 首次升级为 group 时允许一次必要的组件替换；组形成后的追加必须保持 key 稳定。所有 text action context 继续使用原始 `partIndex`。

原 `chatTool.ts#summarizeToolGroup()` 与 `getToolGroupIcon()` 的 group 级职责迁入 `chatAssistant.ts` 并分别重命名为 `summarizeActivityGroup()` 与 `getActivityGroupIcon()`；tool 级 `getToolKind()` / `getToolIcon()` 继续留在 `chatTool.ts` 供 activity helper 复用。这样生产代码、测试描述、render item kind 与 `data-test` 都统一使用 activity-group 命名，同时保留现有工具类别映射。

### 决策 3：抽取统一的工具值格式化与详情组件

在 renderer 格式化之前，`src/main/services/session/chat/acp-mapper/agent-adapters/codex.ts` 负责把 Codex ACP 当前的 `rawOutput.result.content[]` 与旧版直接 `rawOutput.content[]` 中的 text block 按原始顺序拼合为内部 tool update 的 `content`。标准 ACP `update.content` 仍保持最高优先级，终端的 `formatted_output`、`aggregated_output`、`stdout` 与 `stderr` fallback 保持不变；这只补齐 Agent-specific adapter 归一化，不改变 assembler、持久化或 renderer 数据结构。

扩展 `src/renderer/src/utils/chatTool.ts`：

- 导出覆盖 `DynamicToolUIPart | ToolUIPart<UITools>` 的公共 tool part 类型。
- 新增 `getToolInput(part): string | null`，读取 tool part 的 `input`。
- 扩展 `getToolOutput(part): string | null`，同时支持 dynamic/static tool 的 `output-available`，并保留 dynamic tool 的 `toolMetadata.liveOutput` fallback。
- 共用内部 `formatToolValue(value)`：字符串原样返回；对象、数组、数字、布尔值和 `null` 使用可读 JSON 表达；缺失值或空对象返回 `null`，不制造空分区。
- 删除 `getToolSuffix()`；调用方不再向 `UChatTool` 传 `suffix`。

新增 `src/renderer/src/components/chat/message/ChatToolDetails.vue`，独立渲染带有明确 `Input`、`Output` 标签的分区。内容使用等宽小字号、保留换行并允许任意长 token 换行；详情容器限高滚动，但不得截断底层字符串。仅存在一个值时只显示对应分区；二者都不存在时不渲染任何分区。

同时新增 `src/renderer/src/components/chat/message/ChatToolItem.vue`，集中负责普通 `UChatTool` 的 icon、text、streaming 与详情装配。它预先计算 Input/Output；有详情时提供 `ChatToolDetails` slot，无详情时渲染不带 default slot 的 `UChatTool`，避免 Nuxt UI 因检测到空 slot 仍显示无意义的 chevron。`AssistantMessage.vue` 的 direct tool 与 `ChatActivityGroup.vue` 的每个内部 tool 都使用 `ChatToolItem.vue`。`SubagentCallSlideover.vue` 保留自己的 activity summary 外壳，但删除本地 `toolInput()` 与 suffix，并在展开区域复用 `ChatToolDetails.vue`，从而保持其现有 Input/Output 契约而不新增另一种格式。

### 决策 4：所有 activity composition 使用同一层级

连续两个及以上 reasoning/tool 的结构统一为 `ChatActivityGroup -> UChatReasoning/ChatToolItem details`；单个 activity 不增加 group 层。不存在第二种 group 或任何 group 嵌套，因此用户从折叠摘要到任一工具 Input/Output 最多经过 activity group 与目标 tool 两次展开。

展开区域使用有边界的滚动容器和现有语义颜色、间距与 focus-visible 行为，不引入自定义 CSS 选择器或新的全局 theme override。外层折叠和子项折叠均使用组件本地状态，不写入 message metadata 或 store。

## Risks / Trade-offs

- [风险] activity group 展开后仍包含多个折叠子项，用户查看具体 reasoning/tool 需要第二次操作。→ 保持最多两层且禁止 group 嵌套；顶层摘要先降低默认噪音，用户只展开感兴趣的子项。
- [风险] mixed group 正在 streaming reasoning 时仍显示最近的工具图标，图标不再精确表示当前执行 part。→ header 已有独立 streaming 状态视觉；让 icon 稳定表达最近工具行为可避免常见尾部 reasoning 把丰富的工具类型全部收敛成 brain。
- [风险] streaming 中从单 activity 过渡为两个 activity 时会从独立 part 替换成 activity group。→ 这是达到分组阈值所必需的一次结构变化；group 建立后使用首个 `partIndex` 稳定 key，后续追加不再重置 open 状态。
- [风险] 隐藏的子 Agent 后代出现在非连续位置时可能错误切断普通 activity run。→ 投影先跳过 `hiddenPartIndexes` 且不 flush；子 Agent 根卡片自身仍是明确边界，继续满足 inspector 规范。
- [风险] 大型 Input/Output 增加 DOM 与滚动区域高度。→ 详情默认随 `UChatTool` 折叠，展开后使用限高滚动；数据不复制到新的状态容器。
- [风险] static tool 的 output 过去未展示，扩展 helper 后可能暴露更多合法历史内容。→ 仅读取 AI SDK tool part 已有字段，使用与 dynamic tool 相同的格式规则，不修改数据来源。

## Migration Plan

无需数据迁移。实现只改变 renderer 派生投影和展示组件；回滚时把 `ChatActivityGroup.vue` 重命名回 `ChatToolGroup.vue`、移除 reasoning 支持与统一详情组件并恢复原 `AssistantMessage` 模板即可，历史消息格式不受影响。

## Open Questions

无。
