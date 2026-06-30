## MODIFIED Requirements

### Requirement: Action card 由 FylloCode 控制确认与取消

系统 SHALL 为合法且完成解析的 Fyllo action 渲染 FylloCode 控制的 action card。action card 的按钮文案、按钮显隐和业务 handler 绑定 SHALL 来自 renderer 内部 action definition，SHALL NOT 从 Agent 输出读取。

action card SHALL 支持以下展示状态：

- `pending`：流式未完成，确认不可用。
- `invalid`：协议、type、JSON 或 schema 失败，确认不可用。
- `ready`：可以等待用户确认或取消。
- `running`：确认后的 handler 执行中，防止重复点击。
- `succeeded`：handler 成功完成。
- `failed`：handler 执行失败，可重试或取消。
- `cancelled`：用户取消。

系统 SHALL NOT 在仅渲染 `<fyllo-action>` 时自动执行 action。action 只有在用户点击确认动作后才 MAY 执行对应 handler。取消 SHALL NOT 执行业务 handler；Chat 主会话中已经解析为 ready 且具备 action id 的 action SHALL 写入 cancelled 状态，pending、invalid 或非 Chat 渲染入口只更新当前渲染实例状态。

type-specific dispatcher SHALL 返回通用 outcome：

- `succeeded`：`FylloActionShell` SHALL 进入 succeeded，并在 Chat 主会话中写入 `actionStates[actionId].status = "succeeded"`。
- `failed`：`FylloActionShell` SHALL 进入 failed，并在 Chat 主会话中写入 `actionStates[actionId].status = "failed"`。
- `cancelled`：`FylloActionShell` SHALL 进入 cancelled，并在 Chat 主会话中写入 `actionStates[actionId].status = "cancelled"`。
- `dismissed`：`FylloActionShell` SHALL 回到 ready，不写入 session meta 的 `actionStates`。

Chat 主会话中的 action SHALL 支持从 session meta 的 `actionStates` 回显 `succeeded`、`failed` 或 `cancelled` 状态。`FylloActionShell` SHALL 统一负责在用户确认、取消或 handler 返回持久化 outcome 后写入 action state；type-specific 组件和 dispatcher SHALL NOT 重复实现 action state 持久化逻辑。

#### Scenario: 合法 action 等待用户确认

- **WHEN** renderer 完成解析并校验一个合法 `task.create` action
- **THEN** action card 显示由 FylloCode action definition 控制的确认和取消操作
- **AND** 不在渲染时创建任务

#### Scenario: 用户取消 action

- **WHEN** action card 处于 ready 状态
- **AND** 用户点击取消操作
- **THEN** action card 进入 cancelled 状态
- **AND** 系统不调用 action handler
- **AND** Chat session meta 中对应 `actionStates[actionId].status` 被写入为 `"cancelled"`

#### Scenario: 用户确认 action

- **WHEN** action card 处于 ready 状态
- **AND** 用户点击确认操作
- **THEN** action card 进入 running 状态
- **AND** 系统调用该 type 对应的 FylloCode handler
- **AND** running 期间重复点击确认不会重复执行 handler
- **AND** handler 返回 `succeeded` 后 Chat session meta 中对应 `actionStates[actionId].status` 被写入为 `"succeeded"`

#### Scenario: handler dismissed 不写入 action state

- **WHEN** 用户确认一个合法 Fyllo action
- **AND** handler 返回 `{ outcome: "dismissed" }`
- **THEN** action card 回到 ready 状态
- **AND** Chat session meta 中不新增该 `actionId` 对应的 `actionStates` 条目

#### Scenario: 已完成 action 回显为 succeeded

- **WHEN** Chat session meta 中存在 `actionStates[actionId] = { "type": "task.create", "status": "succeeded", "updatedAt": "..." }`
- **AND** renderer 再次渲染同一 action
- **THEN** action card 初始显示已完成状态
- **AND** 确认按钮不可用

#### Scenario: 失败 action 回显后可重试

- **WHEN** Chat session meta 中存在 `actionStates[actionId] = { "type": "task.create", "status": "failed", "updatedAt": "..." }`
- **AND** renderer 再次渲染同一 action
- **THEN** action card 初始显示失败状态
- **AND** 用户仍可点击确认操作重试

## ADDED Requirements

### Requirement: `plan.create` action 审阅 session plan

系统 SHALL 支持 `plan.create` action type，用于从 Chat 主会话打开当前 session 的 Plan Slideover。

`plan.create` payload SHALL 为严格 JSON object：

```json
{
  "slug": "string, non-empty full plan slug",
  "goal": "string, non-empty"
}
```

用户确认 `plan.create` 后，renderer 的 Fyllo action dispatcher SHALL 从 action host context 读取当前 chat `sessionId`，并打开 Plan Slideover。dispatcher SHALL NOT 从 payload 读取 `planPath`，也 SHALL NOT 允许 payload 指定按钮、handler、IPC channel 或组件。

当用户在 Plan Slideover 中批准 plan 且 `lineage:approvePlan` 成功时，dispatcher SHALL 返回 `succeeded`。当用户关闭 Slideover 但未批准时，dispatcher SHALL 返回 `dismissed`。当读取、保存或批准失败时，dispatcher SHALL 返回 `failed`。

#### Scenario: 用户批准 plan 后 action succeeded

- **WHEN** 当前项目已选中且存在当前 chat `sessionId`
- **AND** assistant text part 渲染出 payload 为 `{ "slug": "2026-06-29-refactor-chat-store", "goal": "需要先审阅方案" }` 的 `plan.create` action card
- **AND** 用户点击确认操作并在 Slideover 中批准 plan
- **THEN** dispatcher 调用 plan Slideover 审阅流程
- **AND** `lineage:approvePlan` 成功后 handler 返回 `succeeded`
- **AND** action card 进入 succeeded 状态

#### Scenario: 用户关闭 Slideover 后 action 保持待确认

- **WHEN** 用户点击 `plan.create` action 的确认操作
- **AND** Plan Slideover 打开后用户关闭但未批准
- **THEN** dispatcher 返回 `dismissed`
- **AND** action card 回到 ready 状态
- **AND** session meta 不写入该 action 的 `actionStates`

#### Scenario: plan.create payload 含 planPath 被拒绝

- **WHEN** assistant 输出 `<fyllo-action type="plan.create">` 且 JSON payload 含 `planPath`
- **THEN** renderer 使用 strict payload schema 校验失败
- **AND** 该 action 进入 invalid 状态
