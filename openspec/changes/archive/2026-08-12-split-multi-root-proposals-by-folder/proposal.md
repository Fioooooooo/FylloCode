## Why

当前 multi-root Chat 虽然会把全部 Folder identity 注入 Agent，`create-proposal` 也要求显式 `folderId`，但 Chat 决策契约仍以单个 change 为叙事单位，没有要求按 repository 分别判断 Proposal 门槛。结果是一个横跨多个 root repository 的需求可能只在 primary Folder 创建 Proposal，把其他 repository 的契约变更错误收进 primary owner，破坏 repository-owned Proposal 边界。

## What Changes

- 要求 Chat 在 multi-root Workspace 中先按 Folder 拆分预期改动，再对每个 repository 独立判断 Direct、Plan 或 Proposal 轨道。
- 跨 repository 接口依赖以权威 contract/spec 的 owner Folder 承担契约变化；依赖方适配保留在依赖方 Folder 并独立判断轨道。用户确认 owner 集合时至少看到 Folder 名称、具体契约变化与已知跨仓库依赖或顺序。
- 当多个 Folder 各自达到 Proposal 标准时，Agent 必须在取得用户对明确 owner 集合的同意后，为每个 Folder 分别调用 `create-proposal`，并显式传入对应 `folderId`；不得创建 primary-owned umbrella Proposal。
- 未达到 Proposal 标准的 Folder 继续按自身改动性质走 Direct 或 Plan，不因同一用户目标中的其他 Folder 需要 Proposal 而被强制升级。
- 每个 Proposal artifact 只描述其 owner repository 内的契约、实现和验证；跨 repository 依赖在相关 design/tasks 中显式记录，但不得把另一 Folder 的代码任务归入当前 Proposal。
- 修正 Chat workspace policy 中过时的 `state.workspace.path` 表述，统一以 `state.target.proposalRef` 和 `state.target.worktreePath` 跟踪一个或多个 Proposal target。
- 补强 `create-proposal` Agent-facing instruction，明确一次调用只创建一个 repository owner 的 Proposal，跨 Folder 需要独立调用。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `repository-owned-proposals`: 增加 multi-root 用户目标按 Folder 独立判断并分别创建 repository-owned Proposal 的行为契约。
- `acp-multi-root-session`: 扩展 Chat system reminder contract，使 Agent 获得逐 Folder 轨道判断、owner 集合确认和多 Proposal target 跟踪规则。

## Impact

- Agent policy：`src/main/services/session/chat/system-reminder/templates/chat.txt`。
- MCP instruction：`src/mcp-servers/fyllo-specs/src/tools/instructions/create-proposal.md`；`create-proposal` schema、resolver、事件和 workspace runtime 无需修改。
- Specs：`openspec/specs/repository-owned-proposals/spec.md`、`openspec/specs/acp-multi-root-session/spec.md`。
- Tests：`test/main/services/session/chat/system-reminder/{shared,resolve}.spec.ts` 与 `test/mcp-servers/fyllo-specs/tools.test.ts` 的静态/渲染契约断言。
- 不改变 `ProposalRef`、MCP input、IPC、持久化、Proposal browser、Apply/Archive 或 task/lineage 数据结构；同一 Session 关联多个 Proposal 的现有能力继续复用。
