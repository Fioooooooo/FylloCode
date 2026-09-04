# workflow-proposal-authoring Specification

## Purpose

定义 bundled `fyllo-workflow` MCP server 如何披露 workflow schema、执行解析期校验并创建按 session owner 隔离的 workflow proposal，明确 proposal authoring 与后续运行时执行、用户确认之间的边界。

## Requirements

### Requirement: `fyllo-workflow` provides on-demand schema disclosure via `describe_workflow_schema`

系统 SHALL 在 `fyllo-workflow` bundled MCP server 新增无副作用的 `describe_workflow_schema` tool。该 tool SHALL NOT 修改任何 proposal、definition 或 Run 状态。返回内容 SHALL 是 workflow YAML schema 的骨架说明（`WorkflowDefinition`/`Stage`（`AgentStage`/`ActionStage`/`WaitStage`）/`ActionOp`/`Gate`/`ArtifactSpec`/`Transition` 的字段与语义、解析期校验清单），并 SHALL 明确说明"schema 合法不等于当前运行时可执行"。该内容 SHALL 作为 `fyllo-workflow` MCP server 包内维护的静态资产提供，SHALL NOT 在运行时读取 `references/**` 目录（该目录被排除出应用打包）。

Tool input SHALL 只有一个可选布尔字段 `withExamples`（默认 `false`）；为 `true` 时返回内容 SHALL 额外包含完整 YAML 示例。系统 SHALL NOT 提供按模块拆分的参数化查询。

#### Scenario: Agent 查询 schema 骨架

- **WHEN** trusted Chat Agent 调用 `describe_workflow_schema({})`
- **THEN** server SHALL 返回 schema 骨架的 markdown 全文
- **AND** 返回内容 SHALL 明确区分"schema 合法"与"当前运行时可执行"
- **AND** SHALL NOT 附带完整 YAML 示例

#### Scenario: Agent 请求附带示例

- **WHEN** trusted Chat Agent 调用 `describe_workflow_schema({ withExamples: true })`
- **THEN** 返回内容 SHALL 额外包含完整 YAML 示例
- **AND** 调用 SHALL NOT 产生任何持久化副作用

### Requirement: `propose_workflow` performs parse-time validation only and stores a session-owned proposal

系统 SHALL 在 `fyllo-workflow` bundled MCP server 新增 `propose_workflow` tool，接受 `{yaml, persist: "session" | "workspace", mode: "create" | "update", workflowId?}`。`mode: "create"` 时 `workflowId` SHALL 必须省略；`mode: "update"` 时 `workflowId` SHALL 必填，且 SHALL 能在当前 owner 的 session shadow definition 或 workspace 正式 definition 中解析到。

Tool SHALL 只执行 workflow YAML 的解析期结构校验（[definition-schema.md](../../../../references/designs/workflow-engine/definition-schema.md) 第 9 节：stage 拓扑、`goto` 引用、`maxLoops`、模板变量命名空间等）以及 `mode`/`workflowId`/`persist` 的组合校验。系统 SHALL NOT 在此阶段执行 Phase 1 execution-profile preflight，SHALL NOT 检查目标 workflow 是否存在 active Run 冲突。schema 合法但超出当前 execution profile 的 definition（`context: inherit`、`WaitStage`、非 `exec` Action、非 `human` Gate、`retry`、`idempotencyKey` 等）SHALL 允许通过本阶段校验。

校验失败时 tool SHALL 返回 `{status: "rejected", errors: Array<{rule, detail}>}`，SHALL NOT 写入 proposal 目录、SHALL NOT 触发 wake。校验通过时，系统 SHALL 将 YAML 原文与 `mode`/`workflowId`/`persist`（Agent 建议值）写入 `workspaceDataDir(workspaceId)/sessions/<parentSessionId>/workflow-proposals/<proposalId>/{definition.yaml,.meta.json}`，metadata 状态 SHALL 为 `pending`，SHALL 触发独立 workflow-proposal wake，并返回 `{status: "accepted", proposalId}`。系统 SHALL NOT 在 `accepted` 分支返回 `runId`，SHALL NOT 创建 Run，SHALL NOT 写入 session/workspace 的正式 definition。

