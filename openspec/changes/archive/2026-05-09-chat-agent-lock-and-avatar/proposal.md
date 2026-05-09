## Why

当前 Chat 页面中，agent 选择器在会话开始后仍可切换，且 assistant 消息头像固定显示 Claude 图标，无法反映实际使用的 ACP agent。这导致用户无法直观感知当前会话由哪个 agent 处理，也破坏了"一个 session 对应一个 agent"的语义一致性。

## What Changes

- **ChatAgentSelect 禁用条件变更**：从 `chatStatus === "streaming"` 时禁用，改为当前 session 的 `messages.length > 0` 时即禁用。新会话（草稿态，messages.length = 0）仍可自由切换 agent。
- **UIMessageList assistant 头像动态化**：当 `type="chat"` 时，assistant 头像从固定的 `/claude.webp` 改为显示当前 session 对应 ACP agent 的 icon（来自 `useAcpAgentsStore.icons`）。
- **新增 `agentId` prop**：`UIMessageList` 新增可选 `agentId` prop，用于解析对应的 agent icon。

## Capabilities

### New Capabilities

（无新增 capability）

### Modified Capabilities

- `chat-agent-selection`：更新 Agent 切换禁用条件——从仅流式时禁用改为 session 一旦开始（有消息）即禁用。
- `chat-interface`：更新 UIMessageList 组件要求——assistant 头像需根据当前 session 的 agentId 动态显示对应 ACP agent 的 icon。

## Impact

- `frontend/src/components/chat/ChatAgentSelect.vue`：调整 `disabled` 计算逻辑
- `frontend/src/components/shared/UIMessageList.vue`：新增 `agentId` prop，动态解析 assistant avatar
- `frontend/src/components/chat/ChatContainer.vue`：向 `UIMessageList` 传入 `agentId`
- `openspec/specs/chat-agent-selection/spec.md`：更新禁用条件 requirement
- `openspec/specs/chat-interface/spec.md`：更新 UIMessageList requirement
