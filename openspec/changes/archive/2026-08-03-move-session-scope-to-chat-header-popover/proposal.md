## Why

当前 Chat 将 active Session 的 Agent 授权范围作为可展开区块常驻在消息区域上方；当 Workspace 包含较多 Project 时，展开内容会显著压缩消息空间。ChatContainer Header 已预留右侧操作区，可以将这项会话级辅助信息收敛为按需查看的 Popover，同时继续让授权差异与失效状态保持可发现。

## What Changes

- 移除消息区域上方现有的常驻 Session scope 展开区块，在非 draft Session 的 ChatContainer Header 右侧提供“Agent 授权范围”icon button。
- 点击入口打开 Popover，使用 active Session 的 `SessionWorkspaceSnapshot` 展示 Agent 实际可访问的有序 Project 列表、项目目录、数量与主 Project；主 Project 使用 primary color dot 和可见文字共同标识。
- Popover 的 Project 列表设置最大高度并独立纵向滚动，使最多 16 个 Project 不再压缩消息区域或产生横向滚动。
- 当授权范围与当前 Project/Workspace 不同或已经失效时，在 icon button 上显示非纯颜色的可感知状态，并在 Popover 内完整展示 `activeSessionScopeDiff` 差异与“新建 Session”提示。
- 保持 Session snapshot、Folder identity、Workspace resolver、ACP/MCP 授权、IPC、schema、持久化和 stale 判定不变；本变更只调整 renderer 的展示入口与交互。
- 以 `references/designs/multi-root-workspace/prototype/session-scope-popover.html` 作为已确认的 UI/UX 基准，并补齐正常、16 个 Project、范围变化、失效、键盘关闭与 draft 隐藏等组件测试。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `workspace-window`: 将 Chat header 展示 active Session 固定授权范围的交互从常驻展开区块改为 Header 右侧 icon button 与 Popover，并明确多 Project 滚动、主 Project 标识、差异/失效可发现性和键盘访问要求。

## Impact

- Renderer：`src/renderer/src/components/chat/ChatContainer.vue`、现有 `SessionScopeHeader.vue`（重命名或替换为 Popover 组件）及其 Header 右侧装配。
- 测试：`test/renderer/src/components/session-scope-header.spec.ts`、`test/renderer/src/components/chat-container.spec.ts`，必要时随组件重命名同步测试文件名与 import。
- 设计参考：`references/designs/multi-root-workspace/prototype/session-scope-popover.html`。
- 不新增依赖，不修改 Main、Preload、shared contract、公开 API、数据 schema、持久化格式或 Agent/MCP 授权行为。
