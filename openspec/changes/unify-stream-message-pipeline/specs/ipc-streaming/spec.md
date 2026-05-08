## MODIFIED Requirements

### Requirement: 接收流式 chunk

系统 SHALL 通过 MessagePort 传输 `StreamMessage<MessageChunkData>` 类型的消息，其中 `MessageChunkData` 为联合类型，支持 `text_delta`、`tool_call_start`、`tool_call_update`、`session_info_update`、`user_message`、`status` 六种 chunk 语义。Preload 层的 `StreamCallbacks.onChunk` 回调参数类型 SHALL 更新为新的 `MessageChunkData`。

`MessageChunkData` 定义（新增 `user_message` 分支）：

```typescript
type MessageChunkData =
  | { kind: "text_delta"; text: string }
  | { kind: "tool_call_start"; toolCallId: string; title: string; toolKind: string }
  | {
      kind: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      input?: Record<string, unknown>;
      content?: string;
    }
  | { kind: "session_info_update"; title: string }
  | { kind: "user_message"; message: UIMessage<MessageMeta> }
  | { kind: "status"; agentStatus: ChatStatus };
```

`user_message` 分支 SHALL 由 `proposal:stageStream` / `proposal:archive` handler 在流启动初期直接通过 sink 发送（不经 `session-event-mapper`，因为 user message 源自主进程落盘动作，不是 ACP `SessionEvent`）。`chat:stream:message` handler 在当前 change 范围内 SHALL NOT 发送 `user_message` chunk（chat 的 user message 由渲染进程本地 push + `chat:persistMessage` 落盘）。

所有消费 `MessageChunkData` 的 switch/分支 SHALL 处理新增的 `user_message` 分支；TypeScript 穷尽检查 SHALL 在编译期发现漏处理。

#### Scenario: 接收 text_delta chunk

- **WHEN** main 进程从 ACP 收到文本增量
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "text_delta", text: string } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "text_delta", text })` 回调

#### Scenario: 接收 tool_call_start chunk

- **WHEN** main 进程从 ACP 收到 tool call start
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "tool_call_start", toolCallId, title, toolKind } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "tool_call_start", ... })` 回调

#### Scenario: 接收 tool_call_update chunk

- **WHEN** main 进程从 ACP 收到 tool call update
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "tool_call_update", toolCallId, status, input?, content? } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "tool_call_update", ... })` 回调

#### Scenario: 接收 user_message chunk

- **WHEN** `proposal:stageStream` 或 `proposal:archive` handler 在启动阶段落盘 user 消息后
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "user_message", message: UIMessage<MessageMeta> } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "user_message", message })` 回调
- **AND** 渲染进程将该消息原样追加到本轮消息列表（不触发组装逻辑）
