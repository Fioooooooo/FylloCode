# acp-chat-backend Specification

## Purpose

ACP agent 进程池管理、session 生命周期、sessionUpdate 映射、session 持久化。

## Requirements

### Requirement: ACP agent 进程池管理（按 agentId 懒启动复用）

系统 SHALL 维护一个 `Map<agentId, AcpAgentProcess>` 进程池（`acp-process-pool.ts`），不在应用启动时预启动任何进程。首次使用某个 `agentId` 时，系统 SHALL 懒启动对应子进程并通过 `ClientSideConnection.initialize` 完成握手；后续同 `agentId` 的请求复用同一连接。进程退出时 SHALL 自动重启并重新握手。

#### Scenario: 首次使用某 agentId 时懒启动进程

- **WHEN** `getOrStartProcess(agentId)` 被调用，且该 `agentId` 尚无运行中的进程
- **THEN** 系统从 `AcpInstalledRecord` 读取 `installMethod`，按以下规则组装 spawn 命令：
  - `npx`：`spawn("npx", ["--no-install", distribution.npx.package, ...(distribution.npx.args ?? [])])`
  - `uvx`：`spawn("uvx", [distribution.uvx.package, ...(distribution.uvx.args ?? [])])`
  - `binary`：`spawn(installPath, [])` （`installPath` 来自 `installed.json` 中的记录，指向 `getDataSubPath('acp')/bin/<agent-id>/` 下的可执行文件）
- **AND** 所有方式均使用 `stdio: ["pipe", "pipe", "inherit"]`
- **AND** spawn 后通过 `ClientSideConnection.initialize` 完成握手
- **AND** 将连接实例存入进程池，供后续同 `agentId` 的请求复用

#### Scenario: 同 agentId 复用已有进程

- **WHEN** `getOrStartProcess(agentId)` 被调用，且该 `agentId` 已有运行中的进程
- **THEN** 直接返回已有的 `ClientSideConnection`，不重新 spawn

#### Scenario: ACP agent 进程意外退出后自动重启

- **WHEN** 某 `agentId` 对应的子进程意外退出
- **THEN** 系统重新 spawn 该子进程并完成 `initialize` 握手
- **AND** 重启期间收到的 `streamMessage` 请求 SHALL 返回 `{ type: "error", data: { code: "ACP_NOT_READY" } }`

### Requirement: 权限请求自动允许（allow_once）

系统 SHALL 在 ACP agent 发起 `requestPermission` 时，自动选择 `allow_once` 选项（若存在），无需用户交互。

#### Scenario: 工具调用权限请求

- **WHEN** ACP agent 通过 `requestPermission` 请求工具调用权限
- **AND** options 中存在 `kind === "allow_once"` 的选项
- **THEN** 系统自动返回 `{ outcome: { outcome: "selected", optionId: allowOption.optionId } }`

#### Scenario: 无 allow_once 选项时取消

- **WHEN** ACP agent 发起 `requestPermission`
- **AND** options 中不存在 `kind === "allow_once"` 的选项
- **THEN** 系统返回 `{ outcome: { outcome: "cancelled" } }`

### Requirement: ACP session 生命周期管理

系统 SHALL 在每次 `streamMessage` 时，根据是否存在持久化的 `acpSessionId` 决定调用 `newSession` 或 `resumeSession`。`acpSessionId` SHALL 在 `newSession`/`resumeSession` 返回后**立即**持久化，不等待 prompt 完成。

#### Scenario: 首次发送消息创建新 ACP session

- **WHEN** IPC handler 收到 `chat:stream:message`，且该 `sessionId` 无持久化的 `acpSessionId`
- **THEN** 调用 `connection.newSession({ cwd, mcpServers: [] })` 创建新 ACP session
- **AND** `newSession` 返回后立即将 `acpSessionId` 持久化到 session 元数据文件
- **AND** emit `{ type: "session_id_resolved", acpSessionId }` 事件，IPC 层监听后写入 session-store

#### Scenario: 续接已有 ACP session

- **WHEN** IPC handler 收到 `chat:stream:message`，且该 `sessionId` 存在持久化的 `acpSessionId`
- **THEN** 调用 `connection.resumeSession({ sessionId: acpSessionId, cwd })` 恢复上下文
- **AND** 若 `resumeSession` 返回错误，降级为 `newSession`，更新持久化记录，并 emit `session_id_resolved`

#### Scenario: 取消流式传输

