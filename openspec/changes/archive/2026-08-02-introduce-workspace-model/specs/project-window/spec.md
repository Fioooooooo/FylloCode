## ADDED Requirements

### Requirement: Legacy Project window contract is retired

系统 SHALL NOT 在正常运行期公开 Project-scoped window API、`role: "project"` 窗口上下文、`ProjectWindowManager` 或 project window state namespace；窗口身份、上下文、复用、事件隔离与状态持久化 SHALL 由 `workspace-window` capability 的 Workspace contract 定义。

#### Scenario: Runtime exposes only Workspace window identity

- **WHEN** 应用创建 launcher 或业务窗口并向 Renderer 返回窗口上下文
- **THEN** launcher context SHALL 使用 `workspaceId: null`
- **AND** 业务窗口 context SHALL 使用 `role: "workspace"` 与稳定 `workspaceId`
- **AND** 系统 SHALL NOT 返回 `projectId` 或 `role: "project"`

#### Scenario: Legacy Project window storage is not written

- **WHEN** 应用保存业务窗口状态
- **THEN** 状态 SHALL 写入 Workspace window namespace
- **AND** 系统 SHALL NOT 写入 Project window state namespace

## REMOVED Requirements

### Requirement: Application provides a launcher window

**Reason**: launcher 生命周期改由 `workspace-window` 的 Workspace contract 统一定义，旧 Project window contract 不再是运行期入口。

**Migration**: 使用 `workspace-window` 的 `Application 提供 launcher window` requirement，并将 launcher context 切换为 `workspaceId: null`。

### Requirement: Project opens in a dedicated window

**Reason**: 顶层窗口身份从 Project 切换为 Workspace，同一 Project 唯一窗口不再是有效领域约束。

**Migration**: 使用 `workspace-window` 的 `Workspace 打开在独立窗口` requirement，以稳定 `workspaceId` 保证窗口唯一性。

### Requirement: Project window context is owned by the main process

**Reason**: `ProjectWindowManager`、`role: "project"` 与 `projectId` context 被一次性退役。

**Migration**: 使用 `WorkspaceWindowManager` 与 `{ role: "workspace", workspaceId } | { role: "launcher", workspaceId: null }`。

### Requirement: Project-scoped events are isolated by project window

**Reason**: runtime event 的顶层隔离 key 改为 `workspaceId`，Project scope 不再存在于正常运行期。

**Migration**: 使用 `workspace-window` 的 `Workspace-scoped runtime 和事件按 Workspace 隔离` requirement。

### Requirement: Streaming runtime cancellation is project scoped

**Reason**: chat、apply 与 archive 的取消作用域必须服从 Workspace 身份，不能继续传播 `projectId`。

**Migration**: 所有 runtime key 与 cancellation API 改用 `workspaceId`；repository owner 的进一步拆分由后续 proposal 定义。

### Requirement: Window state is persisted per launcher and project

**Reason**: project window state namespace 随 Project identity 一并退役。

**Migration**: launcher 使用独立 key，workspace window 使用 `<appData>/window-state/workspaces/<workspaceId>.json`。

### Requirement: Opening folders is window-owned

**Reason**: 旧 contract 把选中目录直接 adopt 为 Project；新模型必须先经 Folder registry 解析稳定 Folder/Workspace identity。

**Migration**: 使用 `workspace-window` 的 `打开文件夹解析 Folder Workspace` requirement，仍由 sender window 拥有系统目录选择器。

### Requirement: Project deletion closes its project window

**Reason**: Project 删除 lifecycle 被退役，本 proposal 不提供 Workspace 删除 UI；完整 tombstone、恢复与永久清理由后续 launcher lifecycle proposal 定义。

**Migration**: 本阶段不暴露删除入口；后续 `add-workspace-launcher-lifecycle` SHALL 定义 Workspace 删除时的窗口关闭和 runtime 清理。
