# workflow-run-inspection Specification

## Purpose

定义 Workflow Run 的 Renderer 观察和人工决策契约：使用独立的 `automation:workflow-run:*` IPC area、Main→Renderer wake + pull 模式和与 spawned session 平级的 `WorkflowRunActivityEntry`，让 Run 状态、确认点和 fresh Agent 对话可见而不混入 spawned-session 语义。

## Requirements

### Requirement: Workflow Run IPC is domain-first, owner-validated and read-only except for decisions

系统 SHALL 在 `src/shared/ipc/automation/workflow-run.channels.ts` 定义 `automation:workflow-run:list`、`automation:workflow-run:getDetail`、`automation:workflow-run:decide` 和 `automation:workflow-run:wake`。共享 schemas SHALL 位于 automation area；Main handler SHALL 位于 `src/main/ipc/automation/workflow-run.ts` 并由 automation registry 注册；Preload SHALL 通过 `window.api.automation.workflowRun` 暴露；Renderer wrapper SHALL 位于 `src/renderer/src/api/automation/workflow-run.ts`。

`list` SHALL 接受 `{workspaceId,parentSessionId}`；`getDetail` 和 `decide` SHALL 接受相同 owner 字段以及 `runId`，decide 还接受 `decision: "approve" | "reject"`。Main SHALL 校验 Workspace、parent session、Run 归属和当前状态，且 SHALL NOT 允许 Renderer 直接写入 Run snapshot。wake SHALL 只作为 Main→Renderer 失效通知，payload 只有 `{workspaceId,runId}`。

#### Scenario: 合法 owner 查询自己的 Run

- **WHEN** 当前 Workspace 的 parent session 请求 list 或其名下 Run 的 detail
- **THEN** Main SHALL 返回该 owner 可见的 summary/detail
- **AND** detail SHALL 来自 WorkflowEngine snapshot projection
- **AND** Renderer SHALL 不读取 Run JSON 文件

#### Scenario: 跨 Workspace 或 parent 查询被拒绝

- **WHEN** caller 使用不匹配的 workspaceId、parentSessionId 或 runId 请求 detail/decision
- **THEN** IPC SHALL 返回结构化 owner/authorization error
- **AND** SHALL 不泄露另一个 owner 的 detail，也不改变 Run 状态

#### Scenario: 决策入口统一

- **WHEN** Run 处于 `awaiting_start_confirmation`、`awaiting_gate_decision` 或 `awaiting_action_confirmation`
- **THEN** Renderer SHALL 通过同一 decide action 提交 approve/reject
- **AND** Main SHALL 将 decision 交给 WorkflowEngine 的串行队列
- **AND** 终态或 pending kind 不匹配的 decision SHALL 被拒绝

#### Scenario: Wake 不携带完整状态

- **WHEN** WorkflowEngine 有效推进、进入 awaiting、终态、错误或取消
- **THEN** Main SHALL debounce 后发送 `{workspaceId,runId}` wake
- **AND** wake SHALL NOT 携带 snapshot、ACP token、命令输出或 transcript 内容

### Requirement: Renderer uses wake plus interest-gated pull

Renderer SHALL 维护 workflow-run 专属 Pinia store 和 interest 生命周期。收到 wake 后，只有对应组件声明 active interest 时 store 才能调用 `getDetail`；detail response SHALL 按 workspace/parent/run identity 更新 store。无 interest 时 SHALL 忽略 wake 或只记录待刷新标记，不得发起无观察者查询。

#### Scenario: 观察中的 Run 收到 wake

- **WHEN** ActivityEntry 或 detail view 已声明 Run interest 并收到 matching wake
- **THEN** store SHALL 拉取最新 detail
- **AND** UI SHALL 更新 status、current stage、pending decision、artifact summary 和 error
- **AND** 短时间连续 wake SHALL 通过 debounce/generation 规则避免过量请求

#### Scenario: 无观察者时收到 wake

