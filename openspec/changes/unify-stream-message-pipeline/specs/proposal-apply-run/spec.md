## ADDED Requirements

### Requirement: Stage user message 由主进程落盘并通过 user_message chunk 实时推送

系统 SHALL 在 `proposal:stageStream` handler 的 `onReady` 阶段，在调用 `session.start(prompt)` 之前：

1. 构造 `UIMessage<MessageMeta>`，`role` 为 `"user"`，`parts` 为单个 `{ type: "text", text: prompt }`，`metadata.sessionId` 为 `stageFylloSessionId`，`metadata.createdAt` 为当前时间
2. 通过 `appendApplyRunMessage(projectPath, changeId, stageIndex, userMessage)` 将该消息作为 `stage-{stageIndex}.messages.jsonl` 的首行写入
3. 通过 sink 发送 `{ type: "chunk", data: { kind: "user_message", message: userMessage } }` 给渲染进程

`MessageAssembler` 随后只处理 assistant 相关事件；`done` 时 `flush()` 的 assistant `UIMessage` 通过 `appendApplyRunMessage` 追加到同一 jsonl 文件（磁盘顺序：user 首行，assistant 后续）。

#### Scenario: Stage stream 启动时落盘 user 消息

- **WHEN** `proposal:stageStream` 的 handler 完成 runMeta 校验、prompt 构造
- **THEN** 主进程构造 role 为 `"user"` 的 `UIMessage<MessageMeta>`
- **AND** 通过 `appendApplyRunMessage` 将该消息写入 `apply-runs/<changeId>/stage-{stageIndex}.messages.jsonl`
- **AND** 通过 sink 发送 `{ type: "chunk", data: { kind: "user_message", message } }`
- **AND** 之后才调用 `session.start(prompt)`

#### Scenario: user 落盘失败

- **WHEN** 首次 `appendApplyRunMessage` 写入 user 消息时抛出异常
- **THEN** 主进程通过 sink 发送 `{ type: "error", data: { code: "APPLY_RUN_PERSIST_FAILED", message } }`
- **AND** 不启动 `AcpSession`
- **AND** 从 `sessionRegistry` 注销（或不注册）对应的 `apply` session

### Requirement: Archive 流独立落盘与状态持久化

系统 SHALL 在 `proposal:archive` handler 的 `onReady` 阶段：

1. 构造 `ArchiveRunMeta`，结构为 `{ runId: "archive-<timestamp>", changeId, status: "running", startedAt, updatedAt }`，通过 `saveArchiveRunMeta` 写入 `apply-runs/<changeId>/archive.json`
2. 构造 archive 的 user message（`role: "user"`，`parts: [{ type: "text", text: prompt }]`），通过 `appendArchiveMessage` 写入 `apply-runs/<changeId>/archive.messages.jsonl`，并通过 sink 发送 `{ kind: "user_message", message }` chunk
3. 使用 `MessageAssembler` 收集 assistant 事件；`done` 时 `flush()` → `appendArchiveMessage` → 更新 `archive.json` 的 `status` 为 `"done"` 与 `updatedAt`
4. 若 `AcpSession` emit `error`，更新 `archive.json` 的 `status` 为 `"error"` 后再通过 sink 发送错误 chunk

archive 的持久化路径 SHALL 与 stage 完全解耦：不写入 `stage-*.messages.jsonl`，不修改 `run.json` 的 `stages` 数组。

#### Scenario: Archive 流启动时初始化 meta 与 user 消息

- **WHEN** `proposal:archive` handler 的 `onReady` 执行
- **THEN** 主进程写入 `archive.json`（status: "running"）
- **AND** 落盘 archive user message 到 `archive.messages.jsonl`
- **AND** 通过 sink 发送 `user_message` chunk
- **AND** 启动 `AcpSession`

#### Scenario: Archive 正常完成

- **WHEN** archive 的 `AcpSession` emit `done`
- **THEN** 主进程 `flush()` 得到 assistant `UIMessage`
- **AND** 通过 `appendArchiveMessage` 追加到 `archive.messages.jsonl`
- **AND** 更新 `archive.json` 的 `status` 为 `"done"` 与 `updatedAt`
- **AND** 通过 sink 发送 `done` chunk

#### Scenario: Archive 出错

- **WHEN** archive 的 `AcpSession` emit `error`
- **THEN** 主进程更新 `archive.json` 的 `status` 为 `"error"` 与 `updatedAt`
- **AND** 通过 sink 发送 `error` chunk

### Requirement: proposal:loadArchive / proposal:loadArchiveMessages IPC 用于恢复 archive 历史

系统 SHALL 提供 `proposal:loadArchive` IPC handler，从磁盘读取 `apply-runs/<changeId>/archive.json`，返回 `ArchiveRunMeta | null`；文件不存在时返回 `null`。

系统 SHALL 提供 `proposal:loadArchiveMessages` IPC handler，从磁盘读取 `apply-runs/<changeId>/archive.messages.jsonl`，返回 `UIMessage<MessageMeta>[]`；文件不存在时返回空数组。

#### Scenario: 加载 archive 元数据

- **WHEN** 渲染进程调用 `proposal:loadArchive` 并传入 `{ projectId, changeId }`
- **THEN** 主进程读取 `archive.json`，返回 `ArchiveRunMeta`
- **AND** 文件不存在时返回 `null`

#### Scenario: 加载 archive 消息列表

