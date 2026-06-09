## MODIFIED Requirements

### Requirement: 任务到聊天的流程自动创建新会话

系统 SHALL 使用现有的 `ChatStore.sendMessage()` 机制创建新聊天会话并发送任务 prompt。会话 SHALL 使用当前项目的 draft agent 创建。

在发起讨论流程中，系统 SHALL 在调用 `sendMessage()` 之前先调用 `lineage:ensureTaskSubject`（携带从 `TaskItem` 构造的全量 `LineageTaskSnapshot`）创建或复用该任务的 lineage subject。该 subject 创建 SHALL 为发起讨论的硬门槛：当 `ensureTaskSubject` 失败时，系统 SHALL 中断流程、SHALL NOT 调用 `sendMessage()`、SHALL NOT 创建会话，并向用户提示失败。

`startChatFromTask`（`src/renderer/src/pages/task.vue`）SHALL 把任务引用 `taskRef`（形如 `<source>:<id>`，由 `task.source` 与 `task.id` 构造）透传至 `chatStore.sendMessage`，再经 `sessionStore.createSession` 传入 `chat:createSession` 的可选入参 `taskRef`。`createSessionInputSchema`（`src/shared/schemas/ipc/chat.ts`）SHALL 新增可选 `taskRef` 字段。`chatStore.sendMessage` 的 draft 分支 SHALL 在创建会话时携带该 `taskRef`，且 SHALL NOT 破坏既有的 probe 预热复用（`carryProbe`）逻辑。

#### Scenario: 无活跃会话

- **WHEN** 用户点击"发起讨论"且没有活跃的聊天会话
- **THEN** 先调用 `lineage:ensureTaskSubject` 创建/复用该任务 subject
- **AND** subject 成功后调用 `sessionStore.beginDraftSession()` 准备 draft agent
- **AND** `chatStore.sendMessage(prompt)` 携带 `taskRef` 使用 draft agent 创建新会话
- **AND** 任务 prompt 作为第一条用户消息发送
- **AND** 用户被导航至 `/chat`

#### Scenario: 存在活跃会话

- **WHEN** 用户点击"发起讨论"且已有活跃的聊天会话
- **THEN** 先调用 `lineage:ensureTaskSubject` 创建/复用该任务 subject
- **AND** subject 成功后调用 `sessionStore.beginDraftSession()` 启动一个新的草稿会话
- **AND** `chatStore.sendMessage(prompt)` 携带 `taskRef` 在新会话中发送任务 prompt

#### Scenario: ensureTaskSubject 失败时中断发起

- **WHEN** 用户点击"发起讨论"
- **AND** `lineage:ensureTaskSubject` 调用失败
- **THEN** 系统 SHALL NOT 调用 `sendMessage()`
- **AND** SHALL NOT 创建会话或导航至 `/chat`
- **AND** 向用户提示发起讨论失败

#### Scenario: 二次发起命中既有 subject

- **WHEN** 用户对一个已发起过讨论的任务再次点击"发起讨论"
- **THEN** `ensureTaskSubject` 经 ref 命中既有 subject 并复用（幂等）
- **AND** 新会话照常创建并携带同一 `taskRef`

### Requirement: 任务到聊天的导航发生在消息提交之后

系统 SHALL 在导航至 `/chat` 之前先完成 `lineage:ensureTaskSubject` 与 `sendMessage()`，以便流式响应立即开始，聊天页面显示进行中的对话，且新会话已携带 `originTaskRef`。

#### Scenario: 导航至带流式消息的聊天

- **WHEN** 用户点击"发起讨论"
- **THEN** 先成功调用 `lineage:ensureTaskSubject`
- **AND** 调用 `sessionStore.beginDraftSession()`
- **AND** 使用任务 prompt 调用携带 `taskRef` 的 `sendMessage()`
- **AND** 调用 `router.push('/chat')`
- **AND** 聊天页面将任务 prompt 显示为用户消息，流式响应正在进行中

## ADDED Requirements

### Requirement: createSession handler 编排 task→session 关联边

系统 SHALL 在 `src/main/ipc/chat.ts` 的 `chat:createSession` handler 中，于 `chat-service.createSession` 返回 session 之后，调用 `lineage-service.linkTaskSession(projectPath, taskRef, sessionId)` 建立 task→session 关联边。该编排 SHALL 仅在入参 `taskRef` 非空时执行。关联边写入 SHALL 为尽力而为：失败时 SHALL 仅 `logger` 记录、SHALL NOT 阻断 handler、SHALL 仍返回已创建的 session。

编排 SHALL 落在 IPC handler 层：`chat-service.createSession` SHALL NOT import lineage 模块，仅负责 write-once 写入 `meta.originTaskRef`；lineage 边的建立由 handler 编排 `lineage-service`。

#### Scenario: 携带 taskRef 时建立关联边

- **WHEN** `chat:createSession` 入参含非空 `taskRef`
- **AND** `chat-service.createSession` 成功返回 session
- **THEN** handler 调用 `lineage-service.linkTaskSession(projectPath, taskRef, session.id)`
- **AND** 返回该 session

#### Scenario: linkTaskSession 失败不阻断会话创建

- **WHEN** `linkTaskSession` 抛出异常或返回 `null`
- **THEN** handler 通过 `logger` 记录失败
- **AND** 仍返回已创建的 session（含 `originTaskRef`）
- **AND** 不向 renderer 上抛错误

#### Scenario: 无 taskRef 时不编排 lineage

- **WHEN** `chat:createSession` 入参无 `taskRef`
- **THEN** handler 不调用 `linkTaskSession`
- **AND** 正常返回 session
