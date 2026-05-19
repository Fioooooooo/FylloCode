## Why

当前 Chat 侧边栏的 session 列表只显示标题、时间戳、轮次数和状态点，用户在切换会话前无法直接识别每个 session 绑定的是哪个 ACP agent。随着同一项目下出现多个 agent 混用的 session，这会降低会话扫描与切换效率。

## What Changes

- 在 Chat 侧边栏的每个 session 条目中新增 agent icon 展示，使用该 session 的 `agentId` 对应 ACP agent icon 作为会话级身份标识。
- 将 session 列表的展示契约从“标题 + 时间戳 + 轮次数 + 状态指示器”扩展为“标题 + 时间戳 + 轮次数 + 状态指示器 + agent icon”。
- 规定 icon 缺失时的降级行为，避免 registry/icon 加载延迟导致列表抖动或报错。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `session-management`: 调整 Chat 左侧 session 列表条目的可见信息，新增会话绑定 agent 的图标标识及其缺失时的降级行为。

## Impact

- 受影响前端组件：`frontend/src/components/chat/SessionItem.vue`、`frontend/src/components/chat/ChatSidebar.vue`
- 受影响前端 store / 数据源：`frontend/src/stores/acp-agents.ts`
- 受影响测试：`frontend/src/__tests__/components/session-item.spec.ts`，以及可能新增的 Chat 侧边栏组件测试
- 不涉及新的 IPC、共享类型、磁盘存储格式或 session 数据模型变更