- **WHEN** Renderer 尚未挂载或已卸载所有对应观察组件
- **THEN** wake SHALL NOT 触发 getDetail
- **AND** 组件首次声明 interest 时 SHALL 能通过 list/detail 获取最新 snapshot

#### Scenario: Owner 或 interest generation 改变时丢弃迟到 response

- **WHEN** detail 请求发出后 Workspace、parent session 或 interest generation 改变
- **THEN** 迟到 response SHALL NOT 覆盖新的 store state
- **AND** store SHALL 以新 owner identity 重新加载 Run 列表

### Requirement: WorkflowRunActivityEntry is independent from spawned-session activity

`ChatBackgroundActivityBar` SHALL 将 `WorkflowRunActivityEntry` 与 `SpawnedSessionActivityEntry` 作为平级兄弟入口。Workflow entry SHALL 使用 workflow-run store、自己的 wake subscription 和 interest ref-count；不得从 `useSpawnedSessionStore`、spawn notification 或 spawned agent count 派生状态。

Workflow entry SHALL 展示 running、等待开始确认、等待 Gate、等待 Action 确认、成功、失败、取消和中断等状态，并为 pending decision 提供 approve/reject 控件。可见性由 workflow-run 数据决定，不能静默并入 spawned entry。终态 Run detail SHALL 保留，不从 Workspace storage/history 自动删除。

#### Scenario: Run 执行中显示独立入口

- **WHEN** parent session 有 active Workflow Run
- **THEN** ChatBackgroundActivityBar SHALL 展示独立 workflow entry
- **AND** spawned 数量和条目 SHALL 保持不变
- **AND** entry SHALL 展示 workflow name/status，而不是旧 stage type

#### Scenario: Run 等待用户处理

- **WHEN** Run 处于任一 awaiting decision 状态
- **THEN** entry SHALL 显示明确等待提示
- **AND** approve/reject SHALL 通过 workflow-run decide IPC 发送
- **AND** 决策前 Run SHALL 保持 awaiting

#### Scenario: Run 进入终态

- **WHEN** Run 进入 succeeded、failed、cancelled 或 interrupted
- **THEN** entry SHALL 通过 wake/pull 更新终态和错误/产物摘要
- **AND** detail SHALL 继续可从 Workspace storage 读取

### Requirement: Fresh Agent detail is reachable without changing spawned ownership

当 Run detail 含有 workflow-owned fresh Agent session 时，WorkflowRunActivityEntry 或 detail view SHALL 提供打开该 session 对话/transcript 的入口。该入口 SHALL 使用 WorkflowEngine 返回的 workflow session identity 和 transcript projection，不得通过 spawned list、notification 或 `SpawnedSessionActivityEntry` 重新发现。

#### Scenario: 用户打开 fresh Agent 对话

- **WHEN** 用户点击 Run 中当前 fresh Agent stage 的查看入口
- **THEN** Renderer SHALL 打开对应 workflow session 的对话内容
- **AND** 内容 SHALL 来自该 Run 专用 transcript
- **AND** session SHALL 不增加 spawned agent count 或改变 spawned parent lifecycle

#### Scenario: fresh Agent session 不可恢复

- **WHEN** 应用重启后 Run 被 reconcile 为 interrupted 且 ACP session 没有 live handle
- **THEN** detail SHALL 展示 interrupted 和已有 transcript/artifact
- **AND** SHALL NOT 伪造新的 spawned session 或自动重放 Agent turn

### Requirement: Workflow Run IPC SHALL be domain-first, owner-validated and read-only except for decisions

系统 SHALL 在 `src/shared/ipc/automation/workflow-run.channels.ts` 定义以下 channel：`automation:workflow-run:list`、`automation:workflow-run:getDetail`、`automation:workflow-run:decide` 和 `automation:workflow-run:wake`。共享 schemas SHALL 位于同一 automation area；Main handler SHALL 位于 `src/main/ipc/automation/workflow-run.ts` 并由 automation registry 注册；Preload SHALL 通过 `window.api.automation.workflowRun` 暴露；Renderer wrapper SHALL 位于 `src/renderer/src/api/automation/workflow-run.ts`。