- **WHEN** 渲染进程调用 `proposal:loadArchiveMessages` 并传入 `{ projectId, changeId }`
- **THEN** 主进程读取 `archive.messages.jsonl` 并返回 `UIMessage<MessageMeta>[]`
- **AND** 文件不存在时返回空数组

## MODIFIED Requirements

### Requirement: Main 进程在 stage 完成时持久化 UIMessage

系统 SHALL 在 main 进程维护 `MessageAssembler`，将 `SessionEvent` 流组装为 `UIMessage<MessageMeta>`，在收到 `done` 事件时将完整 assistant 消息通过 `appendApplyRunMessage` 追加到 `apply-runs/<changeId>/stage-{N}.messages.jsonl`。

Stage 的 user message（stage prompt）SHALL 在 stream 启动时由主进程作为首条消息写入同一 jsonl 文件（见 `Stage user message 由主进程落盘并通过 user_message chunk 实时推送` requirement），assistant 消息在其后追加。

持久化不依赖 renderer 存活：即使 renderer 在 stage 执行过程中关闭，main 进程仍会在 stage 完成时写入 assistant 消息到磁盘。

`MessageAssembler` 组装规则（与 `acp-chat-backend` spec 中描述的共享 composable 逻辑语义一致）：

- `text_delta`：追加到当前 assistant message 的最后一个 text part；若无则新建 text part
- `tool_call_start`：在当前 assistant message 追加 `DynamicToolUIPart`，state 为 `"input-available"`
- `tool_call_update`（`in_progress`）：更新对应 `DynamicToolUIPart` 的 input/title
- `tool_call_update`（`completed` / `failed`）：将对应 part 的 state 改为 `"output-available"`，填入 output
- `done`：将当前 assistant message 写入磁盘，更新 `run.json` 的 `currentStageIndex` 和 `updatedAt`

#### Scenario: Stage 正常完成

- **WHEN** `AcpSession` emit `done` 事件
- **THEN** main 进程 `flush()` `MessageAssembler` 得到 assistant `UIMessage`
- **AND** 通过 `appendApplyRunMessage` 追加到 `stage-{N}.messages.jsonl`
- **AND** 更新 `run.json` 的 `currentStageIndex`（+1）和 `updatedAt`
- **AND** 通过 port 发送 `{ type: "done", data: { totalTokens } }`

#### Scenario: Renderer 在 stage 执行中途关闭

- **WHEN** renderer 关闭，MessagePort 断开
- **THEN** main 进程的 `AcpSession` 继续运行
- **AND** `MessageAssembler` 继续组装消息
- **AND** stage 完成时 assistant 消息正常追加到磁盘（user 首行已在 stream 启动时写入）

#### Scenario: Stage 执行出错

- **WHEN** `AcpSession` emit `error` 事件
- **THEN** main 进程更新 `run.json` 的 `status` 为 `"error"`
- **AND** 通过 port 发送 `{ type: "error", data: { code, message } }`（如果 port 仍活着）

### Requirement: 页面重新打开时自动恢复历史日志展示

系统 SHALL 在 `[id].vue` 的 `onMounted` 中：

- 检测 `proposal.status === "applying"` 时，自动调用 `resumeRun(projectId, changeId)`，从磁盘读取 `run.json` 和 `stage-{currentStageIndex}.messages.jsonl`，在 SidePanel 按磁盘顺序展示 user + assistant 混合消息列表；
- 检测 `proposal.status === "archiving"`（若适用）或用户再次进入已归档过程时，调用 `resumeArchive(projectId, changeId)`，通过 `proposal:loadArchive` 与 `proposal:loadArchiveMessages` 读取 archive 状态与消息列表。

恢复后不自动续跑；渲染层以磁盘返回的 `UIMessage.id` 为准，不与活跃期的临时 id 做匹配。

#### Scenario: 页面重新打开，proposal 处于 applying 状态

- **WHEN** 用户打开 proposal 详情页，`proposal.status === "applying"`
- **THEN** 自动调用 `resumeRun(projectId, changeId)`
- **AND** 读取 `run.json` 恢复 `runMeta`
- **AND** 读取 `stage-{currentStageIndex}.messages.jsonl` 恢复消息列表（user 首行在前，assistant 在后）
- **AND** SidePanel 自动打开，按磁盘顺序展示消息
- **AND** 不自动触发新的 stream

#### Scenario: run.json 不存在（异常情况）

- **WHEN** `proposal.status === "applying"` 但 `run.json` 不存在
- **THEN** `resumeRun` 静默失败，不展示历史日志
- **AND** SidePanel 不自动打开

#### Scenario: 恢复 archive 历史

- **WHEN** 用户重新打开 proposal 详情页，存在 `archive.json`
- **THEN** 调用 `resumeArchive(projectId, changeId)`
- **AND** 通过 `proposal:loadArchive` 读取 `ArchiveRunMeta`
- **AND** 通过 `proposal:loadArchiveMessages` 读取 `UIMessage<MessageMeta>[]`
- **AND** SidePanel 按磁盘顺序展示 archive user + assistant 消息
- **AND** 不自动触发新的 archive stream

#### Scenario: 存量 stage jsonl 缺少 user 首行

- **WHEN** `stage-{N}.messages.jsonl` 由旧版写入（无 user 首行）
- **THEN** `resumeRun` 按文件实际内容返回消息列表
- **AND** SidePanel 仅展示 assistant 消息，不合成 user
