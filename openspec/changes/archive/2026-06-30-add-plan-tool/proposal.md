## Why

当前 Chat 阶段只有“直接实现”和“创建 Proposal”两种正式轨道。对于不改变外部契约、但涉及多文件修改或架构取舍的任务，直接实现缺少可审阅的决策记录；强制创建 Proposal 又会把非契约变更推入完整 SDD 流程，成本偏高。

本变更引入 session-scoped Plan Tool，让 Agent 在探索后创建轻量 plan，用户在 FylloCode 内审阅并批准后，Agent 再按 plan 实施，同时把该决策记录纳入 lineage。

## What Changes

- 新增 `fyllo-specs` MCP tool：`create-plan`，只接收 `goal` 与 Agent 提供的 `slug` 片段，在当前 chat session 的 `plans/` 目录创建 `plan.md` 骨架，并返回供 Agent 填写的绝对路径。
- 新增 `plan.create` Fyllo action type，用于让用户在 Chat 中打开 plan 审阅 Slideover；payload 只包含 `slug` 与 `goal`，不包含 `planPath`。
- 扩展 Fyllo action dispatcher / shell 的通用 handler outcome，支持 `dismissed`：用户打开审阅但未批准时不写入 `actionStates`，避免把“已打开”误记为“已批准”。
- 新增 plan 读写与批准 IPC：renderer 通过 `{ projectId, sessionId, slug }` 访问 plan，主进程负责路径推导和校验。
- 扩展 lineage session link：在 `LineageSessionLink` 上记录 `plans: LineagePlanLink[]`；历史数据缺失 `plans` 时读取为 `[]`。
- 不新增 `LineageIndex.plans`。plan 是 session-scoped 轻量记录，不提供全局 `slug -> subjectId` 反查入口。
- 更新 Chat system-reminder 的三级分流：低风险直接实现、非契约复杂变更走 Plan、契约变更走 Proposal；Plan 批准后 Agent 重新读取最新 plan 再实施。

## Capabilities

### New Capabilities

- `plan-tool`: 定义 session-scoped plan 的文件结构、创建、审阅、编辑、批准和批准后实施语义。

### Modified Capabilities

- `fyllo-specs-mcp`: 新增 `create-plan` tool、第五个 instruction markdown、tool 入参/返回结构和 env 约束。
- `fyllo-action-tags`: 新增 `plan.create` action type，并扩展 action handler outcome 支持 `dismissed`。
- `project-lineage-model`: `LineageSessionLink` 增加 session-scoped `plans` 列表，且 `LineageIndex` 不增加 plan 反查索引。
- `lineage-proposal-link`: MCP event consumer 支持 `create-plan` 事件并分发到 `recordPlan`。
- `lineage-ipc`: 新增 plan 读写与批准 IPC channel。
- `system-reminder-injection`: Chat reminder 增加三级分流和 Plan 阶段规则。
- `bundled-mcp-servers`: `fyllo-specs` instruction markdown 集合从四个扩展为五个。

## Impact

- Shared 类型与 schema：`src/shared/types/fyllo-action.ts`、`src/shared/schemas/fyllo-action.ts`、`src/shared/constants/fyllo-action-contracts.ts`、`src/shared/types/mcp-event.ts`、`src/shared/types/lineage.ts`、`src/shared/types/channels.ts`、`src/shared/schemas/ipc/lineage.ts`。
- MCP server：`src/mcp-servers/fyllo-specs/src/tools/`、`src/mcp-servers/fyllo-specs/src/tools/instructions/`、`src/mcp-servers/fyllo-specs/src/utils/load-prompt.ts`。
- 主进程 lineage 与 storage：`src/main/services/lineage/**`、`src/main/domain/lineage/**`、`src/main/infra/storage/lineage-store.ts`、`src/main/infra/storage/project-paths.ts`、`src/main/ipc/lineage.ts`。
- Renderer：Fyllo action shell/dispatcher、Plan Slideover、lineage API wrapper、Chat action body component。
- System reminder：`src/main/services/chat/system-reminder/templates/chat.txt` 及相关测试。
- 测试范围：MCP tool tests、main lineage/storage/ipc tests、shared schema tests、renderer action/slideover tests、system-reminder tests。
