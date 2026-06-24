## ADDED Requirements

### Requirement: dynamic-tool part 保留 toolKind metadata

系统 SHALL 在将 ACP `tool_call_start` / `tool_call_update` 流式事件组装为 AI SDK `dynamic-tool` part 时，把可用的 `toolKind` 写入 `part.toolMetadata.toolKind`。该字段是 tool part 级别的可选元数据，用于 renderer 生成连续工具调用组的概况文案。

主进程 `MessageAssembler` 与渲染进程 `useUIMessageAssembler` SHALL 使用同一语义：

- 处理 `tool_call_start` 时，新建的 `DynamicToolUIPart` SHALL 包含 `toolMetadata: { toolKind: chunk.toolKind }`。
- 处理孤儿 `tool_call_update` 且需要惰性创建 tool part 时，若 update 携带 `toolKind`，新建的 `DynamicToolUIPart` SHALL 包含 `toolMetadata: { toolKind: chunk.toolKind }`。
- 对已有 tool part 应用 `tool_call_update` 并通过 splice/替换对象更新 part 时，系统 SHALL 保留 `prev.toolMetadata`。
- 若 `tool_call_update` 携带 `toolKind` 且已有 part 缺少 `toolMetadata.toolKind`，系统 MAY 补写该 metadata；但 SHALL NOT 用 `undefined`、空字符串或非字符串值覆盖已有 `toolMetadata.toolKind`。
- `toolMetadata.toolKind` SHALL 只保存工具类别字符串，不保存完整 ACP raw payload。

历史消息兼容规则：系统 SHALL 继续接受没有 `toolMetadata` 或没有 `toolMetadata.toolKind` 的既有 `dynamic-tool` part。缺少该字段 SHALL NOT 触发数据迁移、读取失败或消息丢弃。

#### Scenario: tool_call_start 创建带 toolKind metadata 的 dynamic-tool

- **WHEN** `MessageAssembler.apply` 或 `useUIMessageAssembler.applyChunk` 收到 `{ kind: "tool_call_start", toolCallId: "t1", title: "Read", toolKind: "read" }`
- **THEN** 新建的 `dynamic-tool` part 包含 `toolCallId: "t1"`、`toolName: "Read"`、`state: "input-available"`
- **AND** 该 part 包含 `toolMetadata: { toolKind: "read" }`

#### Scenario: tool_call_update 保留已有 toolMetadata

- **WHEN** 已有 `dynamic-tool` part 包含 `toolMetadata: { toolKind: "write" }`
- **AND** 系统收到同 `toolCallId` 的 `{ kind: "tool_call_update", status: "completed", content: "done" }`
- **THEN** 更新后的 part `state === "output-available"`
- **AND** 更新后的 part 仍包含 `toolMetadata: { toolKind: "write" }`

#### Scenario: 孤儿 tool_call_update 创建带 toolKind metadata 的 dynamic-tool

- **WHEN** 系统收到 `{ kind: "tool_call_update", toolCallId: "replace__1", title: "replace", toolKind: "edit", status: "completed", content: "edited" }`
- **AND** 当前 assistant message 中不存在同 `toolCallId` 的 tool part
- **THEN** 系统惰性创建 `dynamic-tool` part
- **AND** 该 part 包含 `toolMetadata: { toolKind: "edit" }`
- **AND** 随后应用 update，使该 part `state === "output-available"` 且 `output === "edited"`

#### Scenario: 缺少 toolKind 的孤儿 update 仍保持兼容

- **WHEN** 系统收到 `{ kind: "tool_call_update", toolCallId: "orphan", status: "completed", content: "done" }`
- **AND** 当前 assistant message 中不存在同 `toolCallId` 的 tool part
- **THEN** 系统仍按既有孤儿 update 规则惰性创建 `dynamic-tool` part
- **AND** 该 part MAY 缺少 `toolMetadata`
- **AND** 消息组装与持久化不得失败

#### Scenario: 历史 dynamic-tool part 不需要迁移

- **WHEN** `loadMessages` 读取到历史 assistant 消息，且其中 `dynamic-tool` part 不包含 `toolMetadata`
- **THEN** 系统 SHALL 原样返回该消息
- **AND** 不执行消息文件迁移
- **AND** renderer SHALL 能继续渲染该工具调用
