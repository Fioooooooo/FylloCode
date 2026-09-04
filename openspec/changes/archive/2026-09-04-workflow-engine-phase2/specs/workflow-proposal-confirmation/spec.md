## ADDED Requirements

### Requirement: Confirm IPC writes definition per user-selected persist and mode, without creating a Run

系统 SHALL 在 `src/shared/ipc/automation/workflow-proposal.channels.ts` 定义 `automation:workflow-proposal:list`、`getDetail`、`confirm`、`cancel` 和 `wake`。Main handler SHALL 校验 Workspace、parent session 归属和 proposal 当前状态；Renderer SHALL NOT 直接写入 proposal 或 definition 文件。

`confirm` SHALL 接受 `{workspaceId, parentSessionId, proposalId, persist: "session" | "workspace"}`；`yaml`、`mode`、`workflowId` SHALL 从 proposal 记录读取，SHALL NOT 由 Renderer 重新传入。最终生效的 `persist` SHALL 以用户在确认卡片上点击的按钮为准，SHALL NOT 受 `propose_workflow` 提交时 Agent 建议值的约束。

系统 SHALL 按以下矩阵落盘：`mode: "create"` SHALL 分配新的 `workflowId`；`mode: "update"` SHALL 复用 proposal 记录中的 `targetWorkflowId`。`persist: "session"` SHALL 写入 `workspaceDataDir/sessions/<parentSessionId>/workflows/<workflowId>.yaml`；`persist: "workspace"` SHALL 写入 `workspaceDataDir/workflows/<workflowId>/definition.yaml`。`mode: "update"` 且 `persist: "workspace"` 但目标只存在于 session shadow 时，系统 SHALL 返回结构化"目标不可升格"错误，SHALL NOT 自动复制或升格。

正式 definition 写入成功后，系统 SHALL 将 proposal 标记为 `confirmed`，SHALL 返回 `{status: "confirmed", workflowId, persist}`。confirm IPC SHALL NOT 创建 Run、SHALL NOT 分配 `runId`、SHALL NOT 等待执行；执行入口交给后续 `trigger_workflow`。写入失败时系统 SHALL 返回结构化错误，proposal SHALL 保持可重新确认的状态，SHALL NOT 发送 handoff。

同一 proposal 重复点击终态操作（`confirmed`/`cancelled` 之后再次 confirm/cancel）SHALL 只返回既有终态，SHALL NOT 重复写入 definition、SHALL NOT 重复创建 decision 或 handoff。

#### Scenario: `mode: create` 确认为 workspace 正式资产

- **WHEN** 用户对 `mode: "create"` 的 proposal 选择 `persist: "workspace"`
- **THEN** 系统 SHALL 分配新 `workflowId` 并写入 workspace 正式 `definition.yaml`
- **AND** proposal SHALL 标记为 `confirmed` 并返回该 `workflowId`
- **AND** 系统 SHALL NOT 创建 Run

#### Scenario: `mode: update` 确认为 session shadow

- **WHEN** 用户对 `mode: "update"` 的 proposal 选择 `persist: "session"`
- **THEN** 系统 SHALL 使用 proposal 记录的目标 `workflowId` 写入 session shadow definition
- **AND** workspace 正式目录下同一 `workflowId` 的 definition SHALL 不受影响

#### Scenario: `mode: update` 试图升格不存在于 workspace 的目标

- **WHEN** proposal 的目标只存在于 session shadow，用户选择 `persist: "workspace"`
- **THEN** 系统 SHALL 返回结构化错误
- **AND** SHALL NOT 自动复制 session shadow 内容到 workspace 正式目录
- **AND** proposal SHALL 保持可重新确认

#### Scenario: 重复确认只返回既有终态

- **WHEN** 已经 `confirmed` 或 `cancelled` 的 proposal 再次收到 confirm 或 cancel 请求
- **THEN** 系统 SHALL 返回当前终态而不重新执行落盘或取消逻辑
- **AND** SHALL NOT 产生第二次 handoff 或 decision record

### Requirement: Confirm sends a best-effort role:user handoff without a durable delivery queue

definition 落盘成功后，系统 SHALL 尝试发送一条 `role: user` 的 `<system-reminder>` 给 parent session 的主 Agent，提示 workflow 已保存并给出对应 `workflowId`，建议调用 `trigger_workflow`。该投递 SHALL 复用既有 `ChatTurnGate`（`kind: "notification"`），SHALL NOT 新增 `ChatTurnKind`。

