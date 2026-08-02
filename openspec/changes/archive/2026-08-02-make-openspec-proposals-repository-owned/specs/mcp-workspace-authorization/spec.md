## MODIFIED Requirements

### Requirement: MCP events 携带 Workspace 与 Folder identity

新写入的bundled MCP proposal event SHALL携带`workspaceId`、`sessionId`、`proposalRef { folderId, changeId }`、`worktreeMode`与`worktreePath`；plan event SHALL继续携带`workspaceId`与明确owner `folderId`。事件 SHALL写入descriptor的Workspace-owned event directory。Main consumer SHALL验证event Workspace、Folder owner和proposal target，不得从path、primary Folder或event directory反推owner。

#### Scenario: 写入有唯一 owner 的 proposal event

- **WHEN**create-proposal在授权Folder target成功创建新proposal
- **THEN**event SHALL包含当前descriptor的workspaceId、sessionId和完整ResolvedProposalTarget
- **AND**consumer SHALL保留ProposalRef用于lineage与后续owner routing

#### Scenario: 重复 proposal 不写 event

- **WHEN**create-proposal发现ProposalRef已存在并返回`PROPOSAL_ALREADY_EXISTS`
- **THEN**系统 SHALL NOT写新的created event
- **AND** SHALL NOT覆盖既有origin

#### Scenario: Event workspace 或 owner 不匹配

- **WHEN**consumer读到workspaceId不匹配、folderId不属于该Workspace，或worktreePath不属于owner repository的proposal event
- **THEN**consumer SHALL拒绝消费该event
- **AND** SHALL NOT将其关联到当前Workspace的Session或lineage

#### Scenario: Owner 无法唯一确定

- **WHEN**operation需要repository owner但multi-root descriptor与tool input无法确定唯一folderId
- **THEN**operation SHALL在写event前失败
- **AND** SHALL NOT通过primary或repository path猜测owner
