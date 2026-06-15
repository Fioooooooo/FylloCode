# task-chat-bridge 规范

## Purpose

定义任务面板与聊天系统之间的衔接契约——点击任务后如何自动生成 prompt、创建会话、路由跳转，以及 prompt 的生成策略。

## Requirements

### Requirement: 任务 prompt 生成包含任务元数据

系统 SHALL 从 `TaskItem` 生成聊天 prompt，包含任务标题、描述和来源信息。prompt SHALL 指示 AI 分析任务，并在适当时通过 OpenSpec proposal 提出实现步骤。

#### Scenario: 从本地任务生成 prompt

- **WHEN** 用户点击标题为"Fix memory leak"、描述为"The parser fails..."的本地任务上的"发起讨论"
- **THEN** 生成的 prompt 包含任务标题、描述，以及分析和创建 proposal 的请求

#### Scenario: 从外部任务生成 prompt

- **WHEN** 用户点击外部任务上的"发起讨论"（未来阶段）
- **THEN** 生成的 prompt 包含外部任务的标题、描述和来源引用

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

### Requirement: 任务 prompt 格式在不同来源间保持一致

系统 SHALL 使用一致的 prompt 模板，无论任务来源（local、yunxiao、github）。来源特定信息 SHALL 作为上下文包含在同一模板结构中。对于外部任务，当存在 `sourceMeta.url` 时，prompt SHALL 包含来源显示标签与 URL；当 `sourceMeta.url` 为空时，prompt SHALL 仅包含来源显示标签，SHALL NOT 输出空括号或空 URL 占位。对于真实云效任务，只要任务来自 `yunxiao-task-adapter` 的 workitem 映射结果，系统 SHALL 视其为“带 URL 的外部任务”，并在 prompt 来源行中包含构造出的云效详情 URL。

#### Scenario: 外部任务 prompt 带 URL

- **WHEN** 生成一条带有 `sourceMeta.url` 的外部任务 prompt
- **THEN** prompt 的来源行格式为 `**来源**: <sourceDisplay> (<sourceUrl>)`

#### Scenario: 真实云效任务 prompt 包含构造后的来源 URL

- **WHEN** 生成一条真实云效任务 prompt，且该任务的 `sourceMeta` 来自 `yunxiao-task-adapter` 映射结果
- **THEN** prompt 的来源行格式为 `**来源**: 云效 <key> (<sourceUrl>)`
- **AND** `<sourceUrl>` 使用云效任务类型规则构造得到的 `req` / `task` / `bug` URL
- **AND** prompt 中不出现空括号

### Requirement: 缺失描述不破坏 prompt 生成

系统 SHALL 优雅地处理空或缺失描述的任务，从 prompt 中省略描述部分，而不是包含空内容。

#### Scenario: 无描述的任务

- **WHEN** 用户点击一条无描述的任务上的"发起讨论"
- **THEN** prompt 完全省略"**描述**:"部分
- **AND** prompt 保持连贯且可操作

### Requirement: 聊天会话标题从任务标题派生

系统 SHALL 使用任务标题（截断至合理长度）作为新创建聊天会话的 fallback 标题。

#### Scenario: 从任务获取会话标题

- **WHEN** 从标题为"Fix memory leak in parser"的任务创建聊天会话
- **THEN** 会话标题以"Fix memory leak in parser"开头（如需则截断）

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
