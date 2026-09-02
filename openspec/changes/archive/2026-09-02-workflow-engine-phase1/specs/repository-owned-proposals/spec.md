# repository-owned-proposals Specification Delta

## MODIFIED Requirements

### Requirement: Apply 与 Archive 只接受 ProposalRef 并通过 Chat/MCP 固定 target

`apply-change` 与 `archive-change` MCP input SHALL 接受 `folderId + changeName`，SHALL NOT 接受 caller `targetPath` 或 `worktreePath`。工具 SHALL 从 trusted Workspace descriptor 和 owner-qualified `ProposalRef` 解析 `ResolvedProposalTarget`；一次 Apply/Archive tool invocation 内的后续实现、OpenSpec 操作和 Git finalization SHALL 继续使用该 resolved target。Renderer SHALL 通过 Chat 用户消息进入该 MCP 路径，不得直接启动旧 Proposal stage-stream。

系统 SHALL NOT 再提供以 `WorkflowStage`/`ApplyRunMeta` 驱动 Proposal Apply/Archive 的 `proposal:apply:*` 或 `proposal:archive:*` renderer IPC、stage stream、run store 或恢复入口。该删除 SHALL NOT 删除 `fyllo-specs` 的 Apply/Archive MCP tools，也 SHALL NOT 改变其 ProposalRef、target resolver、OpenSpec archive、metadata 和 Git finalization 约束。

#### Scenario: Chat Apply 使用 owner-qualified target

- **WHEN** 用户通过 Chat Event Rail 发送包含 `changeId` 与 `folderId` 的 Apply 消息，Agent 调用 `apply-change`
- **THEN** MCP runtime SHALL 使用对应 ProposalRef 解析 owner Folder 和授权 target
- **AND** SHALL NOT 从 current primary、caller path 或旧 workflow template 推导 target
- **AND** Renderer SHALL NOT 调用 proposal stage-stream 或旧 Proposal run store

#### Scenario: Chat Archive 使用固定 target

- **WHEN** Agent 对 Folder B 的 proposal 调用 `archive-change`
- **THEN** tool SHALL 使用 Folder B 的 ProposalRef 和本次 resolver 返回的 target 完成 archive/finalization
- **AND** SHALL NOT 回退到 main、重新按 linked-preferred 选择其他 worktree 或使用 Folder A 的同名 change
- **AND** archive status、metadata 和 watcher event SHALL 继续以该完整 ProposalRef 标识

#### Scenario: Target 在执行前失效

- **WHEN** Apply/Archive tool 解析后的 target 已移除、不再 registered 或不再包含该 change
- **THEN** tool/runtime SHALL 返回明确 stale target error 并停止
- **AND** SHALL NOT 通过旧 `ApplyRunMeta`、WorkflowStage 或 renderer IPC 重试另一 target

#### Scenario: Legacy Proposal run data is not resumed

- **WHEN** Workspace storage 中仍存在旧 `apply-runs/**` 或包含 WorkflowStage 的 run metadata
- **THEN** 新 Proposal renderer/Main SHALL 不发现、不恢复或继续执行该 run
- **AND** Proposal status SHALL 继续由实际 Proposal metadata、tasks 和 watcher 状态派生
- **AND** 不得为兼容旧 run 而重新引入 WorkflowStage 或第二套 engine
