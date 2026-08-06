## Why

当前打开会话的 ID 是排查问题和关联会话数据时常用的技术标识，但 Chat 界面没有直接获取入口，用户需要到其他数据或日志中查找。Chat Header 右侧需要一个可扩展的会话操作菜单，先提供复制当前会话 ID 的快捷操作，并为后续同类操作保留统一入口。

## What Changes

- 在已打开会话的 Chat Header 右侧操作区增加“会话操作”icon button，点击后打开 dropdown menu。
- dropdown menu 首个操作为“复制会话 ID”，复制当前 `activeSession.id`，而不是底层 ACP session ID。
- 复制成功时显示“会话 ID 已复制”反馈；复制失败时显示包含错误信息的“会话 ID 复制失败”反馈。
- draft 状态或不存在 `activeSession` 时不显示会话操作入口。
- 保持现有“Agent 授权范围”Popover 独立存在，并让会话操作菜单作为其后的可扩展入口。

## Capabilities

### New Capabilities

- `chat-session-actions-menu`: 定义 Chat Header 会话操作入口、显示条件、复制当前会话 ID 的行为及反馈。

### Modified Capabilities

无。

## Impact

- 受影响 Renderer 组件：`src/renderer/src/components/chat/ChatContainer.vue`，以及按现有小规模组件模式可能新增的相邻会话操作菜单组件。
- 受影响测试：`test/renderer/src/components/chat-container.spec.ts`，必要时补充 dropdown menu 的交互测试桩。
- 不影响 Session Store、IPC/preload API、持久化格式、ACP session ID、主进程服务或外部依赖。
