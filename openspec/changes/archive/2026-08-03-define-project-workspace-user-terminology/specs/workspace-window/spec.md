## MODIFIED Requirements

### Requirement: Application 提供 launcher window

系统 SHALL 在没有绑定 Workspace 的窗口中展示 launcher，作为 Folder/Collection Workspace 的统一管理入口；内部 identity 与 kind 保持不变。面向用户时，launcher SHALL 将 Folder Workspace 呈现为 Project、将 Collection Workspace 呈现为 Workspace，并提供“打开 Project”“创建 Workspace”、编辑、最近打开、soft delete，以及始终可达的中性“回收站”管理入口；launcher 自身 SHALL 保持 `workspaceId: null`。

#### Scenario: App starts with launcher

- **WHEN** required cutover gate 通过且应用启动
- **THEN** 系统 SHALL 创建 role 为 `launcher`、`workspaceId: null` 的窗口
- **AND** launcher SHALL NOT 设置 renderer 当前 Workspace

#### Scenario: macOS activate recreates launcher

- **WHEN** 应用运行在 macOS 且所有窗口已关闭
- **AND** 用户通过 Dock 或系统 activate 重新激活应用
- **THEN** 系统 SHALL 创建 launcher window

#### Scenario: Launcher 展示 Project 与 Workspace 摘要

- **WHEN** launcher 加载 active Workspace 列表
- **THEN** Folder Workspace SHALL 以 Project 类型展示唯一项目目录的完整路径
- **AND** Collection Workspace SHALL 以 Workspace 类型展示 primary Project path 与 Project 数量摘要，即使数量为 1
- **AND** missing Project 数量和逐项状态 SHALL 可查看

#### Scenario: 回收站管理入口始终可达

- **WHEN** active Workspace 列表为空或不为空
- **THEN** launcher SHALL 提供中性的“回收站”入口
- **AND** 该视图 SHALL 按呈现术语区分 Project/Workspace 和 cleanup state 对应的可用动作

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

#### Scenario: Workspace 新增成员后查看旧 Session

- **WHEN** 当前 Workspace 比 active Session snapshot 多一个可用 Folder
- **THEN** Chat header SHALL 将该 Folder 标记为当前新增 Project
- **AND** SHALL 提示新建 Session 才能让 Agent 获得该 Project

#### Scenario: Session snapshot 与当前 primary 不同

- **WHEN** Workspace primary 在 Session 创建后发生变化
- **THEN** Chat header SHALL 继续以 snapshot primary 表示当前 Agent `cwd`
- **AND** 用户界面 SHALL 展示当前主 Project 与 snapshot 主 Project 的差异

#### Scenario: Folder 显示名称变化

- **WHEN** 同一 `folderId` 的当前名称与 snapshot `folderName` 不同
- **THEN** Chat header SHALL 以 Project 名称变化呈现该差异而不改写历史 snapshot
