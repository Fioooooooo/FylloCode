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
- 任务创建与会话绑定的成败由 `lineage:createSessionTask` 的失败语义决定（建任务硬要求、回绑并更新 `originTaskRef` 硬要求）；dispatcher SHALL 依据该调用是否成功驱动 action card 的 succeeded/failed 状态。

`lineage:createSessionTask` 成功后，主进程 SHALL 把新创建任务的 `LineageTaskRef` 写回当前会话 meta 的 `originTaskRef` 字段（通过 `session-store.ts` 的 `updateSessionOriginTaskRef`），使该会话绑定到新创建的任务。Renderer 在 action card 进入 succeeded 状态后，SHALL 确保 `OriginTaskBanner` 能回显该新绑定任务（通过刷新 session meta 或使 `taskInfoBySessionId` 缓存失效）。

当当前渲染上下文缺少 chat `sessionId`（例如非 Chat 主会话入口）时，dispatcher SHALL NOT 调用 `lineage:createSessionTask`，并 SHALL 使该 action 进入 failed 状态。

系统 SHALL NOT 从 action card 或 dispatcher 直接调用 `window.api.task`。

#### Scenario: 用户确认后创建并绑定本地任务

- **WHEN** 当前项目已选中且存在当前 chat `sessionId`
- **AND** assistant text part 渲染出 payload 为 `{ "title": "补齐错误处理", "description": "整理异常分支" }` 的 `task.create` action card
- **AND** 用户点击 `确认`
- **THEN** dispatcher 调用 `lineageApi.createSessionTask(projectId, { sessionId, title: "补齐错误处理", description: "整理异常分支" })`
- **AND** 主进程在任务创建成功后把对应 session meta 的 `originTaskRef` 更新为新任务的 `LineageTaskRef`
- **AND** action card 在调用成功后进入 succeeded 状态
- **AND** `OriginTaskBanner` 回显新创建的任务

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
- **AND** session meta 的 `originTaskRef` 不被更新
- **AND** 用户可以再次点击 `确认` 重试

#### Scenario: 更新 originTaskRef 失败时 action card 进入失败

- **WHEN** `lineage:createSessionTask` 创建任务成功
- **AND** 但主进程更新 session meta `originTaskRef` 失败
- **THEN** action card 进入 failed 状态并展示错误信息
- **AND** 用户可以再次点击 `确认` 重试（重试将尝试再次创建任务并更新 `originTaskRef`）
