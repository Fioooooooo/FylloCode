## Why

最近 chat 侧栏给 session 条目加入了 agent icon，但当前布局仍沿用“状态点、图标、标题、元信息、更多菜单并列塞进一行骨架”的结构。在约 260px 的窄侧栏里，这让会话主题不再是第一视觉焦点，列表更像信息密集的表格行而不是会话导航。

## What Changes

- 将 chat 侧栏 session 条目改为 `Conversation-first` 视觉层级：
  - 第一优先级是会话标题；
  - agent icon 保留，但退为辅助身份标识；
  - 运行状态不再占用独立前导列，而是并入前导媒体区；
  - 元信息以低强调度展示，不与标题争抢注意力。
- 调整 session 列表容器与条目间距，让列表更接近块状导航，而不是依赖 `border-b` 的表格式分隔。
- 保持现有交互和数据语义不变：
  - 仍按最新优先排序；
  - 仍显示标题、时间戳、轮次数、状态指示与 agent icon；
  - 仍支持选中高亮、悬停显示三点菜单、重命名与删除。
- 为新的展示层级补充 renderer 组件测试，覆盖可解析 icon、缺失 icon、长标题截断和选中态稳定性。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `session-management`: 调整 chat 侧栏 session 条目的展示层级与视觉编排，重新定义标题、agent icon、状态指示器和元信息在窄侧栏中的主次关系。

## Impact

**Affected code**

- `frontend/src/components/chat/SessionItem.vue`
- `frontend/src/components/chat/ChatSidebar.vue`
- `frontend/src/pages/chat.vue`（如需要微调侧栏宽度或容器内边距）
- `frontend/src/__tests__/components/session-item.spec.ts`

**Unaffected systems**

- `useSessionStore`、`useChatStore`、`useAcpAgentsStore`
- `chat:*` IPC、session 持久化、排序与选择逻辑

**Dependencies**

无新增依赖。