投递 SHALL 是单次尽力尝试：能获取 turn lease 时 SHALL 立即投递并将 proposal 的 `handoffDelivered` 标记为 `true`；无法获取 lease（parent session 当前有其它 turn 占用）时系统 SHALL 放弃本次投递，将 `handoffDelivered` 标记为 `false`，SHALL NOT 建立持久化重试队列、SHALL NOT 复用取消决定的五状态 outbox。`handoffDelivered` 状态 SHALL NOT 影响 confirm IPC 的成功返回——confirm 成功只代表 definition 已落盘。

#### Scenario: Parent session 空闲时立即投递

- **WHEN** confirm 成功且 parent session 当前没有其它 active turn
- **THEN** 系统 SHALL 立即以 `role: user` 追加 handoff reminder 并驱动一次 ACP turn
- **AND** proposal 的 `handoffDelivered` SHALL 标记为 `true`

#### Scenario: Parent session 忙碌时放弃投递

- **WHEN** confirm 成功但 parent session 当前有其它 active turn 占用 `ChatTurnGate`
- **THEN** 系统 SHALL 放弃本次 handoff 投递
- **AND** proposal 的 `handoffDelivered` SHALL 标记为 `false`
- **AND** confirm IPC SHALL 仍返回成功结果

#### Scenario: 应用在 handoff 前重启不构成 confirm 失败

- **WHEN** definition 已落盘但应用在 handoff 发出前重启
- **THEN** 已落盘的 workflow SHALL 保持有效
- **AND** 系统 SHALL NOT 在重启后自动重发该 handoff
- **AND** 用户可在会话中要求 Agent 再次调用 `trigger_workflow`

### Requirement: Cancel writes an isolated decision record and reuses ChatTurnGate delivery semantics

用户取消 proposal 时，系统 SHALL 将 proposal 标记为 `cancelled`，SHALL NOT 写入任何正式 definition，SHALL NOT 创建 Run。系统 SHALL 写入独立的 `workspaceDataDir/sessions/<parentSessionId>/workflow-decisions/<proposalId>.json` decision record，记录 `decision: "cancelled"` 与既有 `pending/dispatched/delivered/delivery_unknown/suppressed` 五状态 notification 语义。

Decision record SHALL 与 `spawned-session-store` 的 spawn notification 记录物理隔离（独立存储、独立类型），SHALL NOT 合并进 `SessionChatNotificationChannels`/`SpawnNotificationSummary` 既有协议。投递 SHALL 复用相同的 `ChatTurnGate`（`kind: "notification"`）互斥语义：turn 忙碌时 decision 保持 `pending`，turn 释放后系统 SHALL 允许重试；应用重启 SHALL 将 `dispatched` 转为 `delivery_unknown` 且 SHALL NOT 重发；parent session 删除 SHALL 将非终态 decision 转为 `suppressed`。Renderer SHALL NOT 直接 claim decision record，claim SHALL 只能由 Main 触发。Agent 收到的取消 reminder SHALL 是用户不可见的 `<system-reminder>`，SHALL NOT 携带新的 workflow 执行指令。

#### Scenario: 取消触发独立 decision record

- **WHEN** 用户对某个 `pending` proposal 点击取消
- **THEN** 系统 SHALL 将 proposal 标记为 `cancelled`
- **AND** SHALL 写入 `pending` 状态的 decision record
- **AND** SHALL NOT 写入任何 session/workspace 正式 definition

#### Scenario: Turn 忙碌时取消提醒保持 pending 并在释放后重试

- **WHEN** decision record 已生成但 parent session 当前有其它 active turn
- **THEN** 系统 SHALL 保持该 decision 为 `pending`
- **AND** turn 释放后系统 SHALL 允许后续投递尝试

#### Scenario: 重启不重发已 dispatched 的取消提醒

- **WHEN** 应用重启时存在 `dispatched` 状态的 decision record
- **THEN** 系统 SHALL 将其转为 `delivery_unknown`
- **AND** SHALL NOT 自动重新投递

#### Scenario: parent 删除抑制未投递的取消提醒

- **WHEN** parent session 删除流程开始且存在非终态 decision record
- **THEN** 系统 SHALL 将其转为 `suppressed`
- **AND** SHALL NOT 在删除后继续尝试投递
