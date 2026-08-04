## MODIFIED Requirements

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
