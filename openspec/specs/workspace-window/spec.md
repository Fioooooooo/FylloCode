# workspace-window Specification

## Purpose

定义启动器与 Workspace 窗口的身份模型、实例唯一性、主进程上下文、事件和取消隔离、窗口状态持久化，以及 Folder Workspace 打开流程的跨进程行为契约。

## Requirements

### Requirement: Application 提供 launcher window

系统 SHALL 在没有绑定 Workspace 的窗口中展示 launcher，作为 Folder/Collection Workspace 的统一管理入口；内部 identity 与 kind 保持不变。面向用户时，launcher SHALL 将 Folder Workspace 呈现为 Project、将 Collection Workspace 呈现为 Workspace，并提供“打开 Project”“创建 Workspace”、编辑、最近打开、soft delete，以及始终可达的中性“回收站”管理入口；launcher 自身 SHALL 保持 `workspaceId: null`。应用冷启动时，required gate通过后 SHALL先reserve既有startup BrowserWindow而不授予业务context，并仅在预期formal main-frame generation提交后激活为launcher，而不是创建第二个可见窗口；normal runtime中不存在任何窗口时 MAY按既有规则创建新的launcher。

#### Scenario: App starts with launcher

- **WHEN** startup shell 可见且 required cutover gate 通过
- **THEN** `WorkspaceWindowManager` SHALL reserve既有startup BrowserWindow且不立即授予业务context
- **AND** 预期formal main-frame generation提交后 SHALL激活为 role `launcher`、`workspaceId: null` 的窗口
- **AND** 系统 SHALL NOT 为正常 startup handoff 创建第二个可见窗口
- **AND** launcher SHALL NOT 设置 renderer 当前 Workspace

#### Scenario: macOS activate recreates launcher

- **WHEN** 应用运行在 macOS 且收到 Dock 或系统 activate
- **AND** startup shell 仍处于 required gate 或 handoff 阶段
- **THEN** 系统 SHALL 聚焦或复用既有 startup BrowserWindow且 SHALL NOT 创建 launcher
- **AND** normal runtime 已就绪且所有窗口已关闭时，系统 SHALL 创建 launcher window

#### Scenario: Launcher 展示 Project 与 Workspace 摘要

- **WHEN** launcher 加载 active Workspace 列表
- **THEN** Folder Workspace SHALL 以 Project 类型展示唯一项目目录的完整路径
- **AND** Collection Workspace SHALL 以 Workspace 类型展示 primary Project path 与 Project 数量摘要，即使数量为 1
- **AND** missing Project 数量和逐项状态 SHALL 可查看

#### Scenario: 回收站管理入口始终可达

- **WHEN** active Workspace 列表为空或不为空
- **THEN** launcher SHALL 提供中性的“回收站”入口
- **AND** 该视图 SHALL 按呈现术语区分 Project/Workspace 和 cleanup state 对应的可用动作

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

系统 SHALL 将目录选择器归属到发起窗口，并通过 Folder registry canonicalize 所选 path、复用或创建 Folder，再打开同 ID 的 Folder Workspace。内部 API/identity 继续使用 Folder；用户入口 SHALL 呈现为“打开 Project”，所选 path SHALL 呈现为项目目录。命中 tombstone 时 SHALL 拒绝普通打开并引导用户进入回收站恢复流程，不得静默恢复或创建重复 Workspace。

#### Scenario: Reopening the same canonical Folder

- **WHEN** 用户重复或并发选择相同 canonical 项目目录
- **THEN** 系统 SHALL 解析到同一个 `folderId/workspaceId`
- **AND** 系统 SHALL 复用原 Workspace-owned 数据与已有窗口

#### Scenario: Selected Folder path missing before open

- **WHEN** 已登记 Folder Workspace 的 primary path 不存在
- **THEN** 系统 SHALL 返回 `WORKSPACE_PRIMARY_FOLDER_MISSING`
- **AND** 用户界面 SHALL 说明 Project 的项目目录不可用
- **AND** 系统 SHALL NOT 创建正常 workspace window

#### Scenario: 所选 Folder 对应 tombstone

- **WHEN** 所选 canonical path 解析到已删除的 Folder Workspace
- **THEN** 系统 SHALL 返回 `WORKSPACE_DELETED` 和原 `workspaceId`
- **AND** launcher SHALL 提供进入回收站恢复该 Project 的操作
- **AND** 系统 SHALL NOT 自动清除 deletion fields

### Requirement: Collection Workspace 在 ACP multi-root 前禁止 Agent 启动

系统 SHALL 允许 primary Folder 可用的 Folder 或 Collection Workspace 进入 Chat shell。系统 SHALL 仅在目标 Session snapshot 的 `additionalDirectories` 非空时要求 Agent 支持 ACP `additionalDirectories`；activity bar、路由进入、Chat empty state 与 Main activation SHALL 使用同一 capability evaluator，且不得在 Agent 不兼容时回退为只授权 primary Folder。用户界面 SHALL 将该能力解释为 Agent 是否支持包含多个 Project 的 Workspace，不显示 Folder/Collection 内部叫法。

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
- **THEN** Chat empty state SHALL 显示该 Agent 不支持多 Project Workspace
- **AND** navigation、probe、create、load、resume 与 stream Main 入口 SHALL 拒绝启动该 Agent Session
- **AND** Main SHALL NOT 创建只使用 primary Folder 的降权 Session