Owner（`workspaceId`/`parentSessionId`）SHALL 只能来自可信 Main/MCP caller context，Agent SHALL NOT 能够自报 owner 或任何文件路径。`callerType` 非 `chat` 时 SHALL 返回 `WORKFLOW_INVALID_CALLER`，且 SHALL NOT 写入 proposal。

#### Scenario: 合法且可执行的 definition 被接受

- **WHEN** Agent 提交包含 Agent fresh/freeform、Action exec、human Gate 和合法 Transition 的 v2 YAML，`mode: "create"`
- **THEN** 系统 SHALL 写入 session-owned proposal 并触发 wake
- **AND** 返回 `status: "accepted"` 与 `proposalId`
- **AND** SHALL NOT 创建 Run 或写入正式 definition

#### Scenario: 合法但超出当前运行时能力的 definition 也被接受

- **WHEN** Agent 提交包含 `context: inherit` 或 `WaitStage` 的合法 v2 YAML
- **THEN** 系统 SHALL 写入 session-owned proposal 并触发 wake
- **AND** SHALL NOT 在本阶段执行运行时能力预检或拒绝
- **AND** 该判断 SHALL 留给后续 `trigger_workflow`

#### Scenario: 解析期校验失败

- **WHEN** YAML 无法解析、stage id 重复、transition 引用不存在的 stage，或 `mode`/`workflowId`/`persist` 组合不合法（如 `mode: "create"` 附带 `workflowId`，或 `mode: "update"` 的 `workflowId` 无法解析到任何既有 definition）
- **THEN** 系统 SHALL 返回 `status: "rejected"` 与结构化 `errors` 列表
- **AND** SHALL NOT 写入 proposal 目录、SHALL NOT 触发 wake

#### Scenario: 非 Chat caller 或自报 owner 被拒绝

- **WHEN** trusted caller owner 为 `workflow`、`spawned` 或 `unknown`，或 tool input 试图携带 owner/路径相关的额外字段
- **THEN** server SHALL 返回 `WORKFLOW_INVALID_CALLER` 或 schema 拒绝额外字段
- **AND** SHALL NOT 写入任何 proposal

### Requirement: Session-owned proposal storage is isolated per owner and survives restart

Proposal SHALL 归属于 `workspaceId + parentSessionId + proposalId` 三元组，存储在 `workspaceDataDir(workspaceId)/sessions/<parentSessionId>/workflow-proposals/<proposalId>/`。Proposal SHALL NOT 出现在 workspace `list_workflows` 结果中，SHALL NOT 被视为 Run snapshot。metadata SHALL 至少包含 `proposalId`、`workspaceId`、`parentSessionId`、`mode`、`targetWorkflowId?`、`suggestedPersist`、`status`（`pending`/`confirming`/`confirmed`/`cancelled`）、`createdAt`、`updatedAt`。

应用重启后，该 parent session 首次查询 SHALL 仍能发现 `pending` proposal。同一 parent session 的多个窗口 SHALL 共享同一份 proposal 数据；跨 session 或跨 workspace 的访问 SHALL 被拒绝。终态（`confirmed`/`cancelled`）metadata 与 `definition.yaml` SHALL 保留到 parent session 删除，系统 SHALL NOT 设置任意 TTL。parent session 删除 SHALL 级联清理该 parent 下全部 proposal 目录。

#### Scenario: 重启后仍可发现 pending proposal

- **WHEN** 应用重启后用户回到某个存在 `pending` proposal 的 session
- **THEN** owner-scoped 查询 SHALL 仍能返回该 proposal
- **AND** SHALL 不需要用户重新触发生成

#### Scenario: 跨 owner 访问被拒绝

- **WHEN** caller 使用不匹配的 `workspaceId`、`parentSessionId` 或 `proposalId` 查询/操作某个 proposal
- **THEN** 系统 SHALL 返回结构化 owner/authorization 错误
- **AND** SHALL NOT 泄露该 proposal 的内容或改变其状态

#### Scenario: parent session 删除级联清理

- **WHEN** parent session 删除流程开始且存在任意状态的 proposal
- **THEN** 系统 SHALL 删除该 parent 下的 `workflow-proposals/` 目录
- **AND** SHALL 在 parent session store 删除之前或同一流程内完成
