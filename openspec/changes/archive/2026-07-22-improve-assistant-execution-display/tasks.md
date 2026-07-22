## 1. 统一工具详情格式与组件

- [x] 1.1 修改 `src/renderer/src/utils/chatTool.ts`：导出统一 tool part 类型，新增 `getToolInput(part)` 与内部 `formatToolValue(value)`，让 `getToolOutput(part)` 同时覆盖 AI SDK static/dynamic tool 的最终 output 并保留 dynamic `toolMetadata.liveOutput` fallback；删除 `getToolSuffix()`。验收字符串保持原文、结构化值输出缩进 JSON、空对象/缺失值返回 `null`，且 Bash command、Glob/Grep pattern 不再通过 suffix 单独输出。
- [x] 1.2 更新 `test/renderer/src/utils/chat-tool.test.ts`：覆盖 dynamic/static tool 的 input 与 output、字符串和结构化格式、空 input、live output 到最终 output 的切换，并移除 suffix 与 tool-group summary/icon 旧命名相关断言。
- [x] 1.3 新增 `src/renderer/src/components/chat/message/ChatToolDetails.vue` 与 `ChatToolItem.vue`：`ChatToolDetails` 使用明确的 `Input`/`Output` 标签、等宽文本、换行和限高滚动；`ChatToolItem` 统一装配 icon、text、streaming 与详情，有内容时才向 `UChatTool` 提供 default slot，无内容时不得产生空 chevron，且不传 `suffix`。
- [x] 1.4 修改 `src/renderer/src/components/chat/message/SubagentCallSlideover.vue`：删除本地 `toolInput()` 与 suffix 展示并复用 `ChatToolDetails`。验收子 Agent activity 的 Input/Output 格式与普通 Tool 一致，卡片、Slideover 和 inspector 其余行为不变。
- [x] 1.5 修改 Codex ACP agent adapter：从 1.1.4/1.1.5 的 `rawOutput.result.content` 提取 MCP text block，同时兼容旧版 `rawOutput.content` 并保留标准 ACP content 与终端聚合输出优先级；新增当前/旧版事件形态的 main 回归测试。

## 2. Activity 分组投影与摘要

- [x] 2.1 新增 `src/renderer/src/utils/chatAssistant.ts`，实现并导出 `AssistantActivityEntry`、`AssistantRenderItem` 与 `projectAssistantRenderItems(messageId, parts, subagentProjection)`：只累计可见 reasoning/普通 tool；run 长度达到 2 产出 `activity-group`，长度为 1 产出普通 part；text、其他可见 part 与每个子 Agent 根调用 flush run；隐藏后代跳过且不作为边界；所有 item 保留原始 `partIndex`，group key 只基于 message id、`activity-group` 和首个 partIndex。
- [x] 2.2 在 `src/renderer/src/utils/chatAssistant.ts` 实现 `summarizeActivityGroup(entries)` 与 `getActivityGroupIcon(entries, isStreamingPart)`，替代 `summarizeToolGroup()` / `getToolGroupIcon()`：现有 Read/Write/Edit/Search/Run 类别、首次出现顺序、单复数与 fallback 保持不变，新增 `think -> Think x time(s)`，并集中 activity group 的代表图标选择职责。
- [x] 2.3 新增 `test/renderer/src/utils/chat-assistant.test.ts`：覆盖 mixed、tool-first、连续纯工具、连续纯 reasoning、单 Tool、单 Thinking、text 切分、连续多个子 Agent 根分别输出、非连续隐藏后代不制造边界、summary 类别顺序/单复数、代表图标、原始顺序/partIndex 与 group key 在尾部追加后保持稳定。
- [x] 2.4 调整 `getActivityGroupIcon()` 与 renderer 组件断言为工具优先规则：最后一个 streaming tool 优先，否则取最后一个 tool，纯 Thinking group 才使用 brain；任意 activity 的 streaming 状态仍独立驱动 group header。覆盖 trailing/streaming reasoning 不覆盖工具图标、多个 streaming tool 取最后一个、纯 Thinking fallback。

## 3. 重命名并泛化 Activity group

- [x] 3.1 使用 `git mv src/renderer/src/components/chat/message/ChatToolGroup.vue src/renderer/src/components/chat/message/ChatActivityGroup.vue` 保留文件历史，并把 props/内部命名从 tool entries 泛化为 reasoning/tool activity entries；将 `chat-tool-group`、`tool-group` 相关 data-test、类型、注释和测试描述统一改为 `chat-activity-group` / `activity-group`。
- [x] 3.2 修改 `ChatActivityGroup.vue`：继续使用原有外层 `UChatTool`、本地 `expanded = false`、summary、streaming 与代表图标交互；展开后按原始 entry 顺序派发 Thinking 和 `ChatToolItem`，不得创建第二种 group 或任何 group 嵌套。group 展开时内部 Tool 与 Thinking 均默认折叠；为组内 reasoning 抑制 `UChatReasoning` 的 streaming 自动展开，同时保留用户主动展开和 reasoning 文本响应式更新。
- [x] 3.3 修改 `src/renderer/src/components/chat/message/AssistantMessage.vue`：用 `projectAssistantRenderItems()` 替代组件内 tool-run 扫描，新增单一 `activity-group` 分支并让 direct tool 使用 `ChatToolItem`；保留每个 `SubagentCallCard` 独立分支、连续子 Agent 卡片逐个展示、`AssistantStreamIndicator` 的末尾位置，以及 text 的 `buildActionContext(item.partIndex)` 原始索引。
- [x] 3.4 更新 `test/renderer/src/components/shared/ui-message-list.spec.ts` 的 Nuxt UI stubs 与组件断言：验证 activity group 在历史/streaming 时默认折叠、现有工具摘要/图标规则加入 Thinking、展开后 reasoning/tool 原始顺序且子项仍折叠、用户展开 group 后追加 activity 不收起、单 Tool/Thinking 直接展示、连续两个 SubagentCallCard 不分组、direct/group Tool 均展示独立 Input/Output 且无 suffix。

## 4. 验证

- [x] 4.1 在 proposal worktree 先运行 `sh scripts/prepare-worktree-env.sh`，再运行聚焦 renderer 测试 `pnpm exec vitest run --project renderer test/renderer/src/utils/chat-tool.test.ts test/renderer/src/utils/chat-assistant.test.ts test/renderer/src/components/shared/ui-message-list.spec.ts`；修复全部失败且不得通过弱化断言绕过规范场景。
- [x] 4.2 运行 `pnpm typecheck:web` 与 `pnpm lint`，确认新增 activity/tool 类型、Vue props/slots、投影联合类型和 import 边界通过严格 TypeScript 与 ESLint。
- [x] 4.3 运行聚焦 main 测试 `pnpm exec vitest run --project main test/main/services/session/chat/acp-mapper/agent-adapters/codex.spec.ts` 与 `pnpm typecheck:node`，确认 Codex MCP 当前/旧版 output 形态及终端 fallback 通过。
- [x] 4.4 人工检查浅色/深色主题及窄窗口：历史和 streaming activity group 默认折叠，键盘可展开并保留可见焦点，group 内 Thinking/Tool 不自动展开，长 Input/Output 可滚动且不产生横向页面滚动，顶层 group 到具体工具详情最多两层展开。
