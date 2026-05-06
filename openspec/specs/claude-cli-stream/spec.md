# claude-cli-stream 规范

## Purpose

Claude CLI stream 规范保留本地 Claude CLI 流式通信、会话映射、消息解析和错误处理要求。

## Requirements

> **DEPRECATED**: 此 capability 已被 `acp-chat-backend` 取代，所有 requirements 已移除。详见 change `acp-agent-chat-integration`。

### Requirement: Claude CLI 子进程以 stream-json 模式启动

系统 SHALL 通过 `child_process.spawn` 启动本地 `claude` CLI，使用 `--print --output-format stream-json --verbose --include-partial-messages` 参数，将用户 prompt 作为最后一个参数传入，并将 `cwd` 设置为当前项目路径。新会话不携带 `--resume`；已有 Claude sessionId 映射的会话 SHALL 携带 `--resume {claudeSessionId}`。

#### Scenario: 新会话首次发送消息

- **WHEN** IPC handler 收到 `chat:stream:message` 请求，包含 `{ sessionId, projectId, prompt }`
- **AND** 该 sessionId 在映射表中无对应的 Claude sessionId
- **THEN** 主进程通过 `projectId` 查询 `ProjectInfo.path` 作为 `cwd`
- **AND** spawn `claude` 子进程，参数为 `--print --output-format stream-json --verbose --include-partial-messages {prompt}`
- **AND** 子进程的 `cwd` 设置为查询到的 `ProjectInfo.path`

#### Scenario: 已有会话续接发送消息

- **WHEN** IPC handler 收到 `chat:stream:message` 请求，包含 `{ sessionId, projectId, prompt }`
- **AND** 该 sessionId 在映射表中已有对应的 Claude sessionId
- **THEN** 主进程 spawn `claude` 子进程，参数包含 `--resume {claudeSessionId} --print --output-format stream-json --verbose --include-partial-messages {prompt}`

#### Scenario: claude 命令不存在时返回错误

- **WHEN** spawn 抛出 `ENOENT` 错误（claude 不在 PATH 中）
- **THEN** 通过 MessagePort 发送 `{ type: "error", data: { code: "CLAUDE_NOT_FOUND", message: "..." } }`
- **AND** 关闭 port1

### Requirement: 从首条 system 消息中提取并持久化 Claude sessionId

系统 SHALL 监听子进程输出的第一条 `type: "system"` 消息（`subtype: "hook_started"` 或 `subtype: "init"`），从中提取 `session_id` 字段，建立 FylloCode sessionId → Claude sessionId 的内存映射，供后续消息的 `--resume` 参数使用。

#### Scenario: 新会话提取 Claude sessionId

- **WHEN** 子进程输出第一条含 `session_id` 字段的 `type: "system"` 消息
- **AND** 当前 FylloCode sessionId 在映射表中尚无记录
- **THEN** 将 `{ fylloSessionId → claudeSessionId }` 写入内存映射表

#### Scenario: 续接会话不覆盖已有映射

- **WHEN** 子进程输出含 `session_id` 字段的 `type: "system"` 消息
- **AND** 当前 FylloCode sessionId 在映射表中已有记录
- **THEN** 不修改映射表（保持原有 Claude sessionId）

### Requirement: NDJSON 输出逐行解析为强类型

系统 SHALL 通过 `readline` 逐行读取子进程 stdout，将每行 JSON 解析为 `ClaudeRawLine` 联合类型，无法解析的行（非 JSON、空行）SHALL 静默跳过。

#### Scenario: 解析有效 JSON 行

- **WHEN** 子进程输出一行有效 JSON
- **THEN** parser 返回对应的 `ClaudeRawLine` 对象

#### Scenario: 跳过无效行

- **WHEN** 子进程输出一行无法解析为 JSON 的内容
- **THEN** parser 返回 `null`，session 状态机忽略该行，不抛出异常

### Requirement: stream_event text_delta 实时推送

系统 SHALL 监听 `stream_event` 类型中 `content_block_delta` 的 `text_delta`，将文本增量以 `{ kind: "text_delta", text }` 格式通过 MessagePort 推送给渲染进程。

#### Scenario: 接收文本 delta

- **WHEN** 解析到 `{ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } } }`
- **THEN** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "text_delta", text: "..." } }`

### Requirement: assistant 完整消息映射为 UIMessage 并 upsert

系统 SHALL 在收到 `type: "assistant"` 消息时，将其 content 数组映射为 `UIMessage<MessageMeta>` 的 parts，并以 `{ kind: "message_upsert", message }` 推送，替换前端的占位消息。

#### Scenario: 纯文本 assistant 消息

- **WHEN** 解析到 `type: "assistant"` 消息，content 只含 `{ type: "text" }` block
- **THEN** 映射为 `UIMessage`，parts 包含一个 `{ type: "text", text }` part
- **AND** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "message_upsert", message } }`

#### Scenario: 含 tool_use 的 assistant 消息

- **WHEN** 解析到 `type: "assistant"` 消息，content 含 `{ type: "tool_use", id, name, input }` block
- **THEN** 映射为 `UIMessage`，对应 part 为 `{ type: "tool-invocation", toolInvocation: { toolCallId: id, toolName: name, args: input, state: "call" } }`
- **AND** 若 `toolResultBuffer` 中已有该 `id` 的结果，则 state 设为 `"result"` 并填入 result

### Requirement: user tool_result 回填 assistant UIMessage

系统 SHALL 在收到 `type: "user"` 消息（含 tool_result）时，将结果回填到对应 assistant UIMessage 的 tool-invocation part，并以 `{ kind: "message_patch" }` 推送。

#### Scenario: tool_result 在 assistant 消息之后到达

- **WHEN** 解析到 `type: "user"` 消息，content 含 `{ type: "tool_result", tool_use_id, content }`
- **AND** 对应的 assistant UIMessage 已存在于 messageMap 中
- **THEN** 更新该 UIMessage 中匹配 `toolCallId` 的 tool-invocation part，state 改为 `"result"`，填入 result
- **AND** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "message_patch", id, parts } }`

#### Scenario: tool_result 在 assistant 消息之前到达（缓存）

- **WHEN** 解析到 `type: "user"` 消息，但对应 assistant UIMessage 尚未到达
- **THEN** 将结果存入 `toolResultBuffer`，等 assistant 消息到达时配对

### Requirement: result 消息触发流式完成

系统 SHALL 在收到 `type: "result"` 消息时，通过 MessagePort 发送 `{ type: "done", data: { totalTokens } }` 并关闭 port1。

#### Scenario: 成功完成

- **WHEN** 解析到 `{ type: "result", subtype: "success" }`
- **THEN** 通过 MessagePort 发送 `{ type: "done", data: { totalTokens: usage.output_tokens } }`
- **AND** 关闭 port1

#### Scenario: CLI 返回错误结果

- **WHEN** 解析到 `{ type: "result", subtype: "error" }`
- **THEN** 通过 MessagePort 发送 `{ type: "error", data: { code: "CLAUDE_ERROR", message: result } }`
- **AND** 关闭 port1

### Requirement: 支持取消流式传输

系统 SHALL 在收到 `chat:stream:cancel` 请求时，kill 对应的 claude 子进程，并关闭 MessagePort。

#### Scenario: 用户取消

- **WHEN** IPC handler 收到 `chat:stream:cancel`，包含 `{ sessionId }`
- **THEN** 找到对应的活跃 ClaudeSession 并调用 `cancel()`
- **AND** 子进程被 kill，port1 关闭
