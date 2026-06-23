## Why

对话过程中 Agent 可能输出需要用户确认或取消的 `<fyllo-action>`，但消息继续流式增长时，action card 会被顶出视口，用户容易错过待处理操作。现有 session meta 已能记录已处理 action 状态，因此可以在右侧会话事件栏中补充待处理 action 提醒，并让用户一键回到原消息位置。

## What Changes

- 在 `ChatSessionEventRail` 中增加通用的待处理 Fyllo action 事件项，不限定 `task.create`，后续 action type 可复用同一机制。
- 从当前 Chat session 的 assistant text parts 中派生 ready 状态的 Fyllo actions，并用既有 transcript 位置规则生成 action id。
- 使用 `activeSession.actionStates` 判断是否仍待处理：缺失 action state 表示 pending；`succeeded`、`failed`、`cancelled` 均表示用户已经处理过，不再显示 rail 提醒。
- 为 Chat 主会话中的 action card 暴露稳定 DOM anchor，rail item 点击后滚动消息列表并定位到对应 action card。
- 不新增 IPC，不新增 session meta 字段，不持久化 ready/running 状态。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `chat-session-event-rail`: 事件栏从仅展示 plan/proposal 扩展为可展示当前会话中的待处理 Fyllo action 事件，并支持点击定位。
- `fyllo-action-tags`: Chat 主会话中的 ready action card 需要暴露可由 action id 定位的 DOM anchor。

## Impact

- Renderer 组件：`src/renderer/src/components/chat/ChatContainer.vue`、`src/renderer/src/components/chat/event/ChatSessionEventRail.vue`、`src/renderer/src/components/chat/message/ChatMessageList.vue`、`src/renderer/src/components/shared/markstream/FylloActionShell.vue`。
- Renderer utility/composable：新增或调整一个纯函数用于从 `Session.messages` 与 `Session.actionStates` 派生 pending Fyllo action rail items。
- Renderer config：复用 `src/renderer/src/config/fyllo-actions.ts` 的 action title/icon；如需要摘要文案，扩展该配置但不改变共享 payload contract。
- 测试：补充 pending action 收集、事件栏显示条件、点击定位、actionStates 更新后 item 消失的 renderer 测试。
- 数据与 IPC：无新增持久化字段、无新增 IPC、无需迁移。
