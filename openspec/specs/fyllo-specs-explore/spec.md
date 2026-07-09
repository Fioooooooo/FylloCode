# fyllo-specs-explore Specification

## Purpose

定义 `fyllo-specs` Explore 阶段如何发现 main workspace 与 linked worktree 中的 active changes、current change 和扫描警告，并向 agent 暴露足够的 workspace metadata 来选择正确的后续工作区。

## Requirements

### Requirement: Explore returns workspace-aware active changes

`fyllo-specs` 的 `explore` tool SHALL 在合法 targetPath 下返回 main workspace 与 registered linked worktree 中的 active OpenSpec changes。

#### Scenario: Main target includes linked worktree active changes

- **WHEN** agent 使用 main repo root 调用 `explore`
- **AND** main workspace 没有 active change
- **AND** registered linked worktree 中存在 active change
- **THEN** `state.activeChanges` SHALL 包含该 linked worktree 中的 active change
- **AND** 该 active change SHALL 保留 `name`、`completedTasks`、`totalTasks`、`lastModified` 和 `status` 字段
- **AND** 该 active change SHALL 暴露 `workspacePath`，值为 linked worktree 的绝对路径
- **AND** 该 active change SHALL 暴露 `workspaceMode: "linked"`

#### Scenario: Main workspace active changes remain visible

- **WHEN** agent 使用 main repo root 调用 `explore`
- **AND** main workspace 中存在 active change
- **THEN** `state.activeChanges` SHALL 包含 main workspace 中的 active change
- **AND** 该 active change SHALL 暴露 `workspacePath`，值为 main repo root 的绝对路径
- **AND** 该 active change SHALL 暴露 `workspaceMode: "main"`

#### Scenario: Duplicate change names prefer linked worktree

- **WHEN** main workspace 与 registered linked worktree 中存在同名 active change
- **THEN** `state.activeChanges` SHALL 只包含一条该名称的 active change
- **AND** 返回条目 SHALL 来自 linked worktree
- **AND** 返回条目 SHALL 暴露 linked worktree 的 `workspacePath` 与 `workspaceMode`

#### Scenario: Non-git project falls back to main workspace

- **WHEN** targetPath 是通过 non-git fallback 校验的项目根目录
- **THEN** `explore` SHALL 只扫描该 main workspace
- **AND** `state.activeChanges` 中的条目 SHALL 暴露 `workspacePath`，值为该项目根目录
- **AND** `state.activeChanges` 中的条目 SHALL 暴露 `workspaceMode: "main"`

### Requirement: Explore resolves currentChange from the owning workspace

`fyllo-specs` 的 `explore` tool SHALL 在传入 `changeName` 时使用该 change 所属 workspace 计算 `state.currentChange`。

#### Scenario: currentChange for linked worktree change

- **WHEN** agent 使用 main repo root 调用 `explore`
- **AND** 输入包含 `changeName`
- **AND** 该 change 存在于 registered linked worktree
- **THEN** `explore` SHALL 使用该 linked worktree 的路径计算 `state.currentChange`
- **AND** `state.currentChange` SHALL 保留 `applyRequires`、`artifacts` 和 `schemaName`
- **AND** `state.currentChange` SHALL 暴露 `changeName`
- **AND** `state.currentChange` SHALL 暴露 `workspacePath`，值为 linked worktree 的绝对路径
- **AND** `state.currentChange` SHALL 暴露 `workspaceMode: "linked"`

#### Scenario: currentChange falls back to target workspace

- **WHEN** agent 调用 `explore` 并输入 `changeName`
- **AND** 聚合 active changes 中没有该 change
- **THEN** `explore` SHALL 使用当前校验后的 target workspace 计算 `state.currentChange`
- **AND** 计算失败时 SHALL 按现有 tool error state 规则返回错误

### Requirement: Explore reports workspace scan warnings without hiding readable changes

`fyllo-specs` 的 `explore` tool SHALL 在部分 workspace 扫描失败时返回可读取 workspace 的 active changes，并通过 warning 暴露失败信息。

#### Scenario: One linked worktree list fails

- **WHEN** agent 使用 main repo root 调用 `explore`
- **AND** 至少一个 workspace 的 OpenSpec list 调用失败
- **AND** 另一个 workspace 的 OpenSpec list 调用成功
- **THEN** `state.activeChanges` SHALL 包含成功 workspace 中的 active changes
- **AND** `state.warnings` SHALL 包含失败 workspace 的路径
- **AND** `explore` SHALL NOT 因单个 workspace list 失败而返回整体 error state

### Requirement: Explore instructions point agents to workspace metadata

`fyllo-specs` 的 `explore` tool instruction SHALL 告诉 agent 在读取 active change artifact 或继续 apply/archive 前使用 state 中的 workspace metadata。

#### Scenario: Agent reads artifacts for linked worktree change

- **WHEN** `state.activeChanges` 或 `state.currentChange` 中的 change metadata 包含 `workspacePath`
- **THEN** tool instruction SHALL 要求 agent 将该 `workspacePath` 作为读取 `openspec/changes/<changeName>/proposal.md`、`design.md`、`tasks.md` 和 specs delta 的根目录
- **AND** tool instruction SHALL NOT 只要求 agent 使用 `state.projectRoot` 拼接 artifact 路径
