## MODIFIED Requirements

### Requirement: Application 提供 launcher window

系统 SHALL 在没有绑定 Workspace 的窗口中展示 launcher，作为 Folder/Collection Workspace 的统一管理入口。launcher SHALL 提供打开文件夹、创建 Workspace、编辑、打开最近 Workspace、soft delete，以及始终可达的已删除 Workspace 管理视图；launcher 自身 SHALL 保持 `workspaceId: null`。

#### Scenario: App starts with launcher

- **WHEN** required cutover gate 通过且应用启动
- **THEN** 系统 SHALL 创建 role 为 `launcher`、`workspaceId: null` 的窗口
- **AND** launcher SHALL NOT 设置 renderer 当前 Workspace

#### Scenario: macOS activate recreates launcher

- **WHEN** 应用运行在 macOS 且所有窗口已关闭
- **AND** 用户通过 Dock 或系统 activate 重新激活应用
- **THEN** 系统 SHALL 创建 launcher window

#### Scenario: Launcher 展示 Folder 与 Collection 摘要

- **WHEN** launcher 加载 active Workspace 列表
- **THEN** Folder Workspace SHALL 展示唯一 Folder 的完整路径
- **AND** Collection Workspace SHALL 展示 primary path 与“共 N 个文件夹”摘要，即使 N 为 1
- **AND** missing 成员数量和逐项状态 SHALL 可查看

#### Scenario: 已删除 Workspace 管理入口始终可达

- **WHEN** active Workspace 列表为空或不为空
- **THEN** launcher SHALL 提供“已删除的 Workspace”入口
- **AND** 该视图 SHALL 区分 `restorable`、`purging` 与 `cleanup-failed` 可用动作

### Requirement: Workspace 打开在独立窗口

系统 SHALL 将每个打开的 Workspace 绑定到独立 workspace window，并保证同一 `workspaceId` 同一时间最多一个窗口；引用相同 Folder 的不同 Workspace SHALL 能并存。Folder Workspace 与 primary 可用的 Collection Workspace SHALL 均可进入 Workspace 管理窗口；secondary missing SHALL 以 degraded 状态展示而不阻止打开。

#### Scenario: Launcher opens an unopened Folder Workspace

- **WHEN** launcher 打开 path 可用且尚未打开的 Folder Workspace
- **THEN** 系统 SHALL 创建或复用窗口并绑定该 `workspaceId`
- **AND** renderer SHALL 将该 Workspace 暴露为当前 Workspace

#### Scenario: Launcher opens an already open Workspace

- **WHEN** 目标 `workspaceId` 已有 workspace window
- **THEN** 系统 SHALL 聚焦已有窗口
- **AND** 系统 SHALL NOT 创建第二个同 ID 窗口

#### Scenario: Collection Workspace 打开管理窗口

- **WHEN** Collection Workspace 的 primary Folder 可用
- **THEN** 系统 SHALL 打开绑定其 `workspaceId` 的 Workspace 窗口
- **AND** renderer SHALL 展示完整成员与 primary 管理状态

#### Scenario: Secondary Folder missing 时降级打开

- **WHEN** primary 可用但一个或多个 secondary Folder missing
- **THEN** 系统 SHALL 打开 Workspace 窗口并标记 degraded 状态
- **AND** missing Folder SHALL 保留在成员列表与修复入口中

### Requirement: 打开文件夹解析 Folder Workspace

系统 SHALL 将目录选择器归属到发起窗口，并通过 Folder registry canonicalize 所选 path、复用或创建 Folder，再打开同 ID 的 Folder Workspace。命中 tombstone 时 SHALL 拒绝普通打开并引导用户进入恢复流程，不得静默恢复或创建重复 Workspace。

#### Scenario: Reopening the same canonical Folder

- **WHEN** 用户重复或并发打开相同 canonical path
- **THEN** 系统 SHALL 解析到同一个 `folderId/workspaceId`
- **AND** 系统 SHALL 复用原 Workspace-owned 数据与已有窗口

#### Scenario: Selected Folder path missing before open

- **WHEN** 已登记 Folder Workspace 的 primary path 不存在
- **THEN** 系统 SHALL 返回 `WORKSPACE_PRIMARY_FOLDER_MISSING`
- **AND** 系统 SHALL NOT 创建正常 workspace window

#### Scenario: 所选 Folder 对应 tombstone

- **WHEN** 所选 canonical path 解析到已删除的 Folder Workspace
- **THEN** 系统 SHALL 返回 `WORKSPACE_DELETED` 和原 `workspaceId`
- **AND** launcher SHALL 提供进入已删除 Workspace 视图的恢复操作
- **AND** 系统 SHALL NOT 自动清除 deletion fields

## ADDED Requirements

### Requirement: Collection Workspace 在 ACP multi-root 前禁止 Agent 启动

在 `add-acp-multi-root-sessions` 生效前，系统 SHALL 允许 Collection Workspace 打开和管理，但 SHALL 禁止从该 Workspace 创建、加载、恢复或发送 Chat/Agent 请求；activity bar disabled 状态与路由进入判断 SHALL 使用同一 capability gate，且不得回退为只授权 primary Folder 的单根 Session。

#### Scenario: Collection Workspace 查看管理界面

- **WHEN** 用户打开 Collection Workspace
- **THEN** Workspace 管理能力 SHALL 可用
- **AND** Chat 入口 SHALL 显示 multi-root Agent 支持将在后续阶段启用的明确原因

#### Scenario: 直接导航到 Chat

- **WHEN** 用户通过 route 或其他入口尝试进入 Collection Workspace Chat
- **THEN** navigation gate SHALL 与 activity bar 一致地拒绝进入
- **AND** Main SHALL NOT 创建只使用 primary Folder 的 Agent Session
