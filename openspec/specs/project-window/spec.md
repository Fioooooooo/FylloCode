# project-window Specification

## Purpose

定义 launcher window 与 project window 的生命周期、项目上下文所有权、项目作用域事件隔离、stream cancellation、窗口状态持久化、文件夹打开和项目删除时的窗口行为。

## Requirements

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
