## Why

采用 ReAct 或 Plan-And-Execute 的 Agent 会在一条 assistant message 中连续产生多段 Thinking 与工具调用；现有 `ChatToolGroup` 只能收拢纯工具连续段，交替出现的 reasoning/tool 仍会造成明显的纵向噪音和阅读跳动。同时普通工具详情只展示 output，input 仅以少量 suffix 摘要暴露，用户无法稳定检查完整调用参数。

## What Changes

- 为普通工具调用提供统一、可折叠的 Input 与 Output 分区，完整展示结构化输入、最终输出和流式 output。
- 修正 Codex ACP adapter 对 MCP `rawOutput.result.content` 的归一化，并兼容旧版 `rawOutput.content`，确保 MCP 最终输出能进入既有 tool part。
- 移除从 `input.command` 或 `input.pattern` 派生的 suffix，避免与完整 Input 重复。
- 使用 `git mv` 将 `ChatToolGroup.vue` 重命名为 `ChatActivityGroup.vue`，保留文件历史，并把组件语义扩展为聚合 Agent 回复过程中的连续 reasoning/tool activity。
- 只有连续两个及以上的可见 reasoning 或普通 tool 才形成 `ChatActivityGroup`；单个 reasoning/tool 保持直接展示。展开后按原始顺序直接展示仍保持折叠的 Thinking 与逐个 Tool。
- mixed activity group 的代表图标优先使用最后一个 streaming tool，否则使用最后一个 tool；只有纯 Thinking group 使用 brain icon，避免尾部 reasoning 持续覆盖更具辨识度的工具类型。
- `SubagentCallCard` 不进入 activity group；即使多个子 Agent 卡片连续出现也继续逐个独立展示，并切断前后的普通 activity run。
- 保持子 Agent 卡片、普通文本、Fyllo Action `partIndex`、消息原始 parts、上游 ACP wire shape 和流式组装协议不变。

## Capabilities

### New Capabilities

- `assistant-activity-display`: 规定普通工具 Input/Output 详情、suffix 移除，以及连续 reasoning/tool activity 的分组、子 Agent 例外、顺序和折叠交互。

### Modified Capabilities

无。

## Impact

- 主要影响 `src/renderer/src/components/chat/message/AssistantMessage.vue`、由 `ChatToolGroup.vue` 重命名得到的 `ChatActivityGroup.vue`、新增的工具详情组件、renderer 工具/activity 展示投影与格式化函数，以及 Codex ACP agent adapter 的 MCP 输出归一化。
- 更新 `test/renderer/src/components/shared/ui-message-list.spec.ts` 与 `test/renderer/src/utils/chat-tool.test.ts`，覆盖分组边界、展开交互、Input/Output 和 streaming。
- 不修改上游 ACP 事件、IPC、持久化格式、`UIMessage.parts` 数据结构或第三方依赖。
