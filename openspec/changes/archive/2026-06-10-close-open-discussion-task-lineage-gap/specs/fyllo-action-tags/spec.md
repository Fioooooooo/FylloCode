## MODIFIED Requirements

### Requirement: `task.create` action 创建本地任务

系统 SHALL 初始支持 `task.create` action type，用于从 Agent 与用户讨论出的结果创建本地任务。

`task.create` payload SHALL 为严格 JSON object：

```json
{
  "title": "string, non-empty",
  "description": "string, optional"
}
```

用户确认 `task.create` 后，renderer 的 Fyllo action dispatcher SHALL 在 chat 上下文中通过 `lineage:createSessionTask` 创建本地任务并把任务绑定到当前会话，而不是直接调用 `useTaskStore().createTask()` 或 `window.api.task`。dispatcher SHALL 从 Fyllo action host context 读取当前 chat `sessionId` 并随调用透传：

- 调用形如 `lineageApi.createSessionTask(projectId, { sessionId, title, description })`。
- 传入的 `description` SHALL 为 payload 的原始字符串（可缺省）；其向结构化 `{ format: "plain_text", content }` 的包装由主进程协调函数负责（见 lineage-ipc delta），renderer SHALL NOT 在此重复包装。
- 任务创建与会话绑定的成败由 `lineage:createSessionTask` 的失败语义决定（建任务硬要求、回绑 best-effort）；dispatcher SHALL 依据该调用是否成功驱动 action card 的 succeeded/failed 状态。

当当前渲染上下文缺少 chat `sessionId`（例如非 Chat 主会话入口）时，dispatcher SHALL NOT 调用 `lineage:createSessionTask`，并 SHALL 使该 action 进入 failed 状态。

系统 SHALL NOT 从 action card 或 dispatcher 直接调用 `window.api.task`。

#### Scenario: 用户确认后创建并绑定本地任务

- **WHEN** 当前项目已选中且存在当前 chat `sessionId`
- **AND** assistant text part 渲染出 payload 为 `{ "title": "补齐错误处理", "description": "整理异常分支" }` 的 `task.create` action card
- **AND** 用户点击 `确认`
- **THEN** dispatcher 调用 `lineageApi.createSessionTask(projectId, { sessionId, title: "补齐错误处理", description: "整理异常分支" })`
- **AND** action card 在调用成功后进入 succeeded 状态

#### Scenario: description 缺失时透传 undefined

- **WHEN** 用户确认 payload 为 `{ "title": "补齐错误处理" }` 的 `task.create` action
- **THEN** dispatcher 调用 `createSessionTask` 时 `description` 为 `undefined`
- **AND** 由主进程协调函数将其规范化为 `{ format: "plain_text", content: "" }`

#### Scenario: 缺少当前会话 id 时进入失败

- **WHEN** 用户确认 `task.create` action
- **AND** 当前渲染上下文无法提供 chat `sessionId`
- **THEN** dispatcher 不调用 `lineage:createSessionTask`
- **AND** action card 进入 failed 状态并展示错误信息

#### Scenario: 创建任务失败时可重试

- **WHEN** 用户确认 `task.create` action
- **AND** `lineage:createSessionTask` 返回错误（任务创建失败）
- **THEN** action card 进入 failed 状态并展示错误信息
- **AND** 用户可以再次点击 `确认` 重试
- **AND** 用户可以点击 `取消` 结束该 action