- **WHEN** IPC handler 收到 `chat:stream:cancel`，包含 `{ sessionId }`
- **THEN** 调用 `connection.cancel({ sessionId: acpSessionId })` 取消当前 prompt
- **AND** 通过 MessagePort 发送 `{ type: "done" }` 并关闭 port1

### Requirement: ACP sessionUpdate 映射为 SessionEvent

系统 SHALL 将 ACP `session/update` notification 映射为 `SessionEvent` 联合类型，通过 MessagePort 推送给渲染进程。

ACP 的 tool call 是独立的一等公民事件（不依附于某条 assistant message），因此不使用旧的 `message_upsert`/`message_patch` 模式，改为直接映射 ACP tool call 语义的新事件类型。

**`SessionEvent` 联合类型定义（替换旧定义）：**

```typescript
type SessionEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; toolCallId: string; title: string; kind: string }
  | {
      type: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      content?: string;
    }
  | { type: "done"; totalTokens: number }
  | { type: "error"; code: string; message: string }
  | { type: "session_id_resolved"; acpSessionId: string };
```

#### Scenario: 文本流式输出

- **WHEN** ACP 推送 `sessionUpdate === "agent_message_chunk"` 且 `content.type === "text"`
- **THEN** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "text_delta", text } }`

#### Scenario: 工具调用开始

- **WHEN** ACP 推送 `sessionUpdate === "tool_call"` 且 `status === "pending"`
- **THEN** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "tool_call_start", toolCallId, title, kind } }`

#### Scenario: 工具调用进度或完成

- **WHEN** ACP 推送 `sessionUpdate === "tool_call_update"`，`status` 为 `"in_progress"`、`"completed"` 或 `"failed"`
- **THEN** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "tool_call_update", toolCallId, status, content } }`
- **AND** `content` 为 `tool_call_update.content` 中所有 text 类型 ContentBlock 的拼合文本（无 content 时为 `undefined`）

#### Scenario: prompt 完成

- **WHEN** `connection.prompt` 返回（`stopReason` 为 `"end_turn"` 或其他终止原因）
- **THEN** 通过 MessagePort 发送 `{ type: "done", data: { totalTokens } }`
- **AND** 关闭 port1

#### Scenario: ACP 通信异常

- **WHEN** `connection.prompt` 抛出异常或 ACP 进程不可用
- **THEN** 通过 MessagePort 发送 `{ type: "error", data: { code: "ACP_ERROR", message } }`
- **AND** 关闭 port1

### Requirement: 前端 chat store 从流式事件组装 assistant UIMessage

前端 chat store SHALL 在流式过程中实时组装 `role: "assistant"` 的 `UIMessage`，不等待 prompt 完成。ACP 没有"assistant message"的概念，text chunk 和 tool call 均为独立事件，store 负责将它们归并到同一条 assistant message 的 `parts` 数组中。

**组装规则：**

- 收到第一个 `text_delta` 时，若当前无活跃 assistant message，则创建一条新的 `UIMessage`（生成临时 id），追加到 `session.messages`，并记录为 `activeAssistantId`
- 后续 `text_delta` 追加到 `activeAssistantId` 对应消息的 text part
- 收到 `tool_call_start` 时，向 `activeAssistantId` 对应消息追加一个 `dynamic-tool` part（`state: "input-available"`，携带 `toolCallId`、`toolName: title`、`input: {}`）；若当前无活跃 assistant message，先创建一条
- 收到 `tool_call_update`（completed/failed）时，找到对应 `toolCallId` 的 `dynamic-tool` part，更新 `state` 为 `"output-available"`，写入 `output: content`
- 收到 `done` 时，清空 `activeAssistantId`

**`MessageChunkData` 类型（替换旧定义）：**

```typescript
type MessageChunkData =
  | { kind: "text_delta"; text: string }
  | { kind: "tool_call_start"; toolCallId: string; title: string; kind: string }
  | {
      kind: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      content?: string;
    }
  | { kind: "status"; agentStatus: ChatStatus };