#### Scenario: Primary Folder missing

- **WHEN** Workspace primary Folder path missing
- **THEN** Chat capability gate SHALL 拒绝 Agent 启动
- **AND** UI SHALL 引导用户先修复主 Project 的项目目录

### Requirement: Chat header 区分 Session scope 与当前 Workspace

Chat header SHALL 使用 active Session 的 `SessionWorkspaceSnapshot` 展示 Agent 实际授权 Folder，并 SHALL 将其与当前 Workspace 解析结果的差异归一化为 current-only Folder、snapshot-only Folder、primary 变化与同 ID Folder 显示名称变化。内部 snapshot 与比较继续使用 Folder identity；用户界面 SHALL 将授权 Folder 呈现为 Project、将 primary 呈现为主 Project，并按当前 kind 将顶层对象呈现为 Project 或 Workspace。组件 SHALL NOT 使用当前 Workspace Folder 列表冒充已有 Agent Session 的授权范围。

对于具有固定授权快照的非 draft Session，Chat header SHALL 在右侧操作区提供“Agent 授权范围”icon button，并 SHALL 通过该入口打开 Popover 按 snapshot 顺序展示 Project 数量、名称与项目目录；系统 SHALL NOT 再在消息区域上方常驻展示可展开的授权范围区块。Popover SHALL 将 Project 列表限制在固定最大高度内并只允许纵向滚动，使 1–16 个 Project 均不压缩消息区域且不产生横向滚动。主 Project SHALL 同时使用 primary color dot 与可见“主 Project”文字标识。

icon button SHALL 提供 tooltip、`aria-label`、可见键盘焦点以及与范围状态一致的可感知提示；授权范围与当前 Project/Workspace 不同或已经失效时，提示 SHALL NOT 仅依赖颜色。Popover SHALL 支持通过入口再次点击、显式关闭、点击外部与 `Escape` 收起，并 SHALL 在关闭后将键盘焦点恢复到入口。

#### Scenario: 正常 Session 按需查看固定授权范围

- **WHEN** 用户打开具有 `SessionWorkspaceSnapshot` 且与当前 Project 或 Workspace 一致的非 draft Session
- **THEN** Chat header 右侧 SHALL 显示“Agent 授权范围”icon button
- **AND** 消息区域上方 SHALL NOT 显示常驻 Session scope 展开区块
- **AND** 用户打开 Popover 后 SHALL 看到“Agent 可访问的 Project”、Project 数量、snapshot 中的有序 Project 名称与项目目录
- **AND** Popover SHALL 说明授权范围在 Session 创建时固定

#### Scenario: 16 个 Project 在 Popover 内纵向滚动

- **WHEN** active Session snapshot 包含 16 个 Project，且完整列表高度超过 Popover 列表区域的最大高度
- **THEN** Project 列表 SHALL 在 Popover 内独立纵向滚动
- **AND** Popover 与 ChatContainer SHALL NOT 因列表产生横向滚动
- **AND** Chat 消息区域高度 SHALL NOT 随 Project 列表展开而缩小
- **AND** 截断的 Project 名称或项目目录 SHALL 提供查看完整值的方式

#### Scenario: 主 Project 使用双重标识

- **WHEN** 用户在 Popover 中查看 snapshot 的 `primaryFolderId` 对应 Project
- **THEN** 该 Project SHALL 显示 primary color dot
- **AND** 该 Project SHALL 同时显示可见“主 Project”文字
- **AND** 非 primary Project SHALL NOT 显示该 dot 或文字标识

#### Scenario: Workspace 新增成员后查看旧 Session

- **WHEN** 当前 Workspace 比 active Session snapshot 多一个可用 Folder
- **THEN** Chat header icon button SHALL 在 Popover 打开前提供非纯颜色的范围变化提示
- **AND** Popover SHALL 将该 Folder 标记为当前新增 Project
- **AND** SHALL 提示新建 Session 才能让 Agent 获得该 Project

#### Scenario: Session snapshot 与当前 primary 不同

- **WHEN** Workspace primary 在 Session 创建后发生变化
- **THEN** Chat header SHALL 继续以 snapshot primary 表示当前 Agent `cwd`
- **AND** icon button SHALL 提示当前授权范围与 Project 或 Workspace 不同
- **AND** Popover SHALL 展示当前主 Project 与 snapshot 主 Project 的差异

#### Scenario: Folder 显示名称变化

- **WHEN** 同一 `folderId` 的当前名称与 snapshot `folderName` 不同
- **THEN** Chat header icon button SHALL 提示当前授权范围与 Project 或 Workspace 不同
- **AND** Popover SHALL 以 Project 名称变化呈现该差异而不改写历史 snapshot

#### Scenario: Session 授权范围已失效

- **WHEN** `activeSessionScopeDiff.isStale` 为 true
- **THEN** Chat header icon button SHALL 使用 error 状态 icon 与可访问文字提示授权范围已失效
- **AND** Popover SHALL 在 Project 列表之前展示失效原因与现有逐项差异
- **AND** Popover SHALL 继续展示 snapshot Project，不得替换为当前 Workspace Folder 列表

#### Scenario: draft 或缺少固定快照

- **WHEN** Chat 正在创建 draft Session，或 active Session 没有 `SessionWorkspaceSnapshot`
- **THEN** Chat header SHALL NOT 显示 Agent 授权范围入口
