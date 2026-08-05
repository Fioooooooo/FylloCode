## MODIFIED Requirements

### Requirement: MCP events 携带 Workspace 与 Folder identity

新写入的 bundled MCP proposal event SHALL 携带 `workspaceId`、`sessionId`、`proposalRef { folderId, changeId }`、`worktreeMode` 与 `worktreePath`；session-scoped plan event SHALL 携带 `workspaceId`、`sessionId` 与 `planSlug`，并 SHALL NOT 要求或推断 repository `folderId`。两类事件 SHALL 写入 descriptor 的 Workspace-owned event directory。Main consumer SHALL 验证 event Workspace；对于 proposal event 还 SHALL 验证 Folder owner 和 proposal target，不得从 path、primary Folder 或 event directory 反推 owner；对于 plan event SHALL 按 Workspace 与 Session 关联 lineage，不得执行 repository owner 解析。

#### Scenario: 写入有唯一 owner 的 proposal event

- **WHEN** `create-proposal` 在授权 Folder target 成功创建新 proposal
- **THEN** event SHALL 包含当前 descriptor 的 `workspaceId`、`sessionId` 和完整 `ResolvedProposalTarget`
- **AND** consumer SHALL 保留 `ProposalRef` 用于 lineage 与后续 owner routing

#### Scenario: 重复 proposal 不写 event

- **WHEN** `create-proposal` 发现 `ProposalRef` 已存在并返回 `PROPOSAL_ALREADY_EXISTS`
- **THEN** 系统 SHALL NOT 写新的 created event
- **AND** SHALL NOT 覆盖既有 origin

#### Scenario: Event workspace 或 proposal owner 不匹配

- **WHEN** consumer 读到 `workspaceId` 不匹配、`folderId` 不属于该 Workspace，或 `worktreePath` 不属于 owner repository 的 proposal event
- **THEN** consumer SHALL 拒绝消费该 event
- **AND** SHALL NOT 将其关联到当前 Workspace 的 Session 或 lineage

#### Scenario: Proposal owner 无法唯一确定

- **WHEN** repository-scoped operation 需要 owner，但 multi-root descriptor 与 tool input 无法确定唯一 `folderId`
- **THEN** operation SHALL 在写 proposal event 前失败
- **AND** SHALL NOT 通过 primary 或 repository path 猜测 owner

#### Scenario: Multi-root Session 创建 Plan event

- **WHEN** `create-plan` 在含多个 Folder 的 descriptor 中仅收到合法的 `goal` 与 `slug`
- **THEN** 系统 SHALL 在当前 `workspaceDataDir` 与 `sessionId` 对应的 Plan 目录创建文档并返回可读写的 `state.planPath`
- **AND** plan event SHALL 包含当前 `workspaceId`、`sessionId` 与完整日期前缀 `planSlug`
- **AND** tool 与 consumer SHALL NOT 要求、选择或推断 `folderId`

#### Scenario: Plan event 关联 Workspace Session lineage

- **WHEN** consumer 在 Workspace event directory 读到 `workspaceId` 匹配的 plan event
- **THEN** consumer SHALL 使用 `sessionId` 与 `planSlug` 记录当前 Workspace subject 的 Plan link
- **AND** SHALL NOT 查询 Folder membership 或 repository worktree
- **AND** event 含有旧版本额外 `folderId` 时 SHALL 忽略该字段而不改变关联结果

#### Scenario: Plan 文件作用域隔离与冲突

- **WHEN** 不同 Workspace 或不同 Session 使用相同合法 slug 创建 Plan
- **THEN** 系统 SHALL 将文档写入各自 Workspace/Session 目录且路径互不冲突
- **AND** 同一 Workspace/Session 在同一天重复使用相同 slug 时 SHALL 返回结构化冲突错误并保留已有文件

#### Scenario: Plan 输入或写入失败

- **WHEN** `create-plan` 收到非法 slug，或 Plan 目录/文件无法创建
- **THEN** tool SHALL 返回包含明确类型、消息和可用底层错误码的结构化 error state
- **AND** SHALL NOT 返回不存在或未完整写入的 `state.planPath`
