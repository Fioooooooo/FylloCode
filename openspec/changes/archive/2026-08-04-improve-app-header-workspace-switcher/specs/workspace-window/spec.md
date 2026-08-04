## MODIFIED Requirements

### Requirement: Workspace 打开在独立窗口

系统 SHALL 将每个打开的 Workspace 绑定到独立 workspace window，并保证同一 `workspaceId` 同一时间最多一个窗口；引用相同 Folder 的不同 Workspace SHALL 能并存。Folder Workspace 与 primary 可用的 Collection Workspace SHALL 均可进入 Workspace 管理窗口；secondary missing SHALL 以 degraded 状态展示而不阻止打开。来源是 Launcher 且目标尚未打开时，系统 SHALL 将该 Launcher Window 原地绑定为目标 Workspace Window；目标已经打开时，系统 SHALL 聚焦已有目标并保留来源 Launcher Window。

#### Scenario: Launcher opens an unopened Folder Workspace

- **WHEN** Launcher 打开 path 可用且尚未打开的 Folder Workspace
- **THEN** 系统 SHALL 将来源 Launcher Window 原地绑定该 `workspaceId`
- **AND** renderer SHALL 将该 Workspace 暴露为当前 Workspace
- **AND** 系统 SHALL NOT 为同一次操作额外创建第二个可见窗口

#### Scenario: Launcher opens an already open Workspace

- **WHEN** Launcher 打开的目标 `workspaceId` 已有 workspace window
- **THEN** 系统 SHALL 聚焦已有窗口
- **AND** 系统 SHALL NOT 创建第二个同 ID 窗口
- **AND** 来源 Launcher Window SHALL 保持 `role: "launcher"` 与 `workspaceId: null`，直到用户手动关闭或用它打开一个尚未打开的目标

#### Scenario: Collection Workspace 打开管理窗口

- **WHEN** Collection Workspace 的 primary Folder 可用
- **THEN** 系统 SHALL 打开绑定其 `workspaceId` 的 Workspace 窗口
- **AND** renderer SHALL 展示完整成员与 primary 管理状态

#### Scenario: Secondary Folder missing 时降级打开

- **WHEN** primary 可用但一个或多个 secondary Folder missing
- **THEN** 系统 SHALL 打开 Workspace 窗口并标记 degraded 状态
- **AND** missing Folder SHALL 保留在成员列表与修复入口中

## ADDED Requirements

### Requirement: AppHeader 提供 Project 与 Workspace 上下文切换和 Launcher 管理入口

Workspace Window 的 AppHeader SHALL 使用可聚焦的语义触发器展示当前 Project 或 Workspace，并在 dropdown 中展示最近打开项、“打开 Project…”和“管理 Project 与 Workspace…”。管理入口 SHALL 调用现有 Launcher Window 能力，创建或聚焦显示 Launcher/Welcome 内容的 `role: "launcher"` 窗口；该操作 SHALL NOT 改变来源 Workspace Window 的 route、`workspaceId` 或 Session 状态，也 SHALL NOT 使用覆盖层模拟 Launcher。

最近打开项 SHALL 显示名称、Project/Workspace 类型、类型图标和当前选中标记。Project SHALL 显示项目目录；Workspace SHALL 显示 Project 数量与主 Project。存在 missing Project 时 SHALL 同时使用警告图标与文字说明 missing 数量，不得仅依赖颜色。

#### Scenario: Workspace Window 打开管理入口且 Launcher 不存在

- **WHEN** 用户在 Workspace Window 的 AppHeader 选择“管理 Project 与 Workspace…”
- **AND** 当前没有可用 Launcher Window
- **THEN** 系统 SHALL 创建一个 `role: "launcher"`、`workspaceId: null` 的 Launcher Window并显示 WelcomeView
- **AND** 来源 Workspace Window SHALL 保持当前 route、Workspace 与 Session 状态

#### Scenario: Workspace Window 聚焦已有 Launcher

- **WHEN** 用户在 Workspace Window 的 AppHeader 选择“管理 Project 与 Workspace…”
- **AND** 已存在可用 Launcher Window
- **THEN** 系统 SHALL 恢复并聚焦已有 Launcher Window
- **AND** 系统 SHALL NOT 创建第二个 Launcher Window

#### Scenario: AppHeader 展示 Workspace 摘要

- **WHEN** 当前对象或最近打开项是 Collection Workspace
- **THEN** AppHeader SHALL 显示 Workspace 类型、Workspace 类型图标和 Project 数量
- **AND** recent item SHALL 显示主 Project
- **AND** 单成员 Collection Workspace SHALL 继续呈现为 Workspace

#### Scenario: AppHeader 展示 Project 摘要

- **WHEN** 当前对象或最近打开项是 Folder Workspace
- **THEN** AppHeader SHALL 显示 Project 类型和 Project 类型图标
- **AND** recent item SHALL 显示项目目录
- **AND** SHALL NOT 把该对象称为 Workspace

#### Scenario: AppHeader missing 状态可感知

- **WHEN** 最近打开的 Project 或 Workspace 包含一个或多个 missing Project
- **THEN** item SHALL 显示警告图标与“X 个项目目录缺失”文字
- **AND** missing 状态 SHALL NOT 仅依赖颜色表达

#### Scenario: Launcher 中不显示冗余管理动作

- **WHEN** 当前 WindowContext 已经是 `role: "launcher"`
- **THEN** AppHeader SHALL NOT 显示点击后只会聚焦当前窗口的“管理 Project 与 Workspace…”动作
- **AND** WelcomeView SHALL 继续提供打开、创建、编辑与回收站管理能力