`list` SHALL 接受 `{workspaceId,parentSessionId}`；`getDetail` SHALL 接受 `{workspaceId,parentSessionId,runId}`；`decide` SHALL 接受相同 owner 字段以及 `decision: "approve" | "reject"`。Main SHALL 校验 Workspace、parent session、Run 归属和当前状态，且 SHALL NOT 允许 Renderer 直接写入 Run snapshot。`wake` SHALL 只作为 Main→Renderer 的失效通知，payload SHALL 只有 `{workspaceId,runId}`。

#### Scenario: 合法 owner 查询自己的 Run

- **WHEN** 当前 Workspace 的 parent session 请求 list 或其名下 Run 的 detail
- **THEN** Main SHALL 返回该 owner 可见的 Run summary/detail
- **AND** detail SHALL 来自 WorkflowEngine 的 snapshot projection
- **AND** Renderer SHALL 不需要也不能直接读取 Run JSON 文件

#### Scenario: 跨 Workspace 或 parent 查询被拒绝

- **WHEN** caller 使用不匹配的 workspaceId、parentSessionId 或 runId 请求 detail/decision
- **THEN** IPC SHALL 返回结构化 owner/authorization error
- **AND** SHALL NOT 泄露另一个 Workspace 或 parent 的 Run detail
- **AND** SHALL NOT 改变任何 Run 状态

#### Scenario: 决策入口统一

- **WHEN** Run 处于 `awaiting_start_confirmation`、`awaiting_gate_decision` 或 `awaiting_action_confirmation`
- **THEN** Renderer SHALL 通过同一 `decide` action 提交 approve/reject
- **AND** Main SHALL 将 decision 交给 WorkflowEngine 的串行事件队列
- **AND** 已终态或不匹配 pending kind 的 decision SHALL 被拒绝且不得重复推进

#### Scenario: Wake 不携带完整状态

- **WHEN** WorkflowEngine 有效推进、进入 awaiting 状态或进入终态
- **THEN** Main SHALL debounce 后发送 `{workspaceId,runId}` wake
- **AND** wake SHALL NOT 携带完整 snapshot、ACP token、命令输出或 transcript 内容

### Requirement: Renderer SHALL use wake + interest-gated pull for Workflow Run state

Renderer SHALL 维护 workflow-run 专属 Pinia store 和 interest 生命周期。收到 wake 后，只有当前组件对对应 run 声明 active interest 时，store 才能调用 `getDetail`；detail response SHALL 按 workspace/parent/run identity 更新 store。无 interest 时 SHALL 忽略 wake 或只记录待刷新标记，不得发起无观察者查询。

#### Scenario: 观察中的 Run 收到 wake

- **WHEN** `WorkflowRunActivityEntry` 或 detail view 已声明某 Run interest 并收到 matching wake
- **THEN** store SHALL 拉取该 Run 的最新 detail
- **AND** UI SHALL 更新 status、current stage、pending decision、artifact summary 和错误信息
- **AND** 同一 run 的短时间连续 wake SHALL 通过既有 debounce/generation 规则避免过量请求

#### Scenario: 无观察者时收到 wake

- **WHEN** Renderer 尚未挂载或已卸载所有该 Run 的观察组件
- **THEN** 收到 wake SHALL NOT 触发 `getDetail`
- **AND** 后续组件首次声明 interest 时 SHALL 能通过 list/detail 获取最新 snapshot

#### Scenario: Workspace 或 parent 切换时丢弃迟到 response

- **WHEN** workflow-run store 发出 detail 请求后 Workspace、parent session 或 interest generation 改变
- **THEN** 迟到 response SHALL NOT 覆盖新的 store state
- **AND** store SHALL 以新的 owner identity 重新加载 Run 列表

### Requirement: WorkflowRunActivityEntry SHALL be independent from spawned-session activity

`ChatBackgroundActivityBar` SHALL 将 `WorkflowRunActivityEntry` 与 `SpawnedSessionActivityEntry` 作为平级兄弟入口渲染。Workflow entry SHALL 使用 workflow-run store、自己的 wake subscription 和 interest ref-count；不得从 `useSpawnedSessionStore`、spawn notification 或 spawned agent count 派生状态。

