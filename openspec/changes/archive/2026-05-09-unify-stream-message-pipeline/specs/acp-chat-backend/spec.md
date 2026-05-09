## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: 前端 chat store 从流式事件组装 assistant UIMessage

前端 chat store SHALL 在流式过程中实时组装 `role: "assistant"` 的 `UIMessage`，用于驱动 UI 展示。组装逻辑 SHALL 复用共享 composable `useUIMessageAssembler`（定义见 `chat-interface` spec）。渲染进程**不再**在 `onDone` 中将 assistant 消息通过 `chat:persistMessage` 写盘——assistant 消息的持久化由主进程在 `done` 时完成。

渲染进程在流式活跃期间使用 `generateId()` 产生的临时 id 驱动 DOM；该临时 id 与主进程 `MessageAssembler.flush()` 生成并写盘的最终 id 独立，系统 SHALL NOT 将两者做跨进程匹配或合并。

**组装规则**（由共享 composable 实现）：

- 收到第一个 `text_delta` 时，若当前无活跃 assistant message，则创建一条新的 `UIMessage`（临时 id），追加到消息列表并记录为 `activeAssistantId`
- 后续 `text_delta` 追加到 `activeAssistantId` 对应消息的 text part
- 收到 `tool_call_start` 时，向 `activeAssistantId` 对应消息追加一个 `dynamic-tool` part（`state: "input-available"`，携带 `toolCallId`、`toolName: title`、`input: {}`）；若当前无活跃 assistant message，先创建一条
- 收到 `tool_call_update`（completed/failed）时，找到对应 `toolCallId` 的 `dynamic-tool` part，更新 `state` 为 `"output-available"`，写入 `output: content`
- 收到 `done` 时，清空 `activeAssistantId`；**不触发 assistant 落盘 IPC**

#### Scenario: 纯文本回复的流式渲染

- **WHEN** 流式过程中连续收到多个 `text_delta`
- **THEN** store 通过共享 composable 创建一条 assistant UIMessage，每个 delta 追加到其 text part，UI 实时更新

#### Scenario: 含工具调用的回复

- **WHEN** 流式过程中收到 `tool_call_start`，随后收到 `tool_call_update`（completed）
- **THEN** store 向当前 assistant message 追加 `dynamic-tool` part，初始 `state: "input-available"`
- **AND** 收到 completed 后更新该 part 的 `state` 为 `"output-available"`，写入 `output`

#### Scenario: done 到达时渲染进程不触发 assistant 持久化

- **WHEN** 渲染进程在 chat stream 收到 `done`
- **THEN** 清空 `activeAssistantId`
- **AND** **不调用** `chat:persistMessage` 写入 assistant 消息
- **AND** 下次打开该 session 时，从磁盘读取由主进程写入的 assistant 消息

#### Scenario: 文本与工具调用交替出现

- **WHEN** 同一轮回复中 `text_delta` 和 `tool_call_start` 交替到达
- **THEN** 所有内容归并到同一条 assistant UIMessage 的 `parts` 数组，顺序与到达顺序一致

### Requirement: Session 信息持久化

系统 SHALL 将每个 session 的元数据（含 `acpSessionId`、`agentId`）持久化到 `getDataSubPath('sessions')/<sessionId>.json`，支持应用重启后恢复 ACP session 上下文。

User message 的磁盘写入由渲染进程通过 `chat:persistMessage` IPC 触发；assistant message 的磁盘写入由主进程在 `chat:stream:message` 的 `done` 事件内直接完成。`chat:persistMessage` IPC 的入参 SHALL 限定 `message.role === "user"`，不得用于写入 assistant 消息。

#### Scenario: 首次创建 session 时写入持久化文件

- **WHEN** 新 ACP session 创建成功
- **THEN** 系统在 `getDataSubPath('projects')/<encodeProjectPath(project.path)>/sessions/<sessionId>.json` 写入 `{ sessionId, acpSessionId, agentId, title, turnCount, createdAt, updatedAt }`
- **AND** `encodeProjectPath` 实现为：去掉路径开头的 `/`，将所有 `/` 替换为 `-`

#### Scenario: 应用重启后读取持久化 session

- **WHEN** IPC handler 收到 `chat:stream:message`，且 `getDataSubPath('projects')/<encodeProjectPath(project.path)>/sessions/<sessionId>.json` 存在
- **THEN** 读取文件中的 `acpSessionId` 用于 `resumeSession`

#### Scenario: persistMessage 仅接受 user 消息

- **WHEN** 渲染进程调用 `chat:persistMessage`，入参 `message.role` 为 `"assistant"`
- **THEN** 主进程返回 `IpcResponse` 错误，code 为 `VALIDATION_ERROR`
- **AND** 不写入任何磁盘内容

#### Scenario: user 消息通过 persistMessage 落盘

- **WHEN** 渲染进程调用 `chat:persistMessage`，入参 `message.role === "user"`
- **THEN** 主进程通过 `appendMessage` 将消息追加到 `sessions/<sessionId>.messages.jsonl`
