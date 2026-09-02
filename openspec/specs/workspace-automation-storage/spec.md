# workspace-automation-storage Specification

## Purpose

定义 Task、v2 Workflow definition/Run 与 Workspace Integration 的 Workspace-owned 持久化和跨进程契约，包括 Task Folder 软引用的 current/stale 投影、Workflow 作用域，以及 repository-bound Integration 的显式 Folder binding。

## Requirements

### Requirement: Automation data remains Workspace-owned

Local tasks、手写 workflow definitions、workflow Run snapshots/artifacts 与 integration config SHALL 存储在 `workspaceDataDir(workspaceId)` 下，并 SHALL NOT 因 Workspace primary、Folder filter、Folder relocation 或共享 Folder 而改用 repository path。Phase 1 不再提供 built-in workflow 的 packaged asset、global staging、启动复制或 global runtime；所有可触发 workflow SHALL 来自当前 Workspace 的正式 definition 目录。

Workflow definition SHALL 位于 `workflows/<workflow-id>/definition.yaml`，Run SHALL 位于对应 workflow 的 `runs/<run-id>/`，其中可包含 `<run-id>.json`、fresh session transcript 和 Action output。workflowId SHALL 是随机稳定 identity，不能由 name 或当前 primary 推导。旧按名称的 `workflows/<name>.yaml`、旧 `WorkflowStage` 数据和 `apply-runs/**` SHALL 不被新 runtime 读取、发现或继续执行；本变更不要求迁移这些 legacy files。

#### Scenario: Two Workspaces share a Folder

- **WHEN** Folder Workspace 与 Collection Workspace 引用同一个 Folder
- **THEN** 两个 Workspace SHALL 读取各自的 workflow definitions、Run snapshots、local tasks 与 integration config
- **AND** SHALL NOT 自动继承或合并另一 Workspace 的 automation data

#### Scenario: Workflow identity remains stable across rename

- **WHEN** 用户修改 workflow definition 的 name 或 Collection Workspace 改变 primary
- **THEN** 系统 SHALL 继续从同一个 workspaceId/workflowId 目录读取 definition 和既有 runs
- **AND** SHALL NOT 按新 name 创建新目录、重新选择 repository owner 或迁移 Run artifacts

#### Scenario: Workflow Run snapshot keeps its execution context

- **WHEN** 一个 Run 已创建并且 Workspace primary、Folder filter 或成员状态之后发生变化
- **THEN** Run SHALL 继续使用 snapshot 内的 parent identity、frozenDefinition 和已授权的 Workspace context
- **AND** workflow stage SHALL NOT 重新按 current primary 解析 owner
- **AND** existing Proposal Apply/Archive 的 owner-qualified `ProposalRef` 与固定 target 语义 SHALL 保持有效

#### Scenario: Legacy automation files remain inert

- **WHEN** Workspace storage 中仍存在旧名称型 workflow 文件或旧 apply-runs 目录
- **THEN** v2 list/trigger/runtime SHALL 忽略这些路径
- **AND** 启动 reconcile SHALL 不把它们转换为 active Run
- **AND** 本变更 SHALL NOT 为其增加删除或自动迁移副作用

#### Scenario: Built-in template resource and global staging are absent from the v2 path

- **WHEN** 应用构建并启动 workflow definition service
- **THEN** packaged resources SHALL NOT contain `resources/workflows/built-in/**`
- **AND** service SHALL NOT read or initialize global `data/workflows`/`userData/workflows`
- **AND** list/save/delete SHALL only operate on `workspaceDataDir(workspaceId)/workflows/<workflow-id>/definition.yaml`

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

## Implementation mapping

- Workspace paths and definition/Run stores：`src/main/infra/storage/workspace-paths.ts`、`workflow-definition-store.ts`、`workflow-run-store.ts`。
- Definition service and runtime ownership：`src/main/services/automation/workflow/workflow-service.ts`、`workflow-engine.ts`。
- Workspace isolation and legacy absence checks：`test/main/infra/storage/workspace-paths.spec.ts`、`workflow-definition-store.spec.ts`、`workflow-run-store.spec.ts`、`test/main/infra/workflow-source-boundary.spec.ts`、`test/main/packaging/workflow-resources.spec.ts`。
