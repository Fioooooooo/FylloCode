## MODIFIED Requirements

### Requirement: Run creation SHALL use trusted ownership, atomic snapshot creation and one active Run per parent

Workflow Run SHALL 归属于 `{workspaceId,parentSessionId}`，且 active 状态下同一复合 key SHALL 最多存在一个 Run。`trigger_workflow` 的调用方 SHALL 只提供 workflowId；parentSessionId SHALL 来自 Main 信任的 bundled MCP caller/Workspace context，不得接受 agent 自报的 parentSessionId。

创建 Run 前系统 SHALL 按以下顺序解析 definition：先查找 `workspaceDataDir/sessions/<parentSessionId>/workflows/<workflowId>.yaml`（session shadow），若不存在则查找 `workspaceDataDir/workflows/<workflowId>/definition.yaml`（workspace 正式资产）。解析到 definition 后 SHALL 完成 Phase 1 preflight，然后组装完整的 `WorkflowRunSnapshot` 并以原子写入创建 `<run-id>/<run-id>.json`。创建成功前 SHALL NOT 向调用方返回 runId。快照 SHALL 包含 `snapshotSchemaVersion: 1`、完整 inline `frozenDefinition`、`definitionSource`（`"session" | "workspace"`，记录实际命中的来源）、currentStageId、visitCounts、artifacts 和 status；不得使用 `workflowVersion`、仅 hash 或 live definition 引用。

#### Scenario: 创建普通 Run

- **WHEN** trusted chat caller 为不存在 active Run 的 parent session 触发可执行 workflow，且 `confirmStart` 为 false
- **THEN** 系统 SHALL 原子写入完整 snapshot
- **AND** Run SHALL 进入 `running` 并开始推进第一个 stage
- **AND** 返回的 runId SHALL 对应已经落盘的 snapshot

#### Scenario: 创建需要开始确认的 Run

- **WHEN** workflow 的 `confirmStart` 为 true
- **THEN** 系统 SHALL 创建并落盘 `awaiting_start_confirmation` snapshot
- **AND** SHALL 触发 Workflow Run wake
- **AND** `trigger_workflow` SHALL 立即返回 runId 和 awaiting 状态而不等待用户决策

#### Scenario: 同一 parent 存在 active Run

- **WHEN** `{workspaceId,parentSessionId}` 已有关联的 active Run，且调用方再次触发任意 workflow
- **THEN** 系统 SHALL 返回 `WORKFLOW_RUN_CONFLICT`
- **AND** SHALL NOT 创建第二个 Run、覆盖既有 snapshot 或启动新的 stage

#### Scenario: Snapshot 原子写入失败

- **WHEN** definition 已通过解析/preflight，但 Run snapshot 写入失败
- **THEN** `trigger_workflow` SHALL 返回持久化错误
- **AND** SHALL NOT 把未完整写入的 runId 返回给调用方
- **AND** SHALL NOT 启动 ACP session 或 Action process

#### Scenario: Session shadow definition 优先于 workspace 正式资产

- **WHEN** 同一 `workflowId` 同时存在于当前 parent session 的 session shadow 目录和 workspace 正式目录
- **THEN** `trigger_workflow` SHALL 使用 session shadow definition 创建 Run
- **AND** snapshot 的 `definitionSource` SHALL 记录为 `"session"`
- **AND** workspace 正式 definition SHALL 保持不受影响

#### Scenario: Session shadow definition 被删除后历史 Run 不受影响

- **WHEN** 某个 Run 已经使用 session shadow definition（`definitionSource: "session"`）创建并持久化 `frozenDefinition`
- **AND** 之后该 session shadow 文件被删除或被更新覆盖
- **THEN** 该历史 Run 的 detail SHALL 继续展示原始 `frozenDefinition` 与 `definitionSource`
- **AND** 系统 SHALL NOT 静默改用 workspace definition 重新解释该 Run
