## ADDED Requirements

### Requirement: Proposal 使用 Folder-qualified identity 与可信 target

系统 SHALL 使用 `ProposalRef { folderId, changeId }` 作为 proposal 的完整持久身份，并 SHALL 使用 `ResolvedProposalTarget { proposalRef, worktreeMode, worktreePath }` 表示本次解析出的 Git 执行位置。`worktreeMode` SHALL 仅为 `main | linked`；proposal lifecycle 的新 tool/IPC/run state SHALL NOT 使用 `projectRoot`、`workspacePath` 或 `workspaceMode` 表示 Git target。

#### Scenario: 两个 Folder 存在同名 change

- **WHEN** 同一 Workspace 的 Folder A 与 Folder B 都包含 `changeId = add-search`
- **THEN** 系统 SHALL 将 `{ folderId: A, changeId: add-search }` 与 `{ folderId: B, changeId: add-search }` 视为两个不同 proposal
- **AND** list、selection、detail、watcher、apply 与 archive SHALL 使用完整 ProposalRef 区分二者

#### Scenario: Tool 返回 resolved target

- **WHEN** create、apply 或 archive tool 成功定位 proposal
- **THEN** success state SHALL 返回该 proposal 的 `proposalRef`、`worktreeMode` 和绝对 `worktreePath`
- **AND** tool instruction SHALL 指导 agent以该 `worktreePath` 为 artifact root

### Requirement: Proposal target resolver 只在 owner repository 中确定性选址

系统 SHALL 先通过授权 Workspace descriptor或 Main Workspace resolver验证 ProposalRef 的 `folderId`，再只扫描该 Folder main worktree与当前 registered linked worktrees中实际包含该 change的 target。caller SHALL NOT 通过 absolute path选择 owner或 target。

#### Scenario: Main 与唯一 linked 同名时 linked 优先

- **WHEN** 同一 owner Folder 的 main worktree与恰好一个 registered linked worktree都包含同名 active change
- **THEN** resolver SHALL 返回 linked worktree target
- **AND** SHALL NOT 因 main也存在该 change而返回歧义

#### Scenario: 多个 linked candidates

- **WHEN** 同一 ProposalRef 在两个或更多 registered linked worktrees中存在
- **THEN** resolver SHALL 返回 `PROPOSAL_LOCATION_AMBIGUOUS`
- **AND** error details SHALL 包含候选 worktree paths
- **AND** SHALL NOT 按 git枚举顺序任取一个

#### Scenario: Owner 非成员或 target 未注册

- **WHEN** folderId不在当前授权范围，或候选 linked worktree不再 registered
- **THEN** resolver SHALL 明确拒绝该操作
- **AND** SHALL NOT 查询其他 Folder、回退 primary或接受 caller path

### Requirement: Create proposal 由 owner Folder 与 worktree mode 驱动

`create-proposal` SHALL 接受 `changeName`、可选 `folderId` 和可选 `worktreeMode`，默认 `worktreeMode = linked`。单 Folder descriptor下 MAY 省略 `folderId`；multi-root descriptor下 SHALL 要求显式 owner。linked target SHALL 固定创建在 `<folderPath>/.worktrees/<changeName>` 并属于该 Folder repository。

#### Scenario: 在指定 secondary Folder 创建 linked proposal

- **WHEN** multi-root activation以 Folder B的 `folderId` 和 `worktreeMode: linked` 创建 proposal
- **THEN** worktree SHALL 创建在 Folder B的 `.worktrees/<changeName>`
- **AND**返回 target的 proposalRef SHALL 以 Folder B为 owner
- **AND**系统 SHALL NOT 在 primary Folder A中创建目录、branch或change

#### Scenario: Multi-root create 缺少 owner

- **WHEN** descriptor包含多个 Folder且 create输入省略 folderId
- **THEN** tool SHALL 返回 owner-required error
- **AND** SHALL NOT 静默使用 primary或第一个 Folder

#### Scenario: ProposalRef 已存在

- **WHEN** create前发现同一 ProposalRef已存在于 owner repository
- **THEN** tool SHALL 返回 `PROPOSAL_ALREADY_EXISTS` 与 existing ResolvedProposalTarget
- **AND** SHALL NOT 覆盖 change、创建第二个 worktree、写 proposal-created event或登记第二个 origin

### Requirement: Apply 与 Archive 只接受 ProposalRef 并冻结 run target

`apply-change` 与 `archive-change` MCP input SHALL 接受 `folderId + changeName`，SHALL NOT 接受 caller `targetPath` 或 `worktreePath`。Main apply/archive IPC SHALL 接受 `workspaceId + folderId + changeId`。apply run创建时 SHALL 将完整 ProposalRef与 resolver返回的 `worktreePath` 固定到 run meta；所有 stage与archive SHALL 复用该 snapshot。

#### Scenario: Apply run 固定 secondary Folder target

- **WHEN** 用户为 Folder B的 proposal创建 apply run
- **THEN** run meta SHALL 持久化 Folder B的 ProposalRef与 resolved worktreePath
- **AND**所有 apply stage和archive activation SHALL 使用该固定 target
- **AND**对应 Agent filesystem与MCP descriptor SHALL 只包含 Folder B

#### Scenario: 固定 target 消失

- **WHEN** run创建后其 worktree被移除、不再 registered或不再包含该 change
- **THEN**后续 stage/archive SHALL 返回明确 stale target error并停止
- **AND** SHALL NOT 回退 main、重新运行 linked-preferred选择或切换到其他 worktree

#### Scenario: 历史 run 缺少 owner

- **WHEN**历史 apply/archive run没有可验证的 folderId
- **THEN**系统 MAY 保留其消息和只读状态
- **AND**继续执行或归档 SHALL 明确失败
- **AND** SHALL NOT 从 Workspace primary、repository path或 changeId猜测 owner

### Requirement: Proposal created event 携带完整身份与 target

成功创建 proposal 后，MCP event SHALL 携带 `workspaceId`、`sessionId`、`proposalRef`、`worktreeMode` 与 `worktreePath`。Main consumer SHALL 验证 event Workspace、owner Folder 与 worktree target 后再记录 proposal origin或通知 UI。

#### Scenario: 新 proposal 写入 owner-qualified event

- **WHEN** create在授权 Folder的 resolved target成功创建 change
- **THEN** event SHALL 包含相同的 ProposalRef与ResolvedProposalTarget字段
- **AND** consumer SHALL NOT 从 event directory、primary Folder或path字符串反推 owner

#### Scenario: 重复 create 不写 event

- **WHEN** create返回 `PROPOSAL_ALREADY_EXISTS`
- **THEN**系统 SHALL NOT 写入新的 proposal-created event
- **AND** SHALL NOT 覆盖现有 proposal origin
