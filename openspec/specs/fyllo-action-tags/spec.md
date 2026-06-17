# fyllo-action-tags 规范

## Purpose

定义 assistant 输出 `<fyllo-action>` 标签的解析、契约注册、流式 pending 状态、确认/取消控制、确定性 action id 以及 `task.create` dispatcher 行为。

## Requirements

### Requirement: `<fyllo-action>` 标签协议

系统 SHALL 在 assistant 可见 text part 的 Markdown 渲染中识别 `<fyllo-action>` 标签，并把它作为 FylloCode 受控 action 节点处理。

`<fyllo-action>` 标签 SHALL 满足：

- 标签名固定为 `fyllo-action`。
- 唯一 attribute 为 `type`。
- `type` SHALL 为本地 action contract 注册表中的已启用 action type。
- 除 `type` 外的任何 attribute SHALL 使该节点进入 invalid 状态。
- 标签正文 SHALL 为严格 JSON object，且 SHALL 通过对应 type 的 payload schema 校验。
- JSON object 中的未知字段 SHALL 被拒绝，除非对应 type 的 schema 明确允许。

系统 SHALL NOT 接受 Agent 在 attribute 或 payload 中定义按钮文案、版本号、节点 id、IPC channel、handler 名称或任意 UI 组件。

#### Scenario: 合法 action 标签被识别

- **WHEN** assistant text part 包含 `<fyllo-action type="task.create">{"title":"补齐错误处理"}</fyllo-action>`
- **THEN** renderer 将该片段识别为 `type === "task.create"` 的 Fyllo action
- **AND** 使用 `task.create` 的 payload schema 校验正文 JSON
- **AND** 渲染 FylloCode 控制的 action card

#### Scenario: 缺失 type attribute

- **WHEN** assistant text part 包含 `<fyllo-action>{"title":"补齐错误处理"}</fyllo-action>`
- **THEN** renderer 将该节点标记为 invalid
- **AND** 不渲染可用的确认按钮

#### Scenario: 存在额外 attribute

- **WHEN** assistant text part 包含 `<fyllo-action type="task.create" title="创建任务">{"title":"补齐错误处理"}</fyllo-action>`
- **THEN** renderer 将该节点标记为 invalid
- **AND** 不使用 `title` attribute 作为 UI 标题

#### Scenario: 未注册 type

- **WHEN** assistant text part 包含 `<fyllo-action type="task.delete">{"id":"task-1"}</fyllo-action>`
- **THEN** renderer 将该节点标记为 invalid
- **AND** 不执行任何 action handler

### Requirement: Action contract 作为 type 与 payload 的来源

系统 SHALL 维护 Fyllo action contract 注册表，作为 action type、payload schema 和 Agent 注入说明的唯一协议来源。renderer 的 action definition SHALL 基于该 contract 补充 UI 展示和 handler 绑定。

action contract SHALL 至少包含：

- `type`：精确 action type 字符串。
- payload zod schema：用于 renderer 校验。
- Agent-facing JSON schema/说明：用于 chat system-reminder 注入。
- 示例 JSON object：用于稳定 Agent 输出。

action type SHALL 使用 `domain.action` 形式，例如 `task.create`。系统 SHALL NOT 接受自然语言、空白、下划线或未注册字符串作为 action type。

#### Scenario: renderer 与 system-reminder 使用同一 contract

- **WHEN** `task.create` payload schema 增加或删除字段
- **THEN** renderer 校验使用更新后的 schema
- **AND** chat system-reminder 注入给 Agent 的 `task.create` JSON 说明也来自同一份 contract

#### Scenario: action type 只能来自注册表

- **WHEN** Agent 输出 `type="创建任务"` 或 `type="task_create"`
- **THEN** renderer 将该节点标记为 invalid
- **AND** system-reminder 不把这些字符串列为可用 type

### Requirement: 流式未完成标签保持 pending 状态

系统 SHALL 在 `<fyllo-action>` 节点处于流式未完成状态时渲染 pending action card，并 SHALL NOT 对标签正文执行 `JSON.parse` 或 schema 校验。

当流结束并且 markstream-vue 不再把该节点标记为 loading 后，系统 SHALL 收集节点正文、解析 JSON 并执行 type-specific schema 校验。流式过程中的半截 JSON、未闭合标签或未完整 attribute SHALL NOT 产生 transient invalid 错误。

#### Scenario: 未闭合标签流式输出中不报 JSON 错误

- **WHEN** assistant 正在流式输出 `<fyllo-action type="task.create">{"title":"补`
- **AND** markstream-vue 节点处于 loading 状态
- **THEN** renderer 展示 pending action card
- **AND** 不调用 `JSON.parse`
- **AND** 不展示 JSON parse error

#### Scenario: 流结束后解析完整 JSON

- **WHEN** assistant 最终输出 `<fyllo-action type="task.create">{"title":"补齐错误处理"}</fyllo-action>`
- **AND** 消息流已结束
- **THEN** renderer 解析正文 JSON
- **AND** payload 通过 `task.create` schema 校验
- **AND** action card 进入 ready 状态

