# workspace-automation-storage Specification Delta

## MODIFIED Requirements

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