```

#### Scenario: 纯文本回复的流式渲染

- **WHEN** 流式过程中连续收到多个 `text_delta`
- **THEN** store 创建一条 assistant UIMessage，每个 delta 追加到其 text part，UI 实时更新

#### Scenario: 含工具调用的回复

- **WHEN** 流式过程中收到 `tool_call_start`，随后收到 `tool_call_update`（completed）
- **THEN** store 向当前 assistant message 追加 `dynamic-tool` part，初始 `state: "input-available"`
- **AND** 收到 completed 后更新该 part 的 `state` 为 `"output-available"`，写入 `output`

#### Scenario: 文本与工具调用交替出现

- **WHEN** 同一轮回复中 `text_delta` 和 `tool_call_start` 交替到达
- **THEN** 所有内容归并到同一条 assistant UIMessage 的 `parts` 数组，顺序与到达顺序一致

### Requirement: Main 进程在 chat stream done 时组装并持久化 assistant UIMessage

系统 SHALL 在 `chat:stream:message` 的主进程 handler 中维护 `MessageAssembler` 实例（来自 `@main/services/chat/message-assembler`），在 `text_delta` / `tool_call_start` / `tool_call_update` 事件上调用 `assembler.apply(ev)`，并在收到 `done` 事件时先执行 `assembler.flush()`，将返回的 `UIMessage<MessageMeta>` 通过 `appendMessage` 写入 `sessions/<sessionId>.messages.jsonl`，随后再通过 sink 发送 `done` chunk。落盘失败 SHALL 通过 sink 以 `ACP_ERROR` 归一化抛错，不阻塞 session 注销。

`MessageAssembler.flush()` 产生的 `UIMessage.id` 由主进程自行 `generateId()` 生成，与渲染进程活跃期间使用的临时 id 独立。

#### Scenario: Stage 正常完成时主进程组装并落盘 assistant 消息

- **WHEN** `chat:stream:message` 的 `AcpSession` emit `done` 事件
- **THEN** 主进程调用 `assembler.flush()` 得到完整 `UIMessage<MessageMeta>`
- **AND** 通过 `appendMessage(projectPath, sessionId, message)` 将该消息写入磁盘
- **AND** 通过 sink 发送 `{ type: "done", data: { totalTokens } }`
- **AND** 从 `sessionRegistry` 注销对应的 `chat` session

#### Scenario: 渲染进程在流中途关闭仍完成 assistant 落盘

- **WHEN** 渲染进程在 chat stream 进行中关闭 MessagePort
- **THEN** 主进程的 `AcpSession` 继续运行
- **AND** `MessageAssembler` 继续累积事件
- **AND** `done` 到达时 assistant 消息正常写入 `sessions/<sessionId>.messages.jsonl`

#### Scenario: Assistant 消息落盘失败

- **WHEN** `appendMessage` 抛出异常
- **THEN** 主进程通过 sink 发送 `{ type: "error", data: { code: "ACP_ERROR", message } }`
- **AND** 从 `sessionRegistry` 注销对应的 `chat` session

### Requirement: `chat:persistMessage` 仅用于 user message

`chat:persistMessage` IPC 的入参校验 SHALL 约束 `message.role === "user"`。非 `"user"` 的请求 SHALL 返回 `VALIDATION_ERROR`。

渲染进程 SHALL 在 `sendMessage` 时，于 `queueUserMessage` 之后调用 `chat:persistMessage` 落盘 user 消息。assistant 消息的持久化 SHALL 由主进程在 `chat:stream:message` 的 `done` 事件内完成，渲染进程 SHALL NOT 在 `onDone` 内调用 `chat:persistMessage` 落盘 assistant。

#### Scenario: 渲染进程发送 user 消息

- **WHEN** 用户点击发送
- **THEN** 渲染进程创建 user UIMessage，push 到 `session.messages`
- **AND** 调用 `chat:persistMessage(sessionId, projectId, userMessage)` 触发落盘

#### Scenario: `persistMessage` 拒绝 assistant 消息

- **WHEN** 渲染进程调用 `chat:persistMessage` 传入 `role !== "user"` 的消息
- **THEN** 主进程返回 `VALIDATION_ERROR`

### Requirement: Session 信息持久化

系统 SHALL 将每个 session 的元数据（含 `acpSessionId`、`agentId`）持久化到 `getDataSubPath('sessions')/<sessionId>.json`，支持应用重启后恢复 ACP session 上下文。

#### Scenario: 首次创建 session 时写入持久化文件

- **WHEN** 新 ACP session 创建成功
- **THEN** 系统在 `getDataSubPath('projects')/<encodeProjectPath(project.path)>/sessions/<sessionId>.json` 写入 `{ sessionId, acpSessionId, agentId, title, turnCount, createdAt, updatedAt }`
- **AND** `encodeProjectPath` 实现为：去掉路径开头的 `/`，将所有 `/` 替换为 `-`

#### Scenario: 应用重启后读取持久化 session

- **WHEN** IPC handler 收到 `chat:stream:message`，且 `getDataSubPath('projects')/<encodeProjectPath(project.path)>/sessions/<sessionId>.json` 存在
- **THEN** 读取文件中的 `acpSessionId` 用于 `resumeSession`

### Requirement: listSessions IPC 从磁盘返回项目 session 列表

系统 SHALL 实现 `chat:listSessions` IPC handler，从磁盘读取指定项目的所有 session 元数据，按 `updatedAt` 降序返回，`messages` 字段为空数组。

#### Scenario: 列出项目 sessions

- **WHEN** 渲染进程调用 `chat:listSessions` 并传入 `{ projectId }`
- **THEN** 主进程通过 `projectId` 解析 `projectPath`，调用 `listSessionMetas(projectPath)`，返回按 `updatedAt` 降序排列的 `Session[]`，每个 session 的 `messages` 为空数组

#### Scenario: 项目无 session 时返回空数组

- **WHEN** 渲染进程调用 `chat:listSessions`，且该项目无任何 session 文件
- **THEN** 返回空数组 `[]`

### Requirement: createSession IPC 创建并持久化 session 元数据

系统 SHALL 实现 `chat:createSession` IPC handler，生成新的 `sessionId`，写入 session 元数据文件，返回 `Session` 对象。

#### Scenario: 创建新 session

- **WHEN** 渲染进程调用 `chat:createSession` 并传入 `{ projectId, title, agentId }`
- **THEN** 主进程生成 `sessionId`（格式：`session-<timestamp>`），调用 `saveSessionMeta` 写入磁盘（含 `agentId`），返回对应的 `Session` 对象（`messages: []`，`status: "ended"`，`turnCount: 0`，`agentId`）

#### Scenario: 草稿态首条消息前创建 session

- **WHEN** 渲染进程在草稿态发送第一条消息前调用 `chat:createSession`
- **THEN** 调用方传入的 `title` 为基于首条用户消息生成的兜底标题
- **AND** 返回的 `sessionId` 作为该轮首条消息持久化与后续流式会话的唯一 session 标识

### Requirement: updateSession IPC 更新 session 元数据

系统 SHALL 实现 `chat:updateSession` IPC handler，读取现有元数据、合并 patch、写回磁盘。

#### Scenario: 更新 session 标题

- **WHEN** 渲染进程调用 `chat:updateSession` 并传入 `{ id, patch: { title }, projectId }`
- **THEN** 主进程读取现有 meta，合并 patch，更新 `updatedAt`，写回磁盘，返回更新后的 `Session`

### Requirement: removeSession IPC 删除 session 文件

系统 SHALL 实现 `chat:removeSession` IPC handler，删除 session 的元数据文件和消息文件。

#### Scenario: 删除 session

- **WHEN** 渲染进程调用 `chat:removeSession` 并传入 `{ id, projectId }`
- **THEN** 主进程删除 `<sessionId>.json` 和 `<sessionId>.messages.jsonl` 文件

### Requirement: session_info_update 事件处理链路

系统 SHALL 在 ACP agent 推送 `session_info_update` 事件时，将标题变更持久化到磁盘并通知前端。

#### Scenario: Agent 推送 session 标题

- **WHEN** ACP agent 推送 `sessionUpdate === "session_info_update"` 且 `title` 字段非空
- **THEN** `acp-mapper.ts` 将其映射为 `SessionEvent: { type: "session_info_update", title }`
- **AND** 主进程 IPC handler 调用 `saveSessionMeta` 更新磁盘中的 `title` 字段
- **AND** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "session_info_update", title } }` 给渲染进程

#### Scenario: 前端收到标题更新

- **WHEN** 渲染进程收到 `kind: "session_info_update"` chunk
- **THEN** 前端 chat store 更新对应 session 的 `title` 字段，UI 实时反映新标题

#### Scenario: Agent 未推送标题时保持调用方初始化标题

- **WHEN** ACP agent 在整轮对话中未推送 `session_info_update`
- **THEN** 主进程保持 `chat:createSession` 初始写入的 `title` 不变

系统 SHALL 提供 `chat:loadMessages` IPC handler，从磁盘读取指定 session 的历史消息列表。

#### Scenario: 加载历史消息

- **WHEN** 渲染进程调用 `chat:loadMessages` 并传入 `{ sessionId, projectId }`
- **THEN** 主进程调用 `loadMessages(projectPath, sessionId)`，返回 `Message[]`

#### Scenario: 无历史消息时返回空数组

- **WHEN** 渲染进程调用 `chat:loadMessages`，且该 session 无消息文件
- **THEN** 返回空数组 `[]`