Workflow entry SHALL 能展示运行中、等待开始确认、等待 Gate、等待 Action 确认、成功、失败、取消和中断等状态，并为 pending decision 提供 approve/reject 控件。Workflow entry 的可见性 SHALL 由 workflow-run 数据决定，不能把 Workflow Run 静默并入 spawned entry。

#### Scenario: Run 在执行中显示独立入口

- **WHEN** parent session 有 active Workflow Run
- **THEN** ChatBackgroundActivityBar SHALL 展示独立 workflow entry
- **AND** spawned session 数量和条目 SHALL 保持不变
- **AND** workflow entry SHALL 展示 Run 的 workflow name/status，而不是旧 WorkflowStage type

#### Scenario: Run 等待用户处理

- **WHEN** Run 状态为 `awaiting_start_confirmation`、`awaiting_gate_decision` 或 `awaiting_action_confirmation`
- **THEN** workflow entry SHALL 显示明确的等待用户提示
- **AND** 用户的 approve/reject SHALL 通过 workflow-run decide IPC 发送
- **AND** 未收到用户决策前 Run SHALL 保持 awaiting 状态

#### Scenario: Run 进入终态

- **WHEN** Run 进入 `succeeded`、`failed`、`cancelled` 或 `interrupted`
- **THEN** workflow entry SHALL 通过 wake/pull 更新终态和可用错误/产物摘要
- **AND** Phase 1 SHALL 保留该 Run detail，不自动把记录从 Workspace storage 或 history 中删除

### Requirement: Workflow fresh Agent detail SHALL be reachable without changing spawned-session ownership

当 Run detail 含有 workflow-owned fresh Agent session 时，WorkflowRunActivityEntry 或其 detail view SHALL 提供打开该 session 对话/transcript 的入口。该入口 SHALL 使用 WorkflowEngine 返回的 workflow session identity 和 transcript 投影；不得通过 spawned-session list、spawned notification 或 `SpawnedSessionActivityEntry` 重新发现它。

#### Scenario: 用户打开 fresh Agent 对话

- **WHEN** 用户点击 Workflow Run 中当前 fresh Agent stage 的查看入口
- **THEN** Renderer SHALL 打开对应 workflow session 的对话内容
- **AND** 对话内容 SHALL 来自该 Run 的专用 transcript
- **AND** 该 session SHALL 不增加 spawned-agent 计数或改变 spawned parent lifecycle

#### Scenario: fresh Agent session 不可恢复

- **WHEN** 应用重启后 Run 被 reconcile 为 `interrupted` 且 ACP session 没有 live handle
- **THEN** Workflow detail SHALL 展示中断状态和已有 transcript/artifact
- **AND** SHALL NOT 伪造一个新的 spawned session 或自动重放 Agent turn

## Implementation mapping

- Shared/Main/Preload/Renderer contract：`src/shared/ipc/automation/workflow-run.*`、`src/main/ipc/automation/workflow-run.ts`、`src/preload/api/automation/workflow-run.ts`、`src/renderer/src/api/automation/workflow-run.ts`。
- Wake and lifecycle integration：`src/main/ipc/automation/workflow-run.ts`、`src/main/bootstrap/runtime.ts`、`src/main/bootstrap/workspace-window-manager.ts`。
- Renderer store and feature boundary：`src/renderer/src/stores/automation/workflow-run.ts`、`src/renderer/src/features/workflow-run-inspector/{model,application,integration,ui}`、`src/renderer/src/components/chat/ChatBackgroundActivityBar.vue`。
- Acceptance tests：`test/main/ipc/automation/workflow-run.spec.ts`、`workflow-run-wake.spec.ts`、`test/renderer/src/stores/automation/workflow-run.spec.ts`、`test/renderer/src/features/workflow-run-inspector/**`、`test/renderer/src/components/chat-background-activity-bar.spec.ts`。
