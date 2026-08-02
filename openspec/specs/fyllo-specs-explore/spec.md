# fyllo-specs-explore Specification

## Purpose

定义 `fyllo-specs` Explore 阶段如何发现 main workspace 与 linked worktree 中的 active changes、current change 和扫描警告，并向 agent 暴露足够的 workspace metadata 来选择正确的后续工作区。

## Requirements

### Requirement: Explore returns workspace-aware active changes

`fyllo-specs` 的 `explore` tool SHALL 在省略 `folderId` 时并行扫描 activation descriptor 中全部授权 Folder，在提供 `folderId` 时只扫描该 Folder。每个 active change SHALL 暴露 `folderId`、`folderName`、`changeId`、`completedTasks`、`totalTasks`、`lastModified`、`status`、`worktreePath` 与 `worktreeMode`；SHALL NOT 使用 `name` 作为唯一 identity，也 SHALL NOT 返回 `workspacePath/workspaceMode`。

#### Scenario: Multi-root 聚合保留跨 Folder 同名 change

- **WHEN** descriptor授权 Folder A与Folder B且二者都包含 `changeId = add-search`
- **THEN** `state.activeChanges` SHALL 同时包含A与B的条目
- **AND**每项 SHALL 携带各自 Folder identity与resolved worktree target
- **AND** SHALL NOT 跨 Folder按changeId去重

#### Scenario: 显式 Folder 只扫描 owner repository

- **WHEN** explore输入包含 Folder B的folderId
- **THEN** tool SHALL 只扫描Folder B的main与registered linked worktrees
- **AND** SHALL NOT 返回或探测其他descriptor Folder的changes

#### Scenario: 同一 Folder main 与 linked 重名

- **WHEN**一个Folder repository的main与唯一linked worktree存在同名active change
- **THEN** `state.activeChanges` SHALL 只包含该ProposalRef的一条linked target记录
- **AND** `worktreeMode` SHALL 为 `linked`

### Requirement: Explore resolves currentChange from the owning workspace

`fyllo-specs` 的 `explore` tool SHALL 用 ProposalRef解析 `state.currentChange`。输入含folderId时 SHALL 只解析该owner；省略folderId时，只有全部目标Folder扫描成功且恰好一个ProposalRef匹配changeName才 SHALL 返回currentChange。

#### Scenario: 显式 owner 解析 linked change

- **WHEN** explore输入包含folderId与changeName且该ProposalRef解析到linked worktree
- **THEN** `state.currentChange` SHALL 保留`applyRequires`、`artifacts`与`schemaName`
- **AND** SHALL 携带完整ProposalRef、`worktreePath`与`worktreeMode: linked`

#### Scenario: 省略 owner 且唯一匹配

- **WHEN**所有授权Folder扫描成功且changeName只匹配一个ProposalRef
- **THEN** explore SHALL 返回该唯一currentChange
- **AND** SHALL NOT 用primary身份替换其owner

#### Scenario: 省略 owner 且多重匹配

- **WHEN** changeName匹配多个授权Folder中的ProposalRef
- **THEN** explore SHALL 返回 `PROPOSAL_OWNER_AMBIGUOUS`
- **AND**error details SHALL 包含候选ProposalRef列表
- **AND** SHALL NOT 选择第一项

#### Scenario: 省略 owner 且扫描不完整

- **WHEN**至少一个目标Folder扫描失败且输入changeName未提供folderId
- **THEN** explore SHALL 返回 `PROPOSAL_OWNER_UNVERIFIED`
- **AND** SHALL 要求caller提供folderId后重试
- **AND** SHALL NOT 用可读Folder中的唯一表面匹配推断owner

### Requirement: Explore reports workspace scan warnings without hiding readable changes

`fyllo-specs` 的 `explore` tool SHALL 将单个Folder扫描失败表示为结构化warning，包含`folderId`、稳定error code与message；列表模式 SHALL 继续返回其他Folder的可读active changes。

#### Scenario: 一个 Folder 扫描失败

- **WHEN**聚合explore中Folder B的Git或OpenSpec list失败而Folder A成功
- **THEN** `state.activeChanges` SHALL 包含Folder A的结果
- **AND** `state.warnings` SHALL 包含Folder B的folderId、error code与message
- **AND**列表查询 SHALL NOT 因单个Folder失败而整体失败

### Requirement: Explore instructions point agents to workspace metadata

`fyllo-specs` explore instruction SHALL 告诉agent使用active change或currentChange中的ProposalRef作为identity，并使用`worktreePath`作为读取artifacts及继续apply/archive的文件根；instruction SHALL NOT 指导agent拼接`projectRoot`、`workspacePath`或caller targetPath。

#### Scenario: Agent 继续处理 resolved proposal

- **WHEN** state返回非空ResolvedProposalTarget
- **THEN** instruction SHALL 要求agent从该`worktreePath/openspec/changes/<changeId>/`读取artifacts
- **AND**继续apply/archive时 SHALL 传proposalRef中的folderId与changeId
