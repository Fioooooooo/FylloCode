## ADDED Requirements

### Requirement: Application 提供 launcher window

系统 SHALL 在没有绑定 Workspace 的窗口中展示 launcher，用于打开文件夹和最近的 Folder Workspace；本阶段 SHALL NOT 提供 Collection Workspace 创建或成员编辑入口。

#### Scenario: App starts with launcher

- **WHEN** required cutover gate 通过且应用启动
- **THEN** 系统 SHALL 创建 role 为 `launcher`、`workspaceId: null` 的窗口
- **AND** launcher SHALL NOT 设置 renderer 当前 Workspace

#### Scenario: macOS activate recreates launcher

- **WHEN** 应用运行在 macOS 且所有窗口已关闭
- **AND** 用户通过 Dock 或系统 activate 重新激活应用
- **THEN** 系统 SHALL 创建 launcher window

### Requirement: Workspace 打开在独立窗口

系统 SHALL 将每个打开的 Workspace 绑定到独立 workspace window，并保证同一 `workspaceId` 同一时间最多一个窗口；引用相同 Folder 的不同 Workspace SHALL 能并存。

#### Scenario: Launcher opens an unopened Folder Workspace

- **WHEN** launcher 打开 path 可用且尚未打开的 Folder Workspace
- **THEN** 系统 SHALL 创建或复用窗口并绑定该 `workspaceId`
- **AND** renderer SHALL 将该 Workspace 暴露为当前 Workspace

#### Scenario: Launcher opens an already open Workspace

- **WHEN** 目标 `workspaceId` 已有 workspace window
- **THEN** 系统 SHALL 聚焦已有窗口
- **AND** 系统 SHALL NOT 创建第二个同 ID 窗口

### Requirement: Workspace window context 由 Main 拥有

系统 SHALL 由 `WorkspaceWindowManager` 维护 sender 到 `{ role, workspaceId }` 的映射；renderer SHALL 通过受控 `workspace:window` IPC 获取上下文，不能自报窗口归属。

#### Scenario: Renderer reads launcher context

- **WHEN** launcher renderer 请求 window context
- **THEN** 系统 SHALL 返回 `role: "launcher"` 与 `workspaceId: null`

#### Scenario: Renderer reads Workspace context

- **WHEN** workspace window renderer 请求 context
- **THEN** 系统 SHALL 返回 `role: "workspace"` 与绑定的 `workspaceId`
- **AND** renderer SHALL 加载该 Workspace 及其 Workspace-owned session list

### Requirement: Workspace-scoped runtime 和事件按 Workspace 隔离

系统 SHALL 使用 `workspaceId` 作为 chat/probe/action/window event 与 stream cancellation 的顶层隔离 key；repository-owned runtime 在后续 owner proposal 前继续以当前 Folder Workspace 的唯一 repository 执行，但不得使用 `projectId`。

#### Scenario: 相同 Session ID 跨 Workspace 不冲突

- **WHEN** Workspace A 与 B 都存在相同 `sessionId`
- **THEN** A 的 stream、event 与 cancellation SHALL NOT 影响 B

#### Scenario: Global Agent event fanout

- **WHEN** ACP agent registry 或 status 变化
- **THEN** `WorkspaceWindowManager` SHALL 将全局事件发送到每个可用 launcher/workspace window

### Requirement: Window state 按 launcher 和 Workspace 持久化

系统 SHALL 将 launcher state 保存在独立 key，并将 workspace window state 保存在 `<appData>/window-state/workspaces/<workspaceId>.json`；不得继续写入 project window namespace。

#### Scenario: Workspace restores its own bounds

- **WHEN** 用户调整 Workspace A 窗口并重新打开 A
- **THEN** 系统 SHALL 恢复 A 的 bounds/maximized state
- **AND** 系统 SHALL NOT 使用 Workspace B 的 state

#### Scenario: Legacy launcher state remains readable

- **WHEN** 新 launcher state 不存在且 legacy main window state 有效
- **THEN** 系统 MAY 将 legacy state 作为 launcher 初始值
- **AND** 系统 SHALL NOT 删除 legacy state

### Requirement: 打开文件夹解析 Folder Workspace

系统 SHALL 将目录选择器归属到发起窗口，并通过 Folder registry canonicalize 所选 path、复用或创建 Folder，再打开同 ID 的 Folder Workspace。

#### Scenario: Reopening the same canonical Folder

- **WHEN** 用户重复或并发打开相同 canonical path
- **THEN** 系统 SHALL 解析到同一个 `folderId/workspaceId`
- **AND** 系统 SHALL 复用原 Workspace-owned 数据与已有窗口

#### Scenario: Selected Folder path missing before open

- **WHEN** 已登记 Folder Workspace 的 primary path 不存在
- **THEN** 系统 SHALL 返回 `WORKSPACE_PRIMARY_FOLDER_MISSING`
- **AND** 系统 SHALL NOT 创建正常 workspace window
