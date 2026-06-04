## ADDED Requirements

### Requirement: 非 done 终止时持久化已组装的 assistant 消息

所有基于 `makeStreamChannel` 的流式 IPC handler（`chat:stream:message`、`proposal:stageStream`、`proposal:archive`）SHALL 在**非 `done` 终止**时也持久化当前已组装的 assistant 消息。非 `done` 终止指两类出口：

1. **`error` 出口**：handler 的 `session.on("event")` 回调收到 `{ type: "error" }` 事件。
2. **`cancel` 出口**：`makeStreamChannel` 返回的 runner 的 `cancel()` 被调用（由 renderer 关闭 port，或由对应的 `streamCancel` / `stageStreamCancel` / `archiveCancel` IPC 经 `sessionRegistry.cancel` 触发 `AcpSession.cancel()` 后，port close 链路命中 `runner.cancel`）。

每个 handler SHALL 通过其已持有的 `MessageAssembler` 实例与该 handler 对应的落盘函数完成持久化：

- `chat:stream:message` → `appendMessage`
- `proposal:stageStream` → `appendApplyRunMessage`
- `proposal:archive` → `appendArchiveMessage`

持久化 SHALL 复用 `done` 出口已有的"取出消息再落盘"两步：先调用 `assembler.flush()`，仅当返回非 `null` 时调用对应落盘函数 append 该消息。

去重 SHALL 依赖 `MessageAssembler.flush()` 的一次性所有权语义：`flush()` 首次调用同步取走 `currentMessage` 并置为 `null` 后返回该消息，后续调用返回 `null`。因此在 `done`、`error`、`cancel` 任意先后组合命中的情况下，同一条 assistant 消息 SHALL 最多落盘一次。handler SHALL NOT 为去重引入额外的布尔标志或独立状态。

落盘 SHALL NOT 改变被中断消息的数据形态：消息作为普通 assistant `UIMessage<MessageMeta>` 落盘，SHALL NOT 新增"中断 / 出错"标记字段，SHALL NOT 改变 `.messages.jsonl` 存储格式。

本 requirement SHALL NOT 改变各 handler 既有的非消息状态逻辑：`proposal:stageStream` 与 `proposal:archive` 在 `error` 出口对 runMeta / archive `status` 的更新保持原样；新增的消息落盘 SHALL 作为这些出口的附加动作，不替换、不依赖其执行结果。

当 `error` 或 `cancel` 在任何 `text_delta` / `reasoning_delta` / `tool_call_*` 事件到达之前发生时，`assembler` 的 `currentMessage` 为 `null`，`flush()` 返回 `null`，handler SHALL NOT append 任何消息（不落盘空消息）。

非 done 终止时的消息落盘失败 SHALL 被捕获并记录日志，SHALL NOT 阻断该出口既有的终止动作（`sink.sendError` / `sink.sendDone` / `sessionRegistry.unregister` / 状态机更新）。

#### Scenario: chat 流式 error 时落盘已组装消息

- **WHEN** `chat:stream:message` 已通过 `assembler.apply` 组装了部分 assistant 内容（至少一个 `text_delta`）
- **AND** handler 的事件回调随后收到 `{ type: "error", code, message }`
- **THEN** handler 调用 `assembler.flush()` 取出该 assistant 消息并通过 `appendMessage` 落盘到该 session 的 `.messages.jsonl`
- **AND** handler 仍调用 `sink.sendError(mapAcpErrorCode(code), message)` 与 `sessionRegistry.unregister("chat", sessionId)`
- **AND** 重启后 `loadMessages` 能读到该条 assistant 消息

#### Scenario: chat 用户 stop 时落盘已组装消息

- **WHEN** `chat:stream:message` 已组装部分 assistant 内容
- **AND** 用户 stop 导致 runner 的 `cancel()` 被调用
- **THEN** handler 在 `cancel` 出口调用 `assembler.flush()` 取出消息并通过 `appendMessage` 落盘
- **AND** handler 仍调用 `session.cancel()` 与 `sessionRegistry.unregister("chat", sessionId)`

#### Scenario: 同一轮先 error 后 cancel 不重复落盘

- **WHEN** `chat:stream:message` 在 `error` 出口已落盘该 assistant 消息（`flush()` 已取走 `currentMessage`）
- **AND** 随后 `sink.sendError` 关闭 port，port close 链路触发 runner 的 `cancel()`
- **THEN** `cancel` 出口再次调用 `assembler.flush()` 返回 `null`
- **AND** handler 不再 append，`.messages.jsonl` 中该消息只出现一次

#### Scenario: 终止发生在任何 delta 之前不落盘空消息

- **WHEN** 流式刚启动、尚未收到任何 `text_delta` / `reasoning_delta` / `tool_call_*` 事件
- **AND** 发生 `error` 或用户 stop
- **THEN** `assembler.flush()` 返回 `null`
- **AND** handler 不调用任何 append 落盘函数，磁盘上不新增空 assistant 消息

#### Scenario: proposal stageStream error 时落盘并保留 runMeta 错误状态

- **WHEN** `proposal:stageStream` 已组装部分 assistant 内容
- **AND** handler 收到 `{ type: "error" }`
- **THEN** handler 调用 `assembler.flush()` 并通过 `appendApplyRunMessage(projectPath, changeId, stageIndex, message)` 落盘
- **AND** handler 仍执行既有的 `updateRunMetaIfCurrent(... status: "error" ...)` 与 `sink.sendError`
- **AND** runMeta 的 `status` 仍被置为 `"error"`（消息落盘不替换、不影响该状态更新）

#### Scenario: proposal stageStream 用户 stop 时落盘已组装消息

- **WHEN** `proposal:stageStream` 已组装部分 assistant 内容
- **AND** 用户 stop 导致 runner 的 `cancel()` 被调用
- **THEN** handler 在 `cancel` 出口调用 `assembler.flush()` 并通过 `appendApplyRunMessage` 落盘
- **AND** handler 仍调用 `session.cancel()` 与 `sessionRegistry.unregister("apply", runId)`

#### Scenario: proposal archive error 时落盘并保留 archive 错误状态

- **WHEN** `proposal:archive` 已组装部分 assistant 内容
- **AND** handler 收到 `{ type: "error" }`
- **THEN** handler 调用 `assembler.flush()` 并通过 `appendArchiveMessage(projectPath, changeId, message)` 落盘
- **AND** handler 仍执行既有的 `persistArchiveStatus("error")` 与 `sink.sendError`

#### Scenario: proposal archive 用户 stop 时落盘已组装消息

- **WHEN** `proposal:archive` 已组装部分 assistant 内容
- **AND** 用户 stop 导致 runner 的 `cancel()` 被调用
- **THEN** handler 在 `cancel` 出口调用 `assembler.flush()` 并通过 `appendArchiveMessage` 落盘
- **AND** handler 仍调用 `session.cancel()` 与 `sessionRegistry.unregister("archive", sessionKey)`