#### Scenario: 流结束后 JSON 仍不合法

- **WHEN** assistant 最终输出 `<fyllo-action type="task.create">{"title":</fyllo-action>`
- **AND** 消息流已结束
- **THEN** renderer 将该节点标记为 invalid
- **AND** 不执行任何 action handler

### Requirement: Action card 由 FylloCode 控制确认与取消

系统 SHALL 为合法且完成解析的 Fyllo action 渲染 FylloCode 控制的 action card。action card SHALL 使用固定的 `确认` 和 `取消` 操作，不从 Agent 输出读取按钮文案。

action card SHALL 支持以下状态：

- `pending`：流式未完成，确认不可用。
- `invalid`：协议、type、JSON 或 schema 失败，确认不可用。
- `ready`：可以等待用户确认或取消。
- `running`：确认后的 handler 执行中，防止重复点击。
- `succeeded`：handler 成功完成。
- `failed`：handler 执行失败，可重试或取消。
- `cancelled`：用户取消。

系统 SHALL NOT 在仅渲染 `<fyllo-action>` 时自动执行 action。action 只有在用户点击 `确认` 后才 MAY 执行对应 handler。取消 SHALL NOT 执行业务 handler；Chat 主会话中已经解析为 ready 且具备 action id 的 action SHALL 写入 cancelled 状态，pending、invalid 或非 Chat 渲染入口只更新当前渲染实例状态。

Chat 主会话中的 action SHALL 支持从 session meta 的 `actionStates` 回显 `succeeded`、`failed` 或 `cancelled` 状态。`FylloActionShell` SHALL 统一负责在用户确认或取消后写入 action state；type-specific 组件和 dispatcher SHALL NOT 重复实现 action state 持久化逻辑。

#### Scenario: 合法 action 等待用户确认

- **WHEN** renderer 完成解析并校验一个合法 `task.create` action
- **THEN** action card 显示固定 `确认` 和 `取消` 操作
- **AND** 不在渲染时创建任务

#### Scenario: 用户取消 action

- **WHEN** action card 处于 ready 状态
- **AND** 用户点击 `取消`
- **THEN** action card 进入 cancelled 状态
- **AND** 系统不调用 action handler
- **AND** Chat session meta 中对应 `actionStates[actionId].status` 被写入为 `"cancelled"`

#### Scenario: 用户确认 action

- **WHEN** action card 处于 ready 状态
- **AND** 用户点击 `确认`
- **THEN** action card 进入 running 状态
- **AND** 系统调用该 type 对应的 FylloCode handler
- **AND** running 期间重复点击确认不会重复执行 handler
- **AND** handler 成功后 Chat session meta 中对应 `actionStates[actionId].status` 被写入为 `"succeeded"`

#### Scenario: 已完成 action 回显为 succeeded

- **WHEN** Chat session meta 中存在 `actionStates[actionId] = { "type": "task.create", "status": "succeeded", "updatedAt": "..." }`
- **AND** renderer 再次渲染同一 action
- **THEN** action card 初始显示已完成状态
- **AND** 确认按钮不可用

#### Scenario: 失败 action 回显后可重试

- **WHEN** Chat session meta 中存在 `actionStates[actionId] = { "type": "task.create", "status": "failed", "updatedAt": "..." }`
- **AND** renderer 再次渲染同一 action
- **THEN** action card 初始显示失败状态
- **AND** 用户仍可点击 `确认` 重试

### Requirement: Chat action id 由 transcript 位置确定

系统 SHALL 为 Chat 主会话中的每个 ready Fyllo action 生成稳定 action id。action id SHALL 由 Chat transcript 位置生成，不由 Agent 输出，也不得使用 markstream-vue 的 `indexKey`。

action id 格式 SHALL 为：

```text
chat:{sessionId}:{messageIndex}:{partIndex}:{actionOrdinalInPart}
```

其中：

- `sessionId` 为当前 Chat session id。
- `messageIndex` 为该 assistant message 在当前 session `messages` 中按持久化顺序的位置。
- `partIndex` 为该 assistant text part 在 message `parts` 中的位置。
- `actionOrdinalInPart` 为该 text part 中 `<fyllo-action>` 按源码出现顺序的 0-based 序号。

#### Scenario: 同一历史 action 重新渲染得到相同 action id

- **WHEN** Chat session 从磁盘恢复同一组 messages
- **AND** renderer 再次渲染同一 assistant text part 中的第一个 Fyllo action
- **THEN** 生成的 action id 与上次渲染相同
- **AND** renderer 可用该 action id 查找 session meta 中的 `actionStates`

#### Scenario: 同一 text part 中多个 action 生成不同 id

- **WHEN** 一个 assistant text part 中包含两个 `<fyllo-action>` 标签
- **THEN** 第一个 action 的 `actionOrdinalInPart` 为 `0`
- **AND** 第二个 action 的 `actionOrdinalInPart` 为 `1`
- **AND** 两个 action id 不相同

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
