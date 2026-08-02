## ADDED Requirements

### Requirement: Automation data remains Workspace-owned

Local tasks、custom workflows 与 integration config SHALL 存储在 `workspaceDataDir(workspaceId)` 下，并 SHALL NOT 因 Workspace primary、Folder filter、Folder relocation 或共享 Folder 而改用 repository path。Built-in workflows 和 provider credentials 的既有 global ownership SHALL 保持不变。

#### Scenario: Two Workspaces share a Folder

- **WHEN** Folder Workspace 与 Collection Workspace 引用同一个 Folder
- **THEN** 两个 Workspace SHALL 读取各自的 local tasks、custom workflows 与 integration config
- **AND** SHALL NOT 自动继承或合并另一 Workspace 的 automation data

#### Scenario: Workflow owner remains stable

- **WHEN** Collection Workspace 改变 primary 或移除非运行中引用的成员
- **THEN** custom workflow files SHALL 仍从相同 `workspaceId` storage 读取
- **AND** 既有 Apply/Archive run SHALL 继续使用 run 中固定的 ProposalRef 与 worktree target
- **AND** workflow stage SHALL NOT 重新按 current primary 解析 repository owner

### Requirement: Task repository targets are non-blocking soft references

Task SHALL 支持可选 `targetFolderIds` 作为 repository hints。系统 SHALL 去重并保留首次选择顺序；省略与空数组均表示无 repository hint。读取 task 时系统 SHALL 按当前 Workspace membership 投影 `currentTargetFolderIds` 与 `staleTargetFolderIds`，并 SHALL 保留原始 targets。

#### Scenario: Task target Folder is removed

- **WHEN** 一个 task 的 target Folder 从 Workspace 成员中移除
- **THEN** 成员移除 SHALL NOT 被该 task 阻止
- **AND** persisted `targetFolderIds` SHALL NOT 被改写
- **AND** task projection SHALL 将该 ID 放入 `staleTargetFolderIds`
- **AND** UI SHALL 展示失效 target 数量并允许用户编辑

#### Scenario: Legacy task has no targets

- **WHEN** 系统读取没有 `targetFolderIds` 的 legacy task
- **THEN** task SHALL 保持无 repository hint
- **AND** SHALL NOT 因 Workspace 只有一个成员或存在 primary 而猜测 target

#### Scenario: Duplicate target IDs are normalized

- **WHEN** create 或 update 输入包含重复 Folder IDs
- **THEN** persisted task SHALL 每个 ID 只保留一次
- **AND** SHALL 保留每个 ID 首次出现的用户顺序

### Requirement: Task proposal owner suggestion preserves original ambiguity

从 task 创建 proposal 时，系统 SHALL 只在原始去重 `targetFolderIds` 恰好一个且该 Folder 仍是当前可用成员时预选 owner。系统 SHALL 允许外部 task repository metadata 作为建议，但该建议 SHALL 通过相同 membership 验证且不得绕过用户确认。

#### Scenario: Multiple targets degrade to one current target

- **WHEN** task 原始 targets 有两个，其中一个已 stale
- **THEN** proposal owner picker SHALL 继续要求用户确认
- **AND** SHALL NOT 因 `currentTargetFolderIds` 只剩一个而自动预选该 Folder

#### Scenario: One valid original target

- **WHEN** task 原始 targets 恰好一个且该 Folder 是当前可用成员
- **THEN** proposal owner picker SHALL 将该 Folder 作为预选 owner
- **AND** 最终 create request SHALL 仍携带显式 Folder owner

### Requirement: Workspace Integration uses explicit Folder binding

系统 SHALL 以 Workspace Integration 命名跨进程 API、Main service 和 renderer store。`WorkspaceIntegrationEntry` SHALL 支持可选 `folderId`；source-control 与 CI/CD 中 repository-bound resource 在新写入时 SHALL 绑定当前 Workspace member Folder，系统 SHALL 允许 Workspace-level resource 保持 unbound。

#### Scenario: Save repository-bound resource

- **WHEN** 用户为 source-control 或 CI/CD stage 保存 repository-bound resource
- **THEN** request SHALL 携带所选 `folderId`
- **AND** Main SHALL 验证该 Folder 是当前 Workspace 成员
- **AND** 无 owner 或未授权 owner SHALL 被拒绝且配置保持不变

#### Scenario: Bound Folder later becomes stale

- **WHEN** persisted integration entry 的 `folderId` 已不属于当前 Workspace
- **THEN** 系统 SHALL 保留该 entry 和原始 binding
- **AND** read projection SHALL 将其标记为 stale
- **AND** UI SHALL 要求用户重新绑定或移除
- **AND** SHALL NOT 静默绑定 primary Folder

#### Scenario: Legacy integration entry is unbound

- **WHEN** 系统读取缺少 `folderId` 的既有 integration entry
- **THEN** entry SHALL 保持 unbound 并继续可读
- **AND** 下一次保存 repository-bound stage 时 SHALL 要求显式 binding
- **AND** 系统 SHALL NOT 根据唯一成员猜测 owner
