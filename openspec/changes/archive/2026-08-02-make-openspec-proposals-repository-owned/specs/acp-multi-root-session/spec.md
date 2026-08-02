## MODIFIED Requirements

### Requirement: Apply 与 Archive Agent 保持 owner-only 目录范围

proposal apply run创建时 SHALL 把`ProposalRef`中的folderId与resolver返回的worktreePath固定到run meta；所有apply stage与archive SHALL 在activation前验证并复用该snapshot，不得重新按Workspace primary或changeId选择target。activation SHALL 只传固定owner的Folder root或registered worktree作为`cwd`，其`additionalDirectories` SHALL为空；对应`McpWorkspaceDescriptorV2` SHALL只包含该owner Folder并将其设为primary。

#### Scenario: Multi-root Workspace proposal apply

- **WHEN**proposal来源Workspace含多个可用Folder且apply run已固定owner worktree
- **THEN**apply Agent `cwd` SHALL等于该owner worktree
- **AND**`additionalDirectories` SHALL为空
- **AND**MCP descriptor folders SHALL只包含run owner Folder
- **AND**descriptor primaryFolderId SHALL等于该owner folderId

#### Scenario: Multi-root Workspace proposal archive

- **WHEN**archive activation来源Workspace含多个可用Folder且run已固定owner
- **THEN**archive Agent `cwd` SHALL使用run中固定的owner root或registered worktree
- **AND**`additionalDirectories` SHALL为空
- **AND**MCP descriptor与reminder SHALL NOT包含任何其他Workspace成员

#### Scenario: Run target validation 失败

- **WHEN**固定worktreePath已消失、不再属于owner repository的registered worktree或不再包含目标change
- **THEN**Main SHALL在启动apply stage或archive Agent前明确失败
- **AND** SHALL NOT回退owner main worktree、其他linked worktree或当前Workspace primary
