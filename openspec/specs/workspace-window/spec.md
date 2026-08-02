# workspace-window Specification

## Purpose

定义启动器与 Workspace 窗口的身份模型、实例唯一性、主进程上下文、事件和取消隔离、窗口状态持久化，以及 Folder Workspace 打开流程的跨进程行为契约。

## Requirements

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

### Requirement: Collection Workspace 在 ACP multi-root 前禁止 Agent 启动

系统 SHALL 允许 primary Folder 可用的 Folder 或 Collection Workspace 进入 Chat shell。系统 SHALL 仅在目标 Session snapshot 的 `additionalDirectories` 非空时要求 Agent 支持 ACP `additionalDirectories`；activity bar、路由进入、Chat empty state 与 Main activation SHALL 使用同一 capability evaluator，且不得在 Agent 不兼容时回退为只授权 primary Folder。

#### Scenario: Collection Workspace 查看与进入 Chat shell

- **WHEN** 用户打开 primary Folder 可用的 Collection Workspace
- **THEN** Workspace 管理与 Chat shell SHALL 可用
- **AND** Chat empty state SHALL 按每个 Agent 的 additional directories 能力显示可选、不可选或待检测状态

#### Scenario: 单根有效目录不限制 Agent

- **WHEN** Folder Workspace 或 degraded Collection Workspace 的新 Session snapshot 只有一个可用 Folder
- **THEN** Chat gate SHALL NOT 要求 Agent 支持 `additionalDirectories`
- **AND** 现有单根 Agent 可用性 SHALL 保持不变

#### Scenario: 多根目录 Agent 不兼容

- **WHEN** Workspace 新 Session snapshot 需要一个或多个 additional directories，且所选 Agent 已确认不支持该能力
- **THEN** Chat empty state SHALL 显示明确的不兼容原因
- **AND** navigation、probe、create、load、resume 与 stream Main入口 SHALL 拒绝启动该 Agent Session
- **AND** Main SHALL NOT 创建只使用 primary Folder 的降权 Session

#### Scenario: Primary Folder missing

- **WHEN** Workspace primary Folder path missing
- **THEN** Chat capability gate SHALL 拒绝 Agent 启动
- **AND** UI SHALL 引导用户先修复 primary Folder

### Requirement: Chat header 区分 Session scope 与当前 Workspace

Chat header SHALL 使用 active Session 的 `SessionWorkspaceSnapshot` 展示 Agent 实际授权 Folder，并 SHALL 将其与当前 Workspace 解析结果的差异归一化为 current-only Folder、snapshot-only Folder、primary 变化与同 ID Folder 显示名称变化。组件 SHALL NOT 使用当前 Workspace Folder 列表冒充已有 Agent Session 的授权范围。

#### Scenario: Workspace 新增成员后查看旧 Session

- **WHEN** 当前 Workspace 比 active Session snapshot 多一个可用 Folder
- **THEN** Chat header SHALL 标记该 Folder 为 current-only
- **AND** SHALL 提示新建 Session 才能让 Agent 获得该成员

#### Scenario: Session snapshot 与当前 primary 不同

- **WHEN** Workspace primary 在 Session 创建后发生变化
- **THEN** Chat header SHALL 继续以 snapshot primary 表示当前 Agent `cwd`
- **AND** SHALL 展示 current primary 与 snapshot primary 的差异

#### Scenario: Folder 显示名称变化

- **WHEN** 同一 `folderId` 的当前名称与 snapshot `folderName` 不同
- **THEN** Chat header SHALL 展示名称变化而不改写历史 snapshot
